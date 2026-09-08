/**
 * components/blocks/StateResultSheet.tsx
 *
 * Folha de resumo de uma UF, aberta ao tocar/clicar num estado no mapa
 * nacional (`NationalChoroplethMap.tsx`). Decisão do usuário, 2026-09-08:
 * o clique não navega mais direto para `/uf/[sigla]` — abre esta folha
 * (`<Sheet>`), que leva um botão em destaque "Ver detalhes do estado" pra
 * quem quiser a página completa.
 *
 * Composição de referência: `MunSheet` do kit Atlas Menna
 * (`docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:196-208`) —
 * duas `<Figure>` no topo, linhas de candidato abaixo. Adaptado ao que o
 * payload REALMENTE tem (ver "O que fica de fora" abaixo).
 *
 * Contrato de dados — só `EdgeUfRow` + `EdgeCandidate[]` (nenhum campo
 * novo, nenhum número sintético):
 *   - Figuras: `pct_apurado` ("Apurado") e `margem_projetada` ("Margem
 *     projetada"). O protótipo mostra "Eleitores" no lugar da segunda
 *     figura — esse campo NÃO existe em `EdgeUfRow` (nem por UF nem por
 *     município no payload nacional hoje, ver `docs/_meta/plano-redesign-
 *     2026-09-08.md` § "BiggestPanel"). Omitido, não inventado.
 *   - Líder: resolvido de `row.lider` (id) via `candidatos[]` — mostrado
 *     como linha de destaque acima do ranking.
 *   - Candidatos: `row.top_candidatos` (id + `pct`). Esse `pct` é
 *     `pct_projetado`, NÃO parcial por candidato — o payload só tem parcial
 *     agregada por UF (`pct_apurado`), nunca por candidato (mesma
 *     observação já documentada em `buildHoverRows`,
 *     `_NationalChoroplethMapImpl.tsx`). Por isso as linhas mostram um único
 *     número "Projeção", não o par parcial+projeção do `CandidateResultRow`
 *     (que exigiria um `pctAtual` por candidato que não existe aqui — usá-lo
 *     forçaria `0,0%` onde o dado está ausente).
 *
 * A11y: o diálogo é o `<Sheet>` (aria-modal, Esc, foco preso/devolvido —
 * ver `components/atoms/overlays/Sheet.tsx`). O botão "Ver detalhes" é um
 * `<Link>` real (`<a href>`), não um `onClick` — funciona por teclado, com
 * Cmd/Ctrl+click abre em nova aba, e navega mesmo sem JS (SSR de verdade,
 * não uma âncora fake).
 *
 * Server Component puro (sem hooks) — o custo de cliente já está pago pelo
 * `<Sheet>` que este arquivo importa; nenhum JS adicional aqui.
 */

import Link from "next/link";

import { Figure } from "@/components/atoms/data/Figure";
import { Sheet } from "@/components/atoms/overlays/Sheet";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { formatPercent, formatPp } from "@/lib/utils/format";
import { colorForParty, normalizePartySlug, PARTY_FALLBACK_SLUG } from "@/lib/utils/party-color";

/** Mesma tabela de `GovernorCard.tsx` — sem módulo compartilhado em `lib/utils/**`
 * pra este propósito, então repetida aqui (padrão já existente no repo). */
const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export interface StateResultSheetProps {
  open: boolean;
  onClose: () => void;
  /** UF selecionada. `null` enquanto nada foi tocado no mapa. */
  row: EdgeUfRow | null;
  /** Lista nacional de candidatos — resolve nome/partido/cor por id. */
  candidatos: EdgeCandidate[];
  /** Desktop: cartão lateral não-modal (`Sheet.side`). Mobile: bottom sheet. */
  side?: boolean;
}

/** `partido` tem token próprio (ADR-0024)? Mesma lógica de `partidoIsMapped`
 * em `_NationalChoroplethMapImpl.tsx` — duplicada aqui porque é local/não
 * exportada lá. */
function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

function dotColorFor(cand: EdgeCandidate | undefined): string {
  if (!cand) return "var(--color-cand-other)";
  return partidoIsMapped(cand.partido)
    ? colorForParty(cand.partido)
    : colorForRank(cand.rank ?? 99);
}

export function StateResultSheet({
  open,
  onClose,
  row,
  candidatos,
  side = false,
}: StateResultSheetProps) {
  const candidatosById = new Map(candidatos.map((c) => [c.id, c]));
  const nomeUf = row ? (UF_NAMES[row.sigla] ?? row.sigla) : "Estado";
  const lider = row ? candidatosById.get(row.lider) : undefined;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side={side}
      kicker={row ? `Estado · ${row.sigla}` : undefined}
      title={nomeUf}
    >
      {row ? (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: role=group em div é o correto para "grupo de métricas" (mesmo padrão de ApuracaoMeta.tsx); fieldset exigiria legend. */}
          <div
            role="group"
            aria-label={`Resumo da apuração em ${nomeUf}`}
            className="grid grid-cols-2"
            style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
          >
            <Figure label="Apurado" value={formatPercent(row.pct_apurado, 1)} size="md" />
            <Figure label="Margem projetada" value={formatPp(row.margem_projetada)} size="md" />
          </div>

          {lider ? (
            <p
              data-testid="state-sheet-lider"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                font: "var(--type-body-sm)",
                color: "var(--text-secondary)",
                margin: "0 0 var(--space-3)",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  flex: "none",
                  borderRadius: "var(--radius-xs)",
                  background: dotColorFor(lider),
                }}
              />
              Líder: {lider.nome} ({lider.partido})
            </p>
          ) : null}

          <ul
            data-testid="state-sheet-candidatos"
            aria-label={`Candidatos projetados em ${nomeUf}`}
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {row.top_candidatos.map((tc, index) => {
              const cand = candidatosById.get(tc.id);
              const nome = cand?.nome ?? `#${tc.id}`;
              const partido = cand?.partido ?? "";
              return (
                <li
                  key={tc.id}
                  className="flex items-center justify-between"
                  style={{
                    gap: "var(--space-3)",
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--border-hairline)",
                  }}
                >
                  <span className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 8,
                        height: 8,
                        flex: "none",
                        borderRadius: "var(--radius-xs)",
                        background: dotColorFor(cand),
                      }}
                    />
                    <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
                      {index + 1}.
                    </span>
                    <span className="truncate" style={{ font: "var(--type-body)" }}>
                      {nome}
                    </span>
                    {partido ? (
                      <span
                        className="flex-none"
                        style={{
                          font: "var(--type-kicker)",
                          letterSpacing: "var(--tracking-caps)",
                          textTransform: "uppercase",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {partido}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className="flex-none text-right"
                    style={{ font: "var(--type-figure-sm)", color: "var(--accent-text)" }}
                  >
                    {formatPercent(tc.pct, 1)}
                    <span className="sr-only"> projeção</span>
                  </span>
                </li>
              );
            })}
          </ul>

          <Link
            href={`/uf/${row.sigla}`}
            data-testid="state-sheet-cta"
            className="mt-4 inline-flex items-center justify-center rounded-sm hover:brightness-125"
            style={{
              height: "var(--tap-min)",
              padding: "0 var(--space-4)",
              width: "100%",
              background: "var(--surface-inverse)",
              color: "var(--text-inverse)",
              border: "1px solid var(--surface-inverse)",
              font: "var(--type-label)",
              fontSize: "var(--text-sm)",
              letterSpacing: "0.02em",
              textDecoration: "none",
              transition: "filter var(--dur-fast) var(--ease-out)",
            }}
          >
            Ver detalhes do estado
          </Link>
        </>
      ) : null}
    </Sheet>
  );
}
