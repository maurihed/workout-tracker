"use client"

import { FacebookLogo, GoogleLogo } from "@phosphor-icons/react"
import { signIn } from "next-auth/react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"

export function SignInButtons({ callbackUrl = "/" }: { callbackUrl?: string }) {
  const t = useTranslations("auth")
  return (
    <div className="flex w-full flex-col gap-3">
      <Button onClick={() => signIn("google", { callbackUrl })} className="h-12">
        <GoogleLogo className="size-5" aria-hidden="true" />
        {t("signInWithGoogle")}
      </Button>
      <Button
        variant="secondary"
        onClick={() => signIn("facebook", { callbackUrl })}
        className="h-12"
      >
        <FacebookLogo className="size-5" aria-hidden="true" />
        {t("signInWithFacebook")}
      </Button>
    </div>
  )
}
