/**
 * lib/config/malha-ibge.ts
 *
 * Fatos sobre a **malha municipal do IBGE** que não se derivam do ciclo de
 * apuração — mesmo espírito da seção "Fatos da eleição de 2026" de
 * `lib/config/cargos.ts`.
 *
 * ## Por que este arquivo existe
 *
 * A malha do IBGE **não contém só municípios**. Ela inclui corpos d'água
 * grandes como feições próprias, com código de 7 dígitos no mesmo formato de
 * um município. Quem trata "toda feição da malha" como município acaba
 * desenhando uma lagoa no mapa eleitoral, com hover, clique e ficha.
 *
 * O projeto já sabia disso desde que o mapeamento IBGE↔TSE foi escrito — mas o
 * conhecimento ficou preso em `data-pipeline/tse-mapping-reconcile.ts`, que é
 * a parte que conversa com o TSE. **O mapa e o gerador de simulação nunca
 * souberam**, e por isso a Lagoa dos Patos apareceu na tela do dono em
 * 2026-09-19 com "100% apurado · LULA · PT · 1 voto".
 *
 * Este módulo é a fonte única. Quem precisar da regra **importa daqui**; uma
 * segunda cópia é como as duas divergiriam, e a divergência só apareceria na
 * noite em que ela importa.
 */

/**
 * Códigos IBGE que estão na malha municipal mas **não são municípios**.
 *
 * São corpos d'água — não têm população, não têm eleitor, não têm código no
 * cadastro do TSE, e nunca vão receber dado de apuração.
 *
 * | código | o quê | UF |
 * |---|---|---|
 * | `4300001` | Lagoa Mirim | RS |
 * | `4300002` | Lagoa dos Patos | RS |
 *
 * ⚠️ **Os dois passam por qualquer filtro de UF baseado no prefixo do
 * código**: `Math.floor(4300001 / 100000) === 43`, que é o código do Rio
 * Grande do Sul. Recortar "os municípios do RS" pelo prefixo traz as duas
 * lagoas junto — foi exatamente assim que elas entraram no mapa.
 *
 * ## Esta lista NÃO se defende sozinha, e é por isso que há um teste
 *
 * Uma lista de dois códigos não pega o terceiro. Se o IBGE publicar uma malha
 * nova com outra feição d'água, nada aqui percebe. Quem percebe é
 * `tests/unit/lib/malha-ibge.test.ts`, que confere a contagem de feições por
 * UF contra {@link MUNICIPIOS_POR_UF} e **falha nomeando** o que apareceu.
 *
 * Esse teste falha também quando um município **legítimo** é criado. Isso é
 * deliberado: em 2026-09-19 a divergência de Mato Grosso levou à descoberta de
 * que Boa Esperança do Norte existe de verdade (ver {@link MUNICIPIOS_POR_UF}).
 * Um alarme que obriga a conferir é melhor que um silêncio que decide sozinho
 * qual feição nova é lagoa e qual é município.
 */
export const CODIGOS_IBGE_NAO_MUNICIPIO: readonly number[] = [
  4300001, // RS — Lagoa Mirim
  4300002, // RS — Lagoa dos Patos
] as const;

const NAO_MUNICIPIO = new Set<number>(CODIGOS_IBGE_NAO_MUNICIPIO);

/**
 * `true` quando o código IBGE é de um município de verdade — isto é, quando
 * ele pode ser pintado, hoverado, clicado e contado.
 *
 * Aceita `number` ou `string` porque os tiles vetoriais entregam `CD_MUN` nos
 * dois formatos, dependendo de como o tile foi gerado (é a mesma razão de o
 * filtro do mapa usar `["to-number", ["get", "CD_MUN"]]`). Entrada que não
 * vira número devolve `false`: sem código não há município, e desenhar o que
 * não se consegue identificar é o defeito que este módulo existe para evitar.
 */
export function ehMunicipioDeVerdade(codIbge: number | string): boolean {
  const n = typeof codIbge === "number" ? codIbge : Number.parseInt(codIbge, 10);
  if (!Number.isFinite(n)) return false;
  return !NAO_MUNICIPIO.has(n);
}

/**
 * Quantos **municípios** cada UF tem — sem os corpos d'água de
 * {@link CODIGOS_IBGE_NAO_MUNICIPIO}. Soma **5.571**.
 *
 * ⚠️ **5.571, não 5.570.** O número que a maior parte das fontes repete
 * (5.570) é o de 2022. **Boa Esperança do Norte (MT, `5101837`)** foi
 * instalado em **2025-01-01**, depois que o STF encerrou a ação movida por
 * Nova Ubiratã, de onde vem 80% do seu território.
 * Teve a primeira eleição municipal em outubro de 2024 e elege vereadores e
 * prefeito desde então. É município para todos os efeitos, inclusive o nosso.
 *
 * Conferido contra fonte externa em 2026-09-19, UF a UF.
 *
 * Serve a **um** propósito: ser o outro lado da conferência do teste. Não é
 * fonte de verdade para cálculo nenhum — nada no produto deve derivar número
 * de eleitor, de cadeira ou de apuração daqui.
 */
export const MUNICIPIOS_POR_UF: Readonly<Record<string, number>> = {
  AC: 22,
  AL: 102,
  AM: 62,
  AP: 16,
  BA: 417,
  CE: 184,
  DF: 1,
  ES: 78,
  GO: 246,
  MA: 217,
  MG: 853,
  MS: 79,
  MT: 142, // 141 até 2024; Boa Esperança do Norte instalado em 01/01/2025
  PA: 144,
  PB: 223,
  PE: 185,
  PI: 224,
  PR: 399,
  RJ: 92,
  RN: 167,
  RO: 52,
  RR: 15,
  RS: 497, // a malha do IBGE traz 499 feições no RS — as 2 extras são as lagoas
  SC: 295,
  SE: 75,
  SP: 645,
  TO: 139,
} as const;

/** Total de municípios do país segundo {@link MUNICIPIOS_POR_UF}. */
export const TOTAL_MUNICIPIOS_BRASIL = Object.values(MUNICIPIOS_POR_UF).reduce(
  (soma, n) => soma + n,
  0,
);
