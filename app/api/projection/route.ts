/**
 * app/api/projection/route.ts
 *
 * Endpoint público de leitura da projeção. Cumpre RF-019/RF-020 e o contrato
 * declarado pelas specs 003 (home) e 004 (UF):
 *
 *   GET /api/projection                → EdgePayload (nacional, Presidente)
 *   GET /api/projection?cargo=gov      → EdgePayload (nacional, Governador)
 *   GET /api/projection?uf=<sigla>     → EdgePayloadUf (RESUMO da UF)
 *
 * **ADR-0033 § 1 (2026-09-08)**: `?cargo=gov` é acréscimo desta data. A moldura
 * persistente do mapa (`components/layout/PersistentMapFrame.tsx`) busca o
 * próprio dado no cliente, e a trilha Governador precisava de um read path
 * client-side para o cartograma — o `/governador` lia `readProjection({cargo:
 * "gov"})` só no servidor. Sem parâmetro o comportamento é o de sempre
 * (Presidente), então nenhum consumidor existente muda. O namespacing de chave
 * por cargo/turno continua sendo o do ADR-0012: quem resolve a chave é
 * `readProjection`, não este arquivo.
 *
 * **ADR-0032 (2026-09-08)**: o `?uf=` devolve só o resumo. O detalhe municipal
 * e as séries temporais deixaram de fazer parte de `EdgePayloadUf` — vivem no
 * Vercel Blob, lidos no servidor por `readUfDetail` (`lib/blob/uf-detail.ts`).
 * Não há consumidor deste endpoint no repositório que esperasse esses campos
 * (o `useProjection()` de `components/shared/swr-provider.tsx` só busca o
 * nacional), mas um cliente externo que os esperasse passará a não recebê-los.
 *
 * Backed por Edge Config (ADR-0001). Quando não há payload publicado
 * (dev/preview sem credencial), cai num fixture estático compartilhado com os
 * tests para que `pnpm dev` continue renderizável (constituição § 3: UX nunca
 * quebra). Em produção com Edge Config configurado, comportamento original
 * (503 quando chave ausente).
 *
 * Cache (RF-027 + ADR-0002 — polling com CDN cache):
 *   - `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`
 *     A SWR no cliente faz polling a cada 5s, mas a CDN entrega cache de
 *     30s. Combinado: cliente sempre fresh, CDN absorve carga.
 */

import { NextResponse } from "next/server";
import { currentPresidentialTurno } from "@/lib/config/calendar";

import { readNationalProjection, readProjection, readUfProjection } from "@/lib/edge-config/reader";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};

const UF_REGEX = /^[A-Z]{2}$/;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

/**
 * Em dev (sem `EDGE_CONFIG`), retornamos o fixture para que a home renderize.
 * Em produção com `EDGE_CONFIG` setado, o caller já fez a chamada real ao
 * reader e veio `null` — aí é genuinamente ausência de payload, mantemos 503.
 */
function isDevWithoutEdgeConfig(): boolean {
  return !process.env.EDGE_CONFIG;
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ufParam = url.searchParams.get("uf");

  if (ufParam) {
    const sigla = ufParam.toUpperCase();
    if (!UF_REGEX.test(sigla)) {
      return NextResponse.json({ error: "invalid_uf" }, { status: 400 });
    }
    // Cargo explícito (ADR-0028): este ramo do endpoint é o presidencial —
    // o de governador está mais abaixo, com `cargo: "gov"`.
    const payload = await readUfProjection(sigla, {
      cargo: "pres",
      turno: currentPresidentialTurno(),
    });
    if (!payload) {
      // Em dev, sintetiza UF a partir do fixture nacional para o /api/projection?uf=
      // funcionar sem precisar de fixtures per-UF separadas.
      if (isDevWithoutEdgeConfig()) {
        const national = nationalFixture as unknown as EdgePayload;
        const row = national.por_uf.find((u) => u.sigla === sigla);
        if (!row) {
          return NextResponse.json({ error: "no_payload", uf: sigla }, { status: 503 });
        }
        const synthesized: EdgePayloadUf = {
          uf: sigla,
          ts: national.ts,
          cargo: national.cargo,
          turno: national.turno,
          pct_apurado: row.pct_apurado,
          candidatos: national.national.candidatos.map((c) => ({
            id: c.id,
            nome: c.nome,
            partido: c.partido,
            cor: c.cor,
            votos_atuais: c.votos_atuais,
            votos_projetados: c.votos_projetados,
            pct_atual: c.pct_atual,
            pct_projetado: c.pct_projetado,
            ci95: { lower: c.pct_projetado_lower, upper: c.pct_projetado_upper },
          })),
          needle_position: row.lider === national.national.candidato_a_id ? 0.4 : -0.4,
          needle_band: "lean_a",
        };
        return NextResponse.json(synthesized, { headers: CACHE_HEADERS });
      }
      return NextResponse.json({ error: "no_payload", uf: sigla }, { status: 503 });
    }
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  }

  // ADR-0033 § 1 — `?cargo=gov`. A ordem 1T → 2T é a mesma que
  // `app/(gov)/governador/page.tsx` já usava no servidor.
  if (url.searchParams.get("cargo") === "gov") {
    const gov =
      (await readProjection({ cargo: "gov", turno: 1 })) ??
      (await readProjection({ cargo: "gov", turno: 2 }));
    if (gov) return NextResponse.json(gov, { headers: CACHE_HEADERS });
    if (isDevWithoutEdgeConfig()) {
      return NextResponse.json(govFixture as unknown as EdgePayload, { headers: CACHE_HEADERS });
    }
    return NextResponse.json({ error: "no_payload", cargo: "gov" }, { status: 503 });
  }

  const payload = await readNationalProjection();
  if (!payload) {
    if (isDevWithoutEdgeConfig()) {
      return NextResponse.json(nationalFixture as unknown as EdgePayload, {
        headers: CACHE_HEADERS,
      });
    }
    return NextResponse.json({ error: "no_payload" }, { status: 503 });
  }
  return NextResponse.json(payload, { headers: CACHE_HEADERS });
}
