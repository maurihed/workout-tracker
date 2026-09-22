"use client"

import {
  ChartLineUp,
  Barbell,
  ListChecks,
  SquaresFour,
  UserCircle,
} from "@phosphor-icons/react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { stripLocale } from "@/lib/route-access"
import { cn } from "@/lib/utils"

export const APP_NAV = [
  { href: "/dashboard", icon: SquaresFour, labelKey: "dashboard" },
  { href: "/routines", icon: Barbell, labelKey: "routines" },
  { href: "/workout", icon: ListChecks, labelKey: "workout" },
  { href: "/progress", icon: ChartLineUp, labelKey: "progress" },
  { href: "/profile", icon: UserCircle, labelKey: "profile" },
] as const

export function BottomNav() {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const { locale, path } = stripLocale(pathname)

  return (
    <nav
      aria-label={t("label")}
      className="bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed inset-x-0 bottom-0 z-40 border-t pt-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {APP_NAV.map((item) => {
          const isActive = path === item.href || path.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={`/${locale}${item.href}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-xs",
                  isActive ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="size-6" aria-hidden="true" />
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
