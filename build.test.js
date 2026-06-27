import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockFs, mockFetch, mockCheerioLoad, mockJSDOM, mockReadability } = vi.hoisted(() => ({
  mockFs: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn()
  },
  mockFetch: vi.fn(),
  mockCheerioLoad: vi.fn(),
  mockJSDOM: vi.fn(),
  mockReadability: vi.fn()
}))

vi.mock("fs", () => ({ default: mockFs, ...mockFs }))
vi.mock("node-fetch", () => ({ default: mockFetch }))
vi.mock("cheerio", () => ({ default: { load: mockCheerioLoad } }))
vi.mock("jsdom", () => ({ JSDOM: mockJSDOM }))
vi.mock("@mozilla/readability", () => ({ Readability: mockReadability }))

import { validateUrl, isPrivateIP, parseBookmarks, extractContent, build } from "./build.js"

describe("isPrivateIP", () => {
  it("detects 127.0.0.1 as private", () => {
    expect(isPrivateIP("127.0.0.1")).toBe(true)
  })

  it("detects localhost as private", () => {
    expect(isPrivateIP("localhost")).toBe(true)
  })

  it("detects 10.x.x.x as private", () => {
    expect(isPrivateIP("10.0.0.1")).toBe(true)
    expect(isPrivateIP("10.255.255.255")).toBe(true)
  })

  it("detects 172.16-31.x.x as private", () => {
    expect(isPrivateIP("172.16.0.1")).toBe(true)
    expect(isPrivateIP("172.31.255.255")).toBe(true)
  })

  it("does not flag 172.32.x.x as private", () => {
    expect(isPrivateIP("172.32.0.1")).toBe(false)
  })

  it("detects 192.168.x.x as private", () => {
    expect(isPrivateIP("192.168.1.1")).toBe(true)
    expect(isPrivateIP("192.168.255.255")).toBe(true)
  })

  it("detects 169.254.x.x as private", () => {
    expect(isPrivateIP("169.254.1.1")).toBe(true)
  })

  it("detects 0.0.0.0 as private", () => {
    expect(isPrivateIP("0.0.0.0")).toBe(true)
  })

  it("detects [::1] as private", () => {
    expect(isPrivateIP("[::1]")).toBe(true)
  })

  it("detects [::] as private", () => {
    expect(isPrivateIP("[::]")).toBe(true)
  })

  it("detects fc00::/7 as private", () => {
    expect(isPrivateIP("fc00::1")).toBe(true)
    expect(isPrivateIP("fd00::1")).toBe(true)
  })

  it("detects fe80::/10 as private", () => {
    expect(isPrivateIP("fe80::1")).toBe(true)
  })

  it("returns false for public IPs", () => {
    expect(isPrivateIP("8.8.8.8")).toBe(false)
    expect(isPrivateIP("1.1.1.1")).toBe(false)
    expect(isPrivateIP("93.184.216.34")).toBe(false)
  })

  it("returns false for invalid IP format", () => {
    expect(isPrivateIP("not-an-ip")).toBe(false)
  })

  it("returns false for empty string", () => {
    expect(isPrivateIP("")).toBe(false)
  })

  it("handles IPs with invalid octets", () => {
    expect(isPrivateIP("999.999.999.999")).toBe(false)
  })
})

describe("validateUrl", () => {
  it("accepts valid http URL", () => {
    const result = validateUrl("http://example.com")
    expect(result.valid).toBe(true)
  })

  it("accepts valid https URL", () => {
    const result = validateUrl("https://example.com")
    expect(result.valid).toBe(true)
  })

  it("rejects empty string", () => {
    const result = validateUrl("")
    expect(result.valid).toBe(false)
  })

  it("rejects null input", () => {
    const result = validateUrl(null)
    expect(result.valid).toBe(false)
  })

  it("rejects undefined input", () => {
    const result = validateUrl(undefined)
    expect(result.valid).toBe(false)
  })

  it("rejects non-string input", () => {
    const result = validateUrl(42)
    expect(result.valid).toBe(false)
  })

  it("rejects ftp protocol", () => {
    const result = validateUrl("ftp://example.com")
    expect(result.valid).toBe(false)
  })

  it("rejects file protocol", () => {
    const result = validateUrl("file:///etc/passwd")
    expect(result.valid).toBe(false)
  })

  it("rejects javascript protocol", () => {
    const result = validateUrl("javascript:alert(1)")
    expect(result.valid).toBe(false)
  })

  it("rejects URLs with embedded credentials", () => {
    const result = validateUrl("http://user:pass@example.com")
    expect(result.valid).toBe(false)
  })

  it("rejects localhost", () => {
    const result = validateUrl("http://localhost:8080")
    expect(result.valid).toBe(false)
  })

  it("rejects private 10.x.x.x", () => {
    const result = validateUrl("http://10.0.0.1")
    expect(result.valid).toBe(false)
  })

  it("rejects private 172.16.x.x", () => {
    const result = validateUrl("http://172.16.0.1")
    expect(result.valid).toBe(false)
  })

  it("rejects private 192.168.x.x", () => {
    const result = validateUrl("http://192.168.1.1")
    expect(result.valid).toBe(false)
  })

  it("rejects private 127.0.0.1", () => {
    const result = validateUrl("http://127.0.0.1")
    expect(result.valid).toBe(false)
  })

  it("rejects private 169.254.x.x", () => {
    const result = validateUrl("http://169.254.1.1")
    expect(result.valid).toBe(false)
  })

  it("accepts URLs with whitespace after trimming", () => {
    const result = validateUrl(" http://example.com ")
    expect(result.valid).toBe(true)
    expect(result.url).toBe("http://example.com")
  })

  it("rejects whitespace-only URL after trim", () => {
    const result = validateUrl("   ")
    expect(result.valid).toBe(false)
  })

  it("rejects malformed URL", () => {
    const result = validateUrl("not a url")
    expect(result.valid).toBe(false)
  })
})

describe("parseBookmarks", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function setupMockCheerio(elements) {
    const mock$ = vi.fn((sel) => {
      if (sel === "a") {
        return {
          each: (cb) => {
            elements.forEach((el, i) => cb(i, el))
          }
        }
      }
      if (typeof sel === "object" && sel !== null) {
        const el = sel
        return { attr: (name) => el.attr(name), text: () => el.text() }
      }
      return { attr: () => null, text: () => "" }
    })
    mockCheerioLoad.mockReturnValue(mock$)
  }

  it("parses bookmark HTML and returns links", () => {
    mockFs.readFileSync.mockReturnValue("<html><body></body></html>")
    setupMockCheerio([
      { text: () => "Example", attr: (name) => name === "href" ? "https://example.com" : null },
      { text: () => "Test", attr: (name) => name === "href" ? "https://test.com" : null }
    ])

    const result = parseBookmarks()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ title: "Example", url: "https://example.com" })
    expect(result[1]).toEqual({ title: "Test", url: "https://test.com" })
  })

  it("skips links with empty href", () => {
    mockFs.readFileSync.mockReturnValue("<html><body></body></html>")
    setupMockCheerio([
      { text: () => "Example", attr: (name) => name === "href" ? "https://example.com" : null },
      { text: () => "Empty", attr: (name) => name === "href" ? "" : null },
      { text: () => "Test", attr: (name) => name === "href" ? "https://test.com" : null }
    ])

    const result = parseBookmarks()
    expect(result).toHaveLength(2)
  })

  it("truncates bookmarks exceeding max limit", () => {
    mockFs.readFileSync.mockReturnValue("<html><body></body></html>")
    const elements = Array.from({ length: 6000 }, (_, i) => ({
      text: () => `Link ${i}`,
      attr: (name) => `https://example${i}.com`
    }))
    setupMockCheerio(elements)

    const result = parseBookmarks()
    expect(result).toHaveLength(5000)
  })
})

describe("extractContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function mockSuccessResponse(bodyText) {
    return {
      status: 200,
      ok: true,
      headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      text: () => Promise.resolve(bodyText)
    }
  }

  it("fetches and extracts content successfully", async () => {
    mockFetch.mockResolvedValue(mockSuccessResponse("<html><body><p>Hello World</p></body></html>"))

    const mockDocument = {}
    mockJSDOM.mockReturnValue({
      window: { document: mockDocument }
    })
    mockReadability.mockImplementation(function() {
      return { parse: () => ({ textContent: "Hello World" }) }
    })

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("Hello World")
    expect(result.error).toBeNull()
  })

  it("returns empty for invalid URL", async () => {
    const result = await extractContent("not a url")
    expect(result.content).toBe("")
    expect(result.error).toBeTruthy()
  })

  it("returns empty for private URL", async () => {
    const result = await extractContent("http://192.168.1.1")
    expect(result.content).toBe("")
    expect(result.error).toBeTruthy()
  })

  it("returns empty for HTTP error", async () => {
    mockFetch.mockResolvedValue({
      status: 404,
      ok: false,
      headers: new Map(),
      text: () => Promise.resolve("")
    })

    const result = await extractContent("https://example.com/404")
    expect(result.content).toBe("")
    expect(result.error).toBe("HTTP 404")
  })

  it("follows valid redirect", async () => {
    let callCount = 0
    mockFetch.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve({
          status: 302,
          ok: false,
          headers: new Map([["location", "https://target.com/page"]]),
          text: () => Promise.resolve("")
        })
      }
      return Promise.resolve(mockSuccessResponse("<html><body>Redirected</body></html>"))
    })

    mockJSDOM.mockReturnValue({ window: { document: {} } })
    mockReadability.mockImplementation(function() {
      return { parse: () => ({ textContent: "Redirected" }) }
    })

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("Redirected")
    expect(result.error).toBeNull()
    expect(callCount).toBe(2)
  })

  it("blocks redirect to private network", async () => {
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Map([["location", "http://192.168.1.1/secret"]]),
      text: () => Promise.resolve("")
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("")
    expect(result.error).toBeTruthy()

    warnSpy.mockRestore()
  })

  it("blocks redirect with no Location header", async () => {
    mockFetch.mockResolvedValue({
      status: 302,
      ok: false,
      headers: new Map(),
      text: () => Promise.resolve("")
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("")
    expect(result.error).toBe("Redirect with no Location header")

    warnSpy.mockRestore()
  })

  it("skips non-HTML content type", async () => {
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([["content-type", "application/pdf"]]),
      text: () => Promise.resolve("%PDF-1.4...")
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await extractContent("https://example.com/file.pdf")
    expect(result.content).toBe("")
    expect(result.error).toBeNull()

    warnSpy.mockRestore()
  })

  it("handles fetch error gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"))

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("")
    expect(result.error).toBeTruthy()

    errorSpy.mockRestore()
  })

  it("handles abort/timeout error gracefully", async () => {
    const abortError = new Error("The operation was aborted")
    abortError.name = "AbortError"
    mockFetch.mockRejectedValue(abortError)

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("")
    expect(result.error).toBe("Timeout")

    warnSpy.mockRestore()
  })

  it("truncates response exceeding size limit", async () => {
    const largeChunk = "x".repeat(2 * 1024 * 1024)
    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      text: () => Promise.resolve(largeChunk)
    })

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    mockJSDOM.mockReturnValue({ window: { document: {} } })
    mockReadability.mockImplementation(function() {
      return { parse: () => ({ textContent: "truncated" }) }
    })

    const result = await extractContent("https://example.com")
    expect(result.content).toBe("truncated")
    expect(result.error).toBeNull()

    warnSpy.mockRestore()
  })
})

describe("build", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("completes build successfully with bookmarks", async () => {
    mockFs.readFileSync.mockImplementation((path) => {
      if (path === "bookmarks.html") return "<html><body></body></html>"
      return ""
    })
    mockFs.existsSync.mockImplementation((path) => {
      if (path === "docs/index.json") return false
      return true
    })

    const elements = [
      { text: () => "Example", attr: (name) => name === "href" ? "https://example.com" : null }
    ]
    const mock$ = vi.fn((sel) => {
      if (sel === "a") {
        return {
          each: (cb) => { elements.forEach((el, i) => cb(i, el)) }
        }
      }
      if (typeof sel === "object" && sel !== null) {
        const el = sel
        return { attr: (name) => el.attr(name), text: () => el.text() }
      }
      return { attr: () => null, text: () => "" }
    })
    mockCheerioLoad.mockReturnValue(mock$)

    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      text: () => Promise.resolve("<html><body><p>Hello</p></body></html>")
    })

    mockJSDOM.mockReturnValue({ window: { document: {} } })
    mockReadability.mockImplementation(function() {
      return { parse: () => ({ textContent: "Hello content" }) }
    })

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await build()

    expect(mockFs.writeFileSync).toHaveBeenCalled()
    const writeCall = mockFs.writeFileSync.mock.calls[0]
    expect(writeCall[0]).toBe("docs/index.json")
    const writtenData = JSON.parse(writeCall[1])
    expect(writtenData).toHaveLength(1)
    expect(writtenData[0].title).toBe("Example")
    expect(writtenData[0].url).toBe("https://example.com")

    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it("creates docs directory if it does not exist", async () => {
    mockFs.readFileSync.mockReturnValue("<html><body></body></html>")

    const elements = [
      { text: () => "Example", attr: (name) => name === "href" ? "https://example.com" : null }
    ]
    const mock$ = vi.fn((sel) => {
      if (sel === "a") {
        return {
          each: (cb) => { elements.forEach((el, i) => cb(i, el)) }
        }
      }
      if (typeof sel === "object" && sel !== null) {
        const el = sel
        return { attr: (name) => el.attr(name), text: () => el.text() }
      }
      return { attr: () => null, text: () => "" }
    })
    mockCheerioLoad.mockReturnValue(mock$)

    mockFetch.mockResolvedValue({
      status: 200,
      ok: true,
      headers: new Map([["content-type", "text/html; charset=utf-8"]]),
      text: () => Promise.resolve("<html><body><p>Test</p></body></html>")
    })
    mockJSDOM.mockReturnValue({ window: { document: {} } })
    mockReadability.mockImplementation(function() {
      return { parse: () => ({ textContent: "Test content" }) }
    })
    mockFs.existsSync.mockReturnValue(false)

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    await build()

    expect(mockFs.mkdirSync).toHaveBeenCalledWith("docs", { recursive: true })

    logSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it("handles build error gracefully", async () => {
    mockFs.readFileSync.mockImplementation(() => { throw new Error("File not found") })
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {})

    await build()

    expect(exitSpy).toHaveBeenCalledWith(1)
    errorSpy.mockRestore()
    exitSpy.mockRestore()
  })
})
