import { describe, it, expect, vi, beforeEach } from "vitest"

const mockFetch = vi.hoisted(() => vi.fn())
vi.mock("node-fetch", () => ({ default: mockFetch }))

import { generateTagsLLM } from "./llm-tagger.js"

describe("generateTagsLLM", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns tags and category from valid Ollama response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            tags: ["javascript", "web", "programming", "frontend"],
            category: "web-development"
          })
        }
      })
    })

    const result = await generateTagsLLM("some content here", "Test Title", "https://example.com")
    expect(result).toEqual({
      tags: ["javascript", "web", "programming", "frontend"],
      category: "web-development"
    })
  })

  it("falls back to basic tagging on HTTP error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    })

    const result = await generateTagsLLM("javascript programming javascript coding", "Test", "https://example.com")
    expect(result.tags).toContain("javascript")
    expect(typeof result.category).toBe("string")
  })

  it("falls back to basic tagging on malformed JSON", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: "not json at all" }
      })
    })

    const result = await generateTagsLLM("javascript programming javascript coding", "Test", "https://example.com")
    expect(result.tags).toContain("javascript")
  })

  it("falls back to basic tagging on network error", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"))

    const result = await generateTagsLLM("javascript programming javascript coding", "Test", "https://example.com")
    expect(result.tags).toContain("javascript")
  })

  it("falls back to basic tagging on timeout", async () => {
    const abortError = new Error("The operation was aborted")
    abortError.name = "AbortError"
    mockFetch.mockRejectedValue(abortError)

    const result = await generateTagsLLM("javascript programming javascript coding", "Test", "https://example.com")
    expect(result.tags).toContain("javascript")
  })

  it("limits tags to 10", async () => {
    const manyTags = Array.from({ length: 20 }, (_, i) => `tag${i + 1}`)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            tags: manyTags,
            category: "test"
          })
        }
      })
    })

    const result = await generateTagsLLM("some content", "Test", "https://example.com")
    expect(result.tags.length).toBeLessThanOrEqual(10)
  })

  it("returns basic result for empty content", async () => {
    const result = await generateTagsLLM("", "Test", "https://example.com")
    expect(result).toEqual({ tags: [], category: "other" })
  })
})
