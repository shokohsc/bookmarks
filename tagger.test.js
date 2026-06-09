import { describe, it, expect } from "vitest"
import { generateTags } from "./tagger.js"

describe("generateTags", () => {
  it("returns empty result for non-string input", () => {
    const result = generateTags(null)
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for undefined input", () => {
    const result = generateTags(undefined)
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for number input", () => {
    const result = generateTags(42)
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for object input", () => {
    const result = generateTags({})
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for text longer than 50000 chars", () => {
    const longText = "a ".repeat(50001)
    const result = generateTags(longText)
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for empty string", () => {
    const result = generateTags("")
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for text with only short words", () => {
    const result = generateTags("a an is it of to in on at")
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("returns empty result for text with only stopwords", () => {
    const result = generateTags("the and for with this that")
    expect(result).toEqual({ tags: [], category: "other" })
  })

  it("extracts most frequent words as tags", () => {
    const text = "javascript programming javascript coding javascript web development"
    const result = generateTags(text)
    expect(result.tags).toContain("javascript")
    expect(result.category).toBe("javascript")
  })

  it("returns up to 10 tags", () => {
    const words = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau"
    const text = words.repeat(10)
    const result = generateTags(text)
    expect(result.tags.length).toBeLessThanOrEqual(10)
  })

  it("sorts tags by frequency descending", () => {
    const text = "apple apple apple banana banana cherry cherry cherry cherry"
    const result = generateTags(text)
    expect(result.tags).toEqual(["cherry", "apple", "banana"])
  })

  it("filters out words shorter than 4 characters", () => {
    const text = "a be see deep go high low test code"
    const result = generateTags(text)
    expect(result.tags).not.toContain("a")
    expect(result.tags).not.toContain("be")
    expect(result.tags).not.toContain("go")
    expect(result.tags).toContain("deep")
    expect(result.tags).toContain("high")
    expect(result.tags).toContain("test")
    expect(result.tags).toContain("code")
  })

  it("filters out stopwords", () => {
    const text = "the apple and banana for cherry"
    const result = generateTags(text)
    expect(result.tags).toEqual(["apple", "banana", "cherry"])
    expect(result.tags).not.toContain("the")
    expect(result.tags).not.toContain("and")
    expect(result.tags).not.toContain("for")
  })

  it("handles text with punctuation", () => {
    const text = "hello, world! this is a test: javascript & node.js."
    const result = generateTags(text)
    expect(result.tags).toContain("hello")
    expect(result.tags).toContain("world")
    expect(result.tags).toContain("test")
  })

  it("handles mixed case input", () => {
    const result = generateTags("JAVASCRIPT JavaScript javascript")
    expect(result.tags[0]).toBe("javascript")
  })

  it("sets category to most frequent word", () => {
    const result = generateTags("machine learning machine machine")
    expect(result.category).toBe("machine")
  })

  it("sets category to 'other' when no valid words", () => {
    const result = generateTags("a b c")
    expect(result.category).toBe("other")
  })

  it("handles single repeated word", () => {
    const result = generateTags("code code code code code")
    expect(result.tags).toEqual(["code"])
    expect(result.category).toBe("code")
  })

  it("preserves word boundaries correctly", () => {
    const text = "react_node_angular_vue"
    const result = generateTags(text)
    expect(result.tags).toContain("react_node_angular_vue")
  })

  it("normalizes whitespace", () => {
    const text = "hello    world\n\t test"
    const result = generateTags(text)
    expect(result.tags).toContain("hello")
    expect(result.tags).toContain("world")
    expect(result.tags).toContain("test")
  })
})
