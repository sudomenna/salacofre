/**
 * tests/unit/scripts/vigia-env-seletivo.test.ts
 *
 * O vigia carrega `.env.local` sozinho — e **só** as duas variáveis dele.
 *
 * ## O que isto impede
 *
 * Até 2026-09-19 o uso documentado de `scripts/vigia-ciclo.ts` era
 * `set -a; . ./.env.local; set +a`. Funciona, e é perigoso: carrega o arquivo
 * INTEIRO, e nele está o `DATABASE_URL` de **produção** — o banco que vai
 * guardar a apuração de 04/10.
 *
 * Não é hipótese. Em 2026-09-17 foi exatamente assim que uma suíte de testes
 * gravou **1.877 linhas** de harness em produção, 644 sob um cargo real.
 *
 * Um vigia roda **às pressas, de madrugada, quando algo já está errado** — o
 * pior momento possível para depender de alguém lembrar de não carregar o
 * arquivo errado.
 *
 * ## 🔴 Este arquivo já nasceu errado uma vez, e o registro fica
 *
 * A primeira versão **reimplementava** a regra da lista branca aqui dentro, em
 * vez de importá-la. Ela passava — e **sobreviveu à mutação que removia a lista
 * branca do script**: com a carga total ligada, os 8 casos continuaram verdes,
 * porque mediam a cópia, não o código.
 *
 * Foi para consertar isso que `scripts/_vigia-env.ts` existe como módulo
 * separado: `vigia-ciclo.ts` chama a carga no topo, então importá-lo aqui leria
 * o `.env.local` REAL da máquina. Com a função pura num arquivo próprio, o teste
 * exercita **o código que roda em produção**, sobre conteúdo sintético.
 *
 * É o caso de livro do "teste que não discrimina" que esta base cataloga — e a
 * única coisa que o pegou foi aplicar a mutação de verdade.
 */

import { describe, expect, it } from "vitest";

import { ENV_DO_VIGIA, selecionarEnvDoVigia } from "@/scripts/_vigia-env";

/** Um `.env.local` com a forma do real: o banco de produção vem PRIMEIRO. */
const ENV_FALSO = [
  "DATABASE_URL=postgres://u:p@producao.neon.tech/neondb?sslmode=require",
  "DATABASE_URL_UNPOOLED=postgres://u:p@producao-direto.neon.tech/neondb",
  "POSTGRES_URL=postgres://u:p@producao.neon.tech/neondb",
  "EDGE_CONFIG_TOKEN=token-de-escrita",
  "MODEL_SECRET=abc",
  "# comentário",
  "",
  "EDGE_CONFIG=https://edge-config.vercel.com/ecfg_x?token=a1b7-fefe-44e8",
  "INGEST_WINDOW=17-04",
].join("\n");

describe("vigia — a carga de env é uma lista BRANCA", () => {
  it("🔴 o DATABASE_URL de produção NÃO entra", () => {
    // Mata a mutação principal: remover o `includes` da lista branca, ou
    // "simplificar" carregando o arquivo inteiro.
    const env = selecionarEnvDoVigia(ENV_FALSO);
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.DATABASE_URL_UNPOOLED).toBeUndefined();
    expect(env.POSTGRES_URL).toBeUndefined();
  });

  it("nenhuma outra credencial entra — nem as que parecem inofensivas", () => {
    // A regra é lista branca, não "bloqueie o banco": bloquear por negação
    // exigiria prever cada chave perigosa que alguém acrescente amanhã.
    const env = selecionarEnvDoVigia(ENV_FALSO);
    expect(Object.keys(env).sort()).toEqual(["EDGE_CONFIG", "INGEST_WINDOW"]);
  });

  it("a lista tem exatamente as duas chaves do vigia", () => {
    expect([...ENV_DO_VIGIA]).toEqual(["EDGE_CONFIG", "INGEST_WINDOW"]);
  });

  it("as duas entram com o valor certo", () => {
    const env = selecionarEnvDoVigia(ENV_FALSO);
    expect(env.INGEST_WINDOW).toBe("17-04");
    expect(env.EDGE_CONFIG).toBe("https://edge-config.vercel.com/ecfg_x?token=a1b7-fefe-44e8");
  });

  it('o `=` DENTRO do token sobrevive — `split("=")` truncaria', () => {
    // Connection string do Edge Config tem `?token=…`, e tokens carregam `=` de
    // padding base64. Quebrar por todos os `=` cortaria o valor, e o sintoma
    // seria "credencial inválida" — que manda procurar no lugar errado.
    const env = selecionarEnvDoVigia("EDGE_CONFIG=https://e.v.com/x?token=aa==bb");
    expect(env.EDGE_CONFIG).toBe("https://e.v.com/x?token=aa==bb");
  });

  it("o ambiente REAL vence o arquivo — CI e agendador não têm .env.local", () => {
    const env = selecionarEnvDoVigia(ENV_FALSO, { EDGE_CONFIG: "do-ambiente" });
    expect(env.EDGE_CONFIG).toBe("do-ambiente");
  });

  it("comentário e linha vazia não viram variável", () => {
    const env = selecionarEnvDoVigia("# EDGE_CONFIG=comentado\n\n  \nINGEST_WINDOW=8-20");
    expect(env.EDGE_CONFIG).toBeUndefined();
    expect(env.INGEST_WINDOW).toBe("8-20");
  });

  it("linha sem `=`, ou começando com `=`, é ignorada em vez de virar chave vazia", () => {
    const env = selecionarEnvDoVigia("EDGE_CONFIG\n=valor-sem-chave\nINGEST_WINDOW=17-04");
    expect(Object.keys(env)).toEqual(["INGEST_WINDOW"]);
  });
});
