const STOPWORDS = new Set([
  "the","and","for","with","this","that","from","are","was","were",
  "have","has","had","not","but","you","your","about"
])

export function generateTags(text)
{
  if (typeof text !== "string" || text.length > 50000)
  {
    return { tags: [], category: "other" }
  }

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)

  const freq = Object.create(null)

  for (const w of words)
  {
    if (w.length < 4) continue
    if (STOPWORDS.has(w)) continue

    freq[w] = (freq[w] || 0) + 1
  }

  const sorted =
    Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(x => x[0])

  const category = sorted[0] || "other"

  return {
    tags: sorted,
    category
  }
}
