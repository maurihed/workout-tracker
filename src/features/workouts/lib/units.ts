const KG_PER_LB = 0.45359237

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}
export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}
export function displayWeight(
  kg: number,
  unitSystem: "metric" | "imperial",
): number {
  const value = unitSystem === "imperial" ? kgToLb(kg) : kg
  return Math.round(value * 10) / 10
}
export function parseWeightToKg(
  value: number,
  unitSystem: "metric" | "imperial",
): number {
  const kg = unitSystem === "imperial" ? lbToKg(value) : value
  return Math.round(kg * 10) / 10
}
export function formatWeight(
  kg: number,
  unitSystem: "metric" | "imperial",
): string {
  return `${displayWeight(kg, unitSystem)} ${unitSystem === "imperial" ? "lb" : "kg"}`
}
