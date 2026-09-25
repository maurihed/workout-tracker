import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { HttpResponse, http } from "msw"
import { setupServer } from "msw/node"
import { contractJsonSchema } from "@/features/ai/lib/contract"
import {
  AiUnavailableError,
  createOllamaProvider,
  createOpenAiProvider,
  getProvider,
} from "@/features/ai/lib/provider"

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

afterEach(() => {
  server.resetHandlers()
  vi.unstubAllEnvs()
})

afterAll(() => server.close())

const openAiConfig = {
  baseUrl: "https://ai.example.com",
  model: "gpt-4o-mini",
  apiKey: "test-key",
  timeoutMs: 1_000,
}

const ollamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "qwen2.5",
  timeoutMs: 1_000,
}

type CapturedRequest = {
  url: string
  body: Record<string, unknown>
  authorization: string | null
}

async function captureRequest(request: Request): Promise<CapturedRequest> {
  const body = (await request.json()) as Record<string, unknown>
  return {
    url: request.url,
    body,
    authorization: request.headers.get("authorization"),
  }
}

describe("createOpenAiProvider", () => {
  it("POSTs an OpenAI chat completion with a json_schema response format and parses the content", async () => {
    let captured: CapturedRequest | undefined
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", async ({ request }) => {
        captured = await captureRequest(request)
        return HttpResponse.json({
          choices: [{ message: { content: JSON.stringify({ name: "Full Body", days: [] }) } }],
        })
      }),
    )

    const provider = createOpenAiProvider(openAiConfig)
    const result = await provider.generateJson("build me a routine", contractJsonSchema)

    expect(captured?.url).toBe("https://ai.example.com/v1/chat/completions")
    expect(captured?.authorization).toBe("Bearer test-key")
    expect(captured?.body.model).toBe("gpt-4o-mini")
    expect(captured?.body.messages).toEqual([{ role: "user", content: "build me a routine" }])
    expect(captured?.body.response_format).toEqual({
      type: "json_schema",
      json_schema: contractJsonSchema,
    })
    expect(result).toEqual({ name: "Full Body", days: [] })
  })

  it("omits the Authorization header when no API key is configured", async () => {
    let authorization: string | null | undefined
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", ({ request }) => {
        authorization = request.headers.get("authorization")
        return HttpResponse.json({ choices: [{ message: { content: "{}" } }] })
      }),
    )

    await createOpenAiProvider({ baseUrl: "https://ai.example.com", model: "gpt-4o-mini" }).generateJson(
      "prompt",
      {},
    )

    expect(authorization).toBeNull()
  })

  it("throws when the provider responds with a non-OK status without leaking the body", async () => {
    server.use(
      http.post(
        "https://ai.example.com/v1/chat/completions",
        () => new HttpResponse("super-secret-body", { status: 500 }),
      ),
    )

    const error: unknown = await createOpenAiProvider(openAiConfig)
      .generateJson("prompt", {})
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(/500/)
    expect((error as Error).message).not.toContain("super-secret-body")
  })

  it("aborts and throws when the request exceeds the timeout", async () => {
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json({ choices: [{ message: { content: "{}" } }] })
      }),
    )

    const provider = createOpenAiProvider({ ...openAiConfig, timeoutMs: 20 })
    await expect(provider.generateJson("prompt", {})).rejects.toThrow(/timed out/i)
  })

  it("throws a clear error when the content is not valid JSON", async () => {
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", () =>
        HttpResponse.json({ choices: [{ message: { content: "not json at all" } }] }),
      ),
    )

    await expect(createOpenAiProvider(openAiConfig).generateJson("prompt", {})).rejects.toThrow(
      /valid JSON/i,
    )
  })

  it("parses a fenced ```json content block", async () => {
    const payload = { name: "Fenced", days: [] }
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", () =>
        HttpResponse.json({
          choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`` } }],
        }),
      ),
    )

    await expect(createOpenAiProvider(openAiConfig).generateJson("prompt", {})).resolves.toEqual(
      payload,
    )
  })
})

describe("createOllamaProvider", () => {
  it("POSTs to /api/chat with the schema format and temperature 0 and parses message.content", async () => {
    let captured: CapturedRequest | undefined
    server.use(
      http.post("http://localhost:11434/api/chat", async ({ request }) => {
        captured = await captureRequest(request)
        return HttpResponse.json({
          message: { content: JSON.stringify({ name: "Ollama Routine", days: [] }) },
        })
      }),
    )

    const result = await createOllamaProvider(ollamaConfig).generateJson("prompt", contractJsonSchema)

    expect(captured?.url).toBe("http://localhost:11434/api/chat")
    expect(captured?.body.model).toBe("qwen2.5")
    expect(captured?.body.format).toEqual(contractJsonSchema)
    expect(captured?.body.options).toEqual({ temperature: 0 })
    expect(result).toEqual({ name: "Ollama Routine", days: [] })
  })
})

describe("getProvider", () => {
  it("throws AiUnavailableError when AI_BASE_URL and AI_MODEL are empty", () => {
    vi.stubEnv("AI_BASE_URL", "")
    vi.stubEnv("AI_MODEL", "")

    expect(() => getProvider()).toThrow(AiUnavailableError)
  })

  it("throws AiUnavailableError when the model is missing", () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com")
    vi.stubEnv("AI_MODEL", "")

    expect(() => getProvider()).toThrow(AiUnavailableError)
  })

  it("selects the Ollama provider when the base URL looks like Ollama", async () => {
    vi.stubEnv("AI_BASE_URL", "http://localhost:11434")
    vi.stubEnv("AI_MODEL", "qwen2.5")
    let url = ""
    server.use(
      http.post("http://localhost:11434/api/chat", ({ request }) => {
        url = request.url
        return HttpResponse.json({ message: { content: "{}" } })
      }),
    )

    await getProvider().generateJson("prompt", {})

    expect(url).toBe("http://localhost:11434/api/chat")
  })

  it("strips a trailing /v1 from AI_BASE_URL for the OpenAI path", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com/v1")
    vi.stubEnv("AI_MODEL", "gpt-4o-mini")
    let url = ""
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", ({ request }) => {
        url = request.url
        return HttpResponse.json({ choices: [{ message: { content: "{}" } }] })
      }),
    )

    await getProvider().generateJson("prompt", {})

    expect(url).toBe("https://ai.example.com/v1/chat/completions")
    expect(url).not.toContain("/v1/v1")
  })

  it("strips a trailing /v1 and still selects Ollama for an Ollama base URL", async () => {
    vi.stubEnv("AI_BASE_URL", "http://ollama:11434/v1")
    vi.stubEnv("AI_MODEL", "qwen2.5")
    let url = ""
    server.use(
      http.post("http://ollama:11434/api/chat", ({ request }) => {
        url = request.url
        return HttpResponse.json({ message: { content: "{}" } })
      }),
    )

    await getProvider().generateJson("prompt", {})

    expect(url).toBe("http://ollama:11434/api/chat")
    expect(url).not.toContain("/v1")
  })

  it("selects the OpenAI-compatible provider otherwise and honors AI_TIMEOUT_MS", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com")
    vi.stubEnv("AI_MODEL", "gpt-4o-mini")
    vi.stubEnv("AI_TIMEOUT_MS", "15")
    server.use(
      http.post("https://ai.example.com/v1/chat/completions", async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
        return HttpResponse.json({ choices: [{ message: { content: "{}" } }] })
      }),
    )

    await expect(getProvider().generateJson("prompt", {})).rejects.toThrow(/timed out/i)
  })
})
