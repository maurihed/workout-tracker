import type { Icon } from "@phosphor-icons/react"
import type { ReactNode } from "react"

type EmptyStateProps = {
  icon: Icon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="animate-rise flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="bg-muted text-muted-foreground flex size-16 items-center justify-center rounded-3xl ring-1 ring-(--surface-ring)">
        <Icon className="size-8" aria-hidden="true" />
      </span>
      <h2 className="font-heading text-lg font-bold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-muted-foreground max-w-xs text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
