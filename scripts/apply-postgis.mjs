// Aplica lib/db/migrations/0001_postgis.sql via Neon serverless HTTP.
// Uso: pnpm db:postgis (lê DATABASE_URL_UNPOOLED de .env.local).

import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Pool (WebSocket) precisa do ws polyfill em Node — diferente do Edge runtime.
neonConfig.webSocketConstructor = ws;

const __dirname = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (ou DATABASE_URL) não definido. Rode `vercel env pull` antes.");
  process.exit(1);
}

const migrationPath = resolve(__dirname, "../lib/db/migrations/0001_postgis.sql");
const raw = readFileSync(migrationPath, "utf8");
// Strip linhas-comentário inteiras antes do split — senão um `-- header\nCREATE...` vira
// um statement que começa com `--` e seria filtrado, perdendo o SQL real.
const stripped = raw
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");
const statements = stripped
  .split(/;\s*$/m)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const pool = new Pool({ connectionString: url });
try {
  for (const stmt of statements) {
    const first = stmt.split("\n")[0].slice(0, 80);
    process.stdout.write(`→ ${first}... `);
    await pool.query(stmt);
    console.log("ok");
  }
  console.log(`✓ ${statements.length} statements aplicados`);
} finally {
  await pool.end();
}
