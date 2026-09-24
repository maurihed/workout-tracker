"use client"

import dynamic from "next/dynamic"
import * as React from "react"
import type { ComponentType } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function ChartSkeleton({
  className,
}: {
  className?: string | undefined
}) {
  return (
    <Skeleton
      role="status"
      aria-busy="true"
      className={cn("h-48 w-full rounded-3xl", className)}
    />
  )
}

export function chartBoundary<P extends object>(
  loader: () => Promise<{ default: ComponentType<P> }>,
  skeletonClassName?: string | undefined
): ComponentType<P> {
  return dynamic(loader, {
    ssr: false,
    loading: () => <ChartSkeleton className={skeletonClassName} />,
  })
}

function subscribe() {
  return () => {}
}

export function ChartShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string | undefined
}) {
  const mounted = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )

  if (!mounted) {
    return <ChartSkeleton className={className} />
  }

  return <div className={className}>{children}</div>
}
