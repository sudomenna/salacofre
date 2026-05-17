// Cliente Drizzle conectado via @neondatabase/serverless.
// IMPORTANTE: este módulo só pode ser usado no WRITE PATH (ingest, scripts, jobs).
// O read path do cliente não toca Postgres — ADR-0001 (Edge Config no read path).

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  // Não throw no top-level para não quebrar build estático;
  // throw acontece no primeiro uso real do client.
  // eslint-disable-next-line no-console
  console.warn("[db] DATABASE_URL ausente — db client não está pronto");
}

const sql = neon(databaseUrl ?? "");

export const db = drizzle(sql, { schema });
export { schema };
