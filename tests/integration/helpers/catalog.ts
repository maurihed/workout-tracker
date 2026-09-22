import { prisma } from "@/lib/prisma"

/**
 * Fails loudly when the exercise catalog has not been seeded. Catalog-dependent
 * integration tests should call this in `beforeAll` so a clean database yields
 * an actionable message instead of an obscure assertion failure.
 */
export async function assertCatalogSeeded(): Promise<void> {
  const count = await prisma.exercise.count()
  if (count === 0) {
    throw new Error(
      "Exercise catalog is empty. Seed it before running integration tests: `pnpm db:seed`.",
    )
  }
}
