/**
 * components/blocks/BulletinPanel.tsx
 *
 * "Boletim" — o registro do momento da apuração, em linhas datadas.
 * Design system Atlas Menna (ADR-0025, Bloco 1), portado da ideia do
 * `BulletinPanel` de `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:115`.
 *
 * Cobertura: RF-026 (estado da apuração + timestamp) e RF-044 (texto de
 * análise por template) na superfície nacional.
 *
 * ===== Texto: template determinístico, nunca LLM =====
 * ADR-0005 e constituição § 2. Toda sentença deste bloco sai de
 * `buildBulletin()`, uma função pura de (payload) → itens. Mesma entrada,
 * mesma saída — não há `Date.now()`, `Math.random()` nem chamada de rede.
 *
 * As frases descrevem, não julgam: "aparece com", "a diferença projetada é
 * de", "a projeção indica", "já foram chamadas". Nenhum adjetivo de mérito
 * ("expressiva", "esmagadora", "consolida") entra aqui — a constituição § 2
 * proíbe, e uma vez que a frase existe no código ela é dita a noite inteira.
 *
 * ===== Relação com os blocos vizinhos =====
 *   - `<BreakingNewsTicker />` (topo da página) rotaciona UMA chamada por vez.
 *     Este bloco lista as mesmas chamadas em ordem cronológica, junto dos
 *     fatos derivados. Ticker é alerta; boletim é registro. As chamadas vêm
 *     prontas do orchestrator (`national.chamadas_recentes[].texto`) — este
 *     componente as repassa literalmente, sem reescrever.
 *   - `<InsightCard />` (RF-044) segue existindo com as frases de
 *     `payload.insights`, geradas server-side. Não há sobreposição: aqui as
 *     frases nascem do estado numérico da corrida; lá, do engine de insights.
 *
 * Server Component puro — sem estado, sem hooks, zero JS novo (RNF-007a).
 *
 * A11y: `<ol>` com um `<li>` por linha (o leitor anuncia "1 de 5"); o horário
 * vai em `<time dateTime>` para não ser lido como número solto.
 */

import { Panel } from "@/components/atoms/surfaces/Panel";
import type { EdgeNational, EdgeUfRow, Turno } from "@/lib/edge-config/types";
import { formatCI, formatPercent, formatPp, formatTimeHMS } from "@/lib/utils/format";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

export interface BulletinPanelProps {
  national: EdgeNational;
  rows: EdgeUfRow[];
  /** `EdgePayload.pct_apurado_total` (0–100). */
  pctApuradoTotal: number;
  /** `EdgePayload.ufs_apuradas`. */
  ufsApuradas: number;
  /** ISO 8601 do ciclo do modelo (`EdgePayload.ts`). */
  ts: string;
  turno: Turno;
  totalUfs?: number;
  /** Máximo de chamadas do orchestrator listadas abaixo dos fatos. */
  maxChamadas?: number;
  className?: string;
}

export interface BulletinItem {
  /** Chave estável — usada como `key` e como `data-item`. */
  id: string;
  /** ISO 8601 da linha. */
  ts: string;
  /** Rótulo curto em caixa alta. */
  head: string;
  /** Sentença completa. */
  text: string;
}

/** `undefined` quando o array não tem o rank pedido. */
function byRank(national: EdgeNational, rank: number) {
  return (
    national.candidatos.find((c) => c.rank === rank) ?? national.candidatos[rank - 1] ?? undefined
  );
}

/**
 * Constrói o boletim. Exportada para o teste exercitar os templates sem
 * passar pelo DOM — o texto é o contrato aqui, não o markup.
 */
export function buildBulletin({
  national,
  rows,
  pctApuradoTotal,
  ufsApuradas,
  ts,
  turno,
  totalUfs = 27,
  maxChamadas = 3,
}: Omit<BulletinPanelProps, "className">): BulletinItem[] {
  const items: BulletinItem[] = [];

  items.push({
    id: "apuracao",
    ts,
    head: "Apuração",
    text: `${formatPercent(pctApuradoTotal, 1)} das seções apuradas, com boletim em ${ufsApuradas} de ${totalUfs} unidades federativas.`,
  });

  // 🔊 2026-09-19 — as siglas deste painel NÃO abreviam, e isso é deliberado.
  //
  // A abreviação de `lib/utils/sigla-partido.ts` vale para sigla que é TOKEN
  // dentro de um layout (chip, coluna, rótulo colado ao nome), onde a largura é
  // finita. Aqui ela está dentro de uma FRASE que quebra linha na largura
  // inteira do painel — não há pixel em disputa. E `item.text` é a MESMA string
  // que o leitor de tela recebe: não existe `aria-label` separado para segurar
  // a versão inteira, então encurtar aqui encurtaria também o que é lido, que é
  // o lado que a decisão do dia mandou preservar.
  const lider = byRank(national, 1);
  const segundo = byRank(national, 2);

  if (lider) {
    items.push({
      id: "lideranca",
      ts,
      head: "Projeção",
      text: `${nomeExibicao(lider.nome, lider.sqcand)} (${lider.partido}) aparece com ${formatPercent(lider.pct_projetado, 1)} dos votos a votáveis na projeção, no intervalo de 95% ${formatCI(lider.pct_projetado_lower, lider.pct_projetado_upper)}.`,
    });
  }

  if (lider && segundo) {
    const delta = Math.abs(lider.pct_projetado - segundo.pct_projetado);
    items.push({
      id: "diferenca",
      ts,
      head: "Diferença",
      text: `A diferença projetada entre ${nomeExibicao(lider.nome, lider.sqcand)} e ${nomeExibicao(segundo.nome, segundo.sqcand)} (${segundo.partido}) é de ${formatPp(delta)}.`,
    });
  }

  // O 2º turno é uma pergunta só do 1º turno. Em turno 2 a métrica está vazia
  // de semântica (ver `p_segundo_turno_overall` em lib/edge-config/types.ts).
  if (turno === 1) {
    const p = national.p_segundo_turno_overall;
    items.push({
      id: "segundo-turno",
      ts,
      head: "Segundo turno",
      text:
        p == null
          ? "A probabilidade de segundo turno ainda não foi publicada nesta rodada do modelo."
          : `A projeção indica ${formatPercent(p * 100, 0)} de chance de a eleição ir a segundo turno.`,
    });
  }

  const chamadas = rows.filter((r) => r.chamada).length;
  items.push({
    id: "chamadas",
    ts,
    head: "Chamadas",
    text:
      chamadas === 0
        ? "Nenhuma unidade federativa foi chamada para o líder local até agora."
        : chamadas === 1
          ? "1 unidade federativa já foi chamada para o líder local."
          : `${chamadas} unidades federativas já foram chamadas para o líder local.`,
  });

  // Chamadas do orchestrator: texto pronto, repassado literalmente (ADR-0005).
  // Ordem canônica do campo é `ts` DESC; aqui invertemos para o boletim correr
  // no sentido da leitura (mais antigo em cima, como em qualquer registro).
  const recentes = (national.chamadas_recentes ?? []).slice(0, maxChamadas);
  for (const [i, c] of [...recentes].reverse().entries()) {
    items.push({ id: `chamada-${i}`, ts: c.ts, head: "Boletim", text: c.texto });
  }

  return items;
}

export function BulletinPanel({ className, ...data }: BulletinPanelProps) {
  const items = buildBulletin(data);

  return (
    <Panel
      kicker="Boletim"
      title="O que está acontecendo agora"
      titleId="bulletin-panel-heading"
      className={className}
    >
      <ol data-testid="bulletin-list" className="m-0 list-none p-0">
        {items.map((item, i) => (
          <li
            key={item.id}
            data-item={item.id}
            className="grid grid-cols-[3.25rem_1fr]"
            style={{
              gap: "var(--space-3)",
              padding: "var(--space-3) 0",
              borderTop: i === 0 ? undefined : "1px solid var(--border-hairline)",
            }}
          >
            <time
              dateTime={item.ts}
              style={{ font: "var(--type-data)", color: "var(--text-secondary)" }}
            >
              {formatTimeHMS(item.ts)}
            </time>
            <span style={{ font: "var(--type-body-sm)", textWrap: "pretty" }}>
              <strong style={{ fontWeight: 600 }}>{item.head}</strong>{" "}
              <span style={{ color: "var(--text-secondary)" }}>{item.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p
        data-testid="bulletin-nota"
        style={{
          margin: "var(--space-3) 0 0",
          font: "var(--type-body-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
        }}
      >
        Linhas montadas por regra fixa a partir do payload do modelo, sem edição humana e sem texto
        gerado por IA. Projeção não oficial; o resultado é do TSE.
      </p>
    </Panel>
  );
}
