export class AiUnavailableError extends Error {
  constructor(message = "AI provider is not configured") {
    super(message)
    this.name = "AiUnavailableError"
  }
}

export type AiProvider = {
  generateJson(prompt: string, schema: unknown): Promise<unknown>
}

export type ProviderConfig = {
  baseUrl: string
  apiKey?: string
  model: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 30_000

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

function normalizeEnvBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/i, "")
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (value == null) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readTimeoutMs(): number | undefined {
  const raw = readEnv("AI_TIMEOUT_MS")
  if (raw == null) return undefined
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function isOllamaBaseUrl(baseUrl: string): boolean {
  const lower = baseUrl.toLowerCase()
  return lower.includes("ollama") || /:11434(?:\/|$)/.test(lower)
}

function isDeepSeekBaseUrl(baseUrl: string): boolean {
  try {
    return /(^|\.)deepseek\.com$/i.test(new URL(baseUrl).hostname)
  } catch {
    return false
  }
}

function stripCodeFence(content: string): string {
  const match = /```(?:json)?\s*([\s\S]*?)```/i.exec(content)
  return (match?.[1] ?? content).trim()
}

function parseJsonContent(content: string): unknown {
  try {
    return JSON.parse(stripCodeFence(content))
  } catch {
    throw new Error("AI provider returned content that is not valid JSON")
  }
}

async function postJson(
  endpoint: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch {
      if (controller.signal.aborted) {
        throw new Error(`AI provider request timed out after ${timeoutMs}ms`)
      }
      throw new Error("AI provider request failed")
    }

    if (!response.ok) {
      throw new Error(`AI provider request failed with status ${response.status}`)
    }

    try {
      return await response.json()
    } catch {
      if (controller.signal.aborted) {
        throw new Error(`AI provider request timed out after ${timeoutMs}ms`)
      }
      throw new Error("AI provider returned an invalid response body")
    }
  } finally {
    clearTimeout(timer)
  }
}

function buildHeaders(apiKey: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export function createOpenAiProvider(config: ProviderConfig): AiProvider {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/v1/chat/completions`
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async generateJson(prompt, schema) {
      const data = await postJson(
        endpoint,
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "generated_routine",
              schema,
              strict: false,
            },
          },
        },
        buildHeaders(config.apiKey),
        timeoutMs,
      )

      const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
        ?.message?.content
      if (typeof content !== "string") {
        throw new Error("AI provider returned an unexpected OpenAI response shape")
      }
      return parseJsonContent(content)
    },
  }
}

export function createDeepSeekProvider(config: ProviderConfig): AiProvider {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async generateJson(prompt) {
      const data = await postJson(
        endpoint,
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0,
          response_format: { type: "json_object" },
        },
        buildHeaders(config.apiKey),
        timeoutMs,
      )

      const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]
        ?.message?.content
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("AI provider returned an unexpected DeepSeek response shape")
      }
      return parseJsonContent(content)
    },
  }
}

export function createOllamaProvider(config: ProviderConfig): AiProvider {
  const endpoint = `${normalizeBaseUrl(config.baseUrl)}/api/chat`
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async generateJson(prompt, schema) {
      const data = await postJson(
        endpoint,
        {
          model: config.model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
          format: schema,
          options: { temperature: 0 },
        },
        buildHeaders(config.apiKey),
        timeoutMs,
      )

      const content = (data as { message?: { content?: unknown } })?.message?.content
      if (typeof content !== "string") {
        throw new Error("AI provider returned an unexpected Ollama response shape")
      }
      return parseJsonContent(content)
    },
  }
}

export function getProvider(): AiProvider {
  const rawBaseUrl = readEnv("AI_BASE_URL")
  const model = readEnv("AI_MODEL")
  if (!rawBaseUrl || !model) {
    throw new AiUnavailableError()
  }

  const baseUrl = normalizeEnvBaseUrl(rawBaseUrl)
  const apiKey = readEnv("AI_API_KEY")
  const timeoutMs = readTimeoutMs()
  const config: ProviderConfig = {
    baseUrl,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(timeoutMs ? { timeoutMs } : {}),
  }

  if (isOllamaBaseUrl(baseUrl)) return createOllamaProvider(config)
  if (isDeepSeekBaseUrl(baseUrl)) return createDeepSeekProvider(config)
  return createOpenAiProvider(config)
}
