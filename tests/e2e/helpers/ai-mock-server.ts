import { createServer, type Server } from "node:http"

export const AI_MOCK_PORT = 4010

export const AI_MOCK_MODEL = "e2e-mock"

export const AI_MOCK_ROUTINE = {
  name: "E2E AI Plan",
  goal: "build_muscle",
  days: [
    {
      weekday: 1,
      label: "AI Day",
      exercises: [
        {
          sourceId: "Barbell_Full_Squat",
          name: "Barbell Full Squat",
          sets: 3,
          reps: "8-12",
          restSeconds: 90,
          timerType: "none",
        },
        {
          name: "Zzqx Wibbleflarp",
          sets: 3,
          reps: "10",
          restSeconds: 60,
          timerType: "none",
        },
      ],
    },
  ],
} as const

function openAiResponse() {
  return JSON.stringify({
    choices: [{ message: { content: JSON.stringify(AI_MOCK_ROUTINE) } }],
  })
}

export function startAiMockServer(port = AI_MOCK_PORT): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ status: "ok" }))
      return
    }

    if (req.method === "POST" && req.url?.startsWith("/v1/chat/completions")) {
      req.resume()
      req.on("end", () => {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(openAiResponse())
      })
      return
    }

    res.writeHead(404, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "not_found" }))
  })

  return new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => resolve(server))
  })
}
