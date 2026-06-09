import { defineConfig } from "vite"
import fs from "fs"

export default defineConfig({
  root: ".",
  base: "./",
  build: {
    outDir: "docs",
    emptyOutDir: false,
    rollupOptions: {
      input: "index.html"
    }
  },
  server: {
    host: true,
    // hmr: {
    //   clientPort: 443
    // },
    port: 8001
  },
  plugins: [
    {
      name: "serve-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/index.json")
          {
            try
            {
              const data = fs.readFileSync("docs/index.json", "utf8")
              res.setHeader("Content-Type", "application/json")
              res.end(data)
            }
            catch
            {
              res.statusCode = 404
              res.end("{}")
            }
            return
          }
          next()
        })
      }
    }
  ]
})
