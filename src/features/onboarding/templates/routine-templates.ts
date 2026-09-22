import type { ExperienceLevel, Goal, Location } from "@/generated/prisma/client"

export type TemplateExercise = {
  sourceId: string
  sets: number
  reps: string
  restSeconds: number
}

export type TemplateDay = {
  weekday: number
  label: string
  exercises: TemplateExercise[]
}

export type RoutineTemplate = {
  slug: string
  name: string
  nameEs: string
  description: string
  descriptionEs: string
  goal: Goal
  level: ExperienceLevel
  location: Location
  equipment: string[]
  daysPerWeek: number
  days: TemplateDay[]
}

export const ROUTINE_TEMPLATES: RoutineTemplate[] = [
  {
    slug: "full-body-3x",
    name: "Full Body 3x",
    nameEs: "Cuerpo Completo 3x",
    description: "Three full-body sessions a week. Great for beginners.",
    descriptionEs: "Tres sesiones de cuerpo completo por semana. Ideal para principiantes.",
    goal: "general_fitness",
    level: "beginner",
    location: "both",
    equipment: ["body only", "dumbbell", "barbell", "machine"],
    daysPerWeek: 3,
    days: [
      {
        weekday: 1,
        label: "Full Body A",
        exercises: [
          { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Barbell_Deadlift", sets: 3, reps: "6-8", restSeconds: 120 },
          { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
        ],
      },
      {
        weekday: 3,
        label: "Full Body B",
        exercises: [
          { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Arnold_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Barbell_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
        ],
      },
      {
        weekday: 5,
        label: "Full Body C",
        exercises: [
          { sourceId: "Barbell_Full_Squat", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Alternating_Kettlebell_Row", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Air_Bike", sets: 3, reps: "15-20", restSeconds: 45 },
        ],
      },
    ],
  },
  {
    slug: "upper-lower-4x",
    name: "Upper / Lower 4x",
    nameEs: "Torso / Piernas 4x",
    description: "Four-day upper/lower split for balanced strength and muscle gains.",
    descriptionEs:
      "Rutina de torso y piernas de cuatro días para fuerza y músculo equilibrados.",
    goal: "build_muscle",
    level: "intermediate",
    location: "gym",
    equipment: ["barbell", "dumbbell", "cable", "machine"],
    daysPerWeek: 4,
    days: [
      {
        weekday: 1,
        label: "Upper A",
        exercises: [
          { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: "6-8", restSeconds: 120 },
          { sourceId: "Bent_Over_Barbell_Row", sets: 4, reps: "6-8", restSeconds: 120 },
          { sourceId: "Standing_Military_Press", sets: 3, reps: "8-10", restSeconds: 90 },
          { sourceId: "Wide-Grip_Lat_Pulldown", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Barbell_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Close-Grip_Barbell_Bench_Press", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 2,
        label: "Lower A",
        exercises: [
          { sourceId: "Barbell_Full_Squat", sets: 4, reps: "6-8", restSeconds: 150 },
          { sourceId: "Romanian_Deadlift", sets: 3, reps: "8-10", restSeconds: 120 },
          { sourceId: "Leg_Press", sets: 3, reps: "10-12", restSeconds: 90 },
          { sourceId: "Lying_Leg_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Standing_Calf_Raises", sets: 4, reps: "12-15", restSeconds: 60 },
        ],
      },
      {
        weekday: 4,
        label: "Upper B",
        exercises: [
          {
            sourceId: "Barbell_Incline_Bench_Press_-_Medium_Grip",
            sets: 4,
            reps: "8-10",
            restSeconds: 120,
          },
          { sourceId: "One-Arm_Dumbbell_Row", sets: 4, reps: "8-10", restSeconds: 90 },
          { sourceId: "Seated_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Seated_Cable_Rows", sets: 3, reps: "10-12", restSeconds: 90 },
          { sourceId: "Hammer_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Dips_-_Triceps_Version", sets: 3, reps: "8-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 5,
        label: "Lower B",
        exercises: [
          { sourceId: "Barbell_Deadlift", sets: 4, reps: "4-6", restSeconds: 180 },
          { sourceId: "Front_Barbell_Squat", sets: 3, reps: "8-10", restSeconds: 120 },
          { sourceId: "Leg_Extensions", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Seated_Leg_Curl", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Barbell_Seated_Calf_Raise", sets: 4, reps: "12-15", restSeconds: 60 },
        ],
      },
    ],
  },
  {
    slug: "ppl-6x",
    name: "Push / Pull / Legs 6x",
    nameEs: "Empuje / Tirón / Piernas 6x",
    description: "Six-day push/pull/legs split for high-volume muscle building.",
    descriptionEs: "Rutina de empuje, tirón y piernas de seis días para hipertrofia.",
    goal: "build_muscle",
    level: "advanced",
    location: "gym",
    equipment: ["barbell", "dumbbell", "cable", "machine"],
    daysPerWeek: 6,
    days: [
      {
        weekday: 1,
        label: "Push A",
        exercises: [
          { sourceId: "Barbell_Bench_Press_-_Medium_Grip", sets: 4, reps: "6-8", restSeconds: 120 },
          { sourceId: "Incline_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Seated_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Side_Lateral_Raise", sets: 3, reps: "12-15", restSeconds: 60 },
          {
            sourceId: "Cable_Rope_Overhead_Triceps_Extension",
            sets: 3,
            reps: "10-15",
            restSeconds: 60,
          },
          { sourceId: "Reverse_Grip_Triceps_Pushdown", sets: 3, reps: "10-15", restSeconds: 60 },
        ],
      },
      {
        weekday: 2,
        label: "Pull A",
        exercises: [
          { sourceId: "Barbell_Deadlift", sets: 4, reps: "4-6", restSeconds: 180 },
          { sourceId: "Pullups", sets: 4, reps: "6-10", restSeconds: 90 },
          { sourceId: "Seated_Cable_Rows", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Face_Pull", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Barbell_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Hammer_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 3,
        label: "Legs A",
        exercises: [
          { sourceId: "Barbell_Full_Squat", sets: 4, reps: "6-8", restSeconds: 150 },
          { sourceId: "Romanian_Deadlift", sets: 3, reps: "8-10", restSeconds: 120 },
          { sourceId: "Leg_Press", sets: 3, reps: "10-12", restSeconds: 90 },
          { sourceId: "Lying_Leg_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Standing_Calf_Raises", sets: 4, reps: "12-15", restSeconds: 60 },
          { sourceId: "Hanging_Leg_Raise", sets: 3, reps: "10-15", restSeconds: 60 },
        ],
      },
      {
        weekday: 4,
        label: "Push B",
        exercises: [
          {
            sourceId: "Barbell_Incline_Bench_Press_-_Medium_Grip",
            sets: 4,
            reps: "8-10",
            restSeconds: 120,
          },
          { sourceId: "Dumbbell_Bench_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Arnold_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Cable_Crossover", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Front_Dumbbell_Raise", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "EZ-Bar_Skullcrusher", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 5,
        label: "Pull B",
        exercises: [
          { sourceId: "Bent_Over_Barbell_Row", sets: 4, reps: "6-8", restSeconds: 120 },
          { sourceId: "Wide-Grip_Lat_Pulldown", sets: 4, reps: "8-12", restSeconds: 90 },
          { sourceId: "One-Arm_Dumbbell_Row", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Reverse_Flyes", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Incline_Dumbbell_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Barbell_Shrug", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 6,
        label: "Legs B",
        exercises: [
          { sourceId: "Front_Barbell_Squat", sets: 4, reps: "6-8", restSeconds: 150 },
          { sourceId: "Barbell_Hip_Thrust", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Leg_Extensions", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Seated_Leg_Curl", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Barbell_Seated_Calf_Raise", sets: 4, reps: "12-15", restSeconds: 60 },
          { sourceId: "Plank", sets: 3, reps: "30-60s", restSeconds: 45 },
        ],
      },
    ],
  },
  {
    slug: "dumbbell-home-3x",
    name: "Dumbbell Home 3x",
    nameEs: "Mancuernas en Casa 3x",
    description: "Three dumbbell-only sessions a week you can do at home.",
    descriptionEs: "Tres sesiones semanales solo con mancuernas para hacer en casa.",
    goal: "build_muscle",
    level: "beginner",
    location: "home",
    equipment: ["dumbbell"],
    daysPerWeek: 3,
    days: [
      {
        weekday: 1,
        label: "Dumbbell Full Body A",
        exercises: [
          { sourceId: "Dumbbell_Squat", sets: 3, reps: "10-12", restSeconds: 90 },
          { sourceId: "Dumbbell_Bench_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "One-Arm_Dumbbell_Row", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Dumbbell_Shoulder_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Dumbbell_Bicep_Curl", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Dumbbell_Lunges", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 3,
        label: "Dumbbell Full Body B",
        exercises: [
          { sourceId: "Dumbbell_Step_Ups", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Dumbbell_Flyes", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Bent_Over_Two-Dumbbell_Row", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Arnold_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Hammer_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Dumbbell_Shrug", sets: 3, reps: "12-15", restSeconds: 60 },
        ],
      },
      {
        weekday: 5,
        label: "Dumbbell Full Body C",
        exercises: [
          { sourceId: "Dumbbell_Rear_Lunge", sets: 3, reps: "10-12", restSeconds: 60 },
          {
            sourceId: "Dumbbell_Bench_Press_with_Neutral_Grip",
            sets: 3,
            reps: "8-12",
            restSeconds: 90,
          },
          { sourceId: "Dumbbell_Incline_Row", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Standing_Dumbbell_Press", sets: 3, reps: "8-12", restSeconds: 90 },
          { sourceId: "Concentration_Curls", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "Lying_Dumbbell_Tricep_Extension", sets: 3, reps: "10-12", restSeconds: 60 },
        ],
      },
    ],
  },
  {
    slug: "bodyweight-3x",
    name: "Bodyweight 3x",
    nameEs: "Peso Corporal 3x",
    description: "Three equipment-free sessions a week using only your bodyweight.",
    descriptionEs: "Tres sesiones semanales sin equipo, solo con tu peso corporal.",
    goal: "general_fitness",
    level: "beginner",
    location: "home",
    equipment: ["body only"],
    daysPerWeek: 3,
    days: [
      {
        weekday: 1,
        label: "Bodyweight A",
        exercises: [
          { sourceId: "Pushups", sets: 3, reps: "10-20", restSeconds: 60 },
          { sourceId: "Bodyweight_Squat", sets: 3, reps: "15-20", restSeconds: 60 },
          { sourceId: "Chin-Up", sets: 3, reps: "3-8", restSeconds: 90 },
          { sourceId: "Plank", sets: 3, reps: "30-60s", restSeconds: 45 },
          { sourceId: "Reverse_Crunch", sets: 3, reps: "10-15", restSeconds: 45 },
        ],
      },
      {
        weekday: 3,
        label: "Bodyweight B",
        exercises: [
          { sourceId: "Incline_Push-Up", sets: 3, reps: "10-20", restSeconds: 60 },
          { sourceId: "Freehand_Jump_Squat", sets: 3, reps: "12-15", restSeconds: 60 },
          { sourceId: "Step-up_with_Knee_Raise", sets: 3, reps: "10-12", restSeconds: 60 },
          { sourceId: "3_4_Sit-Up", sets: 3, reps: "10-15", restSeconds: 45 },
          { sourceId: "Hanging_Leg_Raise", sets: 3, reps: "8-12", restSeconds: 60 },
        ],
      },
      {
        weekday: 5,
        label: "Bodyweight C",
        exercises: [
          { sourceId: "Push-Ups_With_Feet_Elevated", sets: 3, reps: "8-15", restSeconds: 60 },
          { sourceId: "Single_Leg_Glute_Bridge", sets: 3, reps: "10-12", restSeconds: 45 },
          { sourceId: "Natural_Glute_Ham_Raise", sets: 3, reps: "6-10", restSeconds: 60 },
          { sourceId: "Bent-Knee_Hip_Raise", sets: 3, reps: "10-15", restSeconds: 45 },
          { sourceId: "Flutter_Kicks", sets: 3, reps: "20-30", restSeconds: 45 },
          { sourceId: "Superman", sets: 3, reps: "10-15", restSeconds: 45 },
        ],
      },
    ],
  },
]

export function getTemplateBySlug(slug: string): RoutineTemplate | undefined {
  return ROUTINE_TEMPLATES.find((t) => t.slug === slug)
}
