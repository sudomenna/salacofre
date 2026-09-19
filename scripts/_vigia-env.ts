/**
 * scripts/_vigia-env.ts
 *
 * Carga **seletiva** do `.env.local` para o vigia externo
 * (`scripts/vigia-ciclo.ts`).
 *
 * ---------------------------------------------------------------------------
 * 🔴 Por que não `set -a; . ./.env.local; set +a`
 * ---------------------------------------------------------------------------
 *
 * Até 2026-09-19 esse era o uso documentado no topo de `vigia-ciclo.ts`.
 * Funciona, e é perigoso: carrega o arquivo **inteiro**, e a primeira variável
 * dele é o `DATABASE_URL` de **produção** — o banco que vai guardar a apuração
 * de 04/10.
 *
 * Não é hipótese. Em 2026-09-17 foi exatamente assim que uma suíte de testes
 * gravou **1.877 linhas** de harness em produção, 644 delas sob um cargo real
 * (`docs/reference/risks.md`).
 *
 * E um vigia é feito para rodar **às pressas, de madrugada, quando algo já
 * está errado**. É o pior momento possível para depender de alguém lembrar de
 * não carregar o arquivo errado. A segurança tem de estar no código, não na
 * disciplina de quem digita.
 *
 * ---------------------------------------------------------------------------
 * Lista BRANCA, nunca negação
 * ---------------------------------------------------------------------------
 *
 * Mesma forma da trava do modo simulado (`lib/dev/simulacao.ts`) e da guarda de
 * escrita em banco (`tests/integration/_guarda-banco.ts`). Bloquear por negação
 * ("tudo menos `DATABASE_URL`") exigiria prever cada chave perigosa que alguém
 * vá acrescentar amanhã ao `.env.local` — e a lista de amanhã é justamente a
 * que ninguém revisa.
 *
 * ---------------------------------------------------------------------------
 * Módulo separado, e por quê
 * ---------------------------------------------------------------------------
 *
 * `vigia-ciclo.ts` chama a carga no topo do módulo, então importá-lo num teste
 * leria o `.env.local` REAL da máquina — com o banco de produção dentro. Este
 * arquivo não executa nada ao ser importado: exporta uma função **pura**
 * (`selecionarEnvDoVigia`) que o teste exercita sobre um conteúdo sintético, e
 * uma casca de I/O (`carregarEnvDoVigia`) que só o script chama.
 *
 * A primeira versão deste teste reimplementava a regra em vez de importá-la, e
 * **sobreviveu à mutação que removia a lista branca** — o defeito que esta base
 * chama de "teste que não discrimina". A separação em dois arquivos é o que
 * torna o teste capaz de medir o código de verdade.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * As ÚNICAS variáveis que o vigia lê. Nenhuma toca banco:
 *
 *   - `EDGE_CONFIG`   — string de leitura do payload publicado;
 *   - `INGEST_WINDOW` — a janela em que silêncio conta como alarme.
 */
export const ENV_DO_VIGIA = ["EDGE_CONFIG", "INGEST_WINDOW"] as const;

/**
 * Aplica a lista branca sobre o conteúdo de um `.env.local`.
 *
 * O `ambiente` recebido **vence sempre** o arquivo: em CI ou num agendador as
 * variáveis já vêm definidas, e sobrescrevê-las com um arquivo de
 * desenvolvimento seria o caminho para o vigia olhar o store errado.
 *
 * Função pura — não lê disco, não escreve em `process.env`.
 */
export function selecionarEnvDoVigia(
  conteudo: string,
  ambiente: Record<string, string | undefined> = {},
  permitidas: readonly string[] = ENV_DO_VIGIA,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(ambiente)) {
    if (v !== undefined && v !== "") out[k] = v;
  }

  for (const linha of conteudo.split("\n")) {
    const limpa = linha.trim();
    if (!limpa || limpa.startsWith("#")) continue;

    const igual = limpa.indexOf("=");
    if (igual < 1) continue;

    const chave = limpa.slice(0, igual).trim();
    if (!permitidas.includes(chave)) continue;
    if (out[chave]) continue;

    // `slice` a partir do PRIMEIRO `=`, e não `split("=")`: a connection string
    // do Edge Config tem `?token=…`, e tokens carregam `=` de padding base64.
    // Quebrar por todos os `=` truncaria o valor, e o sintoma seria
    // "credencial inválida" — que manda procurar no lugar errado.
    out[chave] = limpa
      .slice(igual + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
  }

  return out;
}

/**
 * Casca de I/O: lê `.env.local` do diretório atual e aplica
 * {@link selecionarEnvDoVigia} sobre `process.env`.
 *
 * Arquivo ausente é **silencioso de propósito** — é o caso do CI e do
 * agendador, onde as variáveis vêm do ambiente e o arquivo não existe.
 */
export function carregarEnvDoVigia(cwd: string = process.cwd()): void {
  let bruto: string;
  try {
    bruto = readFileSync(resolve(cwd, ".env.local"), "utf8");
  } catch {
    return;
  }
  const selecionado = selecionarEnvDoVigia(bruto, process.env);
  for (const chave of ENV_DO_VIGIA) {
    const valor = selecionado[chave];
    if (valor && !process.env[chave]) process.env[chave] = valor;
  }
}
