import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted before:absolute before:inset-0 before:animate-[volt-shimmer_1.8s_linear_infinite] before:bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--foreground)_8%,transparent),transparent)] before:bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
