"use client"

import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"

import { Disclaimer } from "@/features/ai/components/disclaimer"
import { GenerateForm } from "@/features/ai/components/generate-form"
import { JobProgress } from "@/features/ai/components/job-progress"
import { RoutinePreviewCard } from "@/features/ai/components/routine-preview-card"
import { useAcceptAiJob } from "@/features/ai/hooks/use-accept-ai-job"
import { useAiJob } from "@/features/ai/hooks/use-ai-jobs"
import { useCancelAiJob } from "@/features/ai/hooks/use-cancel-ai-job"
import { useCreateAiJob } from "@/features/ai/hooks/use-create-ai-job"
import type { AiJobInput } from "@/features/ai/lib/contract"

function errorCode(error: unknown): string | undefined {
  return (
    error as { response?: { data?: { error?: { code?: string } } } }
  )?.response?.data?.error?.code
}

export default function GenerateRoutinePage() {
  const t = useTranslations("ai")
  const locale = useLocale()
  const router = useRouter()

  const [jobId, setJobId] = useState<string | null>(null)
  const [lastInput, setLastInput] = useState<AiJobInput | null>(null)

  const createJob = useCreateAiJob()
  const cancelJob = useCancelAiJob()
  const acceptJob = useAcceptAiJob()
  const { data: job } = useAiJob(jobId ?? "", { enabled: jobId !== null })

  function handleCreate(input: AiJobInput) {
    setLastInput(input)
    createJob.mutate(input, {
      onSuccess: (created) => setJobId(created.id),
      onError: (error) => {
        toast.error(
          errorCode(error) === "rate_limited"
            ? t("errors.rateLimited")
            : t("errors.generic"),
        )
      },
    })
  }

  function handleRegenerate() {
    const input = lastInput ?? job?.input ?? null
    if (!input) {
      setJobId(null)
      return
    }
    handleCreate(input)
  }

  function handleAccept() {
    if (!jobId) return
    acceptJob.mutate(jobId, {
      onSuccess: ({ routineId }) =>
        router.push(`/${locale}/routines/${routineId}`),
      onError: () => toast.error(t("errors.generic")),
    })
  }

  function handleDiscard() {
    setJobId(null)
    setLastInput(null)
    createJob.reset()
    cancelJob.reset()
    acceptJob.reset()
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-3xl font-bold tracking-tight">
        {t("title")}
      </h1>

      {jobId && job?.status === "succeeded" && job.result ? (
        <RoutinePreviewCard
          result={job.result}
          model={job.model}
          promptVersion={job.promptVersion}
          onAccept={handleAccept}
          onRegenerate={handleRegenerate}
          onDiscard={handleDiscard}
          isAccepting={acceptJob.isPending}
          isRegenerating={createJob.isPending}
        />
      ) : jobId ? (
        <>
          <JobProgress
            status={job?.status ?? "queued"}
            error={job?.error ?? null}
            onCancel={() => cancelJob.mutate(jobId)}
            isCancelling={cancelJob.isPending}
            onRestart={handleRegenerate}
          />
          <Disclaimer />
        </>
      ) : (
        <>
          <GenerateForm
            onSubmit={handleCreate}
            isPending={createJob.isPending}
          />
          <Disclaimer />
        </>
      )}
    </div>
  )
}
