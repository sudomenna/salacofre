/**
 * components/blocks/ChancesPanel.tsx
 *
 * Painel de chances do protótipo do kit Atlas Menna (`ChancesPanel` em
 * `docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx`), portado em
 * S07/Bloco 2. É o primeiro — e até aqui único — consumidor do átomo
 * `<ProbabilityMeter />`, que estava no repositório sem call site desde o
 * Bloco 1.
 *
 * ## O que o protótipo faz e o que **não** copiamos
 *
 * O kit monta dois medidores a partir de `AM_DATA.chances()`
 * (`ui_kits/atlas-menna/data.js:142`), que é uma normal fechada calculada na
 * hora, no browser, a partir do percentual projetado do líder e de um sigma
 * inventado (`1.2 + 7 * (1 - apurado/100)`). Aqui **nada é recalculado na
 * UI**: os números vêm prontos do payload, produzidos pelo bootstrap do
 * orchestrator (ADR-0014). Inventar uma normal no cliente contrariaria a
 * constituição § 6 (determinismo — o mesmo dado tem que dar o mesmo número em
 * qualquer superfície) e § 8 (transparência — a nota tem que descrever o
 * cálculo real, não um proxy).
 *
 * Consequência direta: **cada medidor só existe se o campo correspondente
 * existir no payload**. Sem campo, o medidor não aparece; sem nenhum campo,
 * o painel inteiro retorna `null` em vez de desenhar um filete órfão.
 *
 * ## Os três campos que este painel sabe ler
 *
 * | Medidor | Campo | Onde existe |
 * |---|---|---|
 * | "Chance de ir ao 2º turno" | `EdgeNational.p_segundo_turno_overall` | payload nacional |
 * | "<líder> vence no 1º turno" | `EdgeCandidate.p_fecha_1t` | payload nacional |
 * | "<líder> vence em <UF>" | derivado de `EdgePayloadUf.needle_position` | payload de UF |
 *
 * A terceira linha é o caminho das páginas de UF: `EdgePayloadUf` **não**
 * carrega `p_segundo_turno_overall` nem `p_fecha_1t` (ver
 * `lib/edge-config/types.ts` § "Candidato dentro do drill-down de UF" — o
 * subset de UF nem sequer tem `p_vitoria`). O que a UF tem é a posição da
 * agulha, de onde a própria página já deriva a probabilidade do líder para
 * gatilhar o `<WinnerBanner />` e alimentar o `<Needle />`. Reusar esse mesmo
 * número aqui não inventa dado novo — é o mesmo valor que a página já exibe,
 * na gramática do kit.
 *
 * Server Component puro — zero JS novo acima da dobra (RNF-007a).
 *
 * A11y / contraste
 *   - O preenchimento fica no default do `<ProbabilityMeter />`
 *     (`--accent-strong`, 3.88:1 contra a calha — WCAG 1.4.11). **Não** usamos
 *     cor de partido aqui: quatro bases da paleta reprovam como objeto
 *     gráfico e `textForParty()` só resolve texto (ADR-0024).
 *   - Cada medidor sai com `note` — regra editorial do kit e da constituição
 *     § 8: probabilidade nunca vai ao ar sem dizer como foi calculada.
 */

import { ProbabilityMeter } from "@/components/atoms/data/ProbabilityMeter";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { formatPercent } from "@/lib/utils/format";

export interface ChancesPanelProps {
  /**
   * `EdgeNational.p_segundo_turno_overall` em [0, 1] — P(nenhum candidato
   * fecha o 1º turno). `null`/omitido → o medidor não aparece.
   */
  pSegundoTurno?: number | null;
  /** Nome do líder, usado nos rótulos que o nomeiam. */
  liderNome?: string | null;
  /**
   * `EdgeCandidate.p_fecha_1t` do líder em [0, 1] — P(fechar o 1T sozinho,
   * >= 50%+1 dos válidos). `null`/omitido → cai em `liderPVitoria`.
   */
  liderPFecha1t?: number | null;
  /**
   * P(o líder vencer ESTA corrida) em [0, 1]. Nas páginas de UF é o valor
   * derivado de `needle_position` que a página já usa no `<Needle />`.
   * Só é lido quando `liderPFecha1t` está ausente.
   */
  liderPVitoria?: number | null;
  /** `pct_projetado` do líder (0–100) — entra na nota do medidor. */
  liderPctProjetado?: number | null;
  /** Percentual apurado da corrida (0–100) — entra na nota do medidor. */
  pctApurado: number;
  /**
   * Onde a corrida acontece, para o rótulo do medidor de vitória quando ele
   * cai no caminho `liderPVitoria` — ex. `"SP"` produz "… vence em SP".
   */
  escopo?: string;
  /**
   * RF-103 (spec 016) — um medidor por candidato com a probabilidade de
   * **se eleger**, isto é, de terminar entre as `vagas` primeiras posições.
   *
   * É a quarta linha da tabela acima, e a única que não fala de um líder: em
   * corrida de duas vagas não existe "o líder vence" — existem dois eleitos,
   * e a pergunta interessante é quem são. O valor vem pronto de
   * `EdgeUfCandidate.p_eleito` (bootstrap do orchestrator); nada é
   * recalculado aqui, pela mesma razão de sempre (constituição § 6).
   *
   * Quando presente, os medidores de `p_eleito` são os ÚNICOS exibidos: somar
   * "chance de ir ao 2º turno" a uma corrida de turno único seria inventar um
   * evento que não existe para o cargo.
   *
   * **Quem chama é responsável por não passar probabilidade degenerada.** Com
   * o cargo ingerido em granularidade UF, o bootstrap não tem o que
   * reamostrar e `p_eleito` sai 0 ou 1 — ver a nota em
   * `EdgeUfCandidate.p_eleito`. Publicar "100%" às 19h seria uma afirmação
   * que o modelo não sustenta.
   */
  eleitos?: ReadonlyArray<{
    id: number;
    nome: string;
    /** `p_eleito` em [0, 1]. */
    p: number;
    /** `pct_projetado` (0–100) — entra na nota do medidor. */
    pctProjetado?: number | null;
  }>;
  /** Cadeiras em disputa — entra no texto do medidor de `p_eleito`. */
  vagas?: number;
  /** Título do painel. Default "Chances". */
  title?: string;
  className?: string;
}

/** [0, 1] → [0, 100], defensivo contra `NaN` e valores fora do intervalo. */
function toPct(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, p * 100));
}

/** `p` só conta como dado quando é um número finito de verdade. */
function has(p: number | null | undefined): p is number {
  return p != null && Number.isFinite(p);
}

export function ChancesPanel({
  pSegundoTurno,
  liderNome,
  liderPFecha1t,
  liderPVitoria,
  liderPctProjetado,
  pctApurado,
  escopo,
  eleitos,
  vagas = 1,
  title = "Chances",
  className,
}: ChancesPanelProps) {
  const listaEleitos = (eleitos ?? []).filter((e) => has(e.p));
  if (listaEleitos.length > 0) {
    const apurado = `${formatPercent(pctApurado, 1)} apurado`;
    const ondeVence = escopo ? ` em ${escopo}` : "";
    return (
      <Panel kicker="Modelo Atlas Menna" title={title} className={className}>
        <div className="grid" style={{ gap: "var(--space-5)" }} data-testid="chances-panel-meters">
          {listaEleitos.map((e) => (
            <ProbabilityMeter
              key={e.id}
              label={`${e.nome.trim() || "Candidato"} se elege${ondeVence}`}
              pct={toPct(e.p)}
              note={
                has(e.pctProjetado)
                  ? `Projeção ${formatPercent(e.pctProjetado, 1)} · ${apurado}. ` +
                    `Frequência das reamostragens do modelo em que este candidato termina entre os ${vagas} primeiros.`
                  : `${apurado}. Frequência das reamostragens do modelo em que este candidato termina entre os ${vagas} primeiros.`
              }
            />
          ))}
        </div>
      </Panel>
    );
  }

  const temSegundoTurno = has(pSegundoTurno);
  const temFecha1t = has(liderPFecha1t);
  // `p_vitoria` é fallback, não soma: exibir "vence no 1º turno" e "vence"
  // lado a lado seriam duas leituras da mesma corrida com denominadores
  // diferentes.
  const temVitoria = !temFecha1t && has(liderPVitoria);

  if (!temSegundoTurno && !temFecha1t && !temVitoria) return null;

  const nome = liderNome?.trim() || "O líder";
  const apuradoLabel = `${formatPercent(pctApurado, 1)} apurado`;
  const projLabel = has(liderPctProjetado)
    ? `Projeção ${formatPercent(liderPctProjetado, 1)} · ${apuradoLabel}`
    : apuradoLabel;

  return (
    <Panel kicker="Modelo Atlas Menna" title={title} className={className}>
      <div className="grid" style={{ gap: "var(--space-5)" }} data-testid="chances-panel-meters">
        {temSegundoTurno ? (
          <ProbabilityMeter
            label="Chance de ir ao 2º turno"
            pct={toPct(pSegundoTurno)}
            note="Frequência, nas reamostragens do modelo, de nenhum candidato alcançar 50% + 1 dos votos válidos."
          />
        ) : null}

        {temFecha1t ? (
          <ProbabilityMeter
            label={`${nome} vence no 1º turno`}
            pct={toPct(liderPFecha1t)}
            note={`${projLabel}. Frequência das reamostragens em que a projeção do líder fecha 50% + 1 dos válidos.`}
          />
        ) : null}

        {temVitoria ? (
          <ProbabilityMeter
            label={escopo ? `${nome} vence em ${escopo}` : `${nome} vence`}
            pct={toPct(liderPVitoria)}
            note={`${projLabel}. Mesma probabilidade que posiciona a agulha desta corrida — não há, no payload desta página, a chance de decisão em 1º turno.`}
          />
        ) : null}
      </div>
    </Panel>
  );
}
