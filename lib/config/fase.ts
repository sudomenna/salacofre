/**
 * lib/config/fase.ts
 *
 * **O único lugar do produto autorizado a perguntar em que fase a corrida
 * está.** Lado de leitura da spec 019 e do
 * [ADR-0043](../../docs/architecture/adrs/0043-fase-pre-eleicao-campo-proprio-nao-derivada.md).
 *
 * ## O problema que este módulo fecha
 *
 * O produto inteiro foi construído sob a premissa de que existe apuração. Os
 * textos, os rótulos, os intervalos de confiança, o selo do topo, a cor do
 * mapa: todos assumem que há voto. Alimentar essa máquina com zeros não
 * produz "um placar vazio" — produz nove afirmações falsas medidas em
 * 2026-09-13, entre elas "Todas as unidades federativas estão com a apuração
 * concluída", "Fulano vence no 1º turno — 0%" e um intervalo de confiança de
 * 95% `[0,0; 0,0]`, que é a forma tipográfica da certeza absoluta.
 *
 * Nenhuma delas é bug: são a consequência correta do código existente
 * processando um payload de **forma válida** e significado que ele nunca foi
 * escrito para representar. `fase` é como o payload diz "este placar está
 * zerado por não ter começado, não porque tudo empatou em zero", e este
 * módulo é o único ponto que lê esse campo.
 *
 * ## 🔴 As quatro fontes proibidas
 *
 * A fase vem **do campo `fase`, e de nada mais**. Cada alternativa abaixo é
 * mais natural de escrever do que a certa, e cada uma tem um modo de falha
 * que custa a noite de 04/10:
 *
 * | fonte tentadora           | o que ela quebra                                  |
 * |---------------------------|---------------------------------------------------|
 * | `pct_apurado_total === 0` | Às 20h01 o valor real é **0,01** — zero *medido* — e por alguns minutos antes disso ele passa por `0` com o orchestrator já rodando. A tela voltaria ao modo "a eleição não começou" no minuto exato em que ela começa. |
 * | `por_uf.length === 0`     | Mesmo defeito deslocado: uma falha parcial de ingestão no meio da noite acenderia a fase pré. |
 * | `composition.pre_election`| Constante nos quatro emissores hoje (já não mede fase); e quando a spec 008 o tornar peso dinâmico ele valerá ~0,95 em plena apuração. Rede de segurança de mão única. |
 * | data de calendário        | `revalidate` congela o relógio no build: uma página gerada em 03/10 continuaria dizendo "ainda não começou" depois de 05/10. E a data não sabe se o orchestrator de fato começou a gravar. |
 *
 * `tests/unit/config/fase.test.ts` varre `app/` e `components/` e falha se o
 * literal `"pre_eleicao"` aparecer fora deste módulo, de
 * `lib/edge-config/types.ts` e do semeador — a asserção é **negativa** de
 * propósito: a positiva ("o módulo é importado") passaria com uma comparação
 * literal solta num componente ao lado.
 *
 * ## As três propriedades herdadas do molde
 *
 * Molde: `lib/config/dado-freshness.ts`, o lado de leitura do ADR-0038.
 *
 * 1. **Zero I/O.** Funções puras sobre o JSON que já chegou. Nenhuma query,
 *    nenhuma chamada ao TSE, nenhum `Date.now()` — constituição § 9.
 * 2. **Decidido no servidor.** O veredito viaja como prop; não há estado de
 *    cliente, não há `useEffect`, nenhuma rota deixa de ser pré-renderizada.
 * 3. **Guarda própria**, acima.
 */

/**
 * As duas fases possíveis. Não há terceira, e `"normal"` **nunca** é escrito
 * no payload — ele é o que a ausência do campo significa.
 */
export type Fase = "pre_eleicao" | "normal";

/**
 * O literal que o semeador grava. Existe como constante para que o resto do
 * repositório nunca precise escrever a string à mão — e para que a varredura
 * do teste de guarda tenha um único dono legítimo.
 */
export const FASE_PRE_ELEICAO = "pre_eleicao" as const;

/**
 * Qualquer coisa que **possa** carregar o campo. Deliberadamente estrutural e
 * não `EdgePayload`: os quatro payloads do produto (nacional, UF, deputado, e
 * o que o semeador monta antes de existir como tipo) passam por aqui, e um
 * parâmetro amarrado a um deles só empurraria `as` para os call sites.
 */
export interface ComFase {
  fase?: string | null;
}

/**
 * A fase de um payload. **Ausência do campo é fase normal** — que é o estado
 * de todo payload real de apuração, hoje e depois de 04/10.
 *
 * `null` devolve `"normal"`, e é deliberado: uma página **sem payload** não
 * está em fase pré por este caminho. Ela está no ramo de espera, que é outra
 * coisa — a faixa de aviso lá é decisão do chamador, não deste módulo
 * (design 019 § D5). Se `faseDoPayload(null)` devolvesse `"pre_eleicao"`, uma
 * falha de rede no Global Config viraria uma afirmação sobre o calendário
 * eleitoral, que é exatamente o que o RNF-010 desaconselha.
 *
 * Qualquer outro valor também devolve `"normal"`: um produtor que mande
 * `fase: "normal"`, `fase: ""` ou `fase: "pre-eleicao"` (com hífen) não liga
 * o modo. A comparação é por igualdade exata com {@link FASE_PRE_ELEICAO},
 * nunca por "tem alguma coisa no campo".
 */
export function faseDoPayload(payload: ComFase | null | undefined): Fase {
  return payload?.fase === FASE_PRE_ELEICAO ? FASE_PRE_ELEICAO : "normal";
}

/**
 * Atalho booleano de {@link faseDoPayload}, que é a forma que quase todo call
 * site quer: `{!isPreEleicao(payload) && <RemainingPanel … />}`.
 *
 * ⚠️ A supressão é decisão do **chamador**, nunca do componente. Um
 * `if (isPreEleicao(p)) return null` dentro de `RemainingPanel` poria a regra
 * de fase em quatro arquivos e desfaria o ponto único que este módulo existe
 * para ser — foi exatamente assim que a guarda de zero do mapa nacional
 * acabou dentro do ramo `viewMode === "parcial"`, onde ela cobre uma das seis
 * combinações e some nas outras cinco.
 */
export function isPreEleicao(payload: ComFase | null | undefined): boolean {
  return faseDoPayload(payload) === FASE_PRE_ELEICAO;
}
