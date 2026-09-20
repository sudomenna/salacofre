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
 *   - Figuras: `pct_apurado` ("Apurado") e a margem exibida (`margemLabel`/
 *     `margemParaExibir`, `components/layout/UfPicker.tsx`) — em Presidente e
 *     Governador é `margem_projetada` ("Margem projetada", 1º−2º, a margem da
 *     disputa com 1 vaga); em Senador (2 vagas, RF-104) é `margemSegundaVaga`
 *     (2º−3º, a margem que decide a 2ª cadeira), `NaN`/"—" com menos de 3
 *     candidatos no top-3. O protótipo mostra "Eleitores" no lugar da segunda
 *     figura — esse campo NÃO existe em `EdgeUfRow` (nem por UF nem por
 *     município no payload nacional hoje, ver `docs/_meta/plano-redesign-
 *     2026-09-08.md` § "BiggestPanel"). Omitido, não inventado.
 *   - Líder: só existe como linha à parte em Presidente/Governador (1 vaga).
 *     `row.lider` é só o ID — a IDENTIDADE (nome/partido/sqcand) vem PRIMEIRO
 *     de `row.top_candidatos.find(tc => tc.id === row.lider)`, e só cai para
 *     `candidatos[]` (nacional) como fallback. Mesma regra para cada linha do
 *     ranking. Ver "🔴 identidade" logo abaixo do componente para o porquê —
 *     é o mesmo defeito de RF-144/RF-145 que `buildHoverRows`
 *     (`_NationalChoroplethMapImpl.tsx`) já tinha corrigido; esta ficha
 *     lateral é o SEGUNDO consumidor da mesma linha de dado.
 *     **Em Senador (RF-105) não existe "o líder" com tratamento próprio**: as
 *     `vagas` primeiras linhas do ranking ganham o MESMO marcador
 *     (`<VagaBadge>`, reaproveitado de `ResultPanel.tsx`), sem que nenhuma
 *     vire um parágrafo isolado — o resultado não tem hierarquia entre 1º e
 *     2º, e a UI parou de inventar uma.
 *   - Candidatos: `row.top_candidatos` (id + `pct`), INTEIRO, sem `.slice()` —
 *     por isso a ficha passou de 3 para 4 linhas em 2026-09-19 sem nenhuma
 *     mudança de código: o dono decidiu naquele dia que as três telas de
 *     resumo de UF mostram quatro candidaturas, e o produtor passou a emitir
 *     quatro (`TOP_CANDIDATOS_POR_UF = 4`, `api/model/project.py`). A ausência
 *     de corte aqui é deliberada e continua: o contrato do campo não promete
 *     comprimento (`lib/edge-config/types.ts`), e um payload gravado antes
 *     dessa data traz 3 — a ficha renderiza o que houver.
 *     ⚠️ Esta ficha **não** tem a linha "Outros" do balão dos mapas: ela lista
 *     candidaturas, e `EdgeUfRow.outros` é um agregado sem `id` de urna e sem
 *     `sqcand` (ver a docstring do campo). Quem quiser a cauda aqui adiciona
 *     um bloco próprio, não um elemento do ranking.
 *     Esse `pct` é
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
import { VagaBadge } from "@/components/blocks/ResultPanel";
import {
  margemLabel,
  margemParaExibir,
  type UfPickerCargo,
  ufHref,
  vagasPorCargo,
} from "@/components/layout/UfPicker";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { colorForRank } from "@/lib/utils/cand-color";
import { formatPercent, formatPp } from "@/lib/utils/format";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import { normalizePartySlug, PARTY_FALLBACK_SLUG, textForParty } from "@/lib/utils/party-color";
import { siglaExibicao } from "@/lib/utils/sigla-partido";

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
  /**
   * Qual corrida esta folha resume (2026-09-18, estendido 2026-09-18 pra
   * Senador) — decide o destino do CTA "Ver detalhes do estado" via
   * {@link ufHref}: `"pres"` → `/uf/<SIGLA>`, `"gov"` → `/uf/<SIGLA>/governador`,
   * `"sen"` → `/uf/<SIGLA>/senador`. Sem default de propósito: esta prop
   * nasce no dia em que um segundo cargo passa a abrir esta folha
   * (`NationalChoroplethMap.tsx` na trilha Governador), e um default
   * herdaria o valor do PRIMEIRO caller para sempre — a mesma classe de bug
   * que este repositório já pagou três vezes com conversores de cargo
   * silenciosos.
   */
  cargo: UfPickerCargo;
}

/** `partido` tem token próprio (ADR-0024)? Mesma lógica de `partidoIsMapped`
 * em `_NationalChoroplethMapImpl.tsx` — duplicada aqui porque é local/não
 * exportada lá. */
function partidoIsMapped(partido: string | null | undefined): partido is string {
  if (!partido) return false;
  return normalizePartySlug(partido) !== PARTY_FALLBACK_SLUG;
}

/**
 * Cor do ponto de 8×8 que identifica a candidatura (linhas do líder e do
 * ranking).
 *
 * RNF-035 / WCAG SC 1.4.11 — **`textForParty`, não `colorForParty`**. O ponto é
 * marcador de IDENTIDADE: não tem extensão a perder, então o remédio é a
 * variante legível, não o contorno de `DATA_FILL_STROKE` (que é para
 * preenchimento com extensão — barra, segmento, região).
 *
 * Medido em 18/09, tema claro: PSOL 2,08 · PSB 2,19 · outros 2,39 · NOVO 2,72
 * contra o piso de 3:1. No escuro as quatro passam de 9:1 — **o problema é só
 * do claro**, e medir um tema só engana.
 *
 * Recebe `partido`/`rank` já resolvidos (não mais um `EdgeCandidate` inteiro)
 * porque, desde 2026-09-18 (2ª rodada), a identidade de nome/partido pode vir
 * de `EdgeUfRow.top_candidatos` — que não tem `rank` (esse campo só existe em
 * `national.candidatos`, o array nacional). `rank` continua vindo de lá
 * quando disponível; sem ele, `colorForRank` cai no fallback "other" já
 * documentado (`cand-color.ts`).
 */
function dotColor(partido: string | null | undefined, rank: number | undefined): string {
  return partidoIsMapped(partido) ? textForParty(partido) : colorForRank(rank ?? 99);
}

/**
 * 🔴 **Identidade PRIMEIRO da própria linha da UF, nunca do array nacional
 * como fonte primária** — mesma regra de `buildHoverRows`
 * (`_NationalChoroplethMapImpl.tsx`), e pela MESMA razão (RF-144/RF-145,
 * ADR-0042 item 3): `EdgeUfRow.top_candidatos[]` sabe de que UF é e carrega
 * `nome`/`partido`/`sqcand` resolvidos por ela em TODO cargo; `national.
 * candidatos` (origem de `candidatosById`) só tem uma corrida de verdade em
 * cargo 1 — em cargo 3 (Governador) e 5 (Senador) é a UNIÃO de 27 corridas
 * sob o mesmo espaço de `id`, e `api/model/project.py` grava um PLACEHOLDER
 * (`"Candidato {id}"`) em `national.candidatos[].nome` fora do cargo 1.
 *
 * `cand` (de `candidatosById`) entra só como FALLBACK — payloads pré-ADR-0042
 * (`top_candidatos` sem `nome`/`partido`) e para o `rank`, que só existe no
 * array nacional (ver `dotColor` acima).
 */
function resolveIdentidade(
  tc: { id: number; nome?: string; partido?: string; sqcand?: string } | undefined,
  cand: EdgeCandidate | undefined,
): {
  nomeBruto: string | undefined;
  partido: string | undefined;
  sqcand: string | undefined;
  rank: number | undefined;
} {
  return {
    nomeBruto: tc?.nome ?? cand?.nome,
    partido: tc?.partido ?? cand?.partido,
    sqcand: tc?.sqcand ?? cand?.sqcand,
    rank: cand?.rank,
  };
}

export function StateResultSheet({
  open,
  onClose,
  row,
  candidatos,
  side = false,
  cargo,
}: StateResultSheetProps) {
  const candidatosById = new Map(candidatos.map((c) => [c.id, c]));
  const nomeUf = row ? (UF_NAMES[row.sigla] ?? row.sigla) : "Estado";
  // RF-105 — Senado é a única corrida desta ficha com mais de uma vaga por
  // UF. `vagasPorCargo` lê a tabela canônica (`lib/config/cargos.ts`); não é
  // um literal "2" solto aqui.
  const multiVaga = cargo === "sen";
  const vagas = multiVaga ? vagasPorCargo(cargo) : 1;
  // 🔴 Identidade do líder — mesma regra de `resolveIdentidade` (RF-144/145):
  // a linha da própria UF (`top_candidatos`) primeiro, `candidatosById`
  // (nacional) só como fallback. `row.lider` é só o ID; o TOP_CANDIDATOS que
  // carrega esse ID pode não existir no top-3 (corrida com 4+ candidatos e
  // líder fora do recorte) — `candidatosById` cobre esse caso raro também.
  //
  // Usada só fora de `multiVaga`: em Senado não existe "o líder" com
  // tratamento próprio (RF-105) — ver o `<ul>` abaixo, onde as `vagas`
  // primeiras linhas ganham o MESMO marcador (`<VagaBadge>`), sem nenhuma
  // delas virar um parágrafo à parte.
  const liderTop = row?.top_candidatos.find((tc) => tc.id === row.lider);
  const liderCand = row ? candidatosById.get(row.lider) : undefined;
  const liderIdentidade = resolveIdentidade(liderTop, liderCand);

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
          {/* RF-106 — "2 vagas por estado" precisa estar em TODA tela de
              Senador, sem exceção de fase (spec 016:149-152). A ficha cobre o
              resto da página quando aberta (mobile: bottom sheet; desktop:
              cartão sobre o mapa) — sem esta linha, abrir a ficha esconderia
              justamente o aviso que justifica pintar o mapa pelo 1º
              colocado. */}
          {multiVaga ? (
            <p
              data-testid="state-sheet-vagas-label"
              style={{
                margin: "0 0 var(--space-3)",
                font: "var(--type-body-sm)",
                fontSize: "var(--text-xs)",
                color: "var(--text-muted)",
              }}
            >
              2 vagas por estado
            </p>
          ) : null}

          {/* biome-ignore lint/a11y/useSemanticElements: role=group em div é o correto para "grupo de métricas" (mesmo padrão de ApuracaoMeta.tsx); fieldset exigiria legend. */}
          <div
            role="group"
            aria-label={`Resumo da apuração em ${nomeUf}`}
            className="grid grid-cols-2"
            style={{ gap: "var(--space-4)", marginBottom: "var(--space-4)" }}
          >
            <Figure label="Apurado" value={formatPercent(row.pct_apurado, 1)} size="md" />
            {/* RF-104 — rótulo E número por cargo (`margemLabel`/
                `margemParaExibir`). Em Senador o número exibido é a margem de
                2º→3º (`margemSegundaVaga`, `UfPicker.tsx`), não
                `row.margem_projetada` (1º→2º) — que decide a disputa em
                Presidente/Governador (1 vaga), mas não decide nada em Senado
                (2 vagas). Menos de 3 candidatos no top-3 → `NaN` →
                `formatPp` devolve "—" (nunca "0,0 pp": ausência, não zero). */}
            <Figure
              label={margemLabel(cargo)}
              value={formatPp(margemParaExibir(cargo, row))}
              size="md"
            />
          </div>

          {!multiVaga && liderIdentidade.nomeBruto ? (
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
                  background: dotColor(liderIdentidade.partido, liderIdentidade.rank),
                }}
              />
              Líder: {nomeExibicao(liderIdentidade.nomeBruto, liderIdentidade.sqcand)}
              {/* Texto desenhado ⇒ sigla abreviada (2026-09-19). A ficha é uma
                  coluna estreita ao lado do mapa. */}
              {liderIdentidade.partido ? ` (${siglaExibicao(liderIdentidade.partido)})` : ""}
            </p>
          ) : null}

          <ul
            data-testid="state-sheet-candidatos"
            aria-label={`Candidatos projetados em ${nomeUf}`}
            style={{ listStyle: "none", margin: 0, padding: 0 }}
          >
            {row.top_candidatos.map((tc, index) => {
              const cand = candidatosById.get(tc.id);
              // 🔴 Identidade PRIMEIRO de `tc` (a própria linha da UF), nunca
              // de `cand` (nacional) como fonte primária — ver
              // `resolveIdentidade` acima. Até 2026-09-18 (2ª rodada) esta
              // linha lia `cand.nome`/`cand.sqcand` direto, o mesmo defeito
              // que `buildHoverRows` já tinha corrigido: em cargo 3/5,
              // `cand.nome` é o PLACEHOLDER `"Candidato {id}"` (RF-145), e
              // `tc.nome`/`tc.partido` (quando presentes, RF-144) são o nome
              // real daquela UF.
              const identidade = resolveIdentidade(tc, cand);
              const nome = identidade.nomeBruto
                ? nomeExibicao(identidade.nomeBruto, identidade.sqcand)
                : `#${tc.id}`;
              const partido = identidade.partido ?? "";
              // RF-105 — as `vagas` primeiras linhas (2, só em Senado) ganham
              // o MESMO marcador (`<VagaBadge>`, reaproveitado de
              // `ResultPanel.tsx`). Não é "o 1º e o 2º": é "os dois
              // ocupantes", sem que nenhum dos dois vire um parágrafo à
              // parte (era isso que a antiga linha "Líder:" fazia).
              //
              // 🔴 O marcador é contado do TOPO, nunca do fim do array — por
              // isso a ficha passar de 3 para 4 linhas em 2026-09-19 não mexeu
              // nele: continuam marcadas a 1ª e a 2ª, e agora ficam DUAS de
              // fora em vez de uma. Uma regra escrita como "todas menos a
              // última" teria virado "as três primeiras" em silêncio no dia em
              // que o produtor passou a emitir quatro candidaturas.
              const ocupaVaga = multiVaga && index < vagas;
              return (
                <li
                  key={tc.id}
                  style={{
                    padding: "var(--space-2) 0",
                    borderBottom: "1px solid var(--border-hairline)",
                  }}
                >
                  {ocupaVaga ? (
                    <div style={{ marginBottom: "var(--space-1)" }}>
                      <VagaBadge />
                    </div>
                  ) : null}
                  <div
                    className="flex items-center justify-between"
                    style={{ gap: "var(--space-3)" }}
                  >
                    <span className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 8,
                          height: 8,
                          flex: "none",
                          borderRadius: "var(--radius-xs)",
                          background: dotColor(identidade.partido, identidade.rank),
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
                          {/* Desenhado ⇒ abreviado (2026-09-19). */}
                          {siglaExibicao(partido)}
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
                  </div>
                </li>
              );
            })}
          </ul>

          <Link
            href={ufHref(cargo, row.sigla)}
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
