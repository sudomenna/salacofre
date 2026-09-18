/**
 * tests/integration/_guarda-banco.ts
 *
 * **O único lugar autorizado a decidir se um teste pode ESCREVER no banco.**
 *
 * ## O incidente que criou este módulo (2026-09-17)
 *
 * Cinco testes de integração inserem linhas reais em `projections`, `snapshots`,
 * `eleitorado` e `historical_results`. O único freio era a ausência de
 * `DATABASE_URL` — quem carregasse o `.env.local` para qualquer outra coisa
 * (conferir uma migration, por exemplo) e rodasse `vitest run` passava a
 * escrever **no banco de produção**, o mesmo que vai guardar a apuração de
 * 04/10/2026.
 *
 * Foi o que aconteceu: 1.877 linhas de harness ficaram lá — 1.233 sob cargos
 * que não existem (91, 92, 93) e **644 sob o cargo REAL 1**, com as
 * candidaturas sintéticas 101 e 102 ao lado das candidaturas de verdade.
 *
 * Duas causas, e as duas estão fechadas:
 *
 * 1. **A guarda era a ausência de uma variável**, e ausência é um estado que se
 *    perde por acidente. Agora a escrita exige `ALLOW_DB_WRITE_TESTS=1`
 *    **declarado**: a dúvida resolve para "não escreve", que é a mesma postura
 *    de `lib/config/fase.ts` e do semeador do Global Config.
 *
 * 2. **O cleanup tinha um furo de SQL**: filtrava por `uf IN (…)`, e `IN` nunca
 *    casa com `NULL`. As linhas de escopo NACIONAL (`uf IS NULL`) — que são
 *    justamente as que o modelo cria em todo ciclo — **nunca eram apagadas**.
 *    Por isso o resíduo cresceu por meses sem ninguém notar: o teste limpava o
 *    que via e deixava o que não via.
 *
 * ## Por que exigir uma variável em vez de detectar produção
 *
 * Detectar "é produção" pelo host seria adivinhação, e adivinhação com default
 * permissivo é exatamente a rede de mão única que este repositório já pagou
 * caro: uma URL nova, um host de preview, um proxy, e o teste volta a escrever
 * achando que está seguro. Consentimento explícito não tem esse modo de falha —
 * quem declara sabe o que está fazendo, e o `.env.local` sozinho não basta.
 */

/** A variável que autoriza a escrita. Declarada, nunca inferida. */
export const ENV_AUTORIZACAO = "ALLOW_DB_WRITE_TESTS";

/**
 * `true` somente quando há banco **e** autorização explícita.
 *
 * Igualdade exata com `"1"`: um `ALLOW_DB_WRITE_TESTS=false` ou `=0` não libera
 * nada, e um valor vazio muito menos. A dúvida resolve para "não escreve".
 */
export function podeEscreverNoBanco(): boolean {
  if (!process.env.DATABASE_URL) return false;
  return process.env[ENV_AUTORIZACAO] === "1";
}

/** Por que os testes de escrita foram pulados — para a mensagem do `describe.skip`. */
export function motivoDoSkip(): string {
  if (!process.env.DATABASE_URL) return "DATABASE_URL ausente";
  if (process.env[ENV_AUTORIZACAO] !== "1") {
    return (
      `${ENV_AUTORIZACAO} não declarada — estes testes ESCREVEM no banco apontado por ` +
      "DATABASE_URL, que em `.env.local` é produção. Para rodá-los de propósito, contra um " +
      `banco descartável: ${ENV_AUTORIZACAO}=1 npx vitest run <arquivo>`
    );
  }
  return "";
}
