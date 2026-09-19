/**
 * scripts/gen-uf-flags.ts
 *
 * Gera `lib/data/uf-flags.generated.ts` — as 27 bandeiras estaduais como um
 * sprite `<symbol>` embutido, a partir dos SVGs versionados em
 * `scripts/data/bandeiras-uf/`.
 *
 * Uso:
 *   pnpm gen:uf-flags            # regrava lib/data/uf-flags.generated.ts
 *   pnpm gen:uf-flags --check    # não escreve; falha se estiver fora de sincronia
 *
 * Espelha `scripts/gen-party-scale.ts` em forma e em espírito: dado-fonte
 * versionado num diretório de `scripts/data/`, um script que valida e
 * normaliza, e um arquivo gerado com cabeçalho de "não editar à mão".
 *
 * ---------------------------------------------------------------------------
 * Por que um gerador, e não 27 arquivos em `public/`
 * ---------------------------------------------------------------------------
 * `/deputado-federal` tem orçamento de JavaScript de aplicação **zero** e o
 * argumento inteiro do hemiciclo é não pagar rede. Vinte e sete `<img src>`
 * acrescentam 27 round-trips; e uma falha de CDN na noite da apuração
 * produziria 27 imagens quebradas ao lado de um resultado eleitoral. Embutido,
 * cada item custa ~70 bytes (`<use href="#uf-flag-SP"/>`), os `<symbol>` saem
 * uma vez por documento, e não há o que falhar em runtime.
 *
 * ---------------------------------------------------------------------------
 * 🔴 O defeito que este gerador existe para impedir
 * ---------------------------------------------------------------------------
 * Vinte e sete SVGs exportados por editores diferentes trazem `id="a"`,
 * `id="path1"`, `id="clip0"` — **os mesmos nomes**. Colados no mesmo documento,
 * o primeiro `#a` vence e uma bandeira passa a pintar com o gradiente ou a
 * máscara de outra. O erro aparece só em runtime, só numa bandeira, e ninguém
 * liga a causa ao efeito. Por isso {@link prefixarIds} reescreve todo `id` para
 * `ufflag-<SIGLA>-<id>` e persegue as referências locais (`url(#…)`, `href`,
 * `xlink:href`) no mesmo passe.
 *
 * ---------------------------------------------------------------------------
 * Falhar é o comportamento correto
 * ---------------------------------------------------------------------------
 * Os 27 arquivos **ainda não existem** (2026-09-18) — serão fornecidos pelo
 * dono. Este script sai com código ≠ 0 nesse estado, de propósito: um gerador
 * que escreve um sprite vazio em silêncio transforma "as bandeiras não
 * chegaram" em "as bandeiras sumiram", e as duas coisas parecem iguais na tela.
 *
 * O consumidor, esse, degrada: `<UfFlag>` sem entrada devolve `null`, e a grade
 * de estados renderiza só o nome e a sigla em texto.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** As 27 UFs, em ordem alfabética de sigla. Geografia, não eleição. */
const SIGLAS = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

const DIR_FONTE = path.join(process.cwd(), "scripts", "data", "bandeiras-uf");
const DESTINO = path.join(process.cwd(), "lib", "data", "uf-flags.generated.ts");

/** Teto por bandeira, em bytes do markup normalizado. */
const TETO_POR_BANDEIRA = 4 * 1024;
/** Teto do sprite inteiro, em bytes. */
const TETO_DO_SPRITE = 60 * 1024;

/**
 * Proporção fixa do `<symbol>`. Bandeiras estaduais brasileiras são, na quase
 * totalidade, 7:10 (a proporção da bandeira nacional) ou 2:3. Normalizar para
 * uma única caixa é o que permite a grade alinhar sem cada item medir
 * diferente — e `preserveAspectRatio="xMidYMid meet"` no `<symbol>` garante que
 * nenhuma delas seja **distorcida** para caber: o que sobra vira folga.
 */
const VIEWBOX_ALVO = "0 0 70 100";

interface Bandeira {
  sigla: string;
  /** Miolo do `<symbol>` — o conteúdo do `<svg>` de origem, já normalizado. */
  corpo: string;
  /** `viewBox` original, preservado para o `<symbol>` escalar corretamente. */
  viewBox: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// Normalização
// ---------------------------------------------------------------------------

/**
 * Prefixa todo `id` do documento e reescreve as referências locais a ele.
 *
 * Deliberadamente textual, e não por parser de XML: a entrada é um conjunto
 * pequeno de arquivos versionados e auditados, não conteúdo arbitrário da
 * internet, e trazer um parser de DOM para um script de build custa mais do que
 * resolve. A validação de {@link recusarPerigo} é o que sustenta essa escolha —
 * se o arquivo tiver qualquer coisa além de geometria, ele é recusado antes de
 * chegar aqui.
 */
export function prefixarIds(svg: string, sigla: string): string {
  const prefixo = `ufflag-${sigla}-`;
  const ids = new Set<string>();
  for (const m of svg.matchAll(/\bid\s*=\s*["']([^"']+)["']/g)) ids.add(m[1] as string);
  if (ids.size === 0) return svg;

  let saida = svg;
  for (const id of ids) {
    const escapado = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    saida = saida
      .replace(new RegExp(`(\\bid\\s*=\\s*["'])${escapado}(["'])`, "g"), `$1${prefixo}${id}$2`)
      .replace(new RegExp(`url\\(\\s*#${escapado}\\s*\\)`, "g"), `url(#${prefixo}${id})`)
      .replace(
        new RegExp(`((?:xlink:)?href\\s*=\\s*["'])#${escapado}(["'])`, "g"),
        `$1#${prefixo}${id}$2`,
      );
  }
  return saida;
}

/**
 * Recusa conteúdo que não seja geometria.
 *
 * O sprite é embutido no MESMO documento que serve a apuração. Um `<script>`
 * ou um `onload=` vindo de um arquivo de terceiro passaria a executar no
 * contexto da página — e a página não tem nenhum JavaScript de aplicação
 * justamente para não ter essa superfície.
 */
export function recusarPerigo(svg: string, sigla: string): void {
  const proibidos: Array<[RegExp, string]> = [
    [/<\s*script\b/i, "<script>"],
    [/<\s*foreignObject\b/i, "<foreignObject>"],
    [/\son[a-z]+\s*=/i, "atributo de evento (on*=)"],
    [/javascript\s*:/i, "URL javascript:"],
    [/<\s*(image|use)\b[^>]*\bhref\s*=\s*["']https?:/i, "referência externa por http(s)"],
  ];
  for (const [re, nome] of proibidos) {
    if (re.test(svg)) throw new Error(`${sigla}.svg contém ${nome} — recusado.`);
  }
}

/** Extrai `viewBox` e miolo do `<svg>` raiz. */
export function extrairCorpo(svg: string, sigla: string): { viewBox: string; corpo: string } {
  const abertura = /<svg\b([^>]*)>/i.exec(svg);
  if (!abertura) throw new Error(`${sigla}.svg não tem elemento <svg>.`);
  const atributos = abertura[1] as string;
  const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(atributos)?.[1];
  if (!vb) {
    throw new Error(
      `${sigla}.svg não declara viewBox — sem ele o <use> não sabe escalar a bandeira.`,
    );
  }

  const inicio = (abertura.index ?? 0) + abertura[0].length;
  const fim = svg.lastIndexOf("</svg>");
  if (fim < inicio) throw new Error(`${sigla}.svg não fecha o elemento <svg>.`);
  return { viewBox: vb.trim(), corpo: svg.slice(inicio, fim) };
}

/**
 * Minificação conservadora: tira comentários, declarações de documento,
 * metadados de editor e espaço entre tags. Nada de reescrever `path` — o ganho
 * não compensa o risco de mudar um desenho em silêncio.
 */
export function minificar(corpo: string): string {
  return corpo
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<metadata\b[\s\S]*?<\/metadata>/gi, "")
    .replace(/<title\b[\s\S]*?<\/title>/gi, "")
    .replace(/<desc\b[\s\S]*?<\/desc>/gi, "")
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizar(svgBruto: string, sigla: string): Bandeira {
  recusarPerigo(svgBruto, sigla);
  const { viewBox, corpo } = extrairCorpo(svgBruto, sigla);
  const normalizado = prefixarIds(minificar(corpo), sigla);
  return {
    sigla,
    corpo: normalizado,
    viewBox,
    bytes: Buffer.byteLength(normalizado, "utf8"),
  };
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------

function cabecalho(n: number): string {
  return `/**
 * lib/data/uf-flags.generated.ts — ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 *   Gerador : scripts/gen-uf-flags.ts
 *   Comando : pnpm gen:uf-flags
 *   Fonte   : scripts/data/bandeiras-uf/<SIGLA>.svg (ver PROVENIENCIA.md)
 *
 * Qualquer edição manual aqui é perdida na próxima geração.
 *
 * ${n} de 27 bandeiras presentes na fonte no momento da geração.
 *
 * Todo \`id\` interno foi prefixado com \`ufflag-<SIGLA>-\` pelo gerador: 27
 * arquivos de editores diferentes trazem os mesmos \`id="a"\` e colidiriam
 * dentro do mesmo documento, fazendo uma bandeira pintar com o gradiente de
 * outra — defeito que só aparece em runtime, numa bandeira.
 */
`;
}

export function gerarModulo(bandeiras: readonly Bandeira[]): string {
  const linhas = bandeiras
    .map(
      (b) =>
        `  ${b.sigla}: { viewBox: ${JSON.stringify(b.viewBox)}, corpo: ${JSON.stringify(b.corpo)} },`,
    )
    .join("\n");

  return `${cabecalho(bandeiras.length)}
/** Caixa normalizada do \`<symbol>\`. O \`meet\` garante folga, nunca distorção. */
export const UF_FLAG_VIEWBOX = ${JSON.stringify(VIEWBOX_ALVO)} as const;

export interface UfFlagSvg {
  /** \`viewBox\` do arquivo de origem — é ele que o \`<symbol>\` declara. */
  viewBox: string;
  /** Miolo do SVG, já minificado e com os \`id\` prefixados. */
  corpo: string;
}

/**
 * Sigla → bandeira. **Pode estar vazio**, e isso não é erro: enquanto os
 * arquivos não chegam, \`<UfFlag>\` devolve \`null\` e a grade de estados
 * renderiza só o nome e a sigla, em texto.
 */
export const UF_FLAGS: Readonly<Record<string, UfFlagSvg>> = Object.freeze({
${linhas}
});
`;
}

function main(): void {
  const checar = process.argv.includes("--check");

  if (!existsSync(DIR_FONTE)) {
    console.error(`Diretório-fonte ausente: ${DIR_FONTE}`);
    process.exitCode = 1;
    return;
  }

  const presentes = new Set(
    readdirSync(DIR_FONTE)
      .filter((f) => f.endsWith(".svg"))
      .map((f) => path.basename(f, ".svg")),
  );

  const faltando = SIGLAS.filter((s) => !presentes.has(s));
  const sobrando = [...presentes].filter((s) => !(SIGLAS as readonly string[]).includes(s));

  if (sobrando.length > 0) {
    console.error(`Arquivos fora das 27 siglas: ${sobrando.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const bandeiras: Bandeira[] = [];
  for (const sigla of SIGLAS) {
    if (!presentes.has(sigla)) continue;
    try {
      bandeiras.push(normalizar(readFileSync(path.join(DIR_FONTE, `${sigla}.svg`), "utf8"), sigla));
    } catch (erro) {
      console.error(String(erro instanceof Error ? erro.message : erro));
      process.exitCode = 1;
      return;
    }
  }

  const gordas = bandeiras.filter((b) => b.bytes > TETO_POR_BANDEIRA);
  if (gordas.length > 0) {
    console.error(
      `Bandeira acima do teto de ${TETO_POR_BANDEIRA} B:\n` +
        gordas.map((b) => `  ${b.sigla}: ${b.bytes} B`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const totalBytes = bandeiras.reduce((a, b) => a + b.bytes, 0);
  if (totalBytes > TETO_DO_SPRITE) {
    console.error(`Sprite com ${totalBytes} B, acima do teto de ${TETO_DO_SPRITE} B.`);
    process.exitCode = 1;
    return;
  }

  const modulo = gerarModulo(bandeiras);

  if (checar) {
    const atual = existsSync(DESTINO) ? readFileSync(DESTINO, "utf8") : "";
    if (atual !== modulo) {
      console.error("lib/data/uf-flags.generated.ts fora de sincronia — rode `pnpm gen:uf-flags`.");
      process.exitCode = 1;
      return;
    }
    console.log(`Em sincronia — ${bandeiras.length}/27 bandeiras, ${totalBytes} B.`);
  } else {
    writeFileSync(DESTINO, modulo, "utf8");
    console.log(
      `lib/data/uf-flags.generated.ts gerado — ${bandeiras.length}/27 bandeiras, ${totalBytes} B ` +
        `de ${TETO_DO_SPRITE} B.`,
    );
  }

  // 🔴 Depois de escrever, não antes: o arquivo gerado tem de refletir o que
  // existe hoje, e ainda assim o comando precisa FALHAR enquanto faltar
  // bandeira. Sair 0 aqui transformaria "ainda não chegaram" em "está pronto".
  if (faltando.length > 0) {
    console.error(
      `\nFaltam ${faltando.length} bandeiras em scripts/data/bandeiras-uf/: ${faltando.join(", ")}\n` +
        "Enquanto faltarem, <UfFlag> devolve null e a grade mostra só nome e sigla.",
    );
    process.exitCode = 1;
  }
}

// Só executa quando invocado como script — sem esta guarda, importar o módulo
// num teste reescreveria o arquivo gerado como efeito colateral.
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main();
}
