import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

async function getStars(username, fetchFn = globalThis.fetch) {
  if (!username) {
    throw new Error("Usage: node stars.js <github-username>");
  }

  const token = process.env.GH_TOKEN;
  if (!token) {
    throw new Error("Please set GH_TOKEN.");
  }

  let page = 1;
  const repos = [];

  while (true) {
    const response = await fetchFn(
      `https://api.github.com/users/${username}/starred?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "github-stars-export",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      break;
    }

    repos.push(...data.map((repo) => "https://github.com/" + repo.full_name));
    page++;
  }

  writeFileSync("stars.txt", repos.join("\n"), "utf8");
  console.log(`Exported ${repos.length} repositories.`);
}

export { getStars };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node stars.js <github-username>");
    process.exit(1);
  }
  getStars(username).catch(console.error);
}
