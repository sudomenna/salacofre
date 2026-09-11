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
 * ## 2026-09-09 (map-builder) — a moldura agora desce para o município
 *
 * O ADR autorizava uma primeira versão parcial em que a moldura mostrava
 * SEMPRE o nível Brasil — o trabalho de fazer o nível seguir a rota ficou
 * explicitamente marcado como tarefa do `map-builder`. É isto que este
 * arquivo passa a fazer: quando `sigla` está presente, a moldura troca o
 * mapa nacional (PMTiles de UF) pelo coroplético municipal
 * (`ChoroplethMapUF`/`UfLeaderMapLazy`, PMTiles de município) da própria UF,
 * com o dado vindo de `GET /api/projection/municipios?uf=<sigla>&cargo=<c>`
 * — o espelho client-side de `readUfDetail` (`lib/blob/uf-detail.ts`,
 * ADR-0032), que só pode rodar no servidor.
 *
 * `NationalMapBlock`/`_NationalChoroplethMapImpl` (nacional) e
 * `ChoroplethMapUF` (municipal) continuam sendo DUAS implementações MapLibre
 * distintas — fontes PMTiles diferentes (`ufs.pmtiles` vs
 * `municipios.pmtiles`), propriedades de feature diferentes (`SIGLA_UF` vs
 * `CD_MUN`), lógicas de enquadramento diferentes. Trocar de nível troca de
 * COMPONENTE React (tipos diferentes), então o React desmonta a árvore
 * anterior por inteiro — a instância `maplibregl.Map` de um nível é destruída
 * e uma nova é criada para o outro. Isto é exatamente a "primeira versão
 * aceitável" que o ADR nomeia ("mesmo que o `MapLibre.Map` interno ainda
 * reinicialize ao trocar de fonte") — o ganho desta mudança é o WRAPPER React
 * (este componente, o cabeçalho da moldura, os controles) não perder o
 * ciclo de vida na navegação Brasil↔UF; a instância WebGL em si ainda
 * reinicializa. Unificar as duas implementações numa única instância que faz
 * `flyTo` continua não especificado — fica para uma iteração futura.
 *
 * Governador (`cargo="gov"`) ganha o MESMO drill-down: no nível Brasil segue
 * mostrando o cartograma hexagonal (`HexCartogramBrasil`, sem equivalente de
 * "nível UF" — é um mapa nacional por natureza); no nível UF, mostra o MESMO
 * coroplético municipal que a rota presidencial usa, porque é o mesmo tipo de
 * dado (`EdgeUfMunicipio[]`) e o mesmo componente já existia para as duas
 * corridas antes desta mudança (`app/(gov)/uf/[sigla]/governador/page.tsx`).
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { municipiosTotalFor } from "@/components/atoms/maps/_shared";
import { MapSkeleton } from "@/components/atoms/maps/MapSkeleton";
import {
  DetailUnavailable,
  type DetailUnavailableReason,
} from "@/components/atoms/surfaces/DetailUnavailable";
import { HexCartogramBrasil } from "@/components/blocks/HexCartogramBrasil";
import { CHIP_STYLE, NationalMapBlock } from "@/components/blocks/NationalMapBlock";
import { UfLeaderMapLazy } from "@/components/blocks/UfMapsLazy";
import { UfPicker } from "@/components/layout/UfPicker";
import type { EdgePayload, EdgePayloadUf, EdgeUfMunicipio } from "@/lib/edge-config/types";

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

/** Resposta de `GET /api/projection/municipios`. */
type MunicipioDetalheState =
  | { status: "ok"; municipios: EdgeUfMunicipio[] }
  | { status: "unavailable"; reason: DetailUnavailableReason }
  | null; // null = ainda carregando

export function PersistentMapFrame({ cargo }: PersistentMapFrameProps) {
  const params = useParams<{ sigla?: string | string[] }>();
  const sigla = siglaFromParams(params?.sigla);

  const [payload, setPayload] = useState<EdgePayload | null>(null);
  const [ufResumo, setUfResumo] = useState<EdgePayloadUf | null>(null);
  const [municipioDetalhe, setMunicipioDetalhe] = useState<MunicipioDetalheState>(null);

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

  // Detalhe municipal da UF corrente (ADR-0032, via o espelho client-side em
  // `/api/projection/municipios`) — é o que pinta o coroplético por
  // município. Refaz a cada troca de `sigla` ou de `cargo` (Presidente e
  // Governador têm candidatos e cobertura diferentes na mesma UF).
  useEffect(() => {
    if (!sigla) {
      setMunicipioDetalhe(null);
      return;
    }
    let vivo = true;
    setMunicipioDetalhe(null);
    (async () => {
      try {
        const res = await fetch(`/api/projection/municipios?uf=${sigla}&cargo=${cargo}`);
        if (!res.ok) return;
        const json = (await res.json()) as
          | { status: "ok"; municipios: EdgeUfMunicipio[] }
          | { status: "unavailable"; reason: DetailUnavailableReason };
        if (vivo) setMunicipioDetalhe(json);
      } catch {
        if (vivo) setMunicipioDetalhe({ status: "unavailable", reason: "fetch_error" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [sigla, cargo]);

  const escopo = sigla
    ? `${CARGO_LABEL[cargo]} · ${sigla}${
        ufResumo ? ` · ${ufResumo.pct_apurado.toFixed(1).replace(".", ",")}% apurado` : ""
      }`
    : `${CARGO_LABEL[cargo]} · Brasil`;
  // Sempre string (o "Brasil" do cargo corrente) — usado tal qual pelos dois
  // chromes de nível UF abaixo. `NationalMapBlock` (nível Brasil) só desenha
  // o link "← Brasil" quando recebe `backHref`, então ali é passado
  // condicionalmente (`sigla ? homeHref : undefined`) — o próprio nível
  // Brasil não deve exibir um link "voltar para si mesmo".
  const homeHref = cargo === "gov" ? "/governador" : "/";

  if (!payload) {
    return <MapSkeleton height="100%" />;
  }

  // Candidatos da UF (cor por candidato) — vem do resumo (ADR-0012), não do
  // detalhe municipal. Enquanto `ufResumo` ainda não chegou, o coroplético
  // pinta tudo em `--color-tossup` (mesmo fallback que as páginas de UF já
  // usavam antes desta mudança).
  const candidateColor: Record<number, string> = {};
  for (const c of ufResumo?.candidatos ?? []) candidateColor[c.id] = c.cor;

  const municipiosDaUf =
    municipioDetalhe?.status === "ok" ? municipioDetalhe.municipios : ([] as EdgeUfMunicipio[]);
  const choropleth = municipiosDaUf.map((m) => ({
    cod_ibge: m.cod_ibge,
    cor: candidateColor[m.lider.candidato_id] ?? "var(--color-tossup)",
    pctApurado: m.pct_apurado,
  }));

  if (cargo === "gov") {
    return (
      <section
        aria-labelledby="persistent-map-heading"
        className="absolute inset-0 flex flex-col"
        style={{ gap: "var(--space-3)", padding: "var(--space-4)", overflow: "hidden" }}
      >
        {/* Cabeçalho da moldura: título à esquerda, seletor de UF à direita.
            No cargo `gov` o cabeçalho é um elemento de fluxo (não overlay), e
            é ele que ocupa o topo do mapa — então é aqui que o botão do canto
            superior direito do protótipo (`App.jsx:316`) mora. */}
        <div
          className="flex flex-wrap items-start justify-between"
          style={{ gap: "var(--space-2)" }}
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
            {sigla ? `${sigla} · quem lidera cada município` : `Mapa hexagonal — ${escopo}`}
          </h2>
          <UfPicker cargo="gov" atual={sigla} />
        </div>
        {sigla ? (
          // Nível UF — mesmo coroplético municipal da rota presidencial. O
          // "quem lidera cada município" que antes vivia num Panel da própria
          // página de UF (`app/(gov)/uf/[sigla]/governador/page.tsx`) mudou
          // de endereço, não de conteúdo — ADR-0033 § 1.
          <div className="relative min-h-0 flex-1">
            <UfLeaderMapLazy ufSigla={sigla} choropleth={choropleth} height="100%" />
            {municipioDetalhe?.status === "unavailable" && (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: "var(--surface-card)",
                  borderTop: "1px solid var(--border-hairline)",
                }}
              >
                <DetailUnavailable
                  label="A cor por município deste mapa"
                  reason={municipioDetalhe.reason}
                  style={{ borderTop: "none", padding: "var(--space-2) var(--space-3)" }}
                />
              </div>
            )}
            <Link
              href={homeHref}
              className="pointer-events-auto absolute"
              style={{ ...CHIP_STYLE, top: "var(--space-2)", left: "var(--space-2)" }}
            >
              ← Brasil
            </Link>
          </div>
        ) : payload.por_uf.length > 0 ? (
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

  if (sigla) {
    // Nível UF, Presidente — coroplético municipal preenche a moldura
    // inteira, com o mesmo chrome de overlay do nível Brasil.
    return (
      <section
        aria-label={`Mapa coroplético de ${sigla} por município`}
        className="absolute inset-0"
      >
        <UfLeaderMapLazy ufSigla={sigla} choropleth={choropleth} height="100%" />
        {/* Chip "← Brasil" + "<SIGLA> · <N> mun." sobreposto ao coroplético
            municipal — mesma composição visual do chip do nível Brasil
            (`NationalMapBlock`, `variant="frame"`), texto conforme o
            protótipo (`App.jsx:314`). */}
        <div
          className="pointer-events-none absolute flex flex-wrap items-start justify-between"
          style={{
            top: "var(--space-3)",
            left: "var(--space-3)",
            right: "var(--space-3)",
            gap: "var(--space-2)",
          }}
        >
          <div
            className="pointer-events-auto flex min-w-0 items-center"
            style={{ gap: "var(--space-2)" }}
          >
            <Link href={homeHref} style={CHIP_STYLE}>
              ← Brasil
            </Link>
            <span style={{ ...CHIP_STYLE, margin: 0 }}>
              {sigla}
              {municipiosTotalFor(sigla) > 0 ? ` · ${municipiosTotalFor(sigla)} mun.` : ""}
            </span>
          </div>
          {/* Canto superior direito — o seletor de UF do protótipo
              (`App.jsx:316`). Dentro da MESMA faixa `flex-wrap` do chip da
              esquerda, não numa caixa ancorada em `right`: a 375px as duas
              caixas se sobreporiam, e é esse o defeito que a faixa única já
              resolvia para o toggle do nível Brasil. */}
          <div className="pointer-events-auto flex-none">
            <UfPicker cargo="pres" atual={sigla} />
          </div>
        </div>
        {municipioDetalhe?.status === "unavailable" && (
          <div
            style={{
              position: "absolute",
              left: "var(--space-3)",
              right: "var(--space-3)",
              bottom: "var(--space-3)",
              background: "var(--surface-card)",
              border: "1px solid var(--border-hairline)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            <DetailUnavailable
              label="A cor por município deste mapa"
              reason={municipioDetalhe.reason}
              style={{ borderTop: "none", padding: "var(--space-2) var(--space-3)" }}
            />
          </div>
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
      backHref={sigla ? homeHref : undefined}
      // Nível Brasil: o seletor entra na faixa do canto direito, ao lado do
      // `<MapViewToggle>` (ver `action` em `NationalMapBlock`). O mapa
      // continua clicável para descer numa UF — o seletor é o caminho de
      // teclado e de quem sabe o nome do estado mas não onde ele fica.
      action={<UfPicker cargo="pres" atual={sigla} />}
    />
  );
}
