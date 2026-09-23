"use client"

import { useTranslations } from "next-intl"
import Image from "next/image"
import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { exerciseImageUrl } from "@/lib/exercise-images"
import { cn } from "@/lib/utils"

const FRAME_INTERVAL_MS = 700

type ExerciseImageModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  name: string
  imagePaths: string[]
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function ExerciseImageFrames({ name, urls }: { name: string; urls: string[] }) {
  const t = useTranslations("runner")
  const [frame, setFrame] = useState(0)
  const [paused, setPaused] = useState(false)
  const count = urls.length

  useEffect(() => {
    if (paused || count < 2 || prefersReducedMotion()) return
    const id = window.setInterval(() => {
      setFrame((current) => (current + 1) % count)
    }, FRAME_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [paused, count])

  const currentUrl = urls[frame % count] ?? ""
  const stateLabel = frame === 0 ? t("image.start") : t("image.end")

  return (
    <>
      <DialogDescription>{stateLabel}</DialogDescription>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        aria-label={paused ? t("image.play") : t("image.pause")}
        className={cn(
          "focus-visible:border-ring focus-visible:ring-ring/50 relative block w-full overflow-hidden rounded-2xl border bg-muted outline-none focus-visible:ring-3",
        )}
      >
        <Image
          src={currentUrl}
          alt={`${name} — ${stateLabel}`}
          width={640}
          height={640}
          unoptimized={currentUrl.endsWith(".svg")}
          className="h-auto w-full object-contain"
        />
      </button>
    </>
  )
}

export function ExerciseImageModal({
  open,
  onOpenChange,
  name,
  imagePaths,
}: ExerciseImageModalProps) {
  const urls = imagePaths.map((path) => exerciseImageUrl(path))
  if (urls.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{name}</DialogTitle>
        <ExerciseImageFrames name={name} urls={urls} />
      </DialogContent>
    </Dialog>
  )
}
