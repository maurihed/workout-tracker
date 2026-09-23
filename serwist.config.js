// @ts-check
import { serwist } from "@serwist/next/config"

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  // @serwist/next auto-precaches the statically prerendered routes (including
  // `/en/offline`), so adding them here would create conflicting manifest entries.
  additionalPrecacheEntries: [],
})
