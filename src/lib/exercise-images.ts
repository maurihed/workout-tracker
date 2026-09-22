const IMAGE_BASE =
  process.env.NEXT_PUBLIC_EXERCISE_IMAGE_BASE ??
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"

export function exerciseImageUrl(path: string | undefined): string {
  if (!path) return "/images/exercise-placeholder.svg"
  return `${IMAGE_BASE}/${path}`
}
