import axios from "axios"

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
})

export type ApiEnvelope<T> = { data: T }
export type ApiErrorBody = {
  error: { code: string; message: string; details?: unknown }
}
