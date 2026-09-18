/**
 * lib/utils/rank-parcial.ts
 *
 * Ponto ÚNICO da derivação do rank de candidaturas numa UF.
 *
 * Extraído em 2026-09-17 (spec 020, passo 0b) de três cópias byte-idênticas
 * que viviam em `app/(pres)/uf/[sigla]/page.tsx`,
 * `app/(gov)/uf/[sigla]/governador/page.tsx` e
 * `app/(sen)/uf/[sigla]/senador/page.tsx`.
 *
 * Determinismo (constituição § 6): função pura, sem `Date`, sem random.
 */

import type { EdgeUfCandidate } from "@/lib/edge-config/types";

/**
 * DERIVAÇÃO DO RANK — a ordem deste array É o rank exibido.
 *
 * `EdgeUfCandidate` (interface em `lib/edge-config/types.ts`) é, por
 * definição, um subset do `EdgeCandidate` nacional: tem `votos_atuais`,
 * `pct_atual`, `pct_projetado` e `ci95`, mas **não tem `rank`**. O
 * `<ResultPanel>` cai no índice do array quando a chave está ausente
 * (`candidateResultRowProps(c, i + 1)`), e lê `candidatos[0]`/`[1]` como líder
 * e 2º colocado para a figura de margem e para a barra de maioria. Ou seja:
 * ordenar aqui é derivar o rank. Na rota de Senador é também esta ordem que
 * decide quem ocupa vaga e onde fica o corte.
 *
 * Critério primário: **`pct_atual` desc** — o resultado APURADO, que é o
 * número que o leitor confere contra o boletim do TSE, e é sobre `pct` que o
 * protótipo ordena (`ui_kits/atlas-menna/App.jsx:22`, `rows[0]`/`rows[1]`).
 *
 * Dois desempates, e nenhum é cosmético:
 *
 *   1. `pct_projetado` desc. Antes da primeira zona apurada TODOS os
 *      `pct_atual` valem 0 e o critério primário não separa ninguém; sem este
 *      desempate a ordem cairia na do array de origem e a página abriria a
 *      noite eleitoral com um "líder" arbitrário — na numeração, na margem e
 *      na barra. `pct_projetado` carrega o prior pré-eleitoral e é a única
 *      leitura disponível nesse instante. (Era o critério primário até 09/09.)
 *   2. `id` asc — desempate estável final, a mesma convenção do payload
 *      nacional (`EdgeNational.candidatos`).
 *
 * 🔴 **A spec 020 depende deste ser o PONTO ÚNICO.** O produtor Python vai
 * portar este mesmo comparador para escolher as 4 candidaturas que entram no
 * gráfico de evolução da apuração, e um teste compara os dois lados. Se o
 * critério mudar aqui e não lá (ou o contrário), o gráfico passa a mostrar um
 * conjunto de candidaturas diferente do que a tabela ranqueia logo acima dele
 * — divergência silenciosa, sem erro em lugar nenhum. Qualquer alteração de
 * critério tem que ser feita nos dois lugares no mesmo commit.
 */
export function rankByParcial(candidatos: readonly EdgeUfCandidate[]): EdgeUfCandidate[] {
  return [...candidatos].sort((a, b) => {
    if (b.pct_atual !== a.pct_atual) return b.pct_atual - a.pct_atual;
    if (b.pct_projetado !== a.pct_projetado) return b.pct_projetado - a.pct_projetado;
    return a.id - b.id;
  });
}
