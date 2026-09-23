"use client"

import {
  ArrowsLeftRight,
  CaretLeft,
  CaretRight,
  FlagCheckered,
  ListBullets,
  Pause,
  Play,
  Prohibit,
  SpeakerHigh,
  SpeakerSlash,
  XCircle,
} from "@phosphor-icons/react"
import { useLocale, useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useProfile } from "@/features/profile/hooks/use-profile"
import { ExerciseOverview } from "@/features/workouts/components/exercise-overview"
import {
  ExerciseView,
  type LastPerformance,
} from "@/features/workouts/components/exercise-view"
import { IntervalTimer } from "@/features/workouts/components/interval-timer"
import { RestTimerBar } from "@/features/workouts/components/rest-timer-bar"
import { RunnerHeader } from "@/features/workouts/components/runner-header"
import { SwapExerciseSheet } from "@/features/workouts/components/swap-exercise-sheet"
import type {
  SessionDTO,
  SessionExerciseDTO,
  SessionTimerType,
} from "@/features/workouts/hooks/use-active-session"
import type { UnitSystem } from "@/features/workouts/components/set-row"
import { useAbandonSession } from "@/features/workouts/hooks/use-abandon-session"
import { useCompleteSession } from "@/features/workouts/hooks/use-complete-session"
import { useSoundPreference } from "@/features/workouts/hooks/use-sound-preference"
import { useUpdateSession } from "@/features/workouts/hooks/use-update-session"
import {
  getHttpStatus,
  isRetryableSaveError,
} from "@/features/workouts/lib/save-errors"
import {
  adjust as adjustTimer,
  pause as pauseTimer,
  resume as resumeTimer,
  skipRound as skipRoundTimer,
  startInterval as startIntervalTimer,
  startRest as startRestTimer,
  tick as tickTimer,
  type TimerState,
} from "@/features/workouts/lib/timer"
import {
  useSessionStore,
  type SessionSetPatch,
} from "@/features/workouts/stores/session-store"

const PUSH_DEBOUNCE_MS = 2000
// Cap for the exponential backoff that retries a failed debounced save.
const PUSH_MAX_BACKOFF_MS = 30_000

type SaveStatus = "idle" | "saving" | "saved" | "error"

type WakeLockSentinelLike = { release: () => Promise<void> }

/** A paused interval timer for timed exercises, or `null` for rep-based work. */
function buildExerciseTimer(
  timerType: SessionTimerType | null,
  workSeconds: number | null,
  restSeconds: number | null,
  rounds: number | null,
): TimerState | null {
  if (!timerType || timerType === "none") return null
  return pauseTimer(
    startIntervalTimer({
      workSeconds: workSeconds ?? 0,
      restSeconds: restSeconds ?? 0,
      rounds: rounds ?? 1,
    }),
  )
}

export function WorkoutRunner({
  session,
  onSessionConflict,
}: {
  session: SessionDTO
  /**
   * Called when a save fails because the session is no longer in progress
   * (409) — e.g. another tab finished it. The page refetches the active session
   * so the runner exits instead of retrying the doomed save forever.
   */
  onSessionConflict?: () => void
}) {
  const t = useTranslations("runner")
  const tTimers = useTranslations("timers")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const router = useRouter()

  const { data: profile } = useProfile()
  const unitSystem: UnitSystem = profile?.unitSystem ?? "metric"

  const exercises = useSessionStore((state) => state.exercises)
  const currentIndex = useSessionStore((state) => state.currentIndex)
  const activeSeconds = useSessionStore((state) => state.activeSeconds)
  const isDirty = useSessionStore((state) => state.isDirty)
  const hydrate = useSessionStore((state) => state.hydrate)
  const reset = useSessionStore((state) => state.reset)
  const toggleSet = useSessionStore((state) => state.toggleSet)
  const addSet = useSessionStore((state) => state.addSet)
  const skipExercise = useSessionStore((state) => state.skipExercise)
  const swapExercise = useSessionStore((state) => state.swapExercise)
  const setNotes = useSessionStore((state) => state.setNotes)
  const goTo = useSessionStore((state) => state.goTo)

  const update = useUpdateSession(session.id)
  const complete = useCompleteSession(session.id)
  const abandon = useAbandonSession(session.id)

  // Seed the timer from the session DTO so a timed first exercise shows its
  // paused interval timer on the very first paint, before the store hydrates.
  const firstExercise = session.exercises[0] ?? null
  const initialTimer = buildExerciseTimer(
    firstExercise?.timerType ?? null,
    firstExercise?.workSeconds ?? null,
    firstExercise?.restSeconds ?? null,
    firstExercise?.rounds ?? null,
  )
  const [timer, setTimer] = useState<TimerState | null>(initialTimer)
  const [paused, setPaused] = useState(false)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)
  const [finishOpen, setFinishOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")
  const [soundOn, setSoundOn] = useSoundPreference()

  const timerRef = useRef<TimerState | null>(initialTimer)
  const pausedRef = useRef(false)
  // Rest accrual is tracked manually (rather than from wall-clock) so a paused
  // session does not count as resting. `startedAt` is null while paused.
  const restRef = useRef<{
    exerciseId: string
    setNumber: number
    accumulatedMs: number
    startedAt: number | null
  } | null>(null)
  const editVersionRef = useRef(0)
  const updateRef = useRef(update)
  const reducedMotionRef = useRef(false)
  const soundOnRef = useRef(soundOn)
  const sessionConflictRef = useRef(onSessionConflict)

  // Serializes every write through one promise chain so an older payload can
  // never land after a newer one (debounce + visibility/finish can race).
  const pushChainRef = useRef<Promise<unknown>>(Promise.resolve())
  const pushTimerRef = useRef<number | null>(null)
  const pushKeepaliveRef = useRef(false)
  const pushingRef = useRef(false)
  const pendingPushRef = useRef(false)
  const retryAttemptRef = useRef(0)
  const unmountedRef = useRef(false)
  const runPushRef = useRef<() => Promise<void>>(async () => undefined)

  useEffect(() => {
    updateRef.current = update
  })

  useEffect(() => {
    soundOnRef.current = soundOn
  }, [soundOn])

  useEffect(() => {
    sessionConflictRef.current = onSessionConflict
  }, [onSessionConflict])

  const applyTimer = useCallback((nextTimer: TimerState | null) => {
    timerRef.current = nextTimer
    setTimer(nextTimer)
  }, [])

  const playAlert = useCallback(() => {
    // Respect a muted toggle and the user's motion preference for both the
    // vibration and the beep.
    if (reducedMotionRef.current || !soundOnRef.current) return
    try {
      if (typeof navigator.vibrate === "function") navigator.vibrate(200)
    } catch {
      // Vibration is a progressive enhancement.
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return
      const context = new Ctor()
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, context.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.3)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.32)
      oscillator.onended = () => {
        void context.close().catch(() => undefined)
      }
    } catch {
      // Web Audio is a progressive enhancement.
    }
  }, [])

  const finishRest = useCallback(() => {
    const rest = restRef.current
    restRef.current = null
    if (!rest) return
    const live = rest.startedAt == null ? 0 : Date.now() - rest.startedAt
    const elapsed = Math.max(0, Math.round((rest.accumulatedMs + live) / 1000))
    toggleSet(rest.exerciseId, rest.setNumber, { restSecondsLogged: elapsed })
  }, [toggleSet])

  const pauseRest = useCallback(() => {
    const rest = restRef.current
    if (!rest || rest.startedAt == null) return
    rest.accumulatedMs += Date.now() - rest.startedAt
    rest.startedAt = null
  }, [])

  const resumeRest = useCallback(() => {
    const rest = restRef.current
    if (!rest || rest.startedAt != null) return
    rest.startedAt = Date.now()
  }, [])

  const startRestFor = useCallback(
    (exerciseId: string, setNumber: number, seconds: number) => {
      finishRest()
      restRef.current = {
        exerciseId,
        setNumber,
        accumulatedMs: 0,
        startedAt: pausedRef.current ? null : Date.now(),
      }
      applyTimer(startRestTimer(seconds))
    },
    [applyTimer, finishRest],
  )

  // Appends a write to the single serialized chain so requests stay ordered.
  const enqueuePush = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = () => task()
    const next = pushChainRef.current.then(run, run)
    pushChainRef.current = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }, [])

  const schedulePush = useCallback(
    (delay: number, keepalive = false) => {
      if (unmountedRef.current) return
      if (pushTimerRef.current !== null) window.clearTimeout(pushTimerRef.current)
      pushKeepaliveRef.current = keepalive
      pushTimerRef.current = window.setTimeout(() => {
        pushTimerRef.current = null
        void runPushRef.current()
      }, delay)
    },
    [],
  )

  /**
   * Persists the current store snapshot once. A failure re-schedules itself
   * with bounded exponential backoff while the store is still dirty, so a
   * transient network error never silently drops logged sets.
   */
  const pushState = useCallback(async () => {
    if (unmountedRef.current) return
    if (pushingRef.current) {
      // A write is already in flight; ask for one more trailing push.
      pendingPushRef.current = true
      return
    }
    pushingRef.current = true
    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
    }
    const keepalive = pushKeepaliveRef.current
    pushKeepaliveRef.current = false
    setSaveStatus("saving")
    let failed = false
    let retryable = true
    let sessionConflict = false
    let versionMismatch = false
    try {
      await enqueuePush(async () => {
        const version = editVersionRef.current
        const input = useSessionStore.getState().toStateInput()
        await updateRef.current.mutateAsync({ input, keepalive })
        if (editVersionRef.current === version) {
          useSessionStore.setState({ isDirty: false })
        } else {
          versionMismatch = true
        }
      })
    } catch (error) {
      failed = true
      retryable = isRetryableSaveError(error)
      sessionConflict = getHttpStatus(error) === 409
    } finally {
      pushingRef.current = false
    }
    if (unmountedRef.current) return
    const dirty = useSessionStore.getState().isDirty
    const queued = pendingPushRef.current
    pendingPushRef.current = false

    if (failed) {
      setSaveStatus("error")
      // A 409 means the session is no longer in progress (another tab finished
      // or abandoned it). Refresh the active query so the runner exits/updates.
      if (sessionConflict) sessionConflictRef.current?.()
      // Retry only transient failures (network / timeout / 5xx). A terminal 4xx
      // stops the loop and leaves the explicit retry button to the user.
      if (!retryable) {
        retryAttemptRef.current = 0
        return
      }
      retryAttemptRef.current += 1
      const backoff = Math.min(
        PUSH_DEBOUNCE_MS * 2 ** retryAttemptRef.current,
        PUSH_MAX_BACKOFF_MS,
      )
      schedulePush(backoff)
      return
    }

    retryAttemptRef.current = 0
    if (dirty || versionMismatch) {
      setSaveStatus("saving")
      schedulePush(PUSH_DEBOUNCE_MS)
      return
    }
    if (queued) {
      schedulePush(0)
      return
    }
    setSaveStatus("saved")
  }, [enqueuePush, schedulePush])

  useEffect(() => {
    runPushRef.current = pushState
  }, [pushState])

  const retrySave = useCallback(() => {
    retryAttemptRef.current = 0
    schedulePush(0)
  }, [schedulePush])

  // Hydrate the authoritative client store from the server DTO once per session
  // id. Keying on the *store's* sessionId (not a ref) keeps StrictMode's
  // simulated unmount→remount from leaving the runner empty: the reset cleanup
  // nulls the store id, so the remount re-hydrates.
  useEffect(() => {
    if (useSessionStore.getState().sessionId === session.id) return
    hydrate(session)
  }, [hydrate, session])

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
  }, [])

  // Best-effort screen wake lock for the lifetime of the runner. Browsers
  // release it when the page is hidden, so re-acquire when it becomes visible.
  useEffect(() => {
    let sentinel: WakeLockSentinelLike | null = null
    let cancelled = false
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: {
          request: (type: "screen") => Promise<WakeLockSentinelLike>
        }
      }
    ).wakeLock

    async function acquire() {
      if (!wakeLock || cancelled) return
      try {
        if (sentinel) {
          try {
            await sentinel.release()
          } catch {
            // Already released by the browser when hidden.
          }
          sentinel = null
        }
        const held = await wakeLock.request("screen")
        if (cancelled) {
          void held.release().catch(() => undefined)
          return
        }
        sentinel = held
      } catch {
        // Wake lock is a progressive enhancement.
      }
    }

    void acquire()
    function handleVisibility() {
      if (document.visibilityState === "visible") void acquire()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibility)
      if (sentinel) void sentinel.release().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current)
        pushTimerRef.current = null
      }
      reset()
    }
  }, [reset])

  const currentExercise = exercises[currentIndex] ?? null
  const currentTimerType = currentExercise?.timerType ?? null
  const currentRestSeconds = currentExercise?.restSeconds ?? null

  // Timer setup is event-driven: rest timers start on set completion, interval
  // timers are rebuilt (paused) when the user navigates to a timed exercise.
  const primeTimerFor = useCallback(
    (index: number) => {
      finishRest()
      const exercise = exercises[index] ?? null
      applyTimer(
        buildExerciseTimer(
          exercise?.timerType ?? null,
          exercise?.workSeconds ?? null,
          exercise?.restSeconds ?? null,
          exercise?.rounds ?? null,
        ),
      )
    },
    [applyTimer, exercises, finishRest],
  )

  const goToExercise = useCallback(
    (index: number) => {
      goTo(index)
      primeTimerFor(index)
    },
    [goTo, primeTimerFor],
  )

  // Foreground 1s ticker: advances elapsed time and the active timer.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (pausedRef.current) return
      const store = useSessionStore.getState()
      store.setActiveSeconds(store.activeSeconds + 1)
      const running = timerRef.current
      if (!running || !running.running) return
      const advanced = tickTimer(running)
      if (running.phase !== "idle" && advanced.phase === "idle") {
        playAlert()
        if (running.kind === "rest") finishRest()
      }
      applyTimer(advanced)
    }, 1000)
    return () => window.clearInterval(id)
  }, [applyTimer, finishRest, playAlert])

  // Bump a version on every edit so an in-flight push can tell whether it is
  // still the latest state (and therefore owns clearing `isDirty`).
  useEffect(() => {
    editVersionRef.current += 1
  }, [exercises])

  // Debounced push: any edit (isDirty) schedules a PUT ~2s after the last edit.
  useEffect(() => {
    if (!isDirty) return
    schedulePush(PUSH_DEBOUNCE_MS)
    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current)
        pushTimerRef.current = null
      }
    }
  }, [exercises, isDirty, schedulePush])

  // Last-chance push when the tab/app is backgrounded, but only when there are
  // unsaved edits (an unconditional PUT would race the destructive replaceSets).
  // Uses `keepalive` so the request outlives the hidden tab.
  useEffect(() => {
    if (!isDirty) return
    function handleVisibility() {
      if (document.visibilityState === "hidden") schedulePush(0, true)
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility)
  }, [isDirty, schedulePush])

  // Media + previous-performance are keyed by CATALOG exercise id so a swap
  // (which rewrites the store's `exerciseId`) immediately drops the replaced
  // exercise's thumbnail/hint instead of showing stale data.
  const { mediaByExerciseId, lastPerformanceByExerciseId } = useMemo(() => {
    const media = new Map<string, SessionExerciseDTO["exercise"]>()
    const lastPerformance = new Map<string, LastPerformance>()
    for (const item of session.exercises) {
      const catalogId = item.exerciseId ?? item.exercise?.id ?? null
      if (!catalogId) continue
      if (item.exercise) media.set(catalogId, item.exercise)
      if (item.lastPerformance)
        lastPerformance.set(catalogId, item.lastPerformance)
    }
    return {
      mediaByExerciseId: media,
      lastPerformanceByExerciseId: lastPerformance,
    }
  }, [session.exercises])

  const currentExerciseId = currentExercise?.exerciseId ?? null
  const currentMedia = currentExerciseId
    ? mediaByExerciseId.get(currentExerciseId)
    : undefined
  const currentLastPerformance = currentExerciseId
    ? (lastPerformanceByExerciseId.get(currentExerciseId) ?? null)
    : null

  const totalSets = exercises.reduce((sum, item) => sum + item.sets.length, 0)
  const completedSets = exercises.reduce(
    (sum, item) =>
      sum + item.sets.filter((entry) => entry.completedAt !== null).length,
    0,
  )
  const hasUnfinished = exercises.some(
    (item) =>
      !item.skipped && item.sets.some((entry) => entry.completedAt === null),
  )

  function handleSetComplete(setNumber: number, completed: boolean) {
    if (!currentExercise) return
    const patch: SessionSetPatch = {
      completedAt: completed ? new Date().toISOString() : null,
    }
    // Persist the displayed last-performance prefill when the user checks off a
    // set they never typed into, so the shown values are actually saved.
    if (completed) {
      const set = currentExercise.sets.find(
        (entry) => entry.setNumber === setNumber,
      )
      if (set?.reps == null && currentLastPerformance?.reps != null) {
        patch.reps = currentLastPerformance.reps
      }
      if (set?.weightKg == null && currentLastPerformance?.weightKg != null) {
        patch.weightKg = currentLastPerformance.weightKg
      }
    }
    toggleSet(currentExercise.id, setNumber, patch)
    if (
      completed &&
      (!currentTimerType || currentTimerType === "none") &&
      (currentRestSeconds ?? 0) > 0
    ) {
      startRestFor(currentExercise.id, setNumber, currentRestSeconds ?? 0)
    }
  }

  function handleTogglePause() {
    const nextPaused = !pausedRef.current
    pausedRef.current = nextPaused
    setPaused(nextPaused)
    const running = timerRef.current
    if (running && running.phase !== "idle") {
      applyTimer(nextPaused ? pauseTimer(running) : resumeTimer(running))
    }
    if (nextPaused) pauseRest()
    else resumeRest()
    schedulePush(0)
  }

  async function finishSession() {
    pausedRef.current = true
    setPaused(true)
    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
    }
    pendingPushRef.current = false
    // Flush the header (via the serialized chain) before finalizing.
    try {
      await enqueuePush(async () => {
        const input = useSessionStore.getState().toStateInput()
        await updateRef.current.mutateAsync({ input })
      })
      useSessionStore.setState({ isDirty: false })
      retryAttemptRef.current = 0
    } catch {
      // Best effort: still finalize so the user isn't stuck in the runner.
      setSaveStatus("error")
    }
    try {
      await complete.mutateAsync(useSessionStore.getState().activeSeconds)
      router.push(`/${locale}/workout/summary/${session.id}`)
    } catch {
      setFinishOpen(false)
      toast.error(t("save.finishError"))
    }
  }

  async function discardSession() {
    try {
      await abandon.mutateAsync()
    } catch {
      // Ignore; the active query invalidation decides the next view.
    }
    reset()
    router.push(`/${locale}/dashboard`)
  }

  return (
    <div className="flex flex-col gap-4">
      <RunnerHeader
        elapsedSeconds={activeSeconds}
        index={currentIndex}
        total={exercises.length}
        completedSets={completedSets}
        totalSets={totalSets}
      />

      <div className="flex items-center justify-between gap-2">
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex min-h-5 items-center gap-2 text-xs"
        >
          {saveStatus === "saving" ? t("save.saving") : null}
          {saveStatus === "saved" ? t("save.saved") : null}
          {saveStatus === "error" ? (
            <>
              <span className="text-destructive">{t("save.error")}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={retrySave}
              >
                {t("save.retry")}
              </Button>
            </>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5"
          aria-pressed={soundOn}
          onClick={() => setSoundOn(!soundOn)}
        >
          {soundOn ? (
            <SpeakerHigh className="size-4" aria-hidden="true" />
          ) : (
            <SpeakerSlash className="size-4" aria-hidden="true" />
          )}
          {soundOn ? tTimers("soundOn") : tTimers("soundOff")}
        </Button>
      </div>

      {currentTimerType && currentTimerType !== "none" && timer ? (
        <IntervalTimer
          timer={timer}
          onStart={() => {
            // A finished interval can be restarted (rather than leaving Start
            // as a dead control at idle).
            if (timer.phase === "idle") {
              const rebuilt = buildExerciseTimer(
                currentTimerType,
                currentExercise?.workSeconds ?? null,
                currentExercise?.restSeconds ?? null,
                currentExercise?.rounds ?? null,
              )
              if (rebuilt) applyTimer(resumeTimer(rebuilt))
              return
            }
            applyTimer(resumeTimer(timer))
          }}
          onPause={() => applyTimer(pauseTimer(timer))}
          onSkipRound={() => applyTimer(skipRoundTimer(timer))}
        />
      ) : null}

      {(!currentTimerType || currentTimerType === "none") &&
      timer &&
      timer.kind === "rest" &&
      timer.phase !== "idle" ? (
        <RestTimerBar
          timer={timer}
          onAdjust={(delta) => {
            const running = timerRef.current
            if (running && running.kind === "rest") {
              applyTimer(adjustTimer(running, delta))
            }
          }}
          onSkip={() => {
            finishRest()
            applyTimer(null)
          }}
        />
      ) : null}

      {currentExercise ? (
        <ExerciseView
          exercise={{
            id: currentExercise.id,
            nameSnapshot: currentExercise.nameSnapshot,
            targetSets: currentExercise.targetSets,
            targetReps: currentExercise.targetReps,
            restSeconds: currentExercise.restSeconds,
            notes: currentExercise.notes,
            sets: currentExercise.sets.map((entry) => ({
              setNumber: entry.setNumber,
              type: entry.type,
              reps: entry.reps,
              weightKg: entry.weightKg,
              durationSeconds: entry.durationSeconds,
              rpe: entry.rpe,
              restSecondsLogged: entry.restSecondsLogged,
              completedAt: entry.completedAt,
            })),
          }}
          unitSystem={unitSystem}
          imagePath={currentMedia?.images?.[0] ?? null}
          lastPerformance={currentLastPerformance}
          onSetChange={(setNumber, patch) => {
            toggleSet(currentExercise.id, setNumber, patch)
          }}
          onSetComplete={handleSetComplete}
          onAddSet={() => addSet(currentExercise.id)}
          onNotesChange={(notes) => setNotes(currentExercise.id, notes)}
        />
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={currentIndex === 0}
          onClick={() => goToExercise(currentIndex - 1)}
        >
          <CaretLeft className="size-5" aria-hidden="true" />
          {t("prev")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={currentIndex >= exercises.length - 1}
          onClick={() => goToExercise(currentIndex + 1)}
        >
          {t("next")}
          <CaretRight className="size-5" aria-hidden="true" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-12"
          onClick={() => setOverviewOpen(true)}
        >
          <ListBullets className="size-5" aria-hidden="true" />
          {t("overview.title")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={!currentExercise}
          onClick={() => setSwapOpen(true)}
        >
          <ArrowsLeftRight className="size-5" aria-hidden="true" />
          {t("swap.title")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          disabled={!currentExercise}
          onClick={() => {
            if (!currentExercise) return
            skipExercise(currentExercise.id, !currentExercise.skipped)
          }}
        >
          <Prohibit className="size-5" aria-hidden="true" />
          {currentExercise?.skipped ? t("unskip") : t("skip")}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-12"
          onClick={handleTogglePause}
        >
          {paused ? (
            <Play className="size-5" aria-hidden="true" />
          ) : (
            <Pause className="size-5" aria-hidden="true" />
          )}
          {paused ? t("resumeSession") : t("pause")}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          type="button"
          className="h-12 w-full"
          onClick={() => {
            if (hasUnfinished) setFinishOpen(true)
            else void finishSession()
          }}
        >
          <FlagCheckered className="size-5" aria-hidden="true" />
          {t("finish")}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="h-12 w-full"
          onClick={() => setDiscardOpen(true)}
        >
          <XCircle className="size-5" aria-hidden="true" />
          {t("discard")}
        </Button>
      </div>

      <ExerciseOverview
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        currentIndex={currentIndex}
        exercises={exercises.map((item) => ({
          id: item.id,
          nameSnapshot: item.nameSnapshot,
          completed: item.completed,
          skipped: item.skipped,
          setCount: item.sets.length,
        }))}
        onSelect={(index) => goToExercise(index)}
      />

      <SwapExerciseSheet
        open={swapOpen}
        onOpenChange={setSwapOpen}
        onSelect={(target) => {
          if (currentExercise) swapExercise(currentExercise.id, target)
        }}
      />

      <AlertDialog open={finishOpen} onOpenChange={setFinishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("finish")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("finishConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void finishSession()}>
              {t("finish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("discard")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("discardConfirm")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void discardSession()}
            >
              {t("discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
