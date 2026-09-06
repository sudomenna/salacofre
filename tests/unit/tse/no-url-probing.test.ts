/**
 * tests/unit/tse/no-url-probing.test.ts
 *
 * RF-010.5 (spec 001) — **proibição absoluta de sondar URL adivinhada** contra
 * `resultados.tse.jus.br` ou `resultados-sim.tse.jus.br`.
 *
 * Por que este arquivo é uma varredura de fonte e não um teste de unidade
 * comum: o requisito é sobre o que o código **não** faz. Nenhuma chamada
 * isolada prova ausência de sondagem — o risco é alguém, num commit futuro,
 * escrever um `fetch("https://resultados.tse.jus.br/algum/palpite.json")` para
 * "só conferir se existe". O TSE documenta que uma requisição malformada (404)
 * pode bloquear o IP, com bloqueio de 10 minutos renovado e limiar não
 * divulgado (ADR-0020) — e o custo cai justamente na janela de simulado ou no
 * dia da eleição, quando não há como esperar 10 minutos.
 *
 * A invariante que travamos: o host do TSE só pode aparecer no código como
 * **constante de base URL** em dois lugares conhecidos. Toda URL efetivamente
 * requisitada é derivada dela pelos builders de `lib/tse/targets.ts`, que
 * seguem a padronização documentada em `docs/reference/tse-2026-leiautes.md`.
 *
 * Se este teste falhar, a pergunta certa **não** é "como faço passar" — é
 * "essa URL nova é derivada da padronização documentada ou é um palpite?".
 * Sendo derivada, ela deve sair de um builder; sendo palpite, não deve existir.
 *
 * O `rf-coverage-checker` classificou RF-010.5 como invariante de revisão, não
 * de teste. É verdade que uma varredura textual não é prova formal — ela não
 * pega uma URL montada em runtime a partir de dados externos. Mas pega o caso
 * real e provável (literal digitado à mão), e é barata.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../..");
const DIRETORIOS_VARRIDOS = ["lib", "app", "scripts"];

/**
 * Únicos lugares autorizados a conter o host do TSE em código executável.
 * Ambos são a constante de base URL, sobrescritível por `TSE_BASE_URL` para
 * apontar ao mock local (`scripts/tse-mock-server.ts`) ou ao ambiente de
 * simulado.
 */
const ALLOWLIST_BASE_URL = new Set(["lib/tse/targets.ts", "scripts/tse-watch.ts"]);

/**
 * `app/sobre-o-modelo/page.tsx` cita o host em `<a href>` — link para o leitor
 * humano conferir a fonte oficial, exigido pela constituição § 1. Não é alvo
 * de requisição do servidor.
 */
const ALLOWLIST_LINK_HUMANO = new Set(["app/sobre-o-modelo/page.tsx"]);

const HOST_TSE = /resultados(?:-sim)?\.tse\.jus\.br/g;

/**
 * Remove comentários para não confundir documentação com código. O cuidado
 * não-óbvio: `//` dentro de `https://` **não** inicia comentário — a versão
 * ingênua deste regex apagava exatamente as URLs que queremos inspecionar.
 */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
}

function arquivosFonte(dir: string): string[] {
  const absoluto = join(REPO_ROOT, dir);
  const encontrados: string[] = [];

  const percorrer = (atual: string) => {
    for (const entrada of readdirSync(atual)) {
      if (entrada === "node_modules" || entrada === ".next" || entrada.startsWith(".")) continue;
      const caminho = join(atual, entrada);
      if (statSync(caminho).isDirectory()) {
        percorrer(caminho);
        continue;
      }
      if ([".ts", ".tsx"].includes(extname(entrada)) && !entrada.includes(".test.")) {
        encontrados.push(caminho);
      }
    }
  };

  percorrer(absoluto);
  return encontrados;
}

describe("RF-010.5 — proibição de sondar URL adivinhada no CDN do TSE", () => {
  const ocorrencias = new Map<string, number>();

  for (const dir of DIRETORIOS_VARRIDOS) {
    for (const caminho of arquivosFonte(dir)) {
      const codigo = semComentarios(readFileSync(caminho, "utf8"));
      const hits = codigo.match(HOST_TSE);
      if (hits && hits.length > 0) {
        ocorrencias.set(relative(REPO_ROOT, caminho), hits.length);
      }
    }
  }

  it("o host do TSE aparece apenas nos arquivos autorizados", () => {
    const autorizados = new Set([...ALLOWLIST_BASE_URL, ...ALLOWLIST_LINK_HUMANO]);
    const naoAutorizados = [...ocorrencias.keys()].filter((f) => !autorizados.has(f)).sort();

    expect(
      naoAutorizados,
      `Host do TSE fora dos arquivos autorizados: ${naoAutorizados.join(", ")}.\n` +
        "Toda URL requisitada ao CDN do TSE precisa vir de um builder de " +
        "lib/tse/targets.ts (padronização documentada), nunca de um literal " +
        "escrito à mão. Ver RF-010.5 e ADR-0020.",
    ).toEqual([]);
  });

  it("cada arquivo autorizado tem exatamente uma constante de base URL", () => {
    for (const arquivo of ALLOWLIST_BASE_URL) {
      expect(
        ocorrencias.get(arquivo),
        `${arquivo} deveria conter exatamente 1 ocorrência do host (a constante ` +
          "de base URL). Mais que isso sugere URL montada à mão.",
      ).toBe(1);
    }
  });

  it("a base URL é configurável — o mock local não exige tocar o CDN real", () => {
    const targets = readFileSync(join(REPO_ROOT, "lib/tse/targets.ts"), "utf8");
    expect(targets).toContain("TSE_BASE_URL");
  });
});
