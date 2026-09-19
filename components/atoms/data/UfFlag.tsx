/**
 * components/atoms/data/UfFlag.tsx
 *
 * As bandeiras das 27 unidades federativas, como **sprite `<symbol>` embutido**:
 * `<UfFlagSprite />` uma vez por documento, `<UfFlag sigla="SP" />` em cada
 * item da grade.
 *
 * ## Por que sprite embutido, e não `<img src>` de `public/` nem do Blob
 *
 * `/deputado-federal` tem orçamento de JavaScript de aplicação **zero**, e o
 * argumento inteiro do hemiciclo é não pagar rede. Vinte e sete `<img>`
 * acrescentariam 27 round-trips a essa tela; e uma falha de CDN na noite da
 * apuração produziria 27 imagens quebradas ao lado de um resultado eleitoral —
 * o pior momento possível para o produto parecer avariado. Embutido, cada item
 * custa ~70 bytes de `<use>`, os `<symbol>` saem uma vez, e não há requisição
 * que possa falhar.
 *
 * É a mesma razão que descarta `next/image` (Client Component no App Router,
 * traria runtime para uma tela que não tem nenhum — ver
 * `components/atoms/data/CandidateAvatar.tsx`), só que sem precisar do `<img>`.
 *
 * ## 🔴 O caminho SEM bandeira é o caminho normal, não a borda
 *
 * Em 2026-09-18 os 27 arquivos **não existem**: `UF_FLAGS` está vazio. Então
 * `<UfFlag>` devolve `null` — não um `<svg>` vazio, não um `<use>` órfão (que
 * renderiza uma caixa em branco e parece defeito), não um espaço reservado.
 * Nada. A grade de estados fica com o nome e a sigla em texto, sem buraco no
 * layout e sem ícone quebrado, e é **esse** o estado que vai ao ar até os
 * arquivos chegarem. Por isso ele é tratado como caminho principal e testado
 * como tal.
 *
 * ## Acessibilidade: a bandeira é decorativa, e tem de ser
 *
 * `aria-hidden="true"` + `focusable="false"`. O nome do estado por extenso
 * **e** a sigla continuam em texto ao lado — que é o que reconcilia esta
 * superfície com a justificativa de `UfLinksGrid.tsx` (RF-162/163: os dois
 * rótulos são texto). A bandeira não acrescenta informação; ela ajuda o
 * reconhecimento. Um `role="img"` com `aria-label="Bandeira de São Paulo"` faria
 * o leitor de tela anunciar o estado duas vezes por item, 27 vezes na página.
 *
 * `focusable="false"` não é redundante: sem ele, o IE/Edge legado punha cada
 * `<svg>` na ordem de tabulação, e o padrão continua sendo declará-lo em SVG
 * decorativo.
 */

import { UF_FLAGS } from "@/lib/data/uf-flags.generated";

/** `id` do `<symbol>` de uma UF. Um lugar só — o sprite e o `<use>` leem daqui. */
export function ufFlagSymbolId(sigla: string): string {
  return `uf-flag-${sigla.toUpperCase()}`;
}

/** Existe bandeira para esta sigla? É a guarda de existência, e é única. */
export function temBandeira(sigla: string): boolean {
  return Object.hasOwn(UF_FLAGS, sigla.toUpperCase());
}

/**
 * Os `<symbol>` de todas as bandeiras disponíveis, uma vez por documento.
 *
 * Devolve `null` quando não há nenhuma — um `<svg>` escondido e vazio no topo
 * de toda página seria lixo sem função.
 *
 * O `<svg>` hospedeiro fica com `display: none`: `<symbol>` nunca é pintado
 * diretamente, então esconder o hospedeiro não afeta os `<use>` que o
 * referenciam, e evita que ele ocupe uma linha em branco no fluxo.
 */
export function UfFlagSprite() {
  const siglas = Object.keys(UF_FLAGS).sort();
  if (siglas.length === 0) return null;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      data-testid="uf-flag-sprite"
      style={{ display: "none" }}
    >
      {siglas.map((sigla) => {
        const flag = UF_FLAGS[sigla];
        if (!flag) return null;
        return (
          <symbol
            key={sigla}
            id={ufFlagSymbolId(sigla)}
            viewBox={flag.viewBox}
            preserveAspectRatio="xMidYMid meet"
            // Conteúdo GERADO e validado por `scripts/gen-uf-flags.ts`, que
            // recusa `<script>`, `on*=`, `javascript:` e referência externa, e
            // prefixa todo `id` com `ufflag-<SIGLA>-`. Não é entrada de
            // usuário nem conteúdo remoto: é dado-fonte versionado no
            // repositório, do mesmo tipo de `party-official-hexes.json`.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG gerado e validado pelo próprio gerador — ver scripts/gen-uf-flags.ts
            dangerouslySetInnerHTML={{ __html: flag.corpo }}
          />
        );
      })}
    </svg>
  );
}

export interface UfFlagProps {
  sigla: string;
  /** Largura em px. A altura sai da proporção declarada no `<symbol>`. */
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A bandeira de uma UF, ou `null` se ela ainda não existe na fonte.
 *
 * Exige `<UfFlagSprite />` no mesmo documento — sem ele o `<use>` não resolve.
 */
export function UfFlag({ sigla, width = 21, height = 15, className }: UfFlagProps) {
  const chave = sigla.toUpperCase();
  if (!temBandeira(chave)) return null;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={className}
      data-testid="uf-flag"
      data-sigla={chave}
      width={width}
      height={height}
      style={{ flex: "none", display: "block" }}
    >
      <use href={`#${ufFlagSymbolId(chave)}`} />
    </svg>
  );
}
