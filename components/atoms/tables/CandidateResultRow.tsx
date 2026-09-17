/**
 * components/atoms/tables/CandidateResultRow.tsx
 *
 * Linha de candidato com **parcial e projeção lado a lado** — o formato do
 * `CandidateRow` do kit Atlas Menna (`components/data/CandidateRow.jsx`),
 * adotado pelo ADR-0029 § 7 para as Camadas 2 (`<CandidateRanking>`) e 3
 * (`<MinorCandidatesList>`) do ADR-0017.
 *
 * Arquivo novo, e não uma reescrita de `components/atoms/tables/CandidateRow.tsx`:
 * aquele componente (RF-033, avatar + votos + %) segue em uso e com contrato
 * próprio. Este resolve outro problema — mostrar as duas bases ao mesmo
 * tempo.
 *
 * ## O que muda com o controle "Parcial / Projeção"
 *
 * **Nada sai do DOM.** Os dois percentuais ficam sempre visíveis, lado a
 * lado; o controle do shell só decide qual dos dois recebe ênfase
 * tipográfica, via os atributos `data-view-cell` lidos pela cascata de
 * `app/globals.css`. Isso mantém a regra central do ADR-0017 (todas as
 * camadas sempre presentes, sem collapsible) e é o que permite este
 * componente ser Server Component puro: a reação ao controle é CSS, não JS.
 *
 * A barra é a única parte exclusiva: exibir dois preenchimentos sobrepostos
 * seria ilegível, então `data-view-only` mostra o da base ativa. O traço
 * vertical na posição projetada continua visível nas duas bases — é a
 * distância entre "onde está" e "onde o modelo diz que termina", que é a
 * leitura que o § 8 da constituição pede.
 *
 * ## Cor
 *
 * A barra usa a cor de identidade do candidato (`cor`, token
 * `var(--color-cand-N)` — ADR-0013/ADR-0024): é preenchimento, não texto.
 * Os **números não são pintados com cor de partido**: quatro bases da paleta
 * reprovam contraste como texto (PSOL 2,08 · PSB 2,20 · Outros 2,39 ·
 * NOVO 2,72), e o token `--party-<slug>-text` que resolveria isso ainda não
 * existe. Até lá, parcial em `--text-primary` e projeção em `--accent-text`
 * (5,12:1 sobre `--paper-1`, o mesmo tom que o `<Panel>` já usa no kicker —
 * e não `--accent-strong`, 4,21:1, que reprovaria RNF-022).
 *
 * Server Component puro — sem `"use client"`.
 */

import type { CSSProperties } from "react";
import { CandidateAvatar } from "@/components/atoms/data/CandidateAvatar";
import { PartyTag } from "@/components/atoms/data/PartyTag";
import type { EdgeCandidate } from "@/lib/edge-config/types";
import { formatPercent, formatVotes, formatVotesCompact } from "@/lib/utils/format";
import { nomeExibicao } from "@/lib/utils/nome-candidato";

export interface CandidateResultRowProps {
  /** Posição exibida à esquerda. Normalmente `candidato.rank`. */
  rank: number;
  nome: string;
  partido: string;
  /** Token de cor do candidato (`var(--color-cand-N)`) — usado só no preenchimento. */
  cor: string;
  /** % apurado agora (0–100). */
  pctAtual: number;
  /** % projetado pelo modelo (0–100). */
  pctProjetado: number;
  /** Votos apurados. `null`/omitido → a linha de votos não aparece. */
  votos?: number | null;
  /** Densidade reduzida — usada na Camada 3 em telas estreitas (ADR-0017). */
  compact?: boolean;
  /**
   * Como a linha se apresenta. Um eixo, não três flags — as três diferenças
   * andam sempre juntas porque são a mesma decisão: "esta é a lista PRINCIPAL
   * da tela" ou "esta é uma camada de apoio".
   *
   *   `"densa"` (default) — o formato desde o ADR-0029 § 7: sigla em texto
   *     puro, votos abreviados ("15,2 mi"), percentuais em
   *     `--type-figure-sm`. É o que as Camadas 2 e 3 do ADR-0017
   *     (`<CandidateRanking>`, `<MinorCandidatesList>`) e as duas rotas de UF
   *     usam hoje.
   *   `"kit"` — o `CandidateRow` do protótipo, medido contra ele em
   *     2026-09-09: `<PartyTag size="sm">` no lugar do texto puro, votos por
   *     extenso ("15.240.321 votos") e percentuais em 18px
   *     (`CandidateRow.jsx:17,20`). Usado pela lista do `<ResultPanel>`.
   *
   * O default fica em `"densa"` de propósito: trocá-lo mudaria quatro telas
   * que não estão no escopo desta passada.
   *
   * `compact` continua sendo o eixo de DENSIDADE e vale nas duas variantes —
   * no kit, uma linha compacta também volta para `--type-figure-sm`.
   *
   * A `<PartyTag>` entra na variante de **contorno**, que é segura em qualquer
   * cor: o rótulo é `--text-primary` (≥ 15:1 sobre papel) e só a borda e o
   * ponto recebem a cor do candidato — nenhum dos quatro tokens que reprovam
   * como texto (PSOL 2,08 · PSB 2,20 · Outros 2,39 · NOVO 2,72) vira tinta.
   */
  variant?: "densa" | "kit";
  /**
   * Miniavatar à esquerda do nome. **Ausente (default) = a linha de antes**,
   * sem caixa de foto — é o que `<CandidateRanking>` e `<MinorCandidatesList>`
   * continuam recebendo.
   *
   * Presente = a linha TEM a caixa do avatar, e `fotoUrl: null` a preenche com
   * as iniciais em vez da foto. Um objeto, e não um par de booleanos, porque
   * "a linha tem avatar" e "esta pessoa tem foto" são perguntas diferentes: a
   * primeira é da LISTA (se variasse por linha, os nomes desalinhariam entre si)
   * e a segunda é do candidato. Ver {@link candidatoFotoUrl} para as três
   * portas de `null`, todas normais.
   *
   * 🔴 **Vale em TODA densidade desde 14/09**, `compact` inclusive. Antes a
   * linha compacta era excluída para não crescer; o dono viu a tela, pediu foto
   * em todas e aceitou o custo de altura. Ver {@link AVATAR_LINHA_PX}.
   */
  avatar?: { fotoUrl: string | null; eager?: boolean };
}

/**
 * Diâmetro do miniavatar da linha de resultado, em px.
 *
 * **26, medido no navegador em 2026-09-14, não escolhido por gosto** — e é o
 * mesmo número da linha de identidade da fase pré
 * (`<CandidaturaIdentidadeRow>`), por coincidência de medida, não por cópia. Na
 * home, coluna de 400px (`--container-sidebar`, ADR-0033 § 1), a primeira faixa
 * do grid mede **38,05px** na linha normal (o empilhado nome + "N votos"), e o
 * avatar tem de caber nela sem esticá-la.
 *
 * O avatar entra DENTRO da célula do nome — e não como coluna própria do grid —
 * para que o afastamento até o nome seja `--space-2` (8px) em vez do
 * `--space-3` (12px) do `columnGap`. Numa célula de 171px, esses 4px são 4px de
 * nome.
 *
 * ## 🔴 A linha `compact` TAMBÉM recebe avatar — e o que isso custa
 *
 * Até 14/09 ela não recebia, e a razão registrada aqui era boa: na compacta o
 * problema não é altura, é LARGURA. O avatar cabe na altura (a 1ª faixa do grid
 * da linha compacta mede **26px exatos** — 55px de linha menos 16 de `padding`,
 * 1 de filete, 8 de `rowGap` e 4 de barra —, então os 26px do avatar não
 * esticam nada por si). O que estoura é a horizontal: `diâmetro + afastamento`
 * come 34px dos 171,2px da célula, e o `flex-wrap` empurra o selo do partido
 * para uma segunda linha. **55px viram 77,6px.**
 *
 * O dono viu a tela, pediu foto em todas as linhas e **aceitou esse custo**. O
 * comentário fica porque a medida continua verdadeira; o que mudou foi a
 * decisão sobre ela, não o número.
 *
 * ## 🔴 A regra de prioridade quando o nome não cabe: a linha cresce
 *
 * Este é o ponto que a versão anterior errava por omissão. A saída "truncar em
 * vez de crescer" foi medida ("WILSON GRASSI" ao lado do selo "DEMOCRATA"
 * ficaria com 38,7px — "WILS…") e é **pior que a linha alta**: a foto foi posta
 * na linha para tornar a pessoa identificável, e um nome cortado desfaz
 * exatamente isso. Por isso a truncagem sai onde há avatar (ver o `<span>` do
 * nome, mais abaixo) e o nome passa a quebrar.
 *
 * A troca é de graça nas três últimas linhas da home: ali o selo do partido já
 * desce para a segunda linha HOJE, sem avatar nenhum — o custo de altura já
 * estava pago antes de existir foto.
 *
 * A guarda de densidade sai, mas a de LISTA fica: sem `avatar`, nenhuma caixa é
 * desenhada, e é isso que mantém `<CandidateRanking>` e `<MinorCandidatesList>`
 * exatamente como estavam.
 */
const AVATAR_LINHA_PX = 26;

const KICKER: CSSProperties = {
  font: "var(--type-kicker)",
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
};

function clampPct(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

/**
 * Seta de direção do movimento parcial → projeção. Só aparece a partir de
 * 0,1pp: abaixo disso o percentual exibido (1 casa) é o mesmo nos dois
 * lados, e uma seta ali afirmaria um movimento que a tela não mostra.
 */
function deltaGlyph(delta: number): string {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.1) return "";
  return delta > 0 ? " ▲" : " ▼";
}

export function CandidateResultRow({
  rank,
  nome,
  partido,
  cor,
  pctAtual,
  pctProjetado,
  votos,
  compact = false,
  variant = "densa",
  avatar,
}: CandidateResultRowProps) {
  const atual = clampPct(pctAtual);
  const projetado = clampPct(pctProjetado);
  const atualLabel = formatPercent(atual, 1);
  const projLabel = formatPercent(projetado, 1);
  const glyph = deltaGlyph(projetado - atual);
  const kit = variant === "kit";

  // `CandidateRow.jsx:20` — 18px na linha normal, `--type-figure-sm` na
  // compacta. Medido contra o protótipo em 09/09: a linha densa desta base
  // saía a 13px onde o kit tem 18px, e era a única diferença tipográfica
  // restante entre as duas telas.
  const numeroStyle: CSSProperties =
    kit && !compact
      ? { font: "var(--type-figure)", fontSize: 18 }
      : { font: "var(--type-figure-sm)" };

  return (
    <div
      className="grid items-center"
      data-testid="candidate-result-row"
      style={{
        gridTemplateColumns: "1.5rem minmax(0, 1fr) auto auto",
        columnGap: "var(--space-3)",
        rowGap: "var(--space-2)",
        padding: compact ? "var(--space-2) 0" : "var(--space-3) 0",
        borderBottom: "1px solid var(--border-hairline)",
      }}
    >
      <span aria-hidden="true" style={{ font: "var(--type-data)", color: "var(--text-muted)" }}>
        {rank}
      </span>

      {/* O avatar é irmão do EMPILHADO nome+votos, não do nome: centrado contra
          a pilha inteira, ele fica na altura ótica da linha nas duas densidades.
          `flex-none` no átomo garante que ele não ceda largura quando o nome é
          longo — quem trunca é o nome, nunca a foto. */}
      <div className="flex min-w-0 items-center" style={{ gap: "var(--space-2)" }}>
        {avatar ? (
          <CandidateAvatar
            nome={nome}
            fotoUrl={avatar.fotoUrl}
            eager={avatar.eager}
            rounded
            responsive={false}
            width={AVATAR_LINHA_PX}
            height={AVATAR_LINHA_PX}
            /* Foto retrato 161×225 com o rosto no terço superior: centralizado,
               o círculo cortaria a testa.
               🔴 A palavra-chave `top`, NUNCA uma porcentagem — a varredura de
               vocabulário do RF-161 roda sobre o HTML renderizado e não
               distingue um `18%` dentro de um `style` de um percentual na tela.
               Ela já reprovou a linha de identidade por isso em 14/09. */
            style={{ objectPosition: "center top" }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          {/* `flex-wrap` (2026-09-09): a sigla é `flex-none` e come largura fixa
            do nome. Na coluna de 400px do `<AppShellSplit>` (ADR-0033 § 1) o
            nome recebe ~166px, e uma sigla longa — REPUBLICANOS, PODEMOS,
            SOLIDARIEDADE, todas reais em 2026 — não deixava nem isso: medido
            em `/uf/RS/governador` a 1280×900, "Gov RS REPUBLICANOS" precisava
            de 174px e recebia 49px, virando "Gov …".

            Com a quebra, a sigla desce para a segunda linha SÓ quando as duas
            não cabem juntas; enquanto couberem, a linha é idêntica à de antes
            — a home, onde as siglas são curtas, não muda em nenhuma linha. É
            um alívio condicional, não um layout novo. */}
          <div className="flex min-w-0 flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
            {/* 🔴 Com avatar, o nome QUEBRA; sem avatar, ele trunca como sempre.
                Não é gosto: a foto está ali para identificar a pessoa, e
                "WILS…" ao lado do rosto dela é a única combinação que piora as
                duas coisas ao mesmo tempo. Entre linha mais alta e nome
                ilegível, o dono escolheu a linha mais alta em 14/09.
                A truncagem NÃO é removida das listas sem avatar
                (`<CandidateRanking>`, `<MinorCandidatesList>`): lá ninguém pediu
                altura variável, e mexer nelas seria mudança fora do pedido.
                `minWidth: 0` porque, sem `overflow: hidden`, o `min-width: auto`
                do item flex passa a valer a MAIOR palavra e voltaria a empurrar
                a célula; `break-word` é o último recurso para um token único
                maior que a coluna — quebrar no meio da palavra ainda mostra o
                nome inteiro, e reticências não. */}
            <span
              // Testid próprio porque a diferença que importa aqui é de
              // CLASSE, não de texto: o nome inteiro está no DOM nos dois
              // casos, e é o `truncate` que decide se o leitor o vê. Sem um
              // seletor estável, o teste dessa distinção cairia num caminho de
              // classes utilitárias e passaria a medir o layout por acidente.
              data-testid="candidate-result-name"
              className={avatar ? "min-w-0" : "truncate"}
              style={{
                font: compact ? "var(--type-body-sm)" : "var(--type-body)",
                fontWeight: 500,
                ...(avatar ? { minWidth: 0, overflowWrap: "break-word" as const } : null),
              }}
            >
              {nome}
            </span>
            {kit ? (
              <span className="flex-none">
                <PartyTag color={cor} sigla={partido} size="sm" />
              </span>
            ) : (
              <span className="flex-none" style={{ ...KICKER, color: "var(--text-secondary)" }}>
                {partido}
              </span>
            )}
          </div>
          {votos != null && !compact ? (
            <div style={{ font: "var(--type-data)", color: "var(--text-muted)", marginTop: 2 }}>
              {kit ? formatVotes(votos) : formatVotesCompact(votos)} votos
            </div>
          ) : null}
        </div>
      </div>

      {/* Parcial. `data-view-cell` é lido pela cascata do shell — o número
          continua no DOM e visível nas duas bases; só a ênfase muda. */}
      <div className="text-right" data-view-cell="parcial">
        {/* As cores passam por `--cell-ink`/`--cell-kicker` em vez de irem
            diretas no `style`: é o que permite à cascata do shell recuar a
            coluna inativa TROCANDO A COR, com contraste medido. Recuar por
            `opacity` (a primeira tentativa, 2026-09-08) compõe com a cor do
            filho e derrubou o rótulo para 2,27:1 — o axe pegou em 16 nós. */}
        <div style={{ ...numeroStyle, color: "var(--cell-ink, var(--text-primary))" }}>
          {atualLabel}
        </div>
        <div style={{ ...KICKER, color: "var(--cell-kicker, var(--text-muted))", marginTop: 3 }}>
          parcial
        </div>
      </div>

      <div className="text-right" data-view-cell="proj" style={{ minWidth: "3.5rem" }}>
        <div style={{ ...numeroStyle, color: "var(--cell-ink, var(--accent-text))" }}>
          {projLabel}
        </div>
        <div style={{ ...KICKER, color: "var(--cell-kicker, var(--accent-text))", marginTop: 3 }}>
          proj.{glyph}
        </div>
      </div>

      {/* Barra: preenchimento exclusivo da base ativa (`data-view-only`), com
          o traço da projeção sempre visível. `aria-hidden` porque o mesmo dado
          já está nos dois números acima, em texto — uma progressbar aqui
          faria o leitor de tela repetir o percentual três vezes por linha. */}
      <div
        aria-hidden="true"
        style={{
          gridColumn: "2 / -1",
          position: "relative",
          height: 4,
          overflow: "hidden",
          borderRadius: "var(--radius-xs)",
          background: "var(--surface-sunken)",
        }}
      >
        <div
          data-view-only="parcial"
          style={{ position: "absolute", inset: 0, width: `${atual}%`, background: cor }}
        />
        <div
          data-view-only="proj"
          style={{ position: "absolute", inset: 0, width: `${projetado}%`, background: cor }}
        />
        <div
          style={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `${projetado}%`,
            width: 2,
            background: "var(--accent-strong)",
          }}
        />
      </div>
    </div>
  );
}

/**
 * O que este adaptador realmente lê de um candidato.
 *
 * É o subconjunto comum a `EdgeCandidate` (payload nacional) e a
 * `EdgeUfCandidate` (drill-down de UF): o segundo é, por definição do
 * `lib/edge-config/types.ts`, um subset do primeiro — não tem `p_vitoria`,
 * `p_passa_2t`, `p_fecha_1t`, os limites do CI nem **`rank`**. Nenhum desses
 * campos é usado aqui.
 *
 * Declarar o subconjunto (em vez de exigir `EdgeCandidate`) é o que permite as
 * rotas de UF reaproveitarem `<ResultPanel>` sem uma segunda variante do
 * painel. `rank` fica opcional exatamente porque a UF não o tem — daí o
 * `fallbackRank` abaixo deixar de ser um caso de payload legado e passar a ser
 * o caminho normal daquelas rotas.
 */
export type CandidateResultRowSource = Pick<
  EdgeCandidate,
  "nome" | "partido" | "cor" | "pct_atual" | "pct_projetado" | "votos_atuais"
> & {
  rank?: number;
  /**
   * `SQ_CANDIDATO`. Entrou no `Pick` em 14/09 por UM motivo: é o que
   * {@link nomeExibicao} precisa para aplicar a decisão editorial do dono.
   * Opcional porque só o cargo 1 o carrega no bloco nacional (RF-145); sem ele
   * a regra objetiva de prefixo ainda roda. **Não** endereça a foto por aqui —
   * a foto entra pela prop `avatar`, que quem monta a lista resolve, porque só
   * a página sabe de que UF a corrida é.
   */
  sqcand?: string;
};

/**
 * Adaptador para o shape do payload — evita repetir o mesmo mapeamento em
 * `<CandidateRanking>`, `<MinorCandidatesList>` e `<ResultPanel>`.
 *
 * `rank` cai para `fallbackRank` em dois casos: payloads nacionais pré-S05,
 * que não traziam a chave (o array já vinha ordenado por `pct_projetado` desc
 * desde a S04), e o payload de UF, que **nunca** a traz. Nos dois, quem chama
 * é responsável por passar o array já na ordem do ranking — o índice + 1 É o
 * rank exibido.
 */
export function candidateResultRowProps(
  candidato: CandidateResultRowSource,
  fallbackRank: number,
  compact = false,
): CandidateResultRowProps {
  return {
    rank: candidato.rank ?? fallbackRank,
    // 🔴 Ponto de estrangulamento do nome: as três listas de resultado do
    // produto passam por aqui. Converter neste ponto é o que garante que a
    // home, o ranking e a lista de menores digam o MESMO nome — foi a cor que
    // divergiu entre telas em 12/09 por não ter um ponto assim.
    nome: nomeExibicao(candidato.nome, candidato.sqcand),
    partido: candidato.partido,
    cor: candidato.cor,
    pctAtual: candidato.pct_atual,
    pctProjetado: candidato.pct_projetado,
    votos: candidato.votos_atuais ?? null,
    compact,
  };
}
