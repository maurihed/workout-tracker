import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2.5 text-[0.7rem] font-semibold tracking-wide whitespace-nowrap uppercase transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/60 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive aria-invalid:ring-destructive/30 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground ring-1 ring-inset ring-foreground/10 [a]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground ring-1 ring-inset ring-foreground/10 [a]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground ring-1 ring-inset ring-foreground/10 [a]:hover:bg-destructive/90",
        success: "bg-success text-success-foreground",
        warning: "bg-warning text-warning-foreground",
        outline:
          "border-border bg-transparent text-foreground [a]:hover:bg-muted",
        ghost:
          "hover:bg-muted hover:text-muted-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
