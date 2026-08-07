import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawDatabaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/lumina";

// Managed Postgres poolers (Supabase's Supavisor, etc.) commonly present a
// certificate chain that Node's strict TLS validation rejects as
// self-signed/incomplete even though the connection is genuinely encrypted
// to the provider's own endpoint. A `sslmode=require` (or similar) query
// param on the URL is treated by newer pg-connection-string versions as
// `verify-full` and overrides an explicit `ssl` option passed to Pool, so we
// strip it from the URL and control TLS verification only via the explicit
// `ssl` option below.
const parsedUrl = new URL(rawDatabaseUrl);
const requiresSsl = parsedUrl.searchParams.has("sslmode") || parsedUrl.searchParams.get("ssl") === "true";
parsedUrl.searchParams.delete("sslmode");
parsedUrl.searchParams.delete("ssl");
const databaseUrl = parsedUrl.toString();

export const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
