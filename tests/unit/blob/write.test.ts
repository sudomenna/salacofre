/**
 * tests/unit/blob/write.test.ts
 *
 * O primitivo de escrita do Blob — JSON (ADR-0026/0032) e binário (ADR-0041).
 *
 * O que estes testes existem para impedir:
 *   - As duas constantes de cache **trocarem de lugar**. É o erro que o
 *     ADR-0041 item 3 existe para prevenir: alguém "conserta" o 1 ano da foto
 *     de volta para 60 s por consistência com o resto do módulo, e o CDN passa
 *     a revalidar ~8.400 imagens que nunca mudam; na direção inversa, o JSON de
 *     apuração sob cache de 1 ano serviria apuração parada sem nenhum erro em
 *     lugar nenhum. Por isso os dois números são afirmados em LITERAL, nunca
 *     pela constante importada.
 *   - A tríade que torna a URL determinística (`access`/`allowOverwrite`/
 *     `addRandomSuffix`) divergir entre os dois produtores — todo o read path
 *     monta a URL a partir do pathname, sem lookup.
 *   - O no-op sem credencial virar exceção. Preview, CI e dev local não têm
 *     `BLOB_READ_WRITE_TOKEN` por design, e uma exceção aqui derrubaria o ciclo
 *     inteiro do orchestrator.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const putMock = vi.fn(async (pathname: string, _body: unknown, _opts: unknown) => ({
  url: `https://exemplo.test/${pathname}`,
  pathname,
  contentType: "application/octet-stream",
  contentDisposition: "inline",
  downloadUrl: `https://exemplo.test/${pathname}`,
}));

vi.mock("@vercel/blob", () => ({
  put: (pathname: string, body: unknown, opts: unknown) => putMock(pathname, body, opts),
}));

const { BLOB_CACHE_CONTROL_MAX_AGE_SECONDS, BLOB_IMMUTABLE_MAX_AGE_SECONDS, putBinary, putJson } =
  await import("@/lib/blob/write");

const TOKEN = "vercel_blob_rw_jbTu251tioj3y57Z_MtSegredo123";
let savedToken: string | undefined;

beforeEach(() => {
  savedToken = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.BLOB_READ_WRITE_TOKEN = TOKEN;
  putMock.mockClear();
});

afterEach(() => {
  if (savedToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = savedToken;
});

/** Opções do `put()` da última chamada. */
function lastOpts(): Record<string, unknown> {
  const call = putMock.mock.calls.at(-1);
  if (!call) throw new Error("put() não foi chamado");
  return call[2] as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// As duas constantes de cache
// ---------------------------------------------------------------------------

describe("cache — os dois números não podem trocar de lugar (ADR-0041 item 3)", () => {
  it("putJson grava com 60 — a cadência de reescrita do ADR-0011", async () => {
    await putJson("municipios/uf/SP/pres/t1.json", { uf: "SP" });
    expect(lastOpts().cacheControlMaxAge).toBe(60);
  });

  it("putBinary grava com 31536000 — um ano, por default", async () => {
    await putBinary("candidatos/foto/SP/250002553928.jpg", new Uint8Array([1, 2, 3]), {
      contentType: "image/jpeg",
    });
    expect(lastOpts().cacheControlMaxAge).toBe(31536000);
  });

  it("as constantes exportadas valem o que os caminhos de escrita gravam", () => {
    // Literais dos dois lados: a constante e o valor gravado precisam concordar,
    // e nenhum dos dois pode ser derivado do outro dentro do teste.
    expect(BLOB_CACHE_CONTROL_MAX_AGE_SECONDS).toBe(60);
    expect(BLOB_IMMUTABLE_MAX_AGE_SECONDS).toBe(31536000);
    expect(BLOB_IMMUTABLE_MAX_AGE_SECONDS).not.toBe(BLOB_CACHE_CONTROL_MAX_AGE_SECONDS);
  });

  it("o caller pode sobrepor o cache do binário sem tocar no default", async () => {
    await putBinary("candidatos/foto/SP/1.jpg", new Uint8Array([1]), {
      contentType: "image/jpeg",
      cacheControlMaxAge: 86_400,
    });
    expect(lastOpts().cacheControlMaxAge).toBe(86400);

    await putBinary("candidatos/foto/SP/2.jpg", new Uint8Array([1]), {
      contentType: "image/jpeg",
    });
    expect(lastOpts().cacheControlMaxAge).toBe(31536000);
  });
});

// ---------------------------------------------------------------------------
// contentType
// ---------------------------------------------------------------------------

describe("contentType", () => {
  it("putBinary passa o contentType que recebeu, sem adivinhar pela extensão", async () => {
    await putBinary("candidatos/foto/SP/250002553928.jpg", new Uint8Array([1]), {
      contentType: "image/jpeg",
    });
    expect(lastOpts().contentType).toBe("image/jpeg");

    // Extensão .jpg com contentType declarado diferente: quem manda é o
    // parâmetro. Se a implementação inferisse da extensão, isto reprovaria.
    await putBinary("candidatos/foto/SP/250002553928.jpg", new Uint8Array([1]), {
      contentType: "image/webp",
    });
    expect(lastOpts().contentType).toBe("image/webp");
  });

  it("putJson continua fixando application/json", async () => {
    await putJson("deputado/uf/SP.json", { uf: "SP" });
    expect(lastOpts().contentType).toBe("application/json");
  });
});

// ---------------------------------------------------------------------------
// Determinismo de URL — a tríade compartilhada
// ---------------------------------------------------------------------------

describe("tríade de determinismo de URL", () => {
  it("os DOIS produtores gravam com a mesma tríade", async () => {
    await putJson("deputado/uf/SP.json", { uf: "SP" });
    const json = lastOpts();

    await putBinary("candidatos/foto/SP/1.jpg", new Uint8Array([1]), {
      contentType: "image/jpeg",
    });
    const binario = lastOpts();

    for (const opts of [json, binario]) {
      expect(opts.access).toBe("public");
      expect(opts.allowOverwrite).toBe(true);
      expect(opts.addRandomSuffix).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Corpo e contagem de bytes
// ---------------------------------------------------------------------------

describe("corpo gravado e bytes reportados", () => {
  it("os bytes chegam ao put() intactos", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await putBinary("candidatos/foto/SP/1.jpg", bytes, { contentType: "image/jpeg" });

    const body = putMock.mock.calls.at(-1)?.[1];
    expect(new Uint8Array(body as ArrayBuffer)).toEqual(bytes);
  });

  it("uma view PARCIAL grava só a sua fatia, não o buffer inteiro", async () => {
    // `subarray` devolve uma view sobre o mesmo buffer. Passar `body.buffer`
    // cru gravaria os 6 bytes em vez dos 3 — e um JPEG com cauda estranha
    // ainda abre, então a falha passaria despercebida em produção.
    const completo = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const fatia = completo.subarray(2, 5);

    await putBinary("candidatos/foto/SP/1.jpg", fatia, { contentType: "image/jpeg" });

    const body = putMock.mock.calls.at(-1)?.[1];
    expect(new Uint8Array(body as ArrayBuffer)).toEqual(new Uint8Array([3, 4, 5]));
  });

  it("bytes de putBinary é byteLength — bytes reais, não comprimento de string", async () => {
    const fatia = new Uint8Array([1, 2, 3, 4, 5, 6]).subarray(2, 5);
    const result = await putBinary("candidatos/foto/SP/1.jpg", fatia, {
      contentType: "image/jpeg",
    });
    expect(result.bytes).toBe(3);
    expect(result.status).toBe("written");
    expect(result.pathname).toBe("candidatos/foto/SP/1.jpg");
    expect(result.url).toBe("https://exemplo.test/candidatos/foto/SP/1.jpg");
  });

  it("bytes de putJson continua sendo o comprimento UTF-16 da string", async () => {
    // `"José"` tem 4 unidades UTF-16 e 5 bytes em UTF-8. O número do JSON é o
    // primeiro, de propósito (comparabilidade com `itemBytes` do Global
    // Config) — e é por isso que o campo `bytes` da interface documenta que as
    // duas unidades diferem.
    const value = { nome: "José" };
    const result = await putJson("x.json", value);
    expect(result.bytes).toBe(JSON.stringify(value).length);
    expect(result.bytes).toBeLessThan(Buffer.byteLength(JSON.stringify(value), "utf8"));
  });
});

// ---------------------------------------------------------------------------
// Sem credencial
// ---------------------------------------------------------------------------

describe("ambiente sem BLOB_READ_WRITE_TOKEN", () => {
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
  });

  it("putBinary vira no-op logado — não lança, não chama o put()", async () => {
    const result = await putBinary("candidatos/foto/SP/1.jpg", new Uint8Array([1, 2, 3]), {
      contentType: "image/jpeg",
    });

    expect(result).toEqual({
      pathname: "candidatos/foto/SP/1.jpg",
      status: "skipped",
      bytes: 0,
      url: null,
    });
    expect(putMock).not.toHaveBeenCalled();
  });

  it("putJson tem exatamente o mesmo comportamento", async () => {
    const result = await putJson("deputado/uf/SP.json", { uf: "SP" });
    expect(result).toEqual({
      pathname: "deputado/uf/SP.json",
      status: "skipped",
      bytes: 0,
      url: null,
    });
    expect(putMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Falha do put()
// ---------------------------------------------------------------------------

describe("falha do put()", () => {
  it("putBinary propaga — o caller decide agregar ou abortar", async () => {
    putMock.mockRejectedValueOnce(new Error("blob 500"));
    await expect(
      putBinary("candidatos/foto/SP/1.jpg", new Uint8Array([1]), { contentType: "image/jpeg" }),
    ).rejects.toThrow("blob 500");
  });
});
