import { NextResponse } from "next/server"

import { prisma } from "@/lib/prisma"

export async function GET() {
  let db = false
  try {
    await prisma.$queryRaw`SELECT 1`
    db = true
  } catch {
    db = false
  }
  return NextResponse.json(
    { data: { status: db ? "ok" : "degraded", db } },
    { status: db ? 200 : 503 },
  )
}
