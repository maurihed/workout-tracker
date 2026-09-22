"use client"

import { QueryClientProvider } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { createQueryClient } from "@/lib/query-client"

export function QueryProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common")
  const [client] = useState(createQueryClient)

  useEffect(() => {
    client.getMutationCache().config.onError = () => {
      toast.error(t("error"))
    }
  }, [client, t])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
