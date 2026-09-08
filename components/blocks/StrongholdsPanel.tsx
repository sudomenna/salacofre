/**
 * components/blocks/StrongholdsPanel.tsx
 *
 * "Redutos" — onde cada força é mais forte, por percentual projetado e pela
 * margem projetada local. Design system Atlas Menna (ADR-0025, Bloco 1),
 * portado do `StrongholdsPanel` de
 * `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:58`.
 *
 * Cobertura: RF-024 (leitura estadual da corrida nacional) e RF-030.6
 * (distribuição por UF em corrida multi-candidato), na chave "por candidato"
 * em vez de "por UF" — é a mesma matriz lida na outra direção.
 *
 * ===== De onde vem cada número =====
 * Tudo sai de `EdgeUfRow.top_candidatos[]`, cujo `pct` é literalmente o
 * `pct_projetado` daquele candidato naquela UF (ver o campo em
 * `lib/edge-config/types.ts`). Portanto:
 *   - "% projetado" = `top_candidatos[i].pct`
 *   - "posição"     = índice em `top_candidatos` + 1 (o array vem ordenado
 *                     por `pct` desc, com tie-breaker estável por id)
 *   - "diferença"   = margem projetada local: para quem está em 1º, a
 *                     distância até o 2º (positiva); para quem está abaixo,
 *                     a distância até o 1º (negativa)
 *
 * Nada é inventado. Em particular **não** usamos `EdgeUfRow.margem_projetada`
 * aqui: aquele campo é a margem do líder da UF, então só coincidiria com a
 * "diferença" na linha de quem lidera — misturar as duas fontes produziria
 * dois números levemente diferentes para a mesma coisa na mesma tabela.
 *
 * ===== Limite conhecido do payload =====
 * `top_candidatos` guarda **no máximo 3 candidatos por UF**. Um candidato que
 * esteja em 4º naquela UF simplesmente não aparece na linha, e não há campo no
 * payload de onde derivar o percentual dele ali. Consequência: a lista de um
 * candidato de rank 3 pode ser mais curta que a dos dois primeiros. Preferimos
 * a lista curta a um número sintético — a nota de rodapé declara isso ao
 * leitor, e a coluna "UFs consideradas" mostra o denominador real.
 *
 * ===== Cor =====
 * Identidade pelo partido (ADR-0024), intensidade pela margem local
 * (constituição § 2). Sem `partido` mapeado, cai no rank (ADR-0013). Toda
 * barra leva contorno — ver `DATA_FILL_STROKE` em `./_candidateColor`.
 *
 * Server Component puro — sem estado, sem hooks, zero JS novo (RNF-007a). O
 * protótipo do kit trocava de candidato por botão (`useState`); aqui as três
 * colunas são renderizadas de uma vez, o que remove o JS e ainda mostra as
 * três forças lado a lado em vez de uma por vez.
 *
 * A11y (RNF-023): cada coluna é uma `<table>` de verdade, com `<caption>`
 * visível como título da coluna — leitor de tela navega célula a célula e a
 * cor da barra nunca é o único portador de significado.
 */

import { PartyTag } from "@/components/atoms/data/PartyTag";
import { Panel } from "@/components/atoms/surfaces/Panel";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { formatPercent, formatPp } from "@/lib/utils/format";
import { candidateColor, candidateColorByMargin, DATA_FILL_STROKE } from "./_candidateColor";

export interface StrongholdsPanelProps {
  /** `EdgeNational.candidatos`, já ordenado por rank. */
  candidatos: EdgeCandidate[];
  rows: EdgeUfRow[];
  /** Quantas forças exibir (colunas). Default 3 — o que cabe sem rolagem. */
  topCandidatos?: number;
  /** Quantas UFs listar por força. Default 5. */
  topUfs?: number;
  className?: string;
}

/** Uma UF na lista de um candidato. */
export interface StrongholdRow {
  sigla: string;
  /** Posição do candidato entre os `top_candidatos` daquela UF (1..3). */
  posicao: number;
  /** `pct_projetado` do candidato na UF (0–100). */
  pct: number;
  /** Margem projetada local em pp: `+` quando lidera, `−` quando não. */
  diff: number;
  /** Sigla de quem está do outro lado da diferença. */
  contraNome: string;
}

/**
 * UFs em que `candidatoId` aparece nos `top_candidatos`, ordenadas por
 * percentual projetado desc (tie-breaker por sigla, para ser determinístico —
 * constituição § 6). Exportada para o teste medir a regra sem o DOM.
 */
export function strongholdsFor(
  candidatoId: number,
  rows: EdgeUfRow[],
  candidatosById: Map<number, EdgeCandidate>,
): StrongholdRow[] {
  const out: StrongholdRow[] = [];

  for (const row of rows) {
    const top = row.top_candidatos ?? [];
    const i = top.findIndex((t) => t.id === candidatoId);
    if (i < 0) continue;
    const me = top[i];
    if (!me) continue;

    // Em 1º, a diferença é para o 2º; abaixo, para o 1º. Sem adversário na
    // linha (UF com um único candidato no top), não há diferença a exibir.
    const contra = i === 0 ? top[1] : top[0];
    if (!contra) continue;

    out.push({
      sigla: row.sigla,
      posicao: i + 1,
      pct: me.pct,
      diff: me.pct - contra.pct,
      contraNome: candidatosById.get(contra.id)?.nome ?? `#${contra.id}`,
    });
  }

  return out.sort((a, b) => b.pct - a.pct || a.sigla.localeCompare(b.sigla, "pt-BR"));
}

const CELL: React.CSSProperties = {
  padding: "var(--space-2) 0",
  borderTop: "1px solid var(--border-hairline)",
};

const HEAD_CELL: React.CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  paddingBottom: "var(--space-2)",
  fontWeight: 600,
};

interface CandidateColumnProps {
  cand: EdgeCandidate;
  rank: number;
  lista: StrongholdRow[];
  totalUfsComDado: number;
}

function CandidateColumn({ cand, rank, lista, totalUfsComDado }: CandidateColumnProps) {
  const cor = candidateColor(cand.partido, rank);
  const captionId = `redutos-${cand.id}-caption`;

  return (
    <table
      data-testid="stronghold-column"
      data-candidato={cand.id}
      className="w-full border-collapse text-left"
      aria-describedby={captionId}
    >
      <caption
        id={captionId}
        className="text-left"
        style={{ paddingBottom: "var(--space-2)", captionSide: "top" }}
      >
        <span className="flex flex-wrap items-baseline" style={{ gap: "var(--space-2)" }}>
          <span style={{ font: "var(--type-title)", fontSize: "var(--text-lg)" }}>{cand.nome}</span>
          <PartyTag sigla={cand.partido} size="sm" color={cor} />
        </span>
        <span
          className="block"
          style={{
            font: "var(--type-data)",
            color: "var(--text-secondary)",
            marginTop: "var(--space-1)",
          }}
        >
          {lista.length} de {totalUfsComDado} UFs com percentual publicado para este candidato
        </span>
      </caption>
      <thead>
        <tr>
          <th scope="col" style={HEAD_CELL}>
            UF
          </th>
          <th scope="col" style={HEAD_CELL}>
            Posição
          </th>
          <th scope="col" style={{ ...HEAD_CELL, textAlign: "right" }}>
            Diferença
          </th>
          <th scope="col" style={{ ...HEAD_CELL, textAlign: "right" }}>
            Projetado
          </th>
        </tr>
      </thead>
      <tbody>
        {lista.length === 0 ? (
          <tr>
            <td colSpan={4} style={{ ...CELL, font: "var(--type-body-sm)" }}>
              Nenhuma UF publicou percentual para este candidato ainda.
            </td>
          </tr>
        ) : (
          lista.map((l) => (
            <tr key={l.sigla} data-uf={l.sigla}>
              <th scope="row" style={{ ...CELL, font: "var(--type-figure-sm)", fontWeight: 500 }}>
                {l.sigla}
              </th>
              <td style={{ ...CELL, font: "var(--type-body-sm)" }}>
                <span style={{ color: "var(--text-secondary)" }}>
                  {l.posicao}º · {l.posicao === 1 ? "à frente de" : "atrás de"} {l.contraNome}
                </span>
                <span
                  aria-hidden="true"
                  className="mt-1 block overflow-hidden"
                  style={{
                    height: 6,
                    borderRadius: "var(--radius-xs)",
                    background: "var(--surface-sunken)",
                    border: DATA_FILL_STROKE,
                  }}
                >
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.max(0, Math.min(100, l.pct))}%`,
                      background: candidateColorByMargin(cand.partido, rank, l.diff),
                    }}
                  />
                </span>
              </td>
              <td style={{ ...CELL, font: "var(--type-figure-sm)", textAlign: "right" }}>
                {formatPp(l.diff)}
              </td>
              <td style={{ ...CELL, font: "var(--type-figure-sm)", textAlign: "right" }}>
                {formatPercent(l.pct, 1)}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function StrongholdsPanel({
  candidatos,
  rows,
  topCandidatos = 3,
  topUfs = 5,
  className,
}: StrongholdsPanelProps) {
  const candidatosById = new Map(candidatos.map((c) => [c.id, c]));
  const colunas = candidatos.slice(0, topCandidatos);
  const totalUfsComDado = rows.filter((r) => (r.top_candidatos ?? []).length > 0).length;

  return (
    <Panel
      kicker="Por unidade federativa"
      title="Onde cada força é mais forte"
      titleId="strongholds-panel-heading"
      className={className}
    >
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: "var(--space-8)" }}>
        {colunas.map((c, i) => {
          const rank = c.rank ?? i + 1;
          return (
            <CandidateColumn
              key={c.id}
              cand={c}
              rank={rank}
              lista={strongholdsFor(c.id, rows, candidatosById).slice(0, topUfs)}
              totalUfsComDado={totalUfsComDado}
            />
          );
        })}
      </div>
      <p
        data-testid="strongholds-nota"
        style={{
          margin: "var(--space-4) 0 0",
          font: "var(--type-body-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
        }}
      >
        UFs com maior percentual projetado para cada candidato. A diferença é a margem projetada
        local: para quem está em 1º, a distância até o 2º; abaixo disso, a distância até o 1º. O
        payload publica no máximo três candidatos por UF, então uma UF em que o candidato esteja em
        4º ou abaixo não entra na lista. Projeção não oficial; o resultado é do TSE.
      </p>
    </Panel>
  );
}
