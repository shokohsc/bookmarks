import fs from "fs"
import fetch from "node-fetch"
import { JSDOM } from "jsdom"
import { Readability } from "@mozilla/readability"
import cheerio from "cheerio"

import { generateTags } from "./tagger.js"

const MAX_RESPONSE_SIZE = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20000
const MAX_BOOKMARKS = 5000
const USER_AGENT = "bookmark-search-bot/1.0"

function isPrivateIP(hostname)
{
  const parsed = hostname.toLowerCase()

  if (parsed === "localhost" || parsed === "127.0.0.1" || parsed === "0.0.0.0" ||
      parsed === "[::1]" || parsed === "[::]" ||
      parsed.startsWith("fc") || parsed.startsWith("fd") ||
      parsed.startsWith("fe80"))
  {
    return true
  }

  const ipv4Match = parsed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match)
  {
    const [_, a, b, c, d] = ipv4Match.map(Number)
    if (a > 255 || b > 255 || c > 255 || d > 255) return false
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
  }

  return false
}

/**
 * Validate that a URL is safe to fetch.
 * Rejects non-HTTP(S) protocols, empty URLs, and potentially malicious patterns.
 */
function validateUrl(url)
{
  if (!url || typeof url !== "string")
  {
    return { valid: false, reason: "URL is empty or not a string" }
  }

  url = url.trim()

  if (url.length === 0)
  {
    return { valid: false, reason: "URL is empty" }
  }

  try
  {
    const parsed = new URL(url)
    const protocol = parsed.protocol.toLowerCase()

    if (protocol !== "http:" && protocol !== "https:")
    {
      return { valid: false, reason: `Unsupported protocol: ${protocol}. Only http and https are allowed.` }
    }

    if (parsed.username || parsed.password)
    {
      return { valid: false, reason: "URLs with embedded credentials are not allowed" }
    }

    const hostname = parsed.hostname.toLowerCase()
    if (isPrivateIP(hostname))
    {
      return { valid: false, reason: "Requests to private/internal networks are not allowed" }
    }

    return { valid: true, url }
  }
  catch (e)
  {
    return { valid: false, reason: `Invalid URL format: ${e.message}` }
  }
}

function parseBookmarks()
{
  const html = fs.readFileSync("bookmarks.html", "utf8")
  const $ = cheerio.load(html)
  let links = []

  $("a").each((i, el) => {
    const href = $(el).attr("href")
    if (!href || href.trim() === "")
    {
      console.warn(`[WARN] Skipping link #${i + 1} with empty/missing href`)
      return
    }

    links.push({
      title: $(el).text().trim(),
      url: href.trim()
    })
  })

  if (links.length > MAX_BOOKMARKS)
  {
    console.warn(`[WARN] Bookmark count (${links.length}) exceeds ${MAX_BOOKMARKS}, truncating`)
    links = links.slice(0, MAX_BOOKMARKS)
  }

  return links
}

async function extractContent(url)
{
  const validation = validateUrl(url)
  if (!validation.valid)
  {
    console.warn(`[WARN] Skipping invalid URL "${url}": ${validation.reason}`)
    return ""
  }

  const safeUrl = validation.url

  try
  {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    const res = await fetch(safeUrl, {
      signal: controller.signal,
      redirect: "manual",
      headers: {
        "User-Agent": USER_AGENT
      }
    })

    clearTimeout(timeoutId)

    if (res.status >= 300 && res.status < 400)
    {
      const location = res.headers.get("location")
      if (location)
      {
        const redirectValidation = validateUrl(location)
        if (!redirectValidation.valid)
        {
          console.warn(`[WARN] Redirect target blocked: ${location} - ${redirectValidation.reason}`)
          return ""
        }
        return extractContent(redirectValidation.url)
      }
      console.warn(`[WARN] Redirect with no Location header from ${safeUrl}`)
      return ""
    }

    if (!res.ok)
    {
      console.warn(`[WARN] HTTP ${res.status} for ${safeUrl}`)
      return ""
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))
    {
      console.warn(`[WARN] Skipping non-HTML content (${contentType}) for ${safeUrl}`)
      return ""
    }

    let body
    if (typeof res.text === "function")
    {
      body = await res.text()
    }
    else
    {
      const chunks = []
      for await (const chunk of res.body)
      {
        chunks.push(chunk)
      }
      body = Buffer.concat(chunks).toString("utf8")
    }

    if (body.length > MAX_RESPONSE_SIZE)
    {
      console.warn(`[WARN] Response from ${safeUrl} exceeded ${MAX_RESPONSE_SIZE} byte limit, truncating`)
      body = body.slice(0, MAX_RESPONSE_SIZE)
    }

    const dom = new JSDOM(body, { url: safeUrl })
    const reader_ = new Readability(dom.window.document)
    const article = reader_.parse()

    return article?.textContent || ""
  }
  catch (err)
  {
    if (err.name === "AbortError")
    {
      console.warn(`[WARN] Request timed out after ${REQUEST_TIMEOUT_MS}ms for ${safeUrl}`)
    }
    else
    {
      console.error(`[ERROR] Failed to fetch ${safeUrl}: ${err.message}`)
    }
    return ""
  }
}

async function build()
{
  try
  {
    console.log("Parsing bookmarks.html...")
    const bookmarks = parseBookmarks()
    console.log(`Found ${bookmarks.length} bookmarks`)

    const index = []

    for (const b of bookmarks)
    {
      console.log(`Fetching: ${b.url}`)
      const content = await extractContent(b.url)

      const ai = generateTags(content)

      index.push({
        title: b.title,
        url: b.url,
        category: ai.category,
        tags: ai.tags,
        content: content.slice(0, 500)
      })
    }

    // Ensure docs directory exists
    const dir = "docs"
    if (!fs.existsSync(dir))
    {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(
      `${dir}/index.json`,
      JSON.stringify(index, null, 2)
    )

    console.log(`Build complete. Wrote ${index.length} entries to ${dir}/index.json`)
  }
  catch (err)
  {
    console.error(`[ERROR] Build failed: ${err.message}`)
    process.exit(1)
  }
}

export { validateUrl, parseBookmarks, extractContent, build, isPrivateIP }

if (process.argv[1]?.endsWith("build.js"))
{
  build()
}
