import fetch from "node-fetch"
import { generateTags } from "./tagger.js"

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || "http://localhost:11434"
const MODEL = process.env.OLLAMA_MODEL || "gemma4"
const TIMEOUT_MS = 30000

const SYSTEM_PROMPT = `You are a bookmark tagging assistant. Read the following page content and suggest 5-10 relevant tags and one category for it.
Respond in JSON format only, no other text:
{"tags": ["tag1", "tag2", ...], "category": "single_category"}`

export async function generateTagsLLM(content, title, url)
{
  if (typeof content !== "string" || content.length === 0)
  {
    return generateTags(content)
  }

  const userMessage = `Title: ${title || "untitled"}\nURL: ${url || "unknown"}\n\nContent:\n${content.slice(0, 3000)}`

  try
  {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ]
      })
    })

    clearTimeout(timeoutId)

    if (!res.ok)
    {
      console.warn(`[WARN] Ollama returned HTTP ${res.status}, falling back to basic tagging`)
      return generateTags(content)
    }

    const data = await res.json()
    const text = data.message?.content || ""

    const parsed = JSON.parse(text)

    if (!Array.isArray(parsed.tags) || typeof parsed.category !== "string")
    {
      throw new Error("Invalid response shape from Ollama")
    }

    return {
      tags: parsed.tags.slice(0, 10),
      category: parsed.category
    }
  }
  catch (err)
  {
    if (err.name === "AbortError")
    {
      console.warn("[WARN] Ollama request timed out, falling back to basic tagging")
    }
    else
    {
      console.warn(`[WARN] Ollama request failed: ${err.message}, falling back to basic tagging`)
    }
    return generateTags(content)
  }
}
