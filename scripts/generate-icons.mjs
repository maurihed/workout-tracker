import { readFile, writeFile } from "node:fs/promises"
import sharp from "sharp"

const svg = await readFile("public/icons/icon.svg")

async function png(size, out) {
  await writeFile(out, await sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
}

await png(192, "public/icons/icon-192.png")
await png(512, "public/icons/icon-512.png")
await png(180, "public/icons/apple-touch-icon.png")
