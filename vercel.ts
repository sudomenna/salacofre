// vercel.ts — config typed do projeto (substitui vercel.json).
// Cron de /api/ingest é placeholder; cadência final entra em S02 após
// publicação da resolução TSE 2026 (constituição § 1).
//
// O tipo @vercel/config ainda não existe como pacote npm consolidado;
// usamos um shape literal validado em deploy. Mantemos o objeto exportado
// como `const` para que `pnpm typecheck` enforce o shape mínimo.

export type VercelCron = {
  path: string;
  schedule: string;
};

export type VercelProjectConfig = {
  $schema?: string;
  crons?: VercelCron[];
  regions?: string[];
};

const config: VercelProjectConfig = {
  // Cron placeholder — S02 define cadência real (RF-002) após resolução TSE 2026.
  // Vercel exige cron com no mínimo 1 chamada/dia em planos pagos;
  // este placeholder roda às 03:00 UTC e é substituído na S02.
  crons: [
    {
      path: "/api/ingest",
      schedule: "0 3 * * *",
    },
  ],
  // gru1 = São Paulo. Audiência majoritariamente BR — minimizar latência.
  regions: ["gru1"],
};

export default config;
