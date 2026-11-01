// drizzle-kit 0.31.11 config (data-model §6). `generate` works offline; `migrate` runs from CI only, against
// DATABASE_URL_UNPOOLED (never from a Vercel build, never `push` against production).
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "postgres://pot:pot@localhost:54329/pot" },
  strict: true,
  verbose: true,
})
