export type TimerKind = "rest" | "interval"
export type TimerPhase = "work" | "rest" | "idle"

export type TimerState = {
  kind: TimerKind
  phase: TimerPhase
  remaining: number
  total: number
  running: boolean
  round: number
  rounds: number
  workSeconds: number
  restSeconds: number
  deadline: number | null
}

export function startRest(seconds: number, now: number = Date.now()): TimerState {
  const safe = Math.max(0, seconds)
  return {
    kind: "rest",
    phase: "rest",
    remaining: safe,
    total: safe,
    running: true,
    round: 1,
    rounds: 1,
    workSeconds: 0,
    restSeconds: 0,
    deadline: now + safe * 1000,
  }
}

export function startInterval(
  { workSeconds, restSeconds, rounds }: { workSeconds: number; restSeconds: number; rounds: number },
  now: number = Date.now(),
): TimerState {
  const safeWork = Math.max(0, workSeconds)
  const safeRest = Math.max(0, restSeconds)
  const safeRounds = Math.max(1, Math.floor(rounds))
  return {
    kind: "interval",
    phase: "work",
    remaining: safeWork,
    total: safeWork,
    running: true,
    round: 1,
    rounds: safeRounds,
    workSeconds: safeWork,
    restSeconds: safeRest,
    deadline: now + safeWork * 1000,
  }
}

function finish(state: TimerState): TimerState {
  return { ...state, phase: "idle", remaining: 0, running: false, deadline: null }
}

function advance(state: TimerState): TimerState {
  if (state.kind === "rest") return finish(state)
  if (state.phase === "work") {
    if (state.round >= state.rounds) return finish(state)
    if (state.restSeconds > 0) {
      return { ...state, phase: "rest", remaining: state.restSeconds, total: state.restSeconds }
    }
    return { ...state, round: state.round + 1, remaining: state.workSeconds, total: state.workSeconds }
  }
  if (state.phase === "rest") {
    return { ...state, phase: "work", round: state.round + 1, remaining: state.workSeconds, total: state.workSeconds }
  }
  return state
}

function secondsUntil(deadline: number, now: number): number {
  return Math.ceil((deadline - now) / 1000)
}

export function tick(state: TimerState, now: number = Date.now()): TimerState {
  if (!state.running || state.deadline === null) return state
  let next = state
  for (let guard = 0; guard < 10_000; guard += 1) {
    const deadline = next.deadline
    if (deadline === null) return next
    const remainingMs = deadline - now
    if (remainingMs > 0) {
      const remaining = Math.ceil(remainingMs / 1000)
      return remaining === next.remaining ? next : { ...next, remaining }
    }
    const advanced = advance(next)
    if (advanced.phase === "idle") return finish(advanced)
    const nextDeadline = now + advanced.total * 1000 - -remainingMs
    next = { ...advanced, deadline: nextDeadline }
  }
  return next
}

export function skipRound(state: TimerState, now: number = Date.now()): TimerState {
  const advanced = advance(state)
  if (advanced.phase === "idle") return finish(advanced)
  return { ...advanced, deadline: now + advanced.total * 1000 }
}

export function adjust(state: TimerState, deltaSeconds: number, now: number = Date.now()): TimerState {
  void now
  const remaining = Math.max(0, state.remaining + deltaSeconds)
  if (remaining === 0) return finish({ ...state, remaining })
  if (state.running && state.deadline !== null) {
    return { ...state, remaining, deadline: state.deadline + deltaSeconds * 1000 }
  }
  return { ...state, remaining }
}

export function pause(state: TimerState, now: number = Date.now()): TimerState {
  if (!state.running || state.deadline === null) return state
  return { ...state, running: false, remaining: secondsUntil(state.deadline, now), deadline: null }
}

export function resume(state: TimerState, now: number = Date.now()): TimerState {
  if (state.phase === "idle" || state.remaining <= 0) return state
  return { ...state, running: true, deadline: now + state.remaining * 1000 }
}

export function skip(state: TimerState): TimerState {
  return finish(state)
}
