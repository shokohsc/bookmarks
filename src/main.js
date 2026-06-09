import "./style.css"

const search = document.getElementById("search")
const input = document.createElement("input")
input.type = "text"
input.placeholder = "Search bookmarks..."
input.className = "search-input"
search.appendChild(input)

const results = document.createElement("div")
results.className = "results"
search.appendChild(results)

let data = []

const render = (query) => {
  const q = query.trim().toLowerCase()
  if (!q) {
    results.innerHTML = ""
    return
  }
  const hits = data.filter((item) => {
    const text = [item.title, item.url, ...(item.tags || []), item.content].join(" ").toLowerCase()
    return text.includes(q)
  })
  if (hits.length === 0) {
    results.innerHTML = '<div class="empty">No results found</div>'
    return
  }
  results.innerHTML = hits
    .map(
      (item) => `
      <a class="result-item" href="${item.url}" target="_blank" rel="noopener">
        <span class="result-title">${item.title}</span>
        <span class="result-url">${item.url}</span>
        ${item.tags ? `<span class="result-tags">${item.tags.slice(0, 5).join(", ")}</span>` : ""}
      </a>`
    )
    .join("")
}

let timer
input.addEventListener("input", () => {
  clearTimeout(timer)
  timer = setTimeout(() => render(input.value), 150)
})

const init = async () => {
  data = await fetch("index.json").then((r) => r.json())
}

init()
