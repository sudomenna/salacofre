/**
 * tests/unit/blob/paths.test.ts
 *
 * Esquema de caminho e URL determinística do Vercel Blob (ADR-0032, ADR-0026).
 *
 * O que estes testes existem para impedir:
 *   - Um pathname com dois-pontos voltar a entrar. Ele "funciona" no `put()`
 *     mas produz URL percent-encoded, e uma concatenação ingênua devolve 404
 *     só em produção — o modo de falha mais caro possível na noite da apuração.
 *   - A URL deixar de ser determinística. O read path monta a URL a partir do
 *     pathname, sem índice nem lookup; se essa premissa cair, o drill-down
 *     municipal para de existir sem nenhum erro em lugar nenhum.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertValidBlobSegment,
  blobPathname,
  blobPublicBaseUrl,
  blobUrlFor,
  deputadoUfBlobPathname,
  ufDetailBlobPathname,
} from "@/lib/blob/paths";

const ENV_KEYS = ["BLOB_PUBLIC_BASE_URL", "BLOB_READ_WRITE_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("esquema de caminho", () => {
  it("detalhe de UF usa os mesmos qualificadores da chave de Global Config", () => {
    expect(ufDetailBlobPathname("SP", "pres", 1)).toBe("municipios/uf/SP/pres/t1.json");
    expect(ufDetailBlobPathname("SP", "gov", 1)).toBe("municipios/uf/SP/gov/t1.json");
    expect(ufDetailBlobPathname("RJ", "pres", 2)).toBe("municipios/uf/RJ/pres/t2.json");
  });

  it("normaliza a sigla para maiúscula", () => {
    expect(ufDetailBlobPathname("sp", "pres", 1)).toBe("municipios/uf/SP/pres/t1.json");
  });

  it("Deputado (ADR-0026) sai do MESMO construtor de base — não de um segundo padrão", () => {
    expect(deputadoUfBlobPathname("SP")).toBe("deputado/uf/SP.json");
  });

  it("nenhum caminho carrega dois-pontos — a URL sairia percent-encoded", () => {
    const caminhos = [
      ufDetailBlobPathname("SP", "pres", 1),
      ufDetailBlobPathname("MG", "gov", 2),
      deputadoUfBlobPathname("BA"),
    ];
    for (const c of caminhos) {
      expect(c).not.toContain(":");
      // Só usa caracteres que sobrevivem intactos numa URL.
      expect(encodeURI(c)).toBe(c);
    }
  });

  it("recusa sigla malformada em vez de gerar um caminho que só falha em produção", () => {
    expect(() => ufDetailBlobPathname("SPP", "pres", 1)).toThrow(/sigla de UF inválida/);
    expect(() => ufDetailBlobPathname("", "pres", 1)).toThrow(/sigla de UF inválida/);
  });

  it("recusa segmento com dois-pontos e diz por quê", () => {
    expect(() => assertValidBlobSegment("uf:SP", "teste")).toThrow(/percent-encoded/);
    expect(() => blobPathname(["municipios", "uf:SP"], "teste")).toThrow(/inválido/);
  });
});

describe("URL determinística", () => {
  it("deriva o host do storeId embutido no BLOB_READ_WRITE_TOKEN", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_jbTu251tioj3y57Z_MtSegredo123";
    expect(blobPublicBaseUrl()).toBe("https://jbtu251tioj3y57z.public.blob.vercel-storage.com");
  });

  it("BLOB_PUBLIC_BASE_URL tem precedência e perde a barra final", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_jbTu251tioj3y57Z_MtSegredo123";
    process.env.BLOB_PUBLIC_BASE_URL = "https://exemplo.test/";
    expect(blobPublicBaseUrl()).toBe("https://exemplo.test");
  });

  it("a mesma UF/cargo/turno sempre produz a mesma URL", () => {
    process.env.BLOB_PUBLIC_BASE_URL = "https://exemplo.test";
    const a = blobUrlFor(ufDetailBlobPathname("SP", "pres", 1));
    const b = blobUrlFor(ufDetailBlobPathname("sp", "pres", 1));
    expect(a).toBe("https://exemplo.test/municipios/uf/SP/pres/t1.json");
    expect(b).toBe(a);
  });

  it("sem credencial nem override, não há URL — o caller degrada, não quebra", () => {
    expect(blobPublicBaseUrl()).toBeNull();
    expect(blobUrlFor("municipios/uf/SP/pres/t1.json")).toBeNull();
  });

  it("token fora do formato esperado não vira host inventado", () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token_qualquer";
    expect(blobPublicBaseUrl()).toBeNull();
  });
});
