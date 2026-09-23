import { SerwistProvider } from "@serwist/next/react"
import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider, hasLocale } from "next-intl"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"

import "../globals.css"

import { AuthProvider } from "@/components/auth-provider"
import { OfflineSyncManager } from "@/components/offline-sync-manager"
import { QueryProvider } from "@/components/query-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { routing } from "@/i18n/routing"
import { fontBody, fontHeading } from "@/lib/fonts"

export const metadata: Metadata = {
  applicationName: "Gym Tracker",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Gym Tracker" },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${fontBody.variable} ${fontHeading.variable}`}
    >
      <body className="bg-background text-foreground min-h-dvh antialiased">
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV === "development"}>
          <NextIntlClientProvider>
            <AuthProvider>
              <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                <QueryProvider>
                  <OfflineSyncManager />
                  {children}
                </QueryProvider>
                <Toaster richColors />
              </ThemeProvider>
            </AuthProvider>
          </NextIntlClientProvider>
        </SerwistProvider>
      </body>
    </html>
  )
}
