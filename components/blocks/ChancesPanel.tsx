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
 *
 * ===========================================================================
 * 2026-09-20 — QUEM o painel nomeia acompanha a base ativa
 * ===========================================================================
 *
 * Mesmo dia, mesma decisão do dono ("tudo acompanha a base ativa") que fez a
 * lista do `<ResultPanel>` reagir ao controle "Parcial / Projeção". Este
 * painel ficou para trás por um turno, nos DOIS caminhos que ele tem:
 *
 *   - **`eleitos` (Senado)** — quem chama recortava as `vagas + 1` primeiras
 *     candidaturas SEMPRE pela ordem do apurado, então na visualização
 *     "Projeção" a lista logo acima marcava A e B como ocupantes de vaga
 *     enquanto os medidores aqui embaixo falavam de B e C.
 *   - **`lider*` (home presidencial)** — `app/(pres)/page.tsx` nomeava quem
 *     tem `rank === 1`, que é o rank de PROJEÇÃO publicado pelo produtor. Na
 *     visualização "Parcial" a lista podia pôr B em primeiro enquanto este
 *     painel, logo abaixo, dizia "A vence no 1º turno". Mesma classe de
 *     divergência, na corrida de maior audiência do produto.
 *
 * **O que muda é só QUEM aparece.** Nenhum número é recalculado: `p_eleito` e
 * `p_fecha_1t` são saída do bootstrap e não têm "versão parcial" nem "versão
 * projetada" (constituição § 6). Cada medidor lê o registro INTEIRO de uma
 * candidatura — nome, probabilidade e percentual do mesmo registro —, porque
 * o erro perigoso aqui não é trocar o nome, é trocar só o nome.
 *
 * Uma palavra mudou junto, e é a única mudança de texto: a nota do medidor de
 * 1º turno dizia "a projeção **do líder** fecha 50% + 1" e passa a dizer "a
 * projeção **deste candidato**". Enquanto o painel só nomeava o líder da
 * projeção, o anafórico era inofensivo; com o nome acompanhando a base, na
 * visualização "Parcial" o nomeado lidera a CONTAGEM e pode não liderar a
 * projeção — e "do líder", na mesma frase, passaria a apontar para outra
 * pessoa. Mesma afirmação, sujeito resolvido.
 *
 * **Como, sem JS.** A home e as 54 rotas de UF são pré-renderizadas estáticas
 * (ADR-0025 §§ 2 e 5) e `lib/state/view-mode.ts` proíbe torná-las dinâmicas,
 * então o servidor não sabe em que base o leitor está. Os dois elencos entram
 * no DOM sob `data-view-only` e a cascata de `app/globals.css` escolhe —
 * exatamente o que a `<Figure>` de margem e o `<VagaBadge>` já fazem.
 * **Quando as duas bases escolhem o mesmo elenco — o caso comum — o DOM é
 * byte a byte o de antes**: um grupo só, sem invólucro, zero nó a mais. A
 * duplicação só existe quando os elencos de fato divergem, e aí ela é de
 * `vagas + 1` medidores (3 no Senado), não de uma lista inteira.
 *
 * 🔴 O atributo mora num `<div>` externo e nunca no `<div className="grid">`:
 * `[data-view-only] { display: none }` teria de vencer a utilitária de
 * display, e essa é uma corrida de cascata que não vale a pena correr. Mesma
 * regra que o cabeçalho de `app/globals.css` já escreve para a `<Figure>`.
 */

import type { ReactNode } from "react";

import { ProbabilityMeter } from "@/components/atoms/data/ProbabilityMeter";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { formatPercent } from "@/lib/utils/format";

/**
 * A candidatura que o medidor "quem está na frente" nomeia.
 *
 * Os quatro campos andam JUNTOS de propósito — ver `medidorDoLider`. Existe
 * como tipo próprio desde 2026-09-20, quando o painel passou a poder nomear
 * candidaturas diferentes em cada base.
 */
export interface ChancesPanelLider {
  /** Nome de exibição. Vazio/omitido → "O líder". */
  nome?: string | null;
  /** `EdgeCandidate.p_fecha_1t` em [0, 1] — DESTA candidatura. */
  pFecha1t?: number | null;
  /** P(vencer esta corrida) em [0, 1] — DESTA candidatura. Só lido sem `pFecha1t`. */
  pVitoria?: number | null;
  /** `pct_projetado` (0–100) DESTA candidatura — entra na nota. */
  pctProjetado?: number | null;
}

/** Uma candidatura no medidor de `p_eleito` (RF-103). */
export interface ChancesPanelEleito {
  id: number;
  nome: string;
  /** `p_eleito` em [0, 1]. Vem PRONTO do payload — nada é recalculado aqui. */
  p: number;
  /** `pct_projetado` (0–100) — entra na nota do medidor. */
  pctProjetado?: number | null;
}

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
  /**
   * A candidatura que a base **PROJEÇÃO** põe na frente (2026-09-20).
   *
   * Omitida → comportamento de sempre: um medidor só, sem invólucro de base.
   * Presente → as quatro props `lider*` acima passam a descrever a base
   * **PARCIAL**, e esta descreve a projeção; quando as duas produzem o mesmo
   * medidor (o caso comum), o DOM continua sendo o de antes.
   *
   * Agrupada, e não quatro props `*Proj` soltas, porque é a agrupação que
   * torna impossível montar meio medidor de cada base — ver `medidorDoLider`.
   */
  liderProj?: ChancesPanelLider;
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
  eleitos?: ReadonlyArray<ChancesPanelEleito>;
  /**
   * O MESMO recorte, derivado da base **PROJEÇÃO** (2026-09-20).
   *
   * Omitido → o painel se comporta exatamente como antes: um elenco só, sem
   * invólucro de base. Presente e IGUAL a `eleitos` → idem, porque não há o
   * que escolher. Presente e diferente → os dois elencos entram no DOM sob
   * `data-view-only` e a cascata mostra o da base ativa.
   *
   * Quando esta prop é usada, `eleitos` é, por definição, o recorte da base
   * **PARCIAL** — é o par que dá sentido ao atributo.
   */
  eleitosProj?: ReadonlyArray<ChancesPanelEleito>;
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

/**
 * Os dois elencos são o mesmo painel?
 *
 * Compara tudo o que vira pixel — identidade, nome, o número do medidor e o
 * da nota —, e não só a sequência de `id`. Os dois arrays são construídos pelo
 * mesmo `map()` de quem chama, então na prática empatam sempre que os `id`
 * empatam; depender disso, porém, amarraria o painel a um detalhe do chamador.
 * Empatando, o DOM é o de antes: um grupo, sem invólucro, zero nó a mais.
 */
function mesmoElenco(a: readonly ChancesPanelEleito[], b: readonly ChancesPanelEleito[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      y != null &&
      x.id === y.id &&
      x.nome === y.nome &&
      x.p === y.p &&
      (x.pctProjetado ?? null) === (y.pctProjetado ?? null)
    );
  });
}

export function ChancesPanel({
  pSegundoTurno,
  liderNome,
  liderPFecha1t,
  liderPVitoria,
  liderPctProjetado,
  pctApurado,
  escopo,
  liderProj,
  eleitos,
  eleitosProj,
  vagas = 1,
  title = "Chances",
  className,
}: ChancesPanelProps) {
  // 🔴 O filtro é o mesmo nas duas bases e continua sendo o de sempre: sem
  // `p` numérico não há medidor. Um candidato que a base ativa põe na disputa
  // mas para quem o modelo não publicou `p_eleito` some do painel — jamais
  // aparece como 0%, que seria afirmar que ele não se elege.
  const listaParcial = (eleitos ?? []).filter((e) => has(e.p));
  const listaProj = eleitosProj == null ? listaParcial : eleitosProj.filter((e) => has(e.p));
  // Divergem? Só então os dois elencos entram no DOM. `eleitosProj` ausente
  // significa "não há segunda base", não "segunda base vazia".
  const duasBases = eleitosProj != null && !mesmoElenco(listaParcial, listaProj);

  if (listaParcial.length > 0 || listaProj.length > 0) {
    const apurado = `${formatPercent(pctApurado, 1)} apurado`;
    const ondeVence = escopo ? ` em ${escopo}` : "";
    // O rótulo e a nota NÃO mudam com a base: `p_eleito` é saída do modelo e
    // vale igual nas duas leituras. O que muda é o conjunto de linhas.
    const medidores = (lista: readonly ChancesPanelEleito[]) =>
      lista.map((e) => (
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
      ));
    const grade = (lista: readonly ChancesPanelEleito[]) => (
      <div className="grid" style={{ gap: "var(--space-5)" }}>
        {medidores(lista)}
      </div>
    );

    return (
      <Panel kicker="Modelo Atlas Menna" title={title} className={className}>
        {duasBases ? (
          // `data-view-only` num `<div>` NU — ver a nota no topo do arquivo.
          // Um elenco vazio não vira grupo vazio: ele simplesmente não entra.
          <div data-testid="chances-panel-meters">
            {listaParcial.length > 0 ? (
              <div data-view-only="parcial">{grade(listaParcial)}</div>
            ) : null}
            {listaProj.length > 0 ? <div data-view-only="proj">{grade(listaProj)}</div> : null}
          </div>
        ) : (
          <div
            className="grid"
            style={{ gap: "var(--space-5)" }}
            data-testid="chances-panel-meters"
          >
            {medidores(listaParcial.length > 0 ? listaParcial : listaProj)}
          </div>
        )}
      </Panel>
    );
  }

  const temSegundoTurno = has(pSegundoTurno);
  const apuradoLabel = `${formatPercent(pctApurado, 1)} apurado`;

  /**
   * O medidor "quem está na frente", montado a partir de UMA candidatura.
   *
   * 🔴 **Nome, probabilidade e percentual saem SEMPRE do mesmo registro.** É a
   * razão de esta função receber um objeto e não três argumentos soltos: a
   * armadilha desta tela não é trocar o nome, é trocar SÓ o nome. "Fulano
   * vence no 1º turno — 31%" com o nome de quem lidera a contagem e a
   * probabilidade de quem lidera a projeção seria uma frase falsa costurada
   * com dois fatos verdadeiros — exatamente o defeito que a `<Figure>` de
   * margem do `<ResultPanel>` teve até 2026-09-20. Aqui isso é impossível por
   * construção: ou entra o registro inteiro, ou não entra medidor.
   *
   * `chave` existe para comparar as duas bases sem re-renderizar: se o
   * medidor sai idêntico nas duas, ele entra UMA vez, sem invólucro.
   */
  const medidorDoLider = (l: ChancesPanelLider): { chave: string; node: ReactNode } | null => {
    const pFecha1t = has(l.pFecha1t) ? l.pFecha1t : null;
    // `p_vitoria` é fallback, não soma: exibir "vence no 1º turno" e "vence"
    // lado a lado seriam duas leituras da mesma corrida com denominadores
    // diferentes.
    const pVitoria = pFecha1t == null && has(l.pVitoria) ? l.pVitoria : null;
    if (pFecha1t == null && pVitoria == null) return null;

    const nome = l.nome?.trim() || "O líder";
    const projLabel = has(l.pctProjetado)
      ? `Projeção ${formatPercent(l.pctProjetado, 1)} · ${apuradoLabel}`
      : apuradoLabel;

    // 🔴 "a projeção DESTE CANDIDATO", e não mais "a projeção do líder"
    // (2026-09-20). Enquanto o painel só falava de quem lidera a projeção, o
    // anafórico era inofensivo. Com o nome acompanhando a base, na
    // visualização "Parcial" o nomeado lidera a CONTAGEM e pode não liderar a
    // projeção — e aí "a projeção do líder" passaria a apontar para outra
    // pessoa dentro da mesma frase. Mesma afirmação, sujeito resolvido.
    const label =
      pFecha1t != null
        ? `${nome} vence no 1º turno`
        : escopo
          ? `${nome} vence em ${escopo}`
          : `${nome} vence`;
    // `??` e não `||`: `p_fecha_1t` vale 0 legitimamente, e `0 || x` escolheria
    // a probabilidade errada.
    const pct = toPct(pFecha1t ?? pVitoria ?? 0);
    const note =
      pFecha1t != null
        ? `${projLabel}. Frequência das reamostragens em que a projeção deste candidato fecha 50% + 1 dos válidos.`
        : `${projLabel}. Mesma probabilidade que posiciona a agulha desta corrida — não há, no payload desta página, a chance de decisão em 1º turno.`;

    return {
      chave: `${label}|${pct}|${note}`,
      node: <ProbabilityMeter label={label} pct={pct} note={note} />,
    };
  };

  const medidorParcial = medidorDoLider({
    nome: liderNome,
    pFecha1t: liderPFecha1t,
    pVitoria: liderPVitoria,
    pctProjetado: liderPctProjetado,
  });
  const medidorProj = liderProj == null ? medidorParcial : medidorDoLider(liderProj);
  // `liderProj` ausente significa "não há segunda base", não "segunda base
  // vazia" — mesma regra de `eleitosProj`.
  const duasBasesLider = liderProj != null && medidorParcial?.chave !== medidorProj?.chave;

  if (!temSegundoTurno && medidorParcial == null && medidorProj == null) return null;

  return (
    <Panel kicker="Modelo Atlas Menna" title={title} className={className}>
      <div className="grid" style={{ gap: "var(--space-5)" }} data-testid="chances-panel-meters">
        {/* Sem nome e sem base: `p_segundo_turno_overall` é uma afirmação
            sobre a CORRIDA, não sobre uma candidatura. Não duplica nunca. */}
        {temSegundoTurno ? (
          <ProbabilityMeter
            label="Chance de ir ao 2º turno"
            pct={toPct(pSegundoTurno)}
            note="Frequência, nas reamostragens do modelo, de nenhum candidato alcançar 50% + 1 dos votos válidos."
          />
        ) : null}

        {duasBasesLider ? (
          <>
            {medidorParcial ? <div data-view-only="parcial">{medidorParcial.node}</div> : null}
            {medidorProj ? <div data-view-only="proj">{medidorProj.node}</div> : null}
          </>
        ) : (
          ((medidorParcial ?? medidorProj)?.node ?? null)
        )}
      </div>
    </Panel>
  );
}
