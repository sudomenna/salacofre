"use client";

/**
 * components/blocks/MunicipioTable.tsx
 *
 * RF-037 — a lista de municípios de uma UF: **ordenada por eleitorado** e
 * **paginada**. Começa com os 20 maiores colégios eleitorais e acrescenta 40 a
 * cada toque em "mostrar mais", até chegar aos 645 de São Paulo.
 *
 * ## 2026-09-20 — um modo só, no lugar de dois
 *
 * Até hoje este arquivo respondia de duas formas incompatíveis:
 *
 *   - `mode="default"` (rota presidencial): **todos** os municípios, numa
 *     janela de rolagem virtualizada de 480px — `rows.slice(startIndex,
 *     endIndex)` com spacers de altura fixa, ~24 linhas no DOM de cada vez,
 *     em ordem de PAYLOAD (que não é ordem nenhuma que o leitor reconheça).
 *   - `mode="top-by-eleitorado"` (rota de governador): **8** municípios, corte
 *     duro por `.slice(0, topN)`, ordenados com a capital forçada ao topo.
 *
 * O dono pediu a mesma lista nas três rotas de estado (Presidente, Governador
 * e Senador). Os dois modos foram SUBSTITUÍDOS por este, e não somados a ele,
 * por três razões:
 *
 *   1. **Virtualização e paginação não convivem.** As duas fatiam o mesmo
 *      array e as duas mandam na altura do contêiner. Juntas, a mesma tela
 *      responderia de três jeitos à mesma pergunta ("quantos municípios
 *      existem e quais eu estou vendo?").
 *   2. **A coluna "Δ vs 2022" do modo antigo nunca teve dado.** Nenhum dos
 *      dois `toMunicipioRows` (rota presidencial e de governador) preenchia
 *      `deltaVs2022` — o campo era opcional e ninguém o escrevia, então a
 *      coluna renderizava "—" em 100% das linhas em produção. Saiu junto com
 *      o modo.
 *   3. **A rolagem interna era um poço no celular.** `height: 480` +
 *      `contain: strict` cria uma área rolável dentro de uma página rolável:
 *      no toque, o dedo escolhe entre as duas por acidente. Sem virtualização
 *      não há contêiner rolável, e a página inteira rola como o leitor espera.
 *
 * ## A ordem mudou: eleitorado puro, e a capital perdeu o privilégio
 *
 * 🔴 **A regra "capital sempre em primeiro" (decisão E4 do plano de 11/09) foi
 * REVOGADA aqui, de propósito.** O pedido do dono, em 2026-09-20, é literal:
 * "os 20 maiores municípios em número de eleitores". Uma capital pequena
 * empurrada ao topo faria a primeira linha desmentir o título da lista. A
 * capital continua marcada com o kicker `· capital` ao lado do nome — o que
 * ela perdeu foi a posição, não a identidade. Quem for "consertar" isto de
 * volta: leia este parágrafo antes, é uma troca deliberada.
 *
 * ## Município nunca some por falta de eleitorado
 *
 * `EdgeUfMunicipio.eleitores` é **opcional** (ADR-0035 D2): um payload gravado
 * antes da migration 0006 é legítimo e não traz o campo. O modo antigo fazia
 * `filter(r => r.eleitorado != null)` e, com isso, transformava "todos os
 * municípios" em "nenhum município" diante de um payload legado. Aqui o filtro
 * não existe:
 *
 *   - quem tem eleitorado é ordenado por ele, do maior para o menor;
 *   - quem não tem vai para o FIM da lista, na ordem de entrada;
 *   - se NINGUÉM tiver, a lista degrada para a ordem de origem — estável,
 *     completa, e com a legenda dizendo por que a ordem é essa
 *     (constituição § 8: o leitor precisa saber o que está vendo).
 *
 * Em nenhum desses estados a lista fica vazia.
 *
 * ## Por que remover nós do DOM é permitido AQUI
 *
 * O [ADR-0017](../../docs/architecture/adrs/0017-transparencia-total-3-camadas.md)
 * exige que as três camadas visuais estejam "sempre presentes no DOM (sem
 * `display:none`, sem `hidden`, sem `<details>`)", e o
 * [ADR-0034](../../docs/architecture/adrs/0034-resultpanel-colapso-visual-corte-fora-do-kit.md)
 * (D21) generaliza a MECÂNICA de colapso. Os
 * dois falam de **candidaturas**: a palavra "município" não aparece uma vez no
 * ADR-0017, e o que ele protege é que nenhuma candidatura desapareça da
 * narrativa de quem usa leitor de tela ou a busca da página.
 *
 * A lista de municípios nunca esteve sob essa regra, e na prática já removia
 * nós antes desta mudança, nos DOIS modos (`slice` da virtualização e `slice`
 * do topN) — sem ADR, porque ninguém entendeu que a proibição a alcançava. O
 * que esta implementação garante no lugar:
 *
 *   - `aria-rowcount` é o **total real** de municípios, não o carregado;
 *   - o rótulo do botão diz quantos faltam, em número;
 *   - a linha de status declara "mostrando N de M" e é uma região viva.
 *
 * Assim, quem não vê a tela sabe o tamanho da lista e sabe que há mais.
 *
 * ## O que saiu de cada linha
 *
 * As colunas são três, e isso é um corte consciente: a largura útil no celular
 * a 360px é ~328px, e as quatro colunas do modo antigo reservavam 264px fixos,
 * sobrando ~64px para o NOME — "São Bernardo do Campo" cabia como "São Be…".
 *
 *   - **Eleitorado** virou subtítulo sob o nome (era coluna no modo de
 *     governador). Ele é a chave da ordenação e por isso precisa estar visível
 *     — uma lista ordenada por um número invisível parece aleatória.
 *   - **Votos** saiu da tabela (era coluna no modo presidencial). O número por
 *     candidatura está a um toque de distância, na folha do município
 *     (`<MunicipioExplorer>`), e também no balão do mapa ao lado.
 *   - **Δ vs 2022** saiu: nunca teve produtor (ver acima).
 *
 * ## Foco depois de "mostrar mais"
 *
 * Enquanto sobram municípios, o botão NÃO é desmontado — só o rótulo muda —,
 * então o foco do teclado fica onde estava, no próprio botão. No clique que
 * esgota a lista o botão sai do DOM, e aí o foco iria para o `<body>`: por
 * isso, e só nesse caso, ele é movido para a linha de status, que acabou de
 * anunciar "Mostrando 645 de 645 municípios".
 *
 * ## A11y
 *   - `<table>` semântico. `aria-rowcount` com o total, `aria-rowindex` em
 *     cada linha (1-based, cabeçalho é 1).
 *   - Nenhum `sr-only` numa `<table>` — ver
 *     `tests/unit/design-system/sr-only-tabela.test.ts`.
 *   - O nome vira `<button>` de altura `--tap-min` quando há `onSelect`.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Button } from "@/components/atoms/controls/Button";

export interface MunicipioRow {
  cod_ibge: string;
  nome: string;
  /** ID do candidato líder no município. */
  lider: number;
  /** Cor do líder (token CSS). */
  liderCor: string;
  /** Sigla curta do líder pra exibir na coluna "margem". */
  liderNome: string;
  /** Margem em pp (sempre positiva — quem está na frente é `lider`). */
  margemPp: number;
  /** % apurado 0–100. */
  pctApurado: number;
  /**
   * Votos totais reportados no município.
   *
   * ⚠️ **Não é renderizado por esta tabela desde 2026-09-20** — ver "O que saiu
   * de cada linha" no cabeçalho. Segue no tipo porque os dois adaptadores
   * `toMunicipioRows` continuam produzindo o número e porque ele é o candidato
   * natural a uma quarta coluna no desktop, se o dono pedir de volta. Opcional
   * para que nenhum caller seja obrigado a computá-lo só para preencher.
   */
  votosReportados?: number;
  /**
   * Total de eleitores do município (não confundir com `votosReportados`).
   * **É a chave de ordenação da lista.** Opcional de propósito: payload
   * gravado antes da migration 0006 é legítimo e não traz o campo — nesse
   * caso o município vai para o fim da lista, nunca para fora dela.
   */
  eleitorado?: number;
  /**
   * `true` quando o município é a capital da UF. Vem de
   * `EdgeUfMunicipio.capital` (ADR-0035 D2), que é emitido **só quando
   * verdadeiro** — ausência significa "não é capital", não "desconhecido".
   *
   * Desde 2026-09-20 é **puramente informativo**: rende o kicker `· capital`
   * ao lado do nome e nada mais. A regra que a punha em primeiro lugar foi
   * revogada — ver o cabeçalho.
   */
  capital?: boolean;
}

/** Quantos municípios a lista mostra antes do primeiro "mostrar mais". */
export const MUNICIPIOS_PRIMEIRA_LEVA = 20;
/** Quantos municípios cada "mostrar mais" acrescenta. */
export const MUNICIPIOS_POR_LOTE = 40;

export interface MunicipioTableProps {
  rows: MunicipioRow[];
  /** Tamanho da primeira leva. Default {@link MUNICIPIOS_PRIMEIRA_LEVA}. */
  inicial?: number;
  /** Tamanho de cada leva seguinte. Default {@link MUNICIPIOS_POR_LOTE}. */
  lote?: number;
  /**
   * Quando presente, o nome do município vira um `<button>` que devolve o
   * `cod_ibge` ao caller (tipicamente `<MunicipioExplorer>`, que abre a folha
   * do município no `<Sheet>`).
   *
   * Ausente, a tabela renderiza texto puro, sem nenhum nó interativo a mais.
   * As duas formas coexistem de propósito: nem toda superfície que mostra a
   * tabela precisa da folha.
   */
  onSelect?: (codIbge: string) => void;
}

function temEleitorado(r: MunicipioRow): r is MunicipioRow & { eleitorado: number } {
  return typeof r.eleitorado === "number" && Number.isFinite(r.eleitorado);
}

/**
 * Ordena por eleitorado **decrescente**, sem perder ninguém.
 *
 * Exportada para teste direto: é a regra que o dono pediu por escrito, e a
 * mutação que a troca por ordem alfabética precisa morrer em algum lugar
 * nomeado.
 *
 * Contrato:
 *   - quem tem eleitorado vem primeiro, do maior para o menor;
 *   - empate preserva a ordem de entrada (`Array.prototype.sort` é estável
 *     desde ES2019);
 *   - quem não tem eleitorado vai para o fim, na ordem de entrada;
 *   - `rows` nunca encolhe: `saída.length === entrada.length`, sempre.
 */
export function ordenarPorEleitorado(rows: readonly MunicipioRow[]): MunicipioRow[] {
  // `com` carrega a narrowing do type guard: sem isso o `sort` abaixo
  // precisaria de `?? 0`, e um `?? 0` é exatamente o tipo de default silencioso
  // que já mordeu este projeto três vezes.
  const com: Array<MunicipioRow & { eleitorado: number }> = [];
  const sem: MunicipioRow[] = [];
  for (const r of rows) {
    if (temEleitorado(r)) com.push(r);
    else sem.push(r);
  }
  com.sort((a, b) => b.eleitorado - a.eleitorado);
  return [...com, ...sem];
}

/**
 * Kicker `· capital` ao lado do nome, como o protótipo do kit
 * (`ui_kits/atlas-menna/App.jsx:140`). Fica DENTRO do rótulo do botão de
 * propósito: quem navega por teclado/leitor de tela ouve "São Paulo · capital"
 * de uma vez, em vez de um fragmento solto depois do alvo interativo.
 */
function CapitalKicker() {
  return (
    <span
      data-testid="municipio-capital"
      className="flex-none"
      style={{
        font: "var(--type-kicker)",
        letterSpacing: "var(--tracking-caps)",
        textTransform: "uppercase",
        color: "var(--text-muted)",
      }}
    >
      {/* Espaço explícito no texto: o `gap` do flex resolve o visual, mas
          `textContent` (leitor de tela, busca da página, teste) precisa do
          separador para não ler "Uberaba· capital". */}
      {" · capital"}
    </span>
  );
}

/**
 * Célula de nome do município. Vira botão quando há `onSelect`; caso
 * contrário mantém o `<span title>` de sempre.
 */
function NomeCell({
  nome,
  codIbge,
  capital,
  onSelect,
}: {
  nome: string;
  codIbge: string;
  capital?: boolean;
  onSelect?: (codIbge: string) => void;
}) {
  const conteudo = (
    <>
      <span className="truncate">{nome}</span>
      {capital ? <CapitalKicker /> : null}
    </>
  );

  if (!onSelect) {
    return (
      <span className="flex min-w-0 items-baseline" style={{ gap: "var(--space-1)" }} title={nome}>
        {conteudo}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="municipio-open"
      data-cod={codIbge}
      onClick={() => onSelect(codIbge)}
      title={nome}
      className="flex w-full min-w-0 items-baseline text-left"
      style={{
        gap: "var(--space-1)",
        minHeight: "var(--tap-min)",
        border: 0,
        background: "transparent",
        padding: 0,
        color: "inherit",
        font: "inherit",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationColor: "var(--accent)",
        textUnderlineOffset: 2,
      }}
    >
      {conteudo}
    </button>
  );
}

function fmtVotos(v: number): string {
  return new Intl.NumberFormat("pt-BR").format(v);
}

function fmtPct(pct: number): string {
  const r = Math.round(pct * 10) / 10;
  return Number.isInteger(r) ? `${r}%` : `${r.toFixed(1)}%`;
}

/**
 * A legenda que explica a ordem. Três textos porque são três situações reais,
 * e colapsá-las mentiria em duas delas (constituição § 8).
 */
function textoDaOrdem(comEleitorado: number, total: number): string {
  if (total === 0) return "Nenhum município apurado até agora nesta corrida.";
  if (comEleitorado === 0) {
    return "Esta corrida não publica o eleitorado por município, então a lista segue a ordem em que o payload chega — nenhum município fica de fora.";
  }
  if (comEleitorado < total) {
    return "Ordenados pelo eleitorado do município, do maior para o menor. Os municípios cujo eleitorado o payload não publica ficam no fim da lista.";
  }
  return "Ordenados pelo eleitorado do município, do maior para o menor.";
}

export function MunicipioTable({
  rows,
  inicial = MUNICIPIOS_PRIMEIRA_LEVA,
  lote = MUNICIPIOS_POR_LOTE,
  onSelect,
}: MunicipioTableProps) {
  const [carregados, setCarregados] = useState(inicial);

  // Ajuste de estado durante o render — o idioma do React para "prop mudou,
  // estado derivado precisa voltar ao começo". Sem isto, ir de `/uf/SP` para
  // `/uf/MG` (mesmo componente de página, árvore preservada pelo App Router)
  // chegaria em MG já com os 60 de SP carregados. Não é `useEffect` de
  // propósito: um efeito pintaria a tela errada uma vez antes de corrigir.
  const [rowsAnteriores, setRowsAnteriores] = useState(rows);
  if (rowsAnteriores !== rows) {
    setRowsAnteriores(rows);
    setCarregados(inicial);
  }

  const ordenadas = useMemo(() => ordenarPorEleitorado(rows), [rows]);
  const comEleitorado = useMemo(() => rows.filter(temEleitorado).length, [rows]);

  const tabelaId = useId();
  const statusRef = useRef<HTMLParagraphElement | null>(null);
  // Só o clique que ESGOTA a lista move o foco — ver "Foco depois de
  // 'mostrar mais'" no cabeçalho.
  const moverFoco = useRef(false);

  // `carregados` não é LIDO no corpo — é o GATILHO. O efeito precisa rodar
  // depois do render que desmontou o botão, e é essa a única coisa que muda
  // entre os dois renders. Sem a dependência o efeito rodaria só na montagem e
  // o foco nunca se moveria: a regra do linter aponta para um `useRef` que o
  // React não sabe observar, não para uma dependência sobrando. Mesma forma do
  // `ufSigla` em `MunicipioExplorer.tsx`.
  // biome-ignore lint/correctness/useExhaustiveDependencies: carregados é gatilho, não leitura — ver acima
  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    statusRef.current?.focus();
  }, [carregados]);

  const total = ordenadas.length;
  const visiveis = Math.min(carregados, total);
  const lista = ordenadas.slice(0, visiveis);
  const restantes = total - visiveis;
  const proximoLote = Math.min(lote, restantes);

  function carregarMais() {
    const proximo = Math.min(total, visiveis + lote);
    moverFoco.current = proximo >= total;
    setCarregados(proximo);
  }

  return (
    <section aria-labelledby="municipios-heading" data-testid="municipios-lista">
      <h3
        id="municipios-heading"
        className="mb-2 text-lg"
        style={{ fontFamily: "var(--font-serif)", color: "var(--color-text)" }}
      >
        Municípios ({total.toLocaleString("pt-BR")})
      </h3>

      <p
        data-testid="municipios-ordem"
        style={{
          margin: "0 0 var(--space-3)",
          font: "var(--type-body-sm)",
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
        }}
      >
        {textoDaOrdem(comEleitorado, total)}
      </p>

      <table
        aria-rowcount={total}
        className="w-full border-collapse"
        id={tabelaId}
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col />
          <col style={{ width: "6rem" }} />
          <col style={{ width: "4.5rem" }} />
        </colgroup>
        <thead
          style={{
            backgroundColor: "var(--color-bg-muted)",
            color: "var(--color-text-muted)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <tr>
            <th
              scope="col"
              className="px-3 py-2 text-left text-xs uppercase tracking-wide font-normal"
            >
              Município
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
            >
              Margem
            </th>
            <th
              scope="col"
              className="px-3 py-2 text-right text-xs uppercase tracking-wide font-normal"
            >
              Apurado
            </th>
          </tr>
        </thead>
        <tbody>
          {lista.map((m, i) => (
            <tr
              key={m.cod_ibge}
              // 1-based, e o cabeçalho é o índice 1.
              aria-rowindex={i + 2}
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <td className="px-3 py-2 text-sm" style={{ color: "var(--color-text)" }}>
                <NomeCell
                  nome={m.nome}
                  codIbge={m.cod_ibge}
                  capital={m.capital}
                  onSelect={onSelect}
                />
                {/* O eleitorado é a chave da ordem: sem ele à vista, a lista
                    parece embaralhada. Ausente, a linha simplesmente não tem
                    subtítulo — inventar "0 eleitores" seria afirmar um número
                    que ninguém mediu (constituição § 8). */}
                {temEleitorado(m) ? (
                  <span
                    data-testid="municipio-sub"
                    className="block"
                    style={{ font: "var(--type-data)", color: "var(--text-muted)" }}
                  >
                    {fmtVotos(m.eleitorado)} eleitores
                  </span>
                ) : null}
              </td>
              <td
                className="px-3 py-2 text-right text-sm tabular-nums"
                style={{ color: m.liderCor, fontWeight: 500 }}
              >
                {m.liderNome} +{fmtPct(m.margemPp)}
              </td>
              <td
                className="px-3 py-2 text-right text-sm tabular-nums"
                style={{ color: "var(--color-text-muted)" }}
              >
                {fmtPct(m.pctApurado)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Região viva E alvo de foco. Ver "Foco depois de 'mostrar mais'". */}
      <p
        data-testid="municipios-status"
        ref={statusRef}
        role="status"
        tabIndex={-1}
        style={{
          margin: "var(--space-3) 0 0",
          font: "var(--type-data)",
          color: "var(--text-muted)",
        }}
      >
        Mostrando {visiveis.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}{" "}
        {total === 1 ? "município" : "municípios"}.
      </p>

      {restantes > 0 ? (
        <Button
          aria-controls={tabelaId}
          data-testid="municipios-carregar-mais"
          full
          onClick={carregarMais}
          // `md` = 44px (`--tap-min`): é alvo primário de toque no celular.
          size="md"
          style={{ marginTop: "var(--space-2)" }}
          variant="secondary"
        >
          Mostrar mais {proximoLote.toLocaleString("pt-BR")} · faltam{" "}
          {restantes.toLocaleString("pt-BR")}
        </Button>
      ) : null}
    </section>
  );
}
