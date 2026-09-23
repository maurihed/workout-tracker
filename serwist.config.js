// @ts-check
import { serwist } from "@serwist/next/config"

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // Precached page entries are added by the tasks that create those routes
  // (Tasks 17 and 18), so this build never references a URL that does not exist yet.
  additionalPrecacheEntries: [
    { url: "/en/offline", revision: "1" },
    { url: "/manifest.webmanifest", revision: "1" },
  ],
})
