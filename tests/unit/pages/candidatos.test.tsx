// @vitest-environment happy-dom
/**
 * tests/unit/pages/candidatos.test.tsx — T-13, spec 018 (RF-146 a RF-151).
 *
 * `/candidatos` renderizada por SSR com `readCandidatosUf` mockado. O reader
 * **nunca lança** por contrato (`lib/blob/candidatos.ts`), então o que estes
 * testes travam não é "o caminho feliz funciona" — é que os caminhos infelizes
 * produzem notícia honesta em vez de 500 ou de silêncio:
 *
 *   - fatia ausente (`not_found`) → estado nomeado, moldura da página inteira
 *     (constituição § 7);
 *   - `?cargo=99`, `?uf=ZZ`, `?cargo=7` → estado vazio **nomeado**, nunca a
 *     lista inteira em silêncio (RF-147). O cargo 7 (Deputado Estadual) existe
 *     no TSE e não no produto: a rota não revela cargos que não cobre;
 *   - "Fonte: TSE" **sempre** no DOM — obrigação da licença cc-by, não escolha
 *     editorial (RF-150). Um único teste é o que mantém viva uma obrigação de
 *     licença;
 *   - `fonte_ts` sai do dado, nunca literal do JSX (design 018 § D8 — a lição
 *     que custou quatro frases falsas de uma vez na spec 017).
 *
 * Zero JS de aplicação: o filtro é `<form method="get">`, e o caso (j) trava
 * isso estruturalmente (RF-146/RF-147 — "funciona com JavaScript desligado").
 */

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import CandidatosPage from "@/app/(cand)/candidatos/page";
import type {
  CandidatoIdentidade,
  CandidatosUfResult,
  CandidatosUfSlice,
} from "@/lib/blob/candidatos";

const readCandidatosUfMock = vi.fn<(sigla: string, cargo: string) => Promise<CandidatosUfResult>>();

vi.mock("@/lib/blob/candidatos", () => ({
  readCandidatosUf: (sigla: string, cargo: string) => readCandidatosUfMock(sigla, cargo),
}));

const ORIGINAL_BASE = process.env.BLOB_PUBLIC_BASE_URL;
beforeAll(() => {
  process.env.BLOB_PUBLIC_BASE_URL = "https://exemplo.public.blob.vercel-storage.com";
});
afterAll(() => {
  if (ORIGINAL_BASE === undefined) delete process.env.BLOB_PUBLIC_BASE_URL;
  else process.env.BLOB_PUBLIC_BASE_URL = ORIGINAL_BASE;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cand(over: Partial<CandidatoIdentidade> = {}): CandidatoIdentidade {
  return {
    sqcand: "250002553928",
    numero: 13,
    nome_urna: "LULA",
    nome: "Luiz Inácio Lula da Silva",
    partido: "PT",
    sob_ressalva: false,
    foto_ok: false,
    situacao_julgamento: "DEFERIDO",
    ...over,
  };
}

function slice(over: Partial<CandidatosUfSlice> = {}): CandidatosUfSlice {
  return {
    uf: "BR",
    // O corpo da fatia carrega o TOKEN do cargo (design 018 § D2, reconciliado
    // em 13/09) — a página não o lê, mas o fixture precisa ser fiel ao contrato.
    cargo: "pres",
    fonte_ts: "2026-09-12T18:30:00.000Z",
    gerado_ts: "2026-09-13T02:00:00.000Z",
    candidatos: [cand()],
    ...over,
  } as CandidatosUfSlice;
}

function ok(s: CandidatosUfSlice): CandidatosUfResult {
  return { status: "ok", slice: s, url: "https://exemplo/x.json" };
}

async function render(
  params: Record<string, string> = {},
): Promise<{ doc: Document; markup: string }> {
  const markup = renderToStaticMarkup(
    await CandidatosPage({ searchParams: Promise.resolve(params) }),
  );
  return { doc: new DOMParser().parseFromString(markup, "text/html"), markup };
}

beforeEach(() => {
  readCandidatosUfMock.mockReset();
  readCandidatosUfMock.mockResolvedValue(ok(slice()));
});

// ---------------------------------------------------------------------------

describe("/candidatos — default e leitura de UMA fatia (RF-146)", () => {
  it("(a) sem filtro, lê Presidente em BR — uma fatia, nunca as 27×4", () => {
    return render().then(({ doc }) => {
      expect(readCandidatosUfMock).toHaveBeenCalledTimes(1);
      expect(readCandidatosUfMock).toHaveBeenCalledWith("BR", "pres");
      expect(doc.querySelector("[data-testid='candidatos-grid-lista']")).not.toBeNull();
    });
  });

  it("(b) `?cargo=6&uf=BA` lê exatamente a fatia daquela corrida (RF-147)", async () => {
    await render({ cargo: "6", uf: "BA" });
    expect(readCandidatosUfMock).toHaveBeenCalledWith("BA", "dep");
  });

  it("(c) a rota NÃO emite `main[data-trilha]` — nenhuma aba se marca como atual", async () => {
    const { doc } = await render();
    const main = doc.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.getAttribute("data-trilha")).toBeNull();
  });
});

describe("/candidatos — entrada inválida degrada fechado (RF-147)", () => {
  it("(d) `?cargo=99` → estado nomeado, sem ir ao Blob e sem a lista inteira", async () => {
    const { doc } = await render({ cargo: "99" });

    expect(readCandidatosUfMock).not.toHaveBeenCalled();
    expect(doc.querySelector("[data-testid='candidatos-filtro-invalido']")).not.toBeNull();
    expect(doc.querySelector("[data-testid='candidatos-grid-lista']")).toBeNull();
  });

  it("(e) `?uf=ZZ` → mesmo caminho", async () => {
    const { doc } = await render({ uf: "ZZ" });
    expect(readCandidatosUfMock).not.toHaveBeenCalled();
    expect(doc.querySelector("[data-testid='candidatos-filtro-invalido']")).not.toBeNull();
  });

  it("(f) `?cargo=7` (Deputado Estadual) → a rota não revela cargo fora do produto", async () => {
    const { doc, markup } = await render({ cargo: "7" });

    expect(readCandidatosUfMock).not.toHaveBeenCalled();
    expect(doc.querySelector("[data-testid='candidatos-filtro-invalido']")).not.toBeNull();
    // Asserção NEGATIVA: nem o rótulo do cargo que não cobrimos aparece.
    expect(markup).not.toContain("Estadual");
    expect(markup).not.toContain("Distrital");
  });
});

describe("/candidatos — fatia indisponível não quebra a página (RF-146)", () => {
  const motivos = ["not_found", "not_configured", "fetch_error", "invalid"] as const;

  for (const reason of motivos) {
    it(`(g:${reason}) responde com a moldura inteira e a notícia própria do motivo`, async () => {
      readCandidatosUfMock.mockResolvedValue({ status: "unavailable", reason, url: null });
      const { doc } = await render({ cargo: "6", uf: "BA" });

      // A moldura permanece: título, formulário, atribuição e footer.
      expect(doc.querySelector("h1")?.textContent).toContain("Quem está concorrendo");
      expect(doc.querySelector("[data-testid='candidatos-filtros']")).not.toBeNull();
      expect(doc.querySelector("[data-testid='candidatos-fonte']")?.textContent).toContain(
        "Fonte: TSE",
      );

      const aviso = doc.querySelector("[data-testid='candidatos-indisponivel']");
      expect(aviso?.getAttribute("data-reason")).toBe(reason);
      expect((aviso?.textContent ?? "").length).toBeGreaterThan(20);
    });
  }

  it("(h) os quatro motivos produzem textos DIFERENTES entre si", async () => {
    const textos = new Set<string>();
    for (const reason of motivos) {
      readCandidatosUfMock.mockResolvedValue({ status: "unavailable", reason, url: null });
      const { doc } = await render({ cargo: "6", uf: "BA" });
      textos.add(doc.querySelector("[data-testid='candidatos-indisponivel']")?.textContent ?? "");
    }
    // "não publicamos ainda" e "não conseguimos falar com o armazenamento" são
    // notícias diferentes (constituição § 8). Um texto genérico único passaria
    // no caso (g) e falha aqui.
    expect(textos.size).toBe(motivos.length);
  });

  it("(i) fatia publicada porém VAZIA → estado honesto, não uma grade vazia muda", async () => {
    readCandidatosUfMock.mockResolvedValue(ok(slice({ uf: "BA", cargo: "dep", candidatos: [] })));
    const { doc } = await render({ cargo: "6", uf: "BA" });

    expect(doc.querySelector("[data-testid='candidatos-grid-lista']")).toBeNull();
    expect(doc.querySelector("[data-testid='candidatos-grid-vazio']")?.textContent).toBeTruthy();
  });
});

describe("/candidatos — filtro sem JavaScript (RF-147)", () => {
  it("(j) o filtro é um <form method=get>, com <label> visível em cada campo", async () => {
    const { doc } = await render();
    const form = doc.querySelector("[data-testid='candidatos-filtros']");

    expect(form?.tagName).toBe("FORM");
    expect(form?.getAttribute("method")).toBe("get");
    // `action` ausente = submete para a própria rota. Um `onSubmit` exigiria
    // ilha client, que RNF-007a (148,7 de 150 KiB) não comporta.
    expect(form?.getAttribute("onsubmit")).toBeNull();

    for (const id of ["filtro-cargo", "filtro-uf", "filtro-busca"]) {
      const rotulo = doc.querySelector(`label[for='${id}']`);
      expect(rotulo, `campo ${id} sem <label for>`).not.toBeNull();
      expect(rotulo?.classList.contains("sr-only")).toBe(false);
      expect((rotulo?.textContent ?? "").trim().length).toBeGreaterThan(0);
    }

    expect(doc.querySelector("[data-testid='filtro-submit']")?.getAttribute("type")).toBe("submit");
  });

  it("(k) os campos têm `name` — sem ele o filtro não seria submetido", async () => {
    const { doc } = await render();
    expect(doc.querySelector("#filtro-cargo")?.getAttribute("name")).toBe("cargo");
    expect(doc.querySelector("#filtro-uf")?.getAttribute("name")).toBe("uf");
    expect(doc.querySelector("#filtro-busca")?.getAttribute("name")).toBe("q");
  });

  it("(l) os valores submetidos voltam preenchidos no formulário (RF-148)", async () => {
    readCandidatosUfMock.mockResolvedValue(ok(slice({ uf: "BA", cargo: "dep" })));
    const { doc } = await render({ cargo: "6", uf: "BA", q: "marli" });

    // `renderToStaticMarkup` materializa `defaultValue` como `selected`/`value`.
    expect(doc.querySelector("#filtro-cargo option[selected]")?.getAttribute("value")).toBe("6");
    expect(doc.querySelector("#filtro-uf option[selected]")?.getAttribute("value")).toBe("BA");
    expect(doc.querySelector("#filtro-busca")?.getAttribute("value")).toBe("marli");
  });
});

describe("/candidatos — busca por nome (RF-148)", () => {
  const tres = [
    cand({ sqcand: "1", numero: 13, nome_urna: "LULA", nome: "Luiz Inácio Lula da Silva" }),
    cand({ sqcand: "2", numero: 22, nome_urna: "JOSÉ", nome: "José da Silva" }),
    cand({ sqcand: "3", numero: 50, nome_urna: "MARINA", nome: "Marina Souza" }),
  ];

  beforeEach(() => {
    readCandidatosUfMock.mockResolvedValue(ok(slice({ candidatos: tres })));
  });

  it("(m) `jose` casa com `JOSÉ` e com `José da Silva` — sem acento, sem caixa", async () => {
    const { doc } = await render({ q: "jose" });
    const nomes = [...doc.querySelectorAll("[data-testid='candidate-card-nome']")].map(
      (el) => el.textContent,
    );
    expect(nomes).toEqual(["JOSÉ"]);
  });

  it("(n) casa contra o nome COMPLETO, não só o de urna", async () => {
    // "Luiz Inácio" não aparece em lugar nenhum do card — só no campo `nome`.
    // Sem ele, a busca fica cega para metade das formas pelas quais o eleitor
    // conhece o candidato.
    const { doc } = await render({ q: "luiz inacio" });
    const nomes = [...doc.querySelectorAll("[data-testid='candidate-card-nome']")].map(
      (el) => el.textContent,
    );
    expect(nomes).toEqual(["LULA"]);
  });

  it("(o) busca vazia ou só espaços equivale a SEM filtro, não a zero resultado", async () => {
    for (const q of ["", "   "]) {
      const { doc } = await render({ q });
      expect(doc.querySelectorAll("[data-testid='candidate-card']")).toHaveLength(3);
    }
  });

  it("(p) busca sem resultado → estado nomeado, distinto de 'nada publicado'", async () => {
    const { doc } = await render({ q: "zzzzz" });
    const vazio = doc.querySelector("[data-testid='candidatos-grid-vazio']")?.textContent ?? "";
    expect(vazio).toContain("busca");

    readCandidatosUfMock.mockResolvedValue(ok(slice({ candidatos: [] })));
    const semPublicacao =
      (await render()).doc.querySelector("[data-testid='candidatos-grid-vazio']")?.textContent ??
      "";
    expect(semPublicacao).not.toBe(vazio);
  });
});

describe("/candidatos — atribuição e frescor (RF-150)", () => {
  it("(q) 'Fonte: TSE' está no bloco de atribuição da GRADE, não só no footer", async () => {
    const { doc } = await render();

    // ⚠️ A asserção é ESCOPADA de propósito. `body.textContent` conteria
    // "Fonte: TSE" mesmo com o bloco removido, porque o footer global já diz
    // "Não oficial. Fonte: TSE." — medido: apagar a atribuição da grade deixava
    // este arquivo inteiro verde. O RF-150 é explícito em que a atribuição da
    // grade é **adicional** à do footer, e fica junto do dado.
    expect(doc.querySelector("[data-testid='candidatos-fonte']")?.textContent).toContain(
      "Fonte: TSE",
    );
  });

  it("(q2) e continua lá quando a fatia não veio", async () => {
    readCandidatosUfMock.mockResolvedValue({
      status: "unavailable",
      reason: "not_found",
      url: null,
    });
    const { doc } = await render();
    expect(doc.querySelector("[data-testid='candidatos-fonte']")?.textContent).toContain(
      "Fonte: TSE",
    );
  });

  it("(r) o carimbo sai do `fonte_ts` injetado — nunca literal no JSX", async () => {
    readCandidatosUfMock.mockResolvedValue(ok(slice({ fonte_ts: "2026-09-12T18:30:00.000Z" })));
    const a = (await render()).doc.querySelector(
      "[data-testid='candidatos-fonte-ts']",
    )?.textContent;

    readCandidatosUfMock.mockResolvedValue(ok(slice({ fonte_ts: "2026-10-01T09:05:00.000Z" })));
    const b = (await render()).doc.querySelector(
      "[data-testid='candidatos-fonte-ts']",
    )?.textContent;

    // Dois valores distintos → dois carimbos distintos. Um número cravado no
    // JSX passaria em qualquer asserção de igualdade contra si mesmo.
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
    // Fuso de Brasília: 18:30Z é 15:30 local, não 18:30.
    expect(a).toContain("12/09/2026");
    expect(a).toContain("15:30");
  });

  it("(s) `fonte_ts` impresentável omite o carimbo, mas não a atribuição", async () => {
    readCandidatosUfMock.mockResolvedValue(ok(slice({ fonte_ts: "não é data" })));
    const { doc } = await render();

    expect(doc.querySelector("[data-testid='candidatos-fonte-ts']")).toBeNull();
    expect(doc.querySelector("[data-testid='candidatos-fonte']")?.textContent).toContain(
      "Fonte: TSE",
    );
    expect(doc.body.textContent).not.toContain("Invalid Date");
  });

  it("(t) a tela avisa que a lista muda até o fim da apuração (RF-141)", async () => {
    const { doc } = await render();
    expect(doc.querySelector("[data-testid='candidatos-fonte']")?.textContent).toContain(
      "muda até o fim da apuração",
    );
  });

  it("(u) o footer global continua trazendo 'Não oficial' (constituição § 1)", async () => {
    const { doc } = await render();
    expect(doc.body.textContent).toContain("Não oficial");
  });
});

describe("/candidatos — ressalva na tela (RF-141)", () => {
  it("(v) candidatura sob recurso aparece, com a situação ao lado", async () => {
    readCandidatosUfMock.mockResolvedValue(
      ok(
        slice({
          uf: "BA",
          cargo: "dep",
          candidatos: [
            cand({
              sqcand: "9",
              numero: 2727,
              nome_urna: "MARLI LIMA",
              nome: "Marli Lima",
              sob_ressalva: true,
              situacao_julgamento: "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO",
            }),
          ],
        }),
      ),
    );
    const { doc } = await render({ cargo: "6", uf: "BA" });

    // Ela APARECE — excluí-la mentiria por omissão sobre quem recebe voto.
    expect(doc.querySelectorAll("[data-testid='candidate-card']")).toHaveLength(1);
    expect(doc.querySelector("[data-testid='candidate-card-ressalva']")?.textContent).toContain(
      "INDEFERIDO EM PRAZO RECURSAL OU COM RECURSO",
    );
  });
});
