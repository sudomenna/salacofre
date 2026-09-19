/**
 * app/api/projection/route.ts
 *
 * Endpoint público de leitura da projeção. Cumpre RF-019/RF-020 e o contrato
 * declarado pelas specs 003 (home) e 004 (UF):
 *
 *   GET /api/projection                → EdgePayload (nacional, Presidente)
 *   GET /api/projection?cargo=gov      → EdgePayload (nacional, Governador)
 *   GET /api/projection?cargo=sen      → EdgePayload (nacional, Senador)
 *   GET /api/projection?uf=<sigla>     → EdgePayloadUf (RESUMO da UF, sempre Presidente)
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
 * **2026-09-18 — `?cargo=sen` acrescido pelo mesmo motivo.** A trilha Senador
 * ganhou a mesma moldura persistente (`PersistentMapFrame`, ramo `cargo ===
 * "sen"`) e precisava do mesmo read path client-side. Senador não tem 2º
 * turno (`temSegundoTurno: false`, `lib/config/cargos.ts`), então este ramo
 * só tenta `turno: 1` — ao contrário de `?cargo=gov`, que tenta 1 e depois 2.
 *
 * 🔴 `?uf=<sigla>` **ignora** `cargo`: sempre devolve o resumo PRESIDENCIAL da
 * UF (comportamento pré-existente, documentado aqui e não alterado por esta
 * mudança). `PersistentMapFrame` sabe disso e não chama este ramo quando
 * `cargo === "sen"` (Senador não tem nível UF nesta moldura).
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

import { simulacaoLigada, simulacaoNacional, simulacaoUfPresidente } from "@/lib/dev/simulacao";
import { readNationalProjection, readProjection, readUfProjection } from "@/lib/edge-config/reader";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";
import govFixture from "@/tests/fixtures/edge-config/gov-current.json" with { type: "json" };
import nationalFixture from "@/tests/fixtures/edge-config/projection-current.json" with {
  type: "json",
};
import senFixture from "@/tests/fixtures/edge-config/sen-current.json" with { type: "json" };

const UF_REGEX = /^[A-Z]{2}$/;
const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
} as const;

/**
 * Em dev (sem `EDGE_CONFIG`), retornamos o fixture para que a home renderize.
 * Em produção com `EDGE_CONFIG` setado, o caller já fez a chamada real ao
 * reader e veio `null` — aí é genuinamente ausência de payload, mantemos 503.
 *
 * ## O `NODE_ENV === "development"` é acréscimo de 2026-09-14, e conserta um buraco
 *
 * Até aqui esta função olhava SÓ a ausência de `EDGE_CONFIG`, e o nome dela
 * afirmava um "dev" que ela nunca verificou. A consequência não era hipotética:
 * uma deployment de PRODUÇÃO sem a variável `EDGE_CONFIG` — credencial não
 * propagada, projeto recriado, variável removida por engano — caía neste ramo e
 * servia os números da fixture como se fossem apuração, com `Cache-Control`
 * público de 30 s por cima. É a mesma classe de defeito que derrubou a home em
 * 13/09 e que publicou resultado inventado em 14/09: a rede de segurança que,
 * na falta de dado, fabrica dado com cara de verdadeiro.
 *
 * Falta de credencial é justamente o estado em que menos se pode confiar no
 * ambiente — então ele passa a ser afirmado, e não inferido. Fora do `pnpm dev`
 * o caminho honesto é o 503 que os chamadores abaixo já tinham escrito.
 */
function isDevWithoutEdgeConfig(): boolean {
  return process.env.NODE_ENV === "development" && !process.env.EDGE_CONFIG;
}

/**
 * Fonte de DESENVOLVIMENTO deste endpoint: simulação quando ligada, a fixture
 * de sempre caso contrário — e nunca as duas.
 *
 * A exclusividade é o ponto. Se a simulação estiver ligada mas o arquivo do
 * cargo faltar, isto devolve `null` e o endpoint responde 503, em vez de cair
 * na fixture antiga: o mapa desta moldura ficaria mostrando OUTRA apuração ao
 * lado do placar da simulação, e o dono passaria horas caçando um bug de UI que
 * não existe. Endpoint mudo é diagnosticável; endpoint discordando, não.
 */
function fonteDev<T>(daSimulacao: () => T | null, daFixture: () => T): T | null {
  if (simulacaoLigada()) return daSimulacao();
  return isDevWithoutEdgeConfig() ? daFixture() : null;
}

/**
 * Recorta um `EdgePayloadUf` de um payload nacional — a mesma lógica que
 * `synthesizeUfFromNational` aplica em `app/(pres)/uf/[sigla]/page.tsx`.
 *
 * ⚠️ Para PRESIDENTE isto serve a votação NACIONAL como se fosse a do estado:
 * a cédula é a mesma nos 27, e não há por quem filtrar. É aproximação de
 * desenvolvimento, e por isso `simulacaoUfPresidente` tem precedência sobre ela
 * no ramo abaixo.
 */
function sintetizarUf(sigla: string, national: EdgePayload): EdgePayloadUf | null {
  const row = national.por_uf.find((u) => u.sigla === sigla);
  if (!row) return null;
  return {
    uf: sigla,
    ts: national.ts,
    cargo: national.cargo,
    turno: national.turno,
    pct_apurado: row.pct_apurado,
    candidatos: national.national.candidatos.map((c) => ({
      id: c.id,
      nome: c.nome,
      partido: c.partido,
      // `cor` não é repassada: saiu do payload em 19/09 (ADR-0024).
      votos_atuais: c.votos_atuais,
      votos_projetados: c.votos_projetados,
      pct_atual: c.pct_atual,
      pct_projetado: c.pct_projetado,
      ci95: { lower: c.pct_projetado_lower, upper: c.pct_projetado_upper },
    })),
    needle_position: row.lider === national.national.candidato_a_id ? 0.4 : -0.4,
    needle_band: "lean_a",
  };
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const ufParam = url.searchParams.get("uf");

  if (ufParam) {
    const sigla = ufParam.toUpperCase();
    if (!UF_REGEX.test(sigla)) {
      return NextResponse.json({ error: "invalid_uf" }, { status: 400 });
    }

    // 🔴 Simulação ligada ⇒ ela é a fonte de verdade, e o Global Config nem é
    // lido. Ordem deliberada: é este endpoint que pinta o mapa da moldura
    // persistente, e ele precisa contar exatamente a mesma história que
    // `/uf/[sigla]` renderiza ao lado. O payload por UF vem primeiro; a síntese
    // é o fallback enquanto `presidente-uf.json` não existir.
    if (simulacaoLigada()) {
      const daUf = simulacaoUfPresidente(sigla);
      if (daUf) return NextResponse.json(daUf, { headers: CACHE_HEADERS });
      const nacional = simulacaoNacional("pres");
      const sintetizado = nacional ? sintetizarUf(sigla, nacional) : null;
      if (sintetizado) return NextResponse.json(sintetizado, { headers: CACHE_HEADERS });
      return NextResponse.json({ error: "no_payload", uf: sigla }, { status: 503 });
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
      const national = fonteDev(
        () => null,
        () => nationalFixture as unknown as EdgePayload,
      );
      const synthesized = national ? sintetizarUf(sigla, national) : null;
      if (synthesized) return NextResponse.json(synthesized, { headers: CACHE_HEADERS });
      return NextResponse.json({ error: "no_payload", uf: sigla }, { status: 503 });
    }
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  }

  // ADR-0033 § 1 — `?cargo=gov`. A ordem 1T → 2T é a mesma que
  // `app/(gov)/governador/page.tsx` já usava no servidor.
  if (url.searchParams.get("cargo") === "gov") {
    // Simulação primeiro, e sem tocar no Global Config — mesma regra do ramo
    // de UF acima.
    const govSim = simulacaoLigada() ? simulacaoNacional("gov") : null;
    if (govSim) return NextResponse.json(govSim, { headers: CACHE_HEADERS });
    if (!simulacaoLigada()) {
      const gov =
        (await readProjection({ cargo: "gov", turno: 1 })) ??
        (await readProjection({ cargo: "gov", turno: 2 })) ??
        fonteDev(
          () => null,
          () => govFixture as unknown as EdgePayload,
        );
      if (gov) return NextResponse.json(gov, { headers: CACHE_HEADERS });
    }
    return NextResponse.json({ error: "no_payload", cargo: "gov" }, { status: 503 });
  }

  // `?cargo=sen` — mesma estrutura do ramo gov acima, sem o retry de 2º
  // turno: Senador não tem (`temSegundoTurno: false`, `lib/config/cargos.ts`).
  if (url.searchParams.get("cargo") === "sen") {
    const senSim = simulacaoLigada() ? simulacaoNacional("sen") : null;
    if (senSim) return NextResponse.json(senSim, { headers: CACHE_HEADERS });
    if (!simulacaoLigada()) {
      const sen =
        (await readProjection({ cargo: "sen", turno: 1 })) ??
        fonteDev(
          () => null,
          () => senFixture as unknown as EdgePayload,
        );
      if (sen) return NextResponse.json(sen, { headers: CACHE_HEADERS });
    }
    return NextResponse.json({ error: "no_payload", cargo: "sen" }, { status: 503 });
  }

  const presSim = simulacaoLigada() ? simulacaoNacional("pres") : null;
  if (presSim) return NextResponse.json(presSim, { headers: CACHE_HEADERS });
  if (!simulacaoLigada()) {
    const payload =
      (await readNationalProjection()) ??
      fonteDev(
        () => null,
        () => nationalFixture as unknown as EdgePayload,
      );
    if (payload) return NextResponse.json(payload, { headers: CACHE_HEADERS });
  }
  return NextResponse.json({ error: "no_payload" }, { status: 503 });
}
