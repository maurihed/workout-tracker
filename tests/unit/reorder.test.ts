import { describe, expect, it } from "vitest"
import { moveItem } from "@/features/routines/lib/reorder"

describe("moveItem", () => {
  it("moves an item forward and backward without mutating the input", () => {
    const input = ["a", "b", "c"]
    expect(moveItem(input, 0, 2)).toEqual(["b", "c", "a"])
    expect(moveItem(input, 2, 0)).toEqual(["c", "a", "b"])
    expect(input).toEqual(["a", "b", "c"])
  })
  it("is a no-op for the same index or out-of-range indices", () => {
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"])
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"])
  })
})
