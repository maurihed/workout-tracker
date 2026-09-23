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
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
    >
      <ul className="border-border/60 bg-card/85 shadow-2xl mx-auto flex max-w-lg items-stretch justify-between gap-1 rounded-full border p-1.5 backdrop-blur-xl">
        {APP_NAV.map((item) => {
          const isActive = path === item.href || path.startsWith(`${item.href}/`)
          const Icon = item.icon
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={`/${locale}${item.href}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "ease-spring flex min-h-12 flex-col items-center justify-center gap-1 rounded-full px-1 text-[0.65rem] font-semibold transition-[background-color,color,transform] duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground ring-1 ring-inset ring-foreground/10"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon
                  className="size-5"
                  weight={isActive ? "fill" : "regular"}
                  aria-hidden="true"
                />
                {t(item.labelKey)}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
