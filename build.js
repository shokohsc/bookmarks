import fs from "fs"
import fetch from "node-fetch"
import { JSDOM } from "jsdom"
import { Readability } from "@mozilla/readability"
import * as cheerio from "cheerio"

import { generateTags as basicGenerateTags } from "./tagger.js"

const MAX_RESPONSE_SIZE = 1 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 20000
const MAX_BOOKMARKS = 5000
const MAX_REDIRECTS = 5
const USER_AGENT = "bookmark-search-bot/1.0"
const CONCURRENCY = 5

function isPrivateIP(hostname)
{
  let parsed = hostname.toLowerCase()
  parsed = parsed.replace(/^\[|\]$/g, "")

  if (parsed === "localhost" || parsed === "127.0.0.1" || parsed === "0.0.0.0" ||
      parsed === "::1" || parsed === "::" ||
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

async function extractContent(url, redirectDepth = 0)
{
  const validation = validateUrl(url)
  if (!validation.valid)
  {
    console.warn(`[WARN] Skipping invalid URL "${url}": ${validation.reason}`)
    return { content: "", error: validation.reason }
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
      if (redirectDepth >= MAX_REDIRECTS)
      {
        console.warn(`[WARN] Too many redirects (${MAX_REDIRECTS}) for ${safeUrl}`)
        return { content: "", error: "Too many redirects" }
      }
      const location = res.headers.get("location")
      if (location)
      {
        const redirectValidation = validateUrl(location)
        if (!redirectValidation.valid)
        {
          console.warn(`[WARN] Redirect target blocked: ${location} - ${redirectValidation.reason}`)
          return { content: "", error: `Redirect target blocked: ${redirectValidation.reason}` }
        }
        return extractContent(redirectValidation.url, redirectDepth + 1)
      }
      console.warn(`[WARN] Redirect with no Location header from ${safeUrl}`)
      return { content: "", error: "Redirect with no Location header" }
    }

    if (!res.ok)
    {
      console.warn(`[WARN] HTTP ${res.status} for ${safeUrl}`)
      return { content: "", error: `HTTP ${res.status}` }
    }

    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))
    {
      console.warn(`[WARN] Skipping non-HTML content (${contentType}) for ${safeUrl}`)
      return { content: "", error: null }
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

    return { content: article?.textContent || "", error: null }
  }
  catch (err)
  {
    if (err.name === "AbortError")
    {
      console.warn(`[WARN] Request timed out after ${REQUEST_TIMEOUT_MS}ms for ${safeUrl}`)
      return { content: "", error: "Timeout" }
    }
    else
    {
      console.error(`[ERROR] Failed to fetch ${safeUrl}: ${err.message}`)
      return { content: "", error: err.message }
    }
  }
}

async function pMap(items, fn, concurrency)
{
  const results = new Array(items.length)
  let next = 0
  const workers = []
  const count = Math.min(concurrency, items.length)
  for (let i = 0; i < count; i++)
  {
    workers.push((async () => {
      while (next < items.length)
      {
        const idx = next++
        results[idx] = await fn(items[idx])
      }
    })())
  }
  await Promise.all(workers)
  return results
}

async function build()
{
  try
  {
    console.log("Parsing bookmarks.html...")
    const bookmarks = parseBookmarks()
    console.log(`Found ${bookmarks.length} bookmarks`)

    const indexFile = "docs/index.json"
    const existing = new Map()
    if (fs.existsSync(indexFile))
    {
      const data = JSON.parse(fs.readFileSync(indexFile, "utf8"))
      for (const entry of data)
      {
        existing.set(entry.url, entry)
      }
      console.log(`Loaded ${existing.size} existing entries from ${indexFile}`)
    }

    const failures = []
    const seen = new Set()

    const results = await pMap(bookmarks, async (b) => {
      const existingEntry = existing.get(b.url)
      if (existingEntry)
      {
        existingEntry.title = b.title
        seen.add(b.url)
        return null
      }

      console.log(`Fetching: ${b.url}`)
      const { content, error } = await extractContent(b.url)

      if (error)
      {
        failures.push({ url: b.url, title: b.title, error })
      }

      const tagger = process.env.LLM_TAGGING === "true"
        ? (await import("./llm-tagger.js")).generateTagsLLM
        : async (content) => basicGenerateTags(content)

      const ai = await tagger(content, b.title, b.url)
      seen.add(b.url)

      return {
        title: b.title,
        url: b.url,
        category: ai.category,
        tags: ai.tags,
        content: content.slice(0, 500)
      }
    }, CONCURRENCY)

    const existingInOrder = Array.from(existing.values()).filter(e => seen.has(e.url))
    const newEntries = results.filter(r => r !== null)
    const index = [...existingInOrder, ...newEntries]

    const dir = "docs"
    if (!fs.existsSync(dir))
    {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(
      `${dir}/index.json`,
      JSON.stringify(index, null, 2)
    )

    console.log(`Build complete. ${index.length} entries (${existingInOrder.length} cached, ${newEntries.length} new)`)

    if (failures.length > 0)
    {
      console.log(`\n=== FAILED URLs (${failures.length}) ===`)
      for (const f of failures)
      {
        console.log(`  ${f.title}: ${f.url} (${f.error})`)
      }

      const failuresPath = `${dir}/failures.json`
      fs.writeFileSync(failuresPath, JSON.stringify(failures, null, 2))
      console.log(`\nFull failure report written to ${failuresPath}`)
    }
    else
    {
      console.log("All URLs fetched successfully.")
    }
  }
  catch (err)
  {
    console.error(`[ERROR] Build failed: ${err.message}`)
    process.exit(1)
  }
}

export { validateUrl, parseBookmarks, extractContent, build, isPrivateIP, pMap }

if (process.argv[1]?.endsWith("build.js"))
{
  build()
}
