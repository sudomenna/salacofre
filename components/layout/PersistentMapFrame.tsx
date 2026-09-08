"use client";

/**
 * components/layout/PersistentMapFrame.tsx
 *
 * O mapa que NÃO desmonta ao trocar de UF — a Decisão 1 do
 * [ADR-0033](../../docs/architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md)
 * ("jeito C": moldura persistente, endereço sempre muda).
 *
 * ## Por que ele busca o próprio dado
 *
 * Este componente é montado pelo `layout.tsx` do grupo de rotas — `(pres)`
 * para Presidente (`/` ↔ `/uf/[sigla]`), `(gov)` para Governador
 * (`/governador` ↔ `/uf/[sigla]/governador`). O App Router não desmonta um
 * segmento de layout quando só o `page.tsx` filho muda, e é exatamente isso
 * que faz o mapa sobreviver à navegação.
 *
 * Só que um `layout.tsx` ACIMA de um segmento dinâmico não recebe `sigla` por
 * `params` no servidor — quem recebe é o layout aninhado DENTRO do segmento.
 * Então a UF corrente é resolvida no cliente (`useParams()`), e o dado vem de
 * `GET /api/projection` em vez de props do `page.tsx`. É essa troca que
 * desacopla o ciclo de vida do mapa do ciclo de vida de cada página; receber
 * props do `page.tsx` recriaria o acoplamento que a decisão desfaz.
 *
 * O ADR nomeia o custo, e ele é real: passa a haver dois caminhos de dado para
 * a mesma projeção — este, client-side, e o que cada página ainda faz no
 * servidor para os próprios painéis. Os dois podem ficar dessincronizados por
 * alguns segundos, mitigado pela cadência de 60s (ADR-0011) e pelo cache de
 * CDN de 30s do endpoint (ADR-0002).
 *
 * ## O que fica de fora, e é do `map-builder`
 *
 * O ADR autoriza explicitamente uma primeira versão parcial: basta que o
 * wrapper React não desmonte. O mapa nacional (PMTiles de UF) e o mapa
 * municipal são DUAS implementações MapLibre distintas — unificá-las numa
 * instância só, que troca de fonte e faz `flyTo` da visão nacional para a UF,
 * é trabalho de mapa (ADR-0003/ADR-0004) que este ADR autoriza como intenção
 * mas não especifica.
 *
 * Consequência concreta: a moldura mostra SEMPRE o nível Brasil. Numa rota de
 * UF ela ganha a etiqueta da UF e o botão "Brasil" de volta (o overlay que o
 * kit desenha sobre o mapa, `App.jsx`), e o coroplético municipal continua nos
 * painéis da própria página de UF — ele é alimentado pelo Vercel Blob lido no
 * servidor (ADR-0032), que não tem endpoint público de leitura.
 */

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import { HexCartogramBrasil } from "@/components/blocks/HexCartogramBrasil";
import { NationalMapBlock } from "@/components/blocks/NationalMapBlock";
import type { EdgePayload, EdgePayloadUf } from "@/lib/edge-config/types";

/** Mesma cadência de escrita do orchestrator (ADR-0011). */
const REFRESH_MS = 60_000;

const CARGO_LABEL = { pres: "Presidente", gov: "Governador" } as const;

export interface PersistentMapFrameProps {
  /** Grupo de rotas que hospeda esta moldura. */
  cargo: "pres" | "gov";
}

/** `params.sigla` vem como `string | string[] | undefined`. */
function siglaFromParams(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const sigla = value.toUpperCase();
  return /^[A-Z]{2}$/.test(sigla) ? sigla : null;
}

export function PersistentMapFrame({ cargo }: PersistentMapFrameProps) {
  const params = useParams<{ sigla?: string | string[] }>();
  const sigla = siglaFromParams(params?.sigla);

  const [payload, setPayload] = useState<EdgePayload | null>(null);
  const [ufResumo, setUfResumo] = useState<EdgePayloadUf | null>(null);

  // Payload nacional do cargo — não depende da rota, só do grupo. Busca uma
  // vez por montagem da moldura (ou seja, uma vez por sessão de navegação
  // dentro do cargo) e revalida a cada 60s. Sem o intervalo o mapa congelaria
  // pela sessão inteira: agora que ele não remonta, ninguém mais o atualiza.
  useEffect(() => {
    const url = cargo === "gov" ? "/api/projection?cargo=gov" : "/api/projection";
    let vivo = true;
    const buscar = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as EdgePayload;
        if (vivo) setPayload(json);
      } catch {
        // Silencioso de propósito: a moldura degrada para o esqueleto, e os
        // painéis da página (renderizados no servidor) seguem com o dado.
      }
    };
    void buscar();
    const id = setInterval(() => void buscar(), REFRESH_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [cargo]);

  // Resumo da UF corrente — é o que dá o "% apurado" da etiqueta quando a rota
  // é de UF. Refaz a cada troca de `sigla`, sem tocar no mapa.
  useEffect(() => {
    if (!sigla) {
      setUfResumo(null);
      return;
    }
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`/api/projection?uf=${sigla}`);
        if (!res.ok) return;
        const json = (await res.json()) as EdgePayloadUf;
        if (vivo) setUfResumo(json);
      } catch {
        // Idem: a etiqueta fica sem o percentual, o mapa não muda.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [sigla]);

  const escopo = sigla
    ? `${CARGO_LABEL[cargo]} · ${sigla}${
        ufResumo ? ` · ${ufResumo.pct_apurado.toFixed(1).replace(".", ",")}% apurado` : ""
      }`
    : `${CARGO_LABEL[cargo]} · Brasil`;
  const backHref = sigla ? (cargo === "gov" ? "/governador" : "/") : undefined;

  if (!payload) {
    return <MapSkeleton height="100%" />;
  }

  if (cargo === "gov") {
    return (
      <section
        aria-labelledby="persistent-map-heading"
        className="absolute inset-0 flex flex-col"
        style={{ gap: "var(--space-3)", padding: "var(--space-4)", overflow: "hidden" }}
      >
        <h2
          id="persistent-map-heading"
          style={{
            margin: 0,
            font: "var(--type-kicker)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--text-secondary)",
          }}
        >
          Mapa hexagonal — {escopo}
        </h2>
        {payload.por_uf.length > 0 ? (
          // Caixa de razão fixa: o SVG é `w-full h-auto` e, solto numa coluna
          // de 880px, mediria 861px de alto e vazaria a moldura. A razão vem do
          // `viewBox` do próprio cartograma (`gridBounds`, ~390 × 403).
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div style={{ height: "100%", maxWidth: "100%", aspectRatio: "390 / 403" }}>
              <HexCartogramBrasil rows={payload.por_uf} candidatos={payload.national.candidatos} />
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-muted)" }}>
            Aguardando primeiros boletins do TSE para preencher o cartograma.
          </p>
        )}
      </section>
    );
  }

  const rankByLider: Record<number, number> = Object.fromEntries(
    payload.national.candidatos.map((c, i) => [c.id, c.rank ?? i + 1]),
  );

  return (
    <NationalMapBlock
      rows={payload.por_uf}
      candidatoAId={payload.national.candidato_a_id}
      rankByLider={rankByLider}
      candidatos={payload.national.candidatos}
      variant="frame"
      scopeLabel={escopo}
      backHref={backHref}
    />
  );
}
