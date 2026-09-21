"use client";

/**
 * components/blocks/HexCartogramBrasil.tsx
 *
 * S06/F4d (Fase 3) — cartograma hexagonal das 27 UFs (Brasil), NYT-like.
 *
 * SVG inline (sem MapLibre, sem PMTiles) — atende RNF-007a (bundle
 * above-the-fold) e mantém o componente "free of heavy deps". Cada hex
 * é pintado pela SIGLA do líder, com o par fundo+tinta medido de
 * `partyChipInk` (ADR-0024) — nunca pela colocação; ver `pintaHex`. Quando
 * `bucket === "indefinido"` (apuração baixa), usa fill cinza neutro.
 *
 * Link via `<a href>` (sem onClick), permitindo navegação SSR-friendly. Hover
 * puro CSS (sem JS).
 *
 * Cobertura
 *   - Spec 005 (visão alternativa `/governador` cartograma).
 *   - Constituição § 2 (cores via tokens; UFs visualmente iguais).
 *   - ADR-0013 / ADR-0017.
 *
 * A11y
 *   - `<svg role="img">` com `aria-labelledby` ↔ <title>.
 *   - Cada hex agrupado em `<a>` com `aria-label` semântico.
 *
 * ===========================================================================
 * 2026-09-20 — deixa de ser Server Component: pedido do dono, "as cores dos
 * mapas em todas as visões devem respeitar o seletor Parcial/Projeção"
 * ===========================================================================
 *
 * Antes deste commit, todo hex e toda linha da lista textual liam `uf.lider`
 * direto — um único valor, sempre o mesmo independente do controle
 * "Parcial/Projeção" do shell (`<ViewModeSwitch>`, ADR-0029 § 2). Esse
 * controle é estado do CLIENTE (`lib/state/view-mode-client.ts`) e as páginas
 * que hospedam este componente são pré-renderizadas estáticas (RNF-002) — a
 * ÚNICA forma de um pedaço de UI reagir a ele em tempo real, sem recarregar a
 * página, é ler `useViewMode()`. É o MESMO caminho que
 * `<NationalMapBlock>` já percorre para o coroplético (docstring dele, "é
 * também o único lugar da página que precisa do 'Parcial/Projeção' em
 * JavaScript") — aqui pela mesma razão: pintar SVG por script é imperativo,
 * não há cascata de CSS que troque a COR calculada de um hex por sigla.
 *
 * **Custo em JS medido, não estimado: zero.** `grep -rn "import.*HexCartogramBrasil"
 * app/ components/` não retorna nenhuma linha — o componente não é importado
 * por NENHUMA página hoje (o ADR-0048 substituiu-o pelo coroplético em
 * `/governador`; ele fica no repositório por decisão do dono, ver a docstring
 * de `pintaHex` abaixo). "use client" aqui não engorda bundle nenhum já
 * publicado: não há rota que o inclua no grafo. Se um dia ele voltar a ser
 * montado, o custo real (o hook + `lib/state/view-mode-client.ts`, já pago
 * pelo `<NationalMapBlock>` em toda página que usa o shell) deve ser
 * remedido pelo `a11y-perf-auditor` naquele momento.
 *
 * A ordenação da lista textual (`<nav>`, embaixo do SVG) NÃO muda — ela não é
 * um ranking, é a navegação alfabética por UF que já era; só o TEXTO de cada
 * item (quem é "o líder") passa a seguir a base ativa, igual ao hexágono.
 */

import Link from "next/link";
import { gridBounds, hexCenter, hexPoints, UF_HEX_POSITIONS } from "@/lib/data/uf-hex-layout";
import type { EdgeCandidate, EdgeUfRow } from "@/lib/edge-config/types";
import { useViewMode } from "@/lib/state/view-mode-client";
import { liderIdPorBase } from "@/lib/utils/lider-por-base";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import { partyChipInk } from "@/lib/utils/party-color";
import { siglaExibicao } from "@/lib/utils/sigla-partido";

export interface HexCartogramBrasilProps {
  rows: EdgeUfRow[];
  candidatos: EdgeCandidate[];
  /** Raio do hex em unidades SVG. Default 26. */
  hexRadius?: number;
}

/**
 * O par (fundo, tinta) de um hexágono — **os dois juntos**, nunca um de cada
 * cadeia.
 *
 * 🔴 **2026-09-20 — o fundo já vinha da sigla; a TINTA ainda vinha da
 * colocação, e era o pior dos dois.** O hexágono não é só uma área pintada:
 * ele carrega duas linhas de texto por cima (a sigla da UF e a do partido do
 * líder). A versão anterior pintava o fundo com `candidateColor(partido)` —
 * correto — e escolhia a tinta assim:
 *
 *     const rank = lider?.rank ?? 99;
 *     const isDarkBg = uf?.bucket !== "indefinido" && [1, 2, 5, 6].includes(rank);
 *
 * Aquela lista `[1, 2, 5, 6]` é a dos ranks cujo token era escuro **na paleta
 * por COLOCAÇÃO** (`--color-cand-N`, ADR-0013). Depois que o fundo passou a
 * sair da sigla, ela deixou de descrever coisa alguma sobre o pixel de baixo:
 * o líder de um partido de fundo CLARO em rank 1 recebia texto **branco sobre
 * amarelo**, e o de um partido de fundo escuro em rank 3 recebia texto escuro
 * sobre escuro. Não é a troca-de-cor da constituição § 2 — é pior, é texto
 * ilegível (§ 4 / WCAG 1.4.3), e chegava justamente pelo resíduo de rank que
 * ninguém tinha tirado.
 *
 * `partyChipInk` é o par que o gerador MEDE para exatamente este caso —
 * superfície sólida com rótulo em cima, ≥ 4,5:1 nos 31 slugs, inclusive no
 * par de `outros` (sigla ausente, desconhecida ou de federação). Em 29 dos 31
 * partidos o `-chip` **é** a cor-base, então o fundo não muda um pixel; MDB e
 * Rede (dois verdes de meio-tom que reprovam com as DUAS tintas do kit)
 * recebem a base escurecida na mesma matiz, o que o § 2 v1.3 permite.
 *
 * `bucket === "indefinido"` (apuração baixa) continua no cinza neutro com
 * tinta escura: ali não há candidatura a identificar, e o cinza não é uma
 * posição — é a ausência de resposta.
 *
 * ⚠️ Este componente é o EXEMPLO que o ADR-0024 usa para aposentar a cor por
 * rank: 27 hexágonos liderados por partidos diferentes saíam todos na cor de
 * rank 1. Ele segue sem uso em `/governador` desde o ADR-0048 (o coroplético o
 * substituiu), preservado por decisão do dono — e por isso mesmo é onde o
 * defeito sobreviveria mais tempo sem ninguém ver.
 *
 * 🔴 2026-09-20 — recebe `liderId` já resolvido pela base ativa (chamador usa
 * `liderIdPorBase`, `lib/utils/lider-por-base.ts` — o MESMO ponto único que o
 * coroplético nacional usa), em vez de ler `uf.lider` direto. E ganha uma
 * SEGUNDA guarda de "sem candidatura a identificar": UF sem NENHUM boletim
 * (`pct_apurado === 0`) na base "Parcial" não tem líder apurado — pintar o
 * líder projetado sob esse rótulo mostraria um número de outro universo.
 * Mesmo cinza de `bucket === "indefinido"`: as duas são a mesma resposta
 * ("não há resposta"), e este componente nunca teve um token de "sem
 * apuração" próprio (diferente do coroplético, que usa `--map-uncounted`).
 */
function pintaHex(
  uf: EdgeUfRow | undefined,
  candIndex: Map<number, EdgeCandidate>,
  liderId: number | undefined,
): { fill: string; ink: string } {
  if (!uf) {
    return { fill: "var(--color-bg-muted)", ink: "var(--color-text)" };
  }
  // `liderId === undefined` é o chamador dizendo "não há leitura para esta
  // base" (UF sem nenhum boletim, na base Parcial — ver `semLeituraParcial`
  // no chamador). MESMO tratamento de `bucket === "indefinido"`: nenhuma
  // candidatura a identificar, nunca `partyChipInk(undefined)` (que cairia no
  // par de `outros`, uma resposta "existe candidatura, mas sem partido
  // mapeado" — categoria diferente de "não sabemos quem lidera ainda").
  if (uf.bucket === "indefinido" || liderId == null) {
    return { fill: "var(--color-cand-other)", ink: "var(--color-text)" };
  }
  const lider = candIndex.get(liderId);
  const { background, ink } = partyChipInk(lider?.partido);
  return { fill: background, ink };
}

export function HexCartogramBrasil({ rows, candidatos, hexRadius = 26 }: HexCartogramBrasilProps) {
  // Único uso de JavaScript deste componente (ver a docstring do topo do
  // arquivo, 2026-09-20): resolver a cor/identidade pela base ATIVA do
  // controle "Parcial/Projeção" do shell exige o valor em runtime.
  const viewMode = useViewMode();
  const candIndex = new Map(candidatos.map((c) => [c.id, c] as const));
  const rowsBySigla = new Map(rows.map((r) => [r.sigla, r] as const));
  const { width, height } = gridBounds(hexRadius);
  // UF sem nenhum boletim, na base "Parcial": não há líder apurado a mostrar
  // (mesma condição/mesma resposta do coroplético — ver `resolveColor` em
  // `_NationalChoroplethMapImpl.tsx`). `liderIdPorBase` sozinho não sabe
  // disso: ele SEMPRE devolve um `id` (com fallback pra projeção quando falta
  // leitura parcial), e aqui o pedido é o oposto — não mostrar candidatura
  // nenhuma nesse caso, exatamente como `bucket === "indefinido"`.
  const semLeituraParcial = (uf: EdgeUfRow): boolean =>
    viewMode === "parcial" && uf.pct_apurado === 0;
  const liderIdDe = (uf: EdgeUfRow): number | undefined =>
    semLeituraParcial(uf) ? undefined : liderIdPorBase(uf, viewMode);

  return (
    <figure className="w-full" aria-labelledby="hex-cartogram-title">
      {/* biome-ignore lint/a11y/useSemanticElements: `<fieldset>` não existe em SVG; `role="group"` é deliberado — ver comentário abaixo */}
      <svg
        // `role="group"`, NÃO `role="img"`. Este SVG contém 27 links (um por
        // UF) e `role="img"` declara ao leitor de tela que o elemento é uma
        // imagem única, sem partes interativas — os links ficam presos dentro
        // de algo que afirma não tê-los. O axe classifica como
        // `nested-interactive`, serious, WCAG 4.1.2; medido em 2026-09-10 nas
        // quatro combinações de viewport × tema da `/governador`.
        // O nome acessível não se perde: vem do mesmo `aria-labelledby`, e o
        // `<figure>` externo também o carrega.
        //
        // O biome sugere trocar por `<fieldset>` — impossível: `<fieldset>` não
        // existe dentro de SVG, e tampouco é um agrupamento de campos de
        // formulário. Falso-positivo; daí a supressão acima.
        role="group"
        aria-labelledby="hex-cartogram-title hex-cartogram-desc"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
      >
        <title id="hex-cartogram-title">
          Mapa do Brasil em hexágonos — 27 UFs, cores por líder da corrida
        </title>
        <desc id="hex-cartogram-desc">
          Cada hexágono representa uma unidade da federação com tamanho igual. A cor indica o
          candidato líder; cinza indica corrida ainda indefinida.
        </desc>
        {Object.entries(UF_HEX_POSITIONS).map(([sigla, pos]) => {
          const uf = rowsBySigla.get(sigla);
          const { x, y } = hexCenter(pos, hexRadius);
          const pts = hexPoints(x, y, hexRadius);
          const liderId = uf ? liderIdDe(uf) : undefined;
          const { fill, ink: textFill } = pintaHex(uf, candIndex, liderId);
          const lider = liderId != null ? candIndex.get(liderId) : undefined;
          // 2026-09-19 — o hexágono tem ~34 px de largura útil e já carrega a
          // sigla da UF por cima; a do partido é a segunda linha de texto
          // dentro dele. É o caso mais apertado do produto inteiro, e é
          // desenhado ⇒ abreviado.
          //
          // 🔴 `ariaText` logo abaixo NÃO abrevia — o nome acessível do
          // `<Link>` diz "REPUBLICANOS" enquanto o hexágono mostra "REP", e
          // essa divergência é aceita de propósito. A WCAG 2.5.3 (Label in
          // Name) fala do RÓTULO do controle: o rótulo deste link é a UF
          // ("SP"), que é idêntica nos dois canais e é o que alguém diria em
          // comando de voz. O partido é dado dentro do link, não o rótulo
          // dele. Ver a seção "Visto ≠ ouvido" em `lib/utils/sigla-partido.ts`.
          const partidoLabel = lider ? siglaExibicao(lider.partido) : "";
          const ariaText = uf
            ? `${sigla}${lider ? `, líder ${nomeExibicao(lider.nome, lider.sqcand)} (${lider.partido})` : ""}`
            : `${sigla}, sem dados`;
          const href = `/uf/${sigla.toLowerCase()}/governador`;
          // `textFill` sai de `pintaHex` junto com o `fill` — o par medido de
          // `partyChipInk`, nunca a luminância presumida de um rank. Ver a
          // docstring daquela função.

          return (
            <g key={sigla}>
              <Link href={href} aria-label={ariaText}>
                <polygon
                  points={pts}
                  fill={fill}
                  stroke="var(--color-bg)"
                  strokeWidth={1.5}
                  style={{ cursor: "pointer" }}
                />
                <text
                  x={x}
                  y={y - 2}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={700}
                  fill={textFill}
                  style={{ fontFamily: "var(--font-serif)", pointerEvents: "none" }}
                >
                  {sigla}
                </text>
                {partidoLabel && (
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor="middle"
                    fontSize={8}
                    fill={textFill}
                    style={{ fontFamily: "var(--font-sans)", pointerEvents: "none" }}
                  >
                    {partidoLabel}
                  </text>
                )}
              </Link>
            </g>
          );
        })}
      </svg>

      {/* Lista textual paralela (constituição § 4 + RNF-025): screen readers
          navegam 27 UFs sequencialmente como landmark <nav>. */}
      <nav aria-label="Navegação por UF — Governadores" className="sr-only">
        <ul>
          {Object.keys(UF_HEX_POSITIONS).map((sigla) => {
            const uf = rowsBySigla.get(sigla);
            const liderId = uf ? liderIdDe(uf) : undefined;
            const lider = liderId != null ? candIndex.get(liderId) : undefined;
            const liderText = lider
              ? `${nomeExibicao(lider.nome, lider.sqcand)} (${lider.partido}) líder`
              : "sem dados";
            return (
              <li key={sigla}>
                {/* `<Link>`, como os hexágonos logo acima: esta é a rota de
                    teclado e de leitor de tela para a mesma UF, e um `<a href>`
                    cru recarregaria o documento — derrubando a moldura
                    persistente do mapa (ADR-0033 § 1) só para quem navega
                    assim. */}
                <Link href={`/uf/${sigla.toLowerCase()}/governador`}>
                  {sigla}: {liderText}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </figure>
  );
}
