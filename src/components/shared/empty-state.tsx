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
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Icon className="text-muted-foreground size-10" aria-hidden="true" />
      <h2 className="font-heading text-base font-medium">{title}</h2>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}
