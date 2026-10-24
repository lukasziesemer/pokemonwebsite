import "dotenv/config";
import { defineConfig } from "prisma/config";

// Fallback URL für prisma generate (wird nur für Code-Generierung verwendet)
// Die echte DATABASE_URL wird zur Laufzeit verwendet
const databaseUrl =
  process.env.DATABASE_URL ||
  "postgresql://dummy:dummy@localhost:5432/dummy";
const shadowDatabaseUrl = process.env.PRISMA_MIGRATE_SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
    shadowDatabaseUrl,
  },
});
