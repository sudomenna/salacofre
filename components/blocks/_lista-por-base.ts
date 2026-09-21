/**
 * components/blocks/_lista-por-base.ts
 *
 * O contrato compartilhado entre `<ResultPanel>`/`<CandidateListCollapse>` (que
 * marcam a lista) e `<ReordenaListaPorBase>` (que a reordena).
 *
 * ## 🔴 Por que este arquivo existe, e por que NÃO tem `"use client"`
 *
 * Na primeira versão, `ATRIBUTO_LISTA` e `reordenarLista` moravam dentro de
 * `ReordenaListaPorBase.tsx`, que é `"use client"`. `<ResultPanel>` é Server
 * Component e importava a constante de lá. Parecia inofensivo — é uma string.
 *
 * Não é. **O Next transforma TODA exportação de um módulo `"use client"` numa
 * referência de cliente**, inclusive constantes. No servidor,
 * `ATRIBUTO_LISTA` deixava de ser `"data-lista-por-base"` e virava um stub que
 * lança `"Attempted to call ATRIBUTO_LISTA() from the server"`. Esse stub foi
 * usado como NOME DE ATRIBUTO na `<ol>`, e o navegador acusou três erros em
 * sequência: `Invalid attribute name`, `React does not recognize the prop` e
 * um `hydration mismatch`. A lista não recebia o atributo e não reordenava.
 *
 * ⚠️ **Nenhum teste pegou, e não podia pegar**: no vitest não existe fronteira
 * RSC — o import é um import normal e a constante é a string. O defeito só
 * existe sob o build/dev do Next. O que guarda esta separação hoje é o caso
 * "o módulo do contrato não é `use client`" em
 * `tests/unit/components/ReordenaListaPorBase.test.tsx`, que lê o arquivo.
 *
 * Regra geral que vale levar: **valor compartilhado entre servidor e cliente
 * mora num módulo SEM diretiva**, importado pelos dois lados.
 */

/**
 * Marca o `<ol>` cujas linhas devem seguir a base ativa.
 *
 * 🔴 A lista de IDENTIDADE (`data-testid="result-identidade-lista"`, fase pré)
 * **não** recebe este atributo, e isso é constitucional, não esquecimento: sem
 * voto contado não há métrica do leitor para seguir, e a constituição § 2
 * (v1.5) mantém a ordem fixa fora do caso do controle de base — ali é o número
 * na urna (spec 019, RF-161). A exceção da v1.5 é expressa e não a alcança.
 */
export const ATRIBUTO_LISTA = "data-lista-por-base";

/** A posição da linha na base pedida, lida da custom property inline. */
function posicaoNaBase(li: HTMLElement, base: "parcial" | "proj"): number {
  const bruto = li.style.getPropertyValue(`--ord-${base}`).trim();
  const n = Number.parseInt(bruto, 10);
  // Linha sem a propriedade fica no fim sem embaralhar as demais (`sort` é
  // estável no V8). Não é caso esperado — `ResultPanel` sempre emite as duas —,
  // mas um `NaN` no comparador embaralharia a lista inteira em silêncio.
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/**
 * Reordena uma lista **no DOM**, na base pedida, preservando o foco.
 *
 * Idempotente: chamar duas vezes na mesma base não toca no DOM, o que é o que
 * permite montar `<ReordenaListaPorBase>` mais de uma vez por página sem
 * coordenação entre as instâncias.
 *
 * 🔴 **O foco precisa ser devolvido.** Medido no Chrome em 2026-09-20: mover o
 * `<li>` que contém o elemento focado joga `document.activeElement` para o
 * `<body>` — quem navega por teclado perde o lugar ao trocar de base.
 * `preventScroll: true` porque, sem a flag, devolver o foco rola a página até
 * o elemento e trocar de base daria um salto de rolagem que ninguém pediu.
 */
export function reordenarLista(lista: HTMLElement, base: "parcial" | "proj"): void {
  const linhas = [...lista.children].filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.tagName === "LI",
  );
  if (linhas.length < 2) return;

  const alvo = [...linhas].sort((a, b) => posicaoNaBase(a, base) - posicaoNaBase(b, base));
  // Já está na ordem certa? Sai sem tocar no DOM — e sem mexer no foco.
  if (alvo.every((li, i) => li === linhas[i])) return;

  const focado = document.activeElement;
  // `append` com a lista inteira move os nós existentes na ordem dada, numa
  // única operação. Não clona: os mesmos nós, com o mesmo estado e os mesmos
  // ouvintes, mudam de lugar.
  lista.append(...alvo);

  if (
    focado instanceof HTMLElement &&
    focado !== document.body &&
    lista.contains(focado) &&
    typeof focado.focus === "function"
  ) {
    focado.focus({ preventScroll: true });
  }
}
