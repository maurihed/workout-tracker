"use client"

import type { KeyboardEvent } from "react"

import { cn } from "@/lib/utils"

import type { RegionId } from "../lib/muscles"

type BodyShape = {
  region: RegionId
  side: "front" | "back"
  d: string
}

const FRONT: BodyShape[] = [
  {
    region: "traps",
    side: "front",
    d: "M42 40 Q50 36 58 40 L60 47 Q50 43 40 47 Z",
  },
  {
    region: "shoulders",
    side: "front",
    d: "M30 45 Q36 41 42 44 L42 53 Q34 54 29 50 Z M58 44 Q64 41 70 45 L71 50 Q66 54 58 53 Z",
  },
  {
    region: "chest",
    side: "front",
    d: "M42 50 Q50 48 58 50 L59 69 Q50 72 41 69 Z",
  },
  {
    region: "biceps",
    side: "front",
    d: "M28 52 Q34 52 36 56 L35 70 Q29 69 27 64 Z M64 56 Q66 52 72 52 L73 64 Q71 69 65 70 Z",
  },
  {
    region: "forearms",
    side: "front",
    d: "M27 68 Q33 68 35 72 L33 94 Q28 93 26 88 Z M65 72 Q67 68 73 68 L74 88 Q72 93 67 94 Z",
  },
  {
    region: "abs",
    side: "front",
    d: "M43 72 Q50 71 57 72 L56 97 Q50 100 44 97 Z",
  },
  {
    region: "quads",
    side: "front",
    d: "M37 103 Q45 101 48 103 L48 148 Q42 151 37 147 Z M52 103 Q55 101 63 103 L63 147 Q58 151 52 148 Z",
  },
  {
    region: "calves",
    side: "front",
    d: "M39 154 Q46 153 46 157 L44 184 Q40 186 38 182 Z M54 157 Q54 153 61 154 L62 182 Q60 186 56 184 Z",
  },
]

const BACK: BodyShape[] = [
  {
    region: "traps",
    side: "back",
    d: "M142 40 Q150 36 158 40 L160 47 Q150 43 140 47 Z",
  },
  {
    region: "shoulders",
    side: "back",
    d: "M130 45 Q136 41 142 44 L142 53 Q134 54 129 50 Z M158 44 Q164 41 170 45 L171 50 Q166 54 158 53 Z",
  },
  {
    region: "back",
    side: "back",
    d: "M141 50 Q150 48 159 50 L158 86 Q150 90 142 86 Z",
  },
  {
    region: "triceps",
    side: "back",
    d: "M128 52 Q134 52 136 56 L135 70 Q129 69 127 64 Z M164 56 Q166 52 172 52 L173 64 Q171 69 165 70 Z",
  },
  {
    region: "forearms",
    side: "back",
    d: "M127 68 Q133 68 135 72 L133 94 Q128 93 126 88 Z M165 72 Q167 68 173 68 L174 88 Q172 93 167 94 Z",
  },
  {
    region: "glutes",
    side: "back",
    d: "M140 90 Q150 88 160 90 L159 110 Q150 114 141 110 Z",
  },
  {
    region: "hamstrings",
    side: "back",
    d: "M141 112 Q150 110 159 112 L157 150 Q150 153 143 150 Z",
  },
  {
    region: "calves",
    side: "back",
    d: "M139 154 Q146 153 146 157 L144 184 Q140 186 138 182 Z M154 157 Q154 153 161 154 L162 182 Q160 186 156 184 Z",
  },
]

export const BODY_REGIONS: BodyShape[] = [...FRONT, ...BACK]

export function heatOpacity(level: number): number {
  const clamped = Math.min(1, Math.max(0, level))
  return Math.round((0.12 + 0.88 * clamped) * 1000) / 1000
}

type BodyMapProps = {
  levels: Partial<Record<RegionId, number>>
  labelFor: (region: RegionId) => string
  sideLabelFor: (side: "front" | "back") => string
  volumeFor: (region: RegionId) => string
  ariaLabel: string
  selected: RegionId | null
  onSelect: (region: RegionId) => void
}

export function BodyMap({
  levels,
  labelFor,
  sideLabelFor,
  volumeFor,
  ariaLabel,
  selected,
  onSelect,
}: BodyMapProps) {
  function handleKeyDown(event: KeyboardEvent<SVGPathElement>, region: RegionId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onSelect(region)
    }
  }

  return (
    <svg
      viewBox="0 0 200 200"
      role="group"
      aria-label={ariaLabel}
      className="mx-auto h-auto w-full max-w-sm"
    >
      <circle cx="50" cy="24" r="11" className="fill-muted" aria-hidden="true" />
      <circle cx="150" cy="24" r="11" className="fill-muted" aria-hidden="true" />
      {BODY_REGIONS.map((shape) => {
        const isSelected = selected === shape.region
        return (
          <path
            key={`${shape.side}-${shape.region}`}
            data-region={shape.region}
            data-side={shape.side}
            d={shape.d}
            role="button"
            tabIndex={0}
            aria-label={`${labelFor(shape.region)}, ${sideLabelFor(shape.side)}, ${volumeFor(shape.region)}`}
            aria-pressed={isSelected}
            className={cn(
              "fill-primary focus-visible:stroke-primary cursor-pointer outline-none transition-[fill-opacity] focus-visible:stroke-2",
              isSelected && "stroke-primary stroke-2"
            )}
            fillOpacity={heatOpacity(levels[shape.region] ?? 0)}
            onClick={() => onSelect(shape.region)}
            onKeyDown={(event) => handleKeyDown(event, shape.region)}
          />
        )
      })}
    </svg>
  )
}
