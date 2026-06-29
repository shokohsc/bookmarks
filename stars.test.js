import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("node:fs", () => ({ writeFileSync: vi.fn() }))

import { getStars } from "./stars.js"
import { writeFileSync } from "node:fs"

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.GITHUB_TOKEN
})

describe("getStars", () => {
  it("throws when no username provided", async () => {
    await expect(getStars()).rejects.toThrow("Usage: node stars.js <github-username>")
  })

  it("throws when GITHUB_TOKEN is not set", async () => {
    await expect(getStars("testuser")).rejects.toThrow("Please set GITHUB_TOKEN.")
  })

  it("fetches starred repos and writes to stars.txt", async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([
        { full_name: "user/repo1" },
        { full_name: "user/repo2" },
      ]),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    process.env.GITHUB_TOKEN = "token123"
    await getStars("testuser", mockFetch)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/users/testuser/starred?per_page=100&page=1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token123",
        }),
      }),
    )
    expect(writeFileSync).toHaveBeenCalledWith(
      "stars.txt",
      "https://github.com/user/repo1\nhttps://github.com/user/repo2",
      "utf8",
    )
  })

  it("handles pagination across multiple pages", async () => {
    let callCount = 0
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(Array.from({ length: 100 }, (_, i) => ({ full_name: `user/repo${i}` }))),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    })

    process.env.GITHUB_TOKEN = "token123"
    await getStars("testuser", mockFetch)

    expect(callCount).toBe(2)
    expect(writeFileSync).toHaveBeenCalled()
  })

  it("throws error on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    })

    process.env.GITHUB_TOKEN = "token123"
    await expect(getStars("testuser", mockFetch)).rejects.toThrow("403 Forbidden")
  })

  it("handles fetch network error", async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error("Network failure"))

    process.env.GITHUB_TOKEN = "token123"
    await expect(getStars("testuser", mockFetch)).rejects.toThrow("Network failure")
  })

  it("writes single repo correctly", async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ full_name: "single/repo" }]),
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    process.env.GITHUB_TOKEN = "token123"
    await getStars("testuser", mockFetch)

    expect(writeFileSync).toHaveBeenCalledWith(
      "stars.txt",
      "https://github.com/single/repo",
      "utf8",
    )
  })

  it("constructs correct URL for custom username", async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([]),
    })

    process.env.GITHUB_TOKEN = "token123"
    await getStars("some-user", mockFetch)

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.github.com/users/some-user/starred?per_page=100&page=1",
      expect.any(Object),
    )
  })

  it("handles empty starred list", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })

    process.env.GITHUB_TOKEN = "token123"
    await getStars("testuser", mockFetch)

    expect(writeFileSync).toHaveBeenCalledWith("stars.txt", "", "utf8")
  })
})
