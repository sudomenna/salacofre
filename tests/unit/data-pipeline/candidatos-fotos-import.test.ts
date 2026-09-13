// Importador de foto de candidato — `data-pipeline/candidatos-fotos-import.ts`.
//
// Spec 018 RF-142 · ADR-0040 (publicabilidade fail-closed) · ADR-0041 (binário
// no Blob, cache de um ano).
//
// ⚠️ Cada teste aqui foi escrito contra uma **mutação nomeada**, e a mutação foi
// aplicada de verdade para confirmar o vermelho. Asserção de forma
// (`expect.any`, `toBeTruthy`, "não lançou") não serve: passa com o valor errado,
// e foi exatamente assim que este repositório já aceitou teste que não
// discrimina. Se mexer num assert, reaplique a mutação da tabela abaixo.
//
//   | asserção                                    | mutação que derruba              |
//   |---------------------------------------------|----------------------------------|
//   | nome fora do padrão é CONTADO               | descartar sem incrementar        |
//   | `sqcand` de 11 E de 12 dígitos casam        | regex com `(\d{12})` fixo        |
//   | regex ancorada                              | remover `^`/`$`                  |
//   | não-publicável não tem foto gravada         | remover o filtro de publicável   |
//   | delta pula `foto_ok`; `--force` não pula    | inverter a condição              |
//   | `contentType: "image/jpeg"`                 | `application/json`               |
//   | `cacheControlMaxAge` = 1 ano                | trocar pelos 60 s do `putJson`   |
//   | caminho usa a UF do CADASTRO                | usar a UF do nome do arquivo     |
//   | uma falha não derruba o lote                | `Promise.all` no lugar de `allSettled` |

import { describe, expect, it } from "vitest";
import {
  type Cadastro,
  CONCORRENCIA_DEFAULT,
  type DepsFoto,
  ehArquivoDeFoto,
  importarFotosDaSigla,
  type LinhaCadastro,
  parseCli,
  parseNomeFoto,
  SIGLAS_FOTO,
  somarResumos,
} from "@/data-pipeline/candidatos-fotos-import.ts";
import {
  BLOB_CACHE_CONTROL_MAX_AGE_SECONDS,
  BLOB_IMMUTABLE_MAX_AGE_SECONDS,
} from "@/lib/blob/write.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function linha(over: Partial<LinhaCadastro> = {}): LinhaCadastro {
  return { uf: "AC", cargo: 6, publicavel: true, fotoOk: false, ...over };
}

function cadastroDe(entradas: Record<string, Partial<LinhaCadastro>>): Cadastro {
  const m = new Map<string, LinhaCadastro>();
  for (const [sq, over] of Object.entries(entradas)) m.set(sq, linha(over));
  return m;
}

interface Chamada {
  pathname: string;
  bytes: number;
  contentType: string;
  cacheControlMaxAge: number | undefined;
}

interface Espiao {
  deps: DepsFoto;
  chamadas: Chamada[];
  marcados: string[];
}

function espiao(opts: { falharEm?: (pathname: string) => boolean } = {}): Espiao {
  const chamadas: Chamada[] = [];
  const marcados: string[] = [];
  const deps: DepsFoto = {
    // 7 bytes, para o resumo poder somar algo não-trivial.
    lerArquivo: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    putBinary: async (pathname, body, o) => {
      if (opts.falharEm?.(pathname)) throw new Error(`503 no Blob: ${pathname}`);
      chamadas.push({
        pathname,
        bytes: body.byteLength,
        contentType: o.contentType,
        cacheControlMaxAge: o.cacheControlMaxAge,
      });
      return { pathname, status: "written", bytes: body.byteLength, url: `https://x/${pathname}` };
    },
    marcarFotoOk: async (sqs) => {
      marcados.push(...sqs);
    },
  };
  return { deps, chamadas, marcados };
}

const OPTS = { force: false, dryRun: false, concorrencia: CONCORRENCIA_DEFAULT };

/** A 1ª chamada a `putBinary` — lança se não houve, para o assert não passar por vacuidade. */
function primeira(e: Espiao): Chamada {
  const c = e.chamadas[0];
  if (!c) throw new Error("nenhuma chamada a putBinary — o assert seguinte seria vácuo");
  return c;
}

// ---------------------------------------------------------------------------
// T1 — o nome do arquivo
// ---------------------------------------------------------------------------

describe("parseNomeFoto", () => {
  it("extrai sqcand de 12 dígitos", () => {
    expect(parseNomeFoto("FAC250002553928_div.jpg")).toEqual({ uf: "AC", sqcand: "250002553928" });
  });

  // MUTAÇÃO: `(\d{12})` fixo. Descartaria em silêncio toda candidatura de 11
  // dígitos — sintoma seria avatar de fallback em milhares de cards, nunca erro.
  it("extrai sqcand de 11 dígitos — o quantificador NÃO é fixo", () => {
    expect(parseNomeFoto("FAC12345678901_div.jpg")).toEqual({ uf: "AC", sqcand: "12345678901" });
    // E os dois comprimentos convivem no mesmo pacote.
    expect(parseNomeFoto("FBR250002553928_div.jpg")?.sqcand).toHaveLength(12);
    expect(parseNomeFoto("FBR25000255392_div.jpg")?.sqcand).toHaveLength(11);
  });

  it("aceita .jpeg e caixa alta/baixa na extensão", () => {
    expect(parseNomeFoto("FSP250002553928_div.JPEG")?.sqcand).toBe("250002553928");
  });

  // MUTAÇÃO: remover `^`/`$`. Sem âncora, o lixo abaixo casa e grava um blob sob
  // um sqcand que ninguém pediu.
  it("é ancorada nas duas pontas", () => {
    expect(parseNomeFoto("lixo_FAC250002553928_div.jpg")).toBeNull();
    expect(parseNomeFoto("FAC250002553928_div.jpg.bak")).toBeNull();
    expect(parseNomeFoto("FAC250002553928_div.jpg.jpg")).toBeNull();
  });

  it("rejeita o que não é foto de candidato", () => {
    expect(parseNomeFoto("leiame.pdf")).toBeNull();
    expect(parseNomeFoto("FACABCDEFGHIJKL_div.jpg")).toBeNull();
    expect(parseNomeFoto("F250002553928_div.jpg")).toBeNull(); // sem UF
  });

  it("separa arquivo de foto de qualquer outra coisa no ZIP", () => {
    expect(ehArquivoDeFoto("FAC1_div.jpg")).toBe(true);
    expect(ehArquivoDeFoto("qualquer.jpeg")).toBe(true);
    expect(ehArquivoDeFoto("leiame.pdf")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T2 — nome fora do padrão é contado, não engolido
// ---------------------------------------------------------------------------

describe("importarFotosDaSigla — classificação das entradas", () => {
  // MUTAÇÃO: `continue` sem incrementar `foraDoPadrao`. O ZIP teria mudado de
  // formato e o resumo diria "tudo certo" com zero foto subida.
  it("CONTA o nome fora do padrão em vez de descartar em silêncio", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "foto_qualquer.jpg", "OUTRO-FORMATO.jpeg", "leiame.pdf"],
      cadastroDe({ "111111111111": {} }),
      OPTS,
      e.deps,
    );

    expect(r.foraDoPadrao).toBe(2);
    expect(r.jpegs).toBe(3); // os 3 .jpg/.jpeg; o pdf não conta como jpeg
    expect(r.naoImagem).toBe(1);
    expect(r.subidas).toBe(1);
    // A soma fecha: nenhuma entrada some do relatório.
    expect(r.casaram + r.foraDoPadrao + r.semLinha + r.naoPublicavel).toBe(r.jpegs);
  });

  it("conta foto sem linha no cadastro sem gravar nada por ela", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC999999999999_div.jpg"],
      cadastroDe({ "111111111111": {} }),
      OPTS,
      e.deps,
    );

    expect(r.semLinha).toBe(1);
    expect(e.chamadas.map((c) => c.pathname)).toEqual(["candidatos/foto/AC/111111111111.jpg"]);
  });

  // O outro lado do "não sobra órfã de nenhum lado" do RF-142: um contador só de
  // um lado deixaria passar justamente o caso que o leitor vê (RF-151).
  it("conta candidatura publicável SEM foto no ZIP", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg"],
      cadastroDe({
        "111111111111": {},
        "222222222222": {},
        "333333333333": { publicavel: false },
        "444444444444": { uf: "SP" }, // outra sigla: não entra no denominador
      }),
      OPTS,
      e.deps,
    );

    expect(r.publicaveis).toBe(2);
    expect(r.publicaveisSemFoto).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// T3 — publicabilidade (ADR-0040)
// ---------------------------------------------------------------------------

describe("importarFotosDaSigla — fronteira de publicabilidade", () => {
  // MUTAÇÃO: remover o `if (!linha.publicavel)`. Asserção NEGATIVA sobre o
  // conjunto de caminhos gravados, como o RF-142 exige — não basta contar.
  it("NÃO grava foto de candidatura não-publicável", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg", "FAC333333333333_div.jpg"],
      cadastroDe({
        "111111111111": { publicavel: true },
        "222222222222": { publicavel: false },
        "333333333333": { publicavel: false },
      }),
      OPTS,
      e.deps,
    );

    expect(r.naoPublicavel).toBe(2);
    expect(r.subidas).toBe(1);
    expect(e.chamadas).toHaveLength(1);
    expect(primeira(e).pathname).toBe("candidatos/foto/AC/111111111111.jpg");
    for (const sq of ["222222222222", "333333333333"]) {
      expect(e.chamadas.some((c) => c.pathname.includes(sq))).toBe(false);
      expect(e.marcados).not.toContain(sq);
    }
  });

  it("`--force` não afrouxa a publicabilidade", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC222222222222_div.jpg"],
      cadastroDe({ "222222222222": { publicavel: false, fotoOk: true } }),
      { ...OPTS, force: true },
      e.deps,
    );

    expect(r.subidas).toBe(0);
    expect(e.chamadas).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T4 — delta e --force
// ---------------------------------------------------------------------------

describe("importarFotosDaSigla — modo delta", () => {
  // MUTAÇÃO: inverter para `if (!linha.fotoOk && !opts.force)`. O primeiro run
  // não subiria nada e o segundo subiria tudo — e o resumo pareceria plausível
  // nos dois.
  it("pula quem já tem foto_ok e sobe quem não tem", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg"],
      cadastroDe({ "111111111111": { fotoOk: true }, "222222222222": { fotoOk: false } }),
      OPTS,
      e.deps,
    );

    expect(r.puladasDelta).toBe(1);
    expect(r.subidas).toBe(1);
    expect(e.chamadas.map((c) => c.pathname)).toEqual(["candidatos/foto/AC/222222222222.jpg"]);
    expect(e.marcados).toEqual(["222222222222"]);
    // `casaram` conta a junção, não o upload — as duas acharam candidatura.
    expect(r.casaram).toBe(2);
  });

  it("--force reescreve quem já tem foto_ok", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg"],
      cadastroDe({ "111111111111": { fotoOk: true }, "222222222222": { fotoOk: false } }),
      { ...OPTS, force: true },
      e.deps,
    );

    expect(r.puladasDelta).toBe(0);
    expect(r.subidas).toBe(2);
    expect(e.chamadas.map((c) => c.pathname).sort()).toEqual([
      "candidatos/foto/AC/111111111111.jpg",
      "candidatos/foto/AC/222222222222.jpg",
    ]);
  });

  it("--dry-run não grava no Blob nem marca foto_ok", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg"],
      cadastroDe({ "111111111111": {} }),
      { ...OPTS, dryRun: true },
      e.deps,
    );

    expect(r.subidas).toBe(1); // contou o que subiria
    expect(e.chamadas).toHaveLength(0); // mas não tocou o Blob
    expect(e.marcados).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T5 — como a foto é gravada (ADR-0041)
// ---------------------------------------------------------------------------

describe("importarFotosDaSigla — contrato de escrita", () => {
  // MUTAÇÃO: `application/json`. O Blob serviria a foto como download em vez de
  // exibi-la, e nenhum teste de contagem notaria.
  it("grava com contentType image/jpeg", async () => {
    const e = espiao();
    await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg"],
      cadastroDe({ "111111111111": {} }),
      OPTS,
      e.deps,
    );

    expect(primeira(e).contentType).toBe("image/jpeg");
  });

  // MUTAÇÃO: `BLOB_CACHE_CONTROL_MAX_AGE_SECONDS`. É exatamente o "conserto por
  // consistência com o módulo" que o ADR-0041 existe para prevenir — por isso o
  // teste afirma o NÚMERO, e afirma que ele difere do outro.
  it("grava com cache de um ano, não com os 60 s do putJson", async () => {
    const e = espiao();
    await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg"],
      cadastroDe({ "111111111111": {} }),
      OPTS,
      e.deps,
    );

    expect(primeira(e).cacheControlMaxAge).toBe(31_536_000);
    expect(primeira(e).cacheControlMaxAge).toBe(BLOB_IMMUTABLE_MAX_AGE_SECONDS);
    expect(primeira(e).cacheControlMaxAge).not.toBe(BLOB_CACHE_CONTROL_MAX_AGE_SECONDS);
  });

  // MUTAÇÃO: `candidatoFotoBlobPathname(parsed.uf, ...)`. O read path deriva a
  // URL da UF do CADASTRO; gravar sob a do nome do arquivo daria 404 mudo.
  it("usa a UF do cadastro no caminho, não a do nome do arquivo", async () => {
    const e = espiao();
    await importarFotosDaSigla(
      "BR",
      ["FAC111111111111_div.jpg"], // nome diz AC…
      cadastroDe({ "111111111111": { uf: "BR", cargo: 1 } }), // …cadastro diz BR
      OPTS,
      e.deps,
    );

    expect(primeira(e).pathname).toBe("candidatos/foto/BR/111111111111.jpg");
  });

  it("soma os bytes realmente gravados", async () => {
    const e = espiao();
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg"],
      cadastroDe({ "111111111111": {}, "222222222222": {} }),
      OPTS,
      e.deps,
    );

    expect(r.bytes).toBe(14); // 2 × 7 bytes
  });
});

// ---------------------------------------------------------------------------
// T6 — uma falha não derruba o lote
// ---------------------------------------------------------------------------

describe("importarFotosDaSigla — resiliência do lote", () => {
  // MUTAÇÃO: `Promise.all` no lugar de `Promise.allSettled`. Uma foto com 503
  // abortaria o lote inteiro (e, no `main`, as 7.000 seguintes).
  it("agrega a falha e sobe as outras do mesmo lote", async () => {
    const e = espiao({ falharEm: (p) => p.includes("222222222222") });
    const r = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg", "FAC333333333333_div.jpg"],
      cadastroDe({ "111111111111": {}, "222222222222": {}, "333333333333": {} }),
      { ...OPTS, concorrencia: 3 },
      e.deps,
    );

    expect(r.falhas).toBe(1);
    expect(r.subidas).toBe(2);
    expect(r.motivosFalha[0] ?? "").toContain("FAC222222222222_div.jpg");
    // Quem falhou NÃO é marcado — o próximo run em modo delta tenta de novo.
    expect(e.marcados.sort()).toEqual(["111111111111", "333333333333"]);
  });

  it("respeita a concorrência como tamanho de lote, sem perder alvo", async () => {
    const e = espiao();
    const sqs = Array.from({ length: 25 }, (_, i) => String(100000000000 + i));
    const r = await importarFotosDaSigla(
      "AC",
      sqs.map((s) => `FAC${s}_div.jpg`),
      cadastroDe(Object.fromEntries(sqs.map((s) => [s, {}]))),
      { ...OPTS, concorrencia: 4 },
      e.deps,
    );

    expect(r.subidas).toBe(25);
    expect(e.chamadas).toHaveLength(25);
    expect(e.marcados).toHaveLength(25);
  });
});

// ---------------------------------------------------------------------------
// T7 — CLI
// ---------------------------------------------------------------------------

describe("parseCli", () => {
  it("default: todas as siglas, delta, concorrência 10", () => {
    const c = parseCli([]);
    expect(c.ufs).toBeNull();
    expect(c.force).toBe(false);
    expect(c.dryRun).toBe(false);
    expect(c.concorrencia).toBe(10);
  });

  it("aceita lista de siglas separada por vírgula", () => {
    expect(parseCli(["--uf", "sp,br , mg"]).ufs).toEqual(["SP", "BR", "MG"]);
  });

  it("rejeita sigla que o TSE não publica", () => {
    expect(() => parseCli(["--uf", "XX"])).toThrow(/sigla desconhecida/);
    expect(() => parseCli(["--uf", "AC,ZZ"])).toThrow(/ZZ/);
  });

  it("rejeita flag desconhecida e concorrência fora de faixa", () => {
    expect(() => parseCli(["--forca"])).toThrow(/Flag desconhecida/);
    expect(() => parseCli(["--concorrencia", "0"])).toThrow(/entre 1 e 64/);
    expect(() => parseCli(["--concorrencia", "abc"])).toThrow(/entre 1 e 64/);
  });

  it("são 28 siglas: as 27 UFs mais BR", () => {
    expect(SIGLAS_FOTO).toHaveLength(28);
    expect(SIGLAS_FOTO).toContain("BR");
    expect(SIGLAS_FOTO).toContain("DF");
  });
});

// ---------------------------------------------------------------------------
// T8 — agregação
// ---------------------------------------------------------------------------

describe("somarResumos", () => {
  it("soma campo a campo e concatena os motivos de falha", async () => {
    const e = espiao({ falharEm: (p) => p.includes("222222222222") });
    const ac = await importarFotosDaSigla(
      "AC",
      ["FAC111111111111_div.jpg", "FAC222222222222_div.jpg"],
      cadastroDe({ "111111111111": {}, "222222222222": {} }),
      OPTS,
      e.deps,
    );
    const sp = await importarFotosDaSigla(
      "SP",
      ["FSP333333333333_div.jpg", "leiame.pdf"],
      cadastroDe({ "333333333333": { uf: "SP" } }),
      OPTS,
      e.deps,
    );

    const t = somarResumos([ac, sp]);
    expect(t.uf).toBe("TOTAL");
    expect(t.jpegs).toBe(3);
    expect(t.subidas).toBe(2);
    expect(t.falhas).toBe(1);
    expect(t.naoImagem).toBe(1);
    expect(t.motivosFalha).toHaveLength(1);
  });
});
