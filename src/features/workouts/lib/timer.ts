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
}

export function startRest(seconds: number): TimerState {
  return {
    kind: "rest",
    phase: "rest",
    remaining: seconds,
    total: seconds,
    running: true,
    round: 1,
    rounds: 1,
    workSeconds: 0,
    restSeconds: 0,
  }
}

export function startInterval({
  workSeconds,
  restSeconds,
  rounds,
}: {
  workSeconds: number
  restSeconds: number
  rounds: number
}): TimerState {
  return {
    kind: "interval",
    phase: "work",
    remaining: workSeconds,
    total: workSeconds,
    running: true,
    round: 1,
    rounds,
    workSeconds,
    restSeconds,
  }
}

function finish(state: TimerState): TimerState {
  return { ...state, phase: "idle", remaining: 0, running: false }
}

function advance(state: TimerState): TimerState {
  if (state.kind === "rest") return finish(state)

  if (state.phase === "work") {
    if (state.round >= state.rounds) return finish(state)
    if (state.restSeconds > 0) {
      return {
        ...state,
        phase: "rest",
        remaining: state.restSeconds,
        total: state.restSeconds,
      }
    }
    return {
      ...state,
      round: state.round + 1,
      remaining: state.workSeconds,
      total: state.workSeconds,
    }
  }

  if (state.phase === "rest") {
    return {
      ...state,
      phase: "work",
      round: state.round + 1,
      remaining: state.workSeconds,
      total: state.workSeconds,
    }
  }

  return state
}

export function tick(state: TimerState): TimerState {
  if (!state.running) return state

  if (state.remaining > 0) {
    const remaining = state.remaining - 1

    if (state.kind === "interval" && state.phase === "work") {
      return { ...state, remaining }
    }

    if (remaining > 0) return { ...state, remaining }
  }

  return advance(state)
}

export function adjust(state: TimerState, deltaSeconds: number): TimerState {
  return { ...state, remaining: Math.max(0, state.remaining + deltaSeconds) }
}

export function pause(state: TimerState): TimerState {
  return { ...state, running: false }
}

export function resume(state: TimerState): TimerState {
  return { ...state, running: true }
}

export function skip(state: TimerState): TimerState {
  return finish(state)
}
