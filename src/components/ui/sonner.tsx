"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import {
  CheckCircle,
  CircleNotch,
  Info,
  Warning,
  WarningOctagon,
} from "@phosphor-icons/react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={(theme ?? "system") as NonNullable<ToasterProps["theme"]>}
      className="toaster group"
      icons={{
        success: (
          <CheckCircle className="size-4" weight="fill" />
        ),
        info: (
          <Info className="size-4" weight="fill" />
        ),
        warning: (
          <Warning className="size-4" weight="fill" />
        ),
        error: (
          <WarningOctagon className="size-4" weight="fill" />
        ),
        loading: (
          <CircleNotch className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "1.25rem",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast font-medium",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
