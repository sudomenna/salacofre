/**
 * tests/unit/edge-config/keys.test.ts
 *
 * A trava do esquema de chaves do Vercel Global Config.
 *
 * ## O que este arquivo impede
 *
 * A doc da Vercel (`/docs/global-config/global-config-limits`, seção
 * "Maximum item key name length") diz que o nome de uma chave "must adhere to
 * the regex pattern `^[\w-]+$`, which is equivalent to `/^[A-Za-z0-9_-]+$/`".
 * Dois-pontos não está na lista, e o esquema anterior (ADR-0012, S05) usava
 * `:` em todas as chaves. Se a API aplicar o padrão, aquelas escritas nunca
 * funcionaram — e o modo de falha é a gravação ser recusada na noite da
 * apuração.
 *
 * Não dá para verificar empiricamente aqui: `EDGE_CONFIG` está comentada no
 * `.env.local` e não há token de escrita no ambiente. Então a garantia é
 * estrutural, não empírica: **toda chave que o sistema constrói passa por
 * este teste**, e o construtor de chave é único (`lib/edge-config/keys.ts`).
 *
 * ## Como este arquivo pega uma regressão
 *
 * O teste "matriz completa" enumera TODAS as chaves que o sistema pode
 * produzir (5 formatos × 2 cargos × 2 turnos × 27 UFs) e roda o padrão
 * documentado contra cada uma. Trocar qualquer separador de volta para `:`
 * em `keys.ts` faz esse teste falhar — não por comparação com uma string
 * literal esperada, mas contra a regex da doc. Uma chave nova que alguém
 * acrescente ao módulo herda a mesma trava automaticamente, porque o
 * construtor chama `assertValidGlobalConfigKey` por dentro.
 */

import { describe, expect, it } from "vitest";
import type { Cargo, Turno } from "@/lib/config/calendar";
import {
  archiveProjectionKey,
  assertValidGlobalConfigKey,
  currentProjectionKey,
  DEPRECATED_COLON_CURRENT_ALIAS_KEY,
  DEPRECATED_COLON_KEYS_REMOVAL_DATE,
  deprecatedColonArchiveProjectionKey,
  deprecatedColonCurrentProjectionKey,
  deprecatedColonLegacyUfAliasKey,
  deprecatedColonUfProjectionKey,
  GLOBAL_CONFIG_KEY_MAX_LENGTH,
  GLOBAL_CONFIG_KEY_PATTERN,
  isValidGlobalConfigKey,
  LEGACY_CURRENT_ALIAS_KEY,
  legacyUfAliasKey,
  ufProjectionKey,
} from "@/lib/edge-config/keys";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** As 27 UFs (26 estados + DF). Inline de propósito: o teste não deve poder
 *  ser "consertado" mexendo numa constante compartilhada com o código. */
const TODAS_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const CARGOS: readonly Cargo[] = ["pres", "gov"];
const TURNOS: readonly Turno[] = [1, 2];

/**
 * O padrão da doc, reescrito **literalmente aqui**, não importado de
 * `keys.ts`. Se o teste importasse `GLOBAL_CONFIG_KEY_PATTERN` para julgar as
 * chaves, afrouxar a regex no código afrouxaria o teste junto e a trava seria
 * decorativa. Esta cópia é a única duplicação deliberada do arquivo.
 */
const PATTERN_FROM_VERCEL_DOCS = /^[A-Za-z0-9_-]+$/;

/** Toda chave que o sistema é capaz de construir hoje. */
function allProducibleKeys(): string[] {
  const keys: string[] = [LEGACY_CURRENT_ALIAS_KEY];
  for (const cargo of CARGOS) {
    for (const turno of TURNOS) {
      keys.push(currentProjectionKey(cargo, turno));
      keys.push(archiveProjectionKey(cargo, turno));
      for (const uf of TODAS_UFS) {
        keys.push(ufProjectionKey(uf, cargo, turno));
      }
    }
  }
  for (const uf of TODAS_UFS) keys.push(legacyUfAliasKey(uf));
  return keys;
}

// ---------------------------------------------------------------------------
// A trava
// ---------------------------------------------------------------------------

describe("esquema de chaves — matriz completa contra o padrão documentado", () => {
  it("toda chave produzível casa com /^[A-Za-z0-9_-]+$/ e cabe em 256 chars", () => {
    const keys = allProducibleKeys();

    // 1 alias nacional + 2 cargos × 2 turnos × (current + archive + 27 UFs)
    // + 27 aliases de UF = 1 + 4 × 29 + 27 = 144.
    expect(keys).toHaveLength(144);

    const offenders = keys.filter(
      (k) => !PATTERN_FROM_VERCEL_DOCS.test(k) || k.length > GLOBAL_CONFIG_KEY_MAX_LENGTH,
    );
    expect(offenders).toEqual([]);
  });

  it("nenhuma chave produzível contém dois-pontos", () => {
    // Redundante com o teste acima por construção, e deliberado: se alguém
    // relaxar a regex, esta asserção continua nomeando o caractere exato que
    // motivou a mudança de esquema.
    expect(allProducibleKeys().filter((k) => k.includes(":"))).toEqual([]);
  });

  it("sigla de UF em MAIÚSCULA continua válida — o resto do esquema depende disso", () => {
    // A doc admite explicitamente A-Z. Se não admitisse, `projection-uf-SP-...`
    // cairia inteiro e o esquema precisaria de siglas minúsculas.
    for (const uf of TODAS_UFS) {
      expect(uf).toMatch(/^[A-Z]{2}$/);
      expect(ufProjectionKey(uf, "pres", 1)).toMatch(PATTERN_FROM_VERCEL_DOCS);
    }
    expect(ufProjectionKey("SP", "pres", 1)).toBe("projection-uf-SP-pres-t1");
  });

  it("sigla minúscula é normalizada para maiúscula (forma canônica única)", () => {
    expect(ufProjectionKey("sp", "gov", 2)).toBe("projection-uf-SP-gov-t2");
    expect(legacyUfAliasKey("rj")).toBe("projection-uf-RJ");
  });
});

describe("formato de cada chave", () => {
  it("nacional por corrida", () => {
    expect(currentProjectionKey("pres", 1)).toBe("projection-current-pres-t1");
    expect(currentProjectionKey("pres", 2)).toBe("projection-current-pres-t2");
    expect(currentProjectionKey("gov", 1)).toBe("projection-current-gov-t1");
  });

  it("drill-down por UF", () => {
    expect(ufProjectionKey("SP", "pres", 1)).toBe("projection-uf-SP-pres-t1");
    expect(ufProjectionKey("DF", "gov", 2)).toBe("projection-uf-DF-gov-t2");
  });

  it("archive por corrida", () => {
    expect(archiveProjectionKey("pres", 1)).toBe("projection-archive-pres-t1");
  });

  it("aliases legados S04 (já casavam com o padrão — não tinham dois-pontos)", () => {
    expect(LEGACY_CURRENT_ALIAS_KEY).toBe("projection-current");
    expect(legacyUfAliasKey("MG")).toBe("projection-uf-MG");
    expect(isValidGlobalConfigKey(LEGACY_CURRENT_ALIAS_KEY)).toBe(true);
  });

  it("arity preservada: nomeada e alias não colidem", () => {
    expect(ufProjectionKey("SP", "pres", 1)).not.toBe(legacyUfAliasKey("SP"));
    expect(currentProjectionKey("pres", 1)).not.toBe(LEGACY_CURRENT_ALIAS_KEY);
  });
});

// ---------------------------------------------------------------------------
// Validador
// ---------------------------------------------------------------------------

describe("assertValidGlobalConfigKey", () => {
  it("rejeita o esquema ANTIGO com dois-pontos, chave a chave", () => {
    // Estas são exatamente as strings que o repositório gravava até
    // 2026-09-08. O teste existe para que, se alguém as reintroduzir por
    // merge ou por hábito, a suíte fale antes da apuração.
    const esquemaAntigo = [
      "projection:current",
      "projection:current:pres:t1",
      "projection:current:pres:t2",
      "projection:current:gov:t1",
      "projection:uf:SP",
      "projection:uf:SP:pres:t1",
      "projection:archive:pres:t1",
    ];

    for (const key of esquemaAntigo) {
      expect(isValidGlobalConfigKey(key)).toBe(false);
      expect(() => assertValidGlobalConfigKey(key)).toThrow(/":"/);
    }
  });

  it("a mensagem explica: caractere ofensor, padrão, fonte e a saída", () => {
    let message = "";
    try {
      assertValidGlobalConfigKey("projection:current:pres:t1", "writeEdgePayload");
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }

    expect(message).toContain("projection:current:pres:t1");
    expect(message).toContain('":"'); // qual caractere ofendeu
    expect(message).toContain("A-Za-z0-9_-"); // qual é o padrão
    expect(message).toContain("global-config-limits"); // de onde vem
    expect(message).toContain('use "-"'); // o que fazer
    expect(message).toContain("writeEdgePayload"); // quem construiu
  });

  it("rejeita os demais caracteres fora do padrão", () => {
    for (const key of [
      "projection.current",
      "projection current",
      "projection/current",
      "projection@current",
      "projeção-current", // acento — fora de [A-Za-z]
      "projection#current",
    ]) {
      expect(isValidGlobalConfigKey(key)).toBe(false);
      expect(() => assertValidGlobalConfigKey(key)).toThrow(/inválida/);
    }
  });

  it("rejeita string vazia", () => {
    expect(isValidGlobalConfigKey("")).toBe(false);
    expect(() => assertValidGlobalConfigKey("")).toThrow(/vazia/);
  });

  it("rejeita acima de 256 caracteres e aceita exatamente 256", () => {
    const noLimite = "a".repeat(GLOBAL_CONFIG_KEY_MAX_LENGTH);
    const acima = "a".repeat(GLOBAL_CONFIG_KEY_MAX_LENGTH + 1);

    expect(GLOBAL_CONFIG_KEY_MAX_LENGTH).toBe(256);
    expect(isValidGlobalConfigKey(noLimite)).toBe(true);
    expect(isValidGlobalConfigKey(acima)).toBe(false);
    expect(() => assertValidGlobalConfigKey(acima)).toThrow(/257 caracteres, máximo 256/);
  });

  it("aceita e devolve a própria chave quando ela é válida (uso inline)", () => {
    expect(assertValidGlobalConfigKey("projection-current-pres-t1")).toBe(
      "projection-current-pres-t1",
    );
  });

  it("a regex exportada é a mesma que a doc da Vercel publica", () => {
    expect(GLOBAL_CONFIG_KEY_PATTERN.source).toBe(PATTERN_FROM_VERCEL_DOCS.source);
  });
});

describe("validação de sigla — o único componente de chave vindo de fora", () => {
  it("rejeita sigla que não seja exatamente 2 letras", () => {
    for (const bad of ["", "S", "SPX", "S1", "S:", "sp ", "SÃ"]) {
      expect(() => ufProjectionKey(bad, "pres", 1)).toThrow(/sigla de UF inválida/);
      expect(() => legacyUfAliasKey(bad)).toThrow(/sigla de UF inválida/);
    }
  });

  it("o erro aponta a sigla, não a chave — diagnóstico no lugar certo", () => {
    expect(() => ufProjectionKey("SP:1", "pres", 1)).toThrow(/sigla de UF inválida.*"SP:1"/s);
  });
});

// ---------------------------------------------------------------------------
// Camada deprecada de leitura
// ---------------------------------------------------------------------------

describe("esquema deprecado com dois-pontos (só leitura, com prazo)", () => {
  it("reproduz exatamente o esquema antigo — é o que o fallback vai procurar", () => {
    expect(deprecatedColonCurrentProjectionKey("pres", 1)).toBe("projection:current:pres:t1");
    expect(deprecatedColonUfProjectionKey("SP", "pres", 1)).toBe("projection:uf:SP:pres:t1");
    expect(deprecatedColonArchiveProjectionKey("pres", 1)).toBe("projection:archive:pres:t1");
    expect(DEPRECATED_COLON_CURRENT_ALIAS_KEY).toBe("projection:current");
    expect(deprecatedColonLegacyUfAliasKey("SP")).toBe("projection:uf:SP");
  });

  it("essas chaves são inválidas para ESCRITA — existem só no read path", () => {
    // A assimetria é o ponto: o reader pode procurá-las, o writer não pode
    // criá-las. Se um dia alguém passar uma delas para `writeEdgePayload`,
    // a trava do writer lança.
    expect(isValidGlobalConfigKey(deprecatedColonCurrentProjectionKey("pres", 1))).toBe(false);
    expect(isValidGlobalConfigKey(deprecatedColonUfProjectionKey("SP", "gov", 2))).toBe(false);
  });

  it("carrega data de remoção: dia seguinte ao 2º turno", () => {
    // 2º turno: 25/10/2026. Se esta data passar e o código ainda estiver
    // aqui, é dívida — a asserção documenta o compromisso no lugar onde
    // alguém vai olhar.
    expect(DEPRECATED_COLON_KEYS_REMOVAL_DATE).toBe("2026-10-26");
    expect(new Date(DEPRECATED_COLON_KEYS_REMOVAL_DATE).getTime()).toBeGreaterThan(
      new Date("2026-10-25").getTime(),
    );
  });
});
