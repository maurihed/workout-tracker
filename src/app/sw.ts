/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import {
  CacheFirst, ExpirationPlugin, NetworkFirst, Serwist, StaleWhileRevalidate,
} from "serwist"
import { flushOutbox } from "@/lib/offline/sync"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const catalog = new StaleWhileRevalidate({
  cacheName: "api-catalog-v1",
  plugins: [new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 })],
})
const apiData = new NetworkFirst({
  cacheName: "api-data-v1",
  networkTimeoutSeconds: 3,
  plugins: [new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 })],
})
const images = new CacheFirst({
  cacheName: "images-v1",
  plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 })],
})

const API_DATA_PATHS = new Set([
  "/api/sessions/active", "/api/routines/active", "/api/profile", "/api/me",
])

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    { matcher: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/exercises"), handler: catalog },
    { matcher: ({ url, request }) => request.method === "GET" && API_DATA_PATHS.has(url.pathname), handler: apiData },
    { matcher: ({ request }) => request.destination === "image", handler: images },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      { url: "/en/offline", matcher: ({ request }) => request.destination === "document" },
    ],
  },
})

serwist.addEventListeners()

self.addEventListener("sync", (event) => {
  const syncEvent = event as ExtendableEvent & { tag?: string }
  if (syncEvent.tag === "gym-session-sync") syncEvent.waitUntil(flushOutbox())
})
