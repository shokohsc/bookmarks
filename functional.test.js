import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { JSDOM } from "jsdom";
import http from "http";
import { createServer } from "vite";

const PORT = 8765;
let server;
let baseUrl;

beforeAll(async () => {
  server = await createServer({
    root: ".",
    base: "./",
    server: { port: PORT, strictPort: true, host: "127.0.0.1" },
    logLevel: "silent",
  });
  await server.listen();
  baseUrl = `http://127.0.0.1:${PORT}`;
}, 30000);

afterAll(async () => {
  if (server) await server.close();
}, 15000);

function fetchUrl(path) {
  return new Promise((resolve, reject) => {
    http
      .get(`${baseUrl}${path}`, (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      })
      .on("error", reject);
  });
}

describe("Functional Tests (Dev Server)", () => {
  it("serves the main page", async () => {
    const res = await fetchUrl("/");
    expect(res.status).toBe(200);
    expect(res.body).toContain("Bookmarks");
  });

  it("serves the JS entry module", async () => {
    const res = await fetchUrl("/src/main.js");
    expect(res.status).toBe(200);
    expect(res.body).toContain("Search bookmarks");
  });

  // it("serves index.json", async () => {
  //   const res = await fetchUrl("/index.json")
  //   expect(res.status).toBe(200)
  //   const data = JSON.parse(res.body)
  //   expect(Array.isArray(data)).toBe(true)
  // })

  it("all asset references resolve", async () => {
    const html = (await fetchUrl("/")).body;
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const urls = [];
    for (const el of doc.querySelectorAll("script[src], link[href]")) {
      urls.push(el.getAttribute("src") || el.getAttribute("href"));
    }
    for (const url of urls) {
      const res = await fetchUrl(url);
      expect(res.status).toBe(200);
    }
  });
});
