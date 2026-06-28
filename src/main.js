import "./style.css"

const THEME_KEY = "bookmark-theme"

const search = document.getElementById("search")
const input = document.createElement("input")
input.type = "text"
input.placeholder = "Search bookmarks"
input.className = "search-input"
search.appendChild(input)

const tagCloud = document.getElementById("tag-cloud")
const results = document.getElementById("results")

let data = []

const computeTagCloud = (items) => {
  const freq = Object.create(null)
  for (const item of items) {
    for (const tag of (item.tags || [])) {
      freq[tag] = (freq[tag] || 0) + 1
    }
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
}

const renderItem = (item) => `
  <a class="result-item" href="${item.url}" target="_blank" rel="noopener">
    <span class="result-title">${item.title}</span>
    <span class="result-url">${item.url}</span>
    ${item.tags ? `<span class="result-tags">${item.tags.slice(0, 5).join(", ")}</span>` : ""}
  </a>`

const renderTagCloud = (tags) => {
  if (tags.length === 0) {
    tagCloud.innerHTML = ""
    return
  }
  const maxCount = tags[0][1]
  tagCloud.innerHTML = tags
    .map(([tag, count]) => `<button class="tag" data-tag="${tag}" style="font-size:${0.75 + (count / maxCount) * 0.45}rem">${tag}</button>`)
    .join("")

  tagCloud.querySelectorAll(".tag").forEach((btn) => {
    btn.addEventListener("click", () => {
      input.value = btn.dataset.tag
      render(input.value)
    })
  })
}

const render = (query) => {
  const q = query.trim().toLowerCase()

  if (!q) {
    results.innerHTML = data.slice(0, 20).map(renderItem).join("")
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

  results.innerHTML = hits.map(renderItem).join("")
}

let timer
input.addEventListener("input", () => {
  clearTimeout(timer)
  timer = setTimeout(() => render(input.value), 150)
})

const init = async () => {
  data = await fetch("index.json").then((r) => r.json())
  render("")
  renderTagCloud(computeTagCloud(data))
}

// Theme toggle
const toggle = document.getElementById("theme-toggle")
const saved = localStorage.getItem(THEME_KEY)
if (saved === "light") {
  document.documentElement.removeAttribute("data-theme")
  toggle.textContent = "☾"
} else {
  document.documentElement.setAttribute("data-theme", "dark")
  toggle.textContent = "⊙"
}

toggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark"
  if (isDark) {
    document.documentElement.removeAttribute("data-theme")
    toggle.textContent = "☾"
    localStorage.setItem(THEME_KEY, "light")
  } else {
    document.documentElement.setAttribute("data-theme", "dark")
    toggle.textContent = "⊙"
    localStorage.setItem(THEME_KEY, "dark")
  }
})

init()
