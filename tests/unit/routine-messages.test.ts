import { describe, expect, it } from "vitest"

import { EQUIPMENT } from "@/features/exercises/schemas/exercise"
import { MUSCLES } from "@/features/routines/lib/muscles"
import en from "@/i18n/messages/en.json"
import es from "@/i18n/messages/es.json"

type Dict = Record<string, unknown>

const dicts: [string, Dict][] = [
  ["en", en as Dict],
  ["es", es as Dict],
]

const LEVELS = ["beginner", "intermediate", "expert"] as const

function at(dict: Dict, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") return (acc as Dict)[key]
    return undefined
  }, dict)
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0
}

describe("routine builder copy", () => {
  it("has the builder namespaces in both locales", () => {
    for (const [, m] of dicts) {
      expect(m.routines).toBeTruthy()
      expect(m.routineEditor).toBeTruthy()
      expect(m.picker).toBeTruthy()
      expect(m.comingSoon).toBeTruthy()
      expect((m.routines as Dict).new).toBeTruthy()
      expect((m.picker as Dict).add).toBeTruthy()
    }
  })

  it("defines every routine list, action, state, and form key", () => {
    const keys = [
      "routines.title",
      "routines.new",
      "routines.empty",
      "routines.error",
      "routines.activate",
      "routines.duplicate",
      "routines.delete",
      "routines.deleteConfirm",
      "routines.deleteConfirmTitle",
      "routines.active",
      "routines.dayCount",
      "routines.exerciseCount",
      "routines.copySuffix",
      "routines.create.name",
      "routines.create.description",
      "routines.create.goal",
      "routines.create.createBlank",
      "routines.create.fromTemplate",
      "routines.create.chooseTemplate",
    ]
    for (const [locale, m] of dicts) {
      for (const key of keys) {
        expect(nonEmpty(at(m, key)), `${locale}:${key}`).toBe(true)
      }
    }
  })

  it("defines every routine editor key", () => {
    const keys = [
      "routineEditor.title",
      "routineEditor.name",
      "routineEditor.description",
      "routineEditor.goal",
      "routineEditor.days",
      "routineEditor.addDay",
      "routineEditor.removeDay",
      "routineEditor.reorderDay",
      "routineEditor.weekday",
      "routineEditor.label",
      "routineEditor.addExercise",
      "routineEditor.removeExercise",
      "routineEditor.reorderExercise",
      "routineEditor.sets",
      "routineEditor.reps",
      "routineEditor.rest",
      "routineEditor.timer",
      "routineEditor.timerNone",
      "routineEditor.timerInterval",
      "routineEditor.timerEmom",
      "routineEditor.timerAmrap",
      "routineEditor.workSeconds",
      "routineEditor.rounds",
      "routineEditor.notes",
      "routineEditor.save",
      "routineEditor.unsaved",
      "routineEditor.saved",
      "routineEditor.validationError",
      "routineEditor.emptyDays",
    ]
    for (const [locale, m] of dicts) {
      for (const key of keys) {
        expect(nonEmpty(at(m, key)), `${locale}:${key}`).toBe(true)
      }
    }
  })

  it("defines the picker chrome and action keys", () => {
    const keys = [
      "picker.title",
      "picker.back",
      "picker.search",
      "picker.filters",
      "picker.muscle",
      "picker.all",
      "picker.filterMuscle",
      "picker.allMuscles",
      "picker.filterEquipment",
      "picker.allEquipment",
      "picker.filterLevel",
      "picker.allLevels",
      "picker.add",
      "picker.addCount",
      "picker.noResults",
      "picker.empty",
      "picker.emptyDescription",
      "picker.error",
      "picker.retry",
    ]
    for (const [locale, m] of dicts) {
      for (const key of keys) {
        expect(nonEmpty(at(m, key)), `${locale}:${key}`).toBe(true)
      }
    }
  })

  it("localizes every muscle and equipment value the picker renders", () => {
    for (const [locale, m] of dicts) {
      for (const muscle of MUSCLES) {
        expect(nonEmpty(at(m, `picker.muscles.${muscle}`)), `${locale}:${muscle}`).toBe(
          true,
        )
      }
      for (const item of EQUIPMENT) {
        expect(
          nonEmpty(at(m, `picker.equipment.${item}`)),
          `${locale}:equipment:${item}`,
        ).toBe(true)
        expect(
          nonEmpty(at(m, `picker.equipment.items.${item}`)),
          `${locale}:equipment.items:${item}`,
        ).toBe(true)
      }
      for (const level of LEVELS) {
        expect(nonEmpty(at(m, `picker.level.${level}`)), `${locale}:level:${level}`).toBe(
          true,
        )
      }
    }
  })

  it("localizes the placeholder tab titles", () => {
    const keys = [
      "comingSoon.message",
      "workout.title",
      "progress.title",
      "profile.title",
    ]
    for (const [locale, m] of dicts) {
      for (const key of keys) {
        expect(nonEmpty(at(m, key)), `${locale}:${key}`).toBe(true)
      }
    }
  })

  it("reuses the onboarding goal and experience keys instead of duplicating them", () => {
    for (const [locale, m] of dicts) {
      for (const goal of [
        "lose_weight",
        "build_muscle",
        "get_stronger",
        "endurance",
        "general_fitness",
      ]) {
        expect(
          nonEmpty(at(m, `onboarding.goals.${goal}`)),
          `${locale}:goals:${goal}`,
        ).toBe(true)
      }
      for (const level of ["beginner", "intermediate", "advanced"]) {
        expect(
          nonEmpty(at(m, `onboarding.experience.${level}`)),
          `${locale}:experience:${level}`,
        ).toBe(true)
      }
    }
  })
})
