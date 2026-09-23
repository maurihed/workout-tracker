"use client"

import { useEffect, useId, useRef } from "react"

import { Button } from "@/components/ui/button"

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  const descriptionId = useId()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="bg-card text-card-foreground ring-foreground/10 w-full max-w-sm rounded-xl p-4 shadow-lg ring-1"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="font-heading text-base font-medium">
          {title}
        </h2>
        {description ? (
          <p id={descriptionId} className="text-muted-foreground mt-1 text-sm">
            {description}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="destructive"
            className="h-11"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
