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

// Rolling Release não é serializável no bundle do projeto — é configuração
// account/project-side aplicada via `vercel rolling-release configure`
// (Vercel CLI) e armazenada no Vercel API. Mantemos aqui um marker tipado
// como source-of-truth da política desejada, para auditoria e para que
// `pnpm typecheck` quebre se alguém alterar sem revisar.
export type RollingReleaseStage = {
  /** Porcentagem de tráfego no canary nesta etapa (0..100). */
  percentage: number;
  /** Duração mínima antes de avançar (formato Vercel: ex. "5m", "10m"). */
  duration?: string;
};

export type RollingReleasePolicy = {
  enabled: boolean;
  advancementType: "automatic" | "manual-approval";
  stages: RollingReleaseStage[];
};

export type VercelProjectConfig = {
  $schema?: string;
  crons?: VercelCron[];
  regions?: string[];
};

// Rolling Release (RF-059, constituição § 7) — canary 10% → 50% → 100% com
// manual-approval. NÃO é consumido pelo schema do vercel.ts (Vercel rejeita
// propriedades extras na validação). É aplicado no projeto via:
//   vercel rolling-release configure --enable \
//     --advancement-type=manual-approval --stage=10 --stage=50
// Estágio final (100%) é implícito quando o último stage é aprovado. Mantemos
// este export como source-of-truth tipada da política para auditoria.
export const rollingReleasePolicy: RollingReleasePolicy = {
  enabled: true,
  advancementType: "manual-approval",
  stages: [{ percentage: 10 }, { percentage: 50 }],
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
