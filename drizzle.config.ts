import { defineConfig } from "drizzle-kit";

/** Drizzle Kit config — drives `drizzle-kit generate` + `push`. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "./data/mission-control.db",
  },
});
