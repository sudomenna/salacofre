/**
 * tests/unit/design-system/party-separation.test.ts
 *
 * **O gate que impede dois partidos de terem a mesma cor.**
 *
 * A constituição § 2 manda a paleta editorial responder **qual** partido está
 * ganhando. Toda a maquinaria já existente mede a paleta contra o lado de fora
 * — ΔE76 ≥ 12 do hex oficial (`party-delta-e.test.ts`), 4,5:1 de contraste
 * (`party-chip-contrast.test.ts`, `party-text-contrast.test.ts`). Nenhuma media
 * a paleta contra **ela mesma**, e o kit chegou com cinco pares que ninguém
 * distingue (medido em 2026-09-08, no CSS de então):
 *
 *   --party-dc  #3b6fb0 × --party-pp   #2c6fb0 → ΔE76  2,52
 *   --party-pco #a1332b × --party-pstu #9e2b2b → ΔE76  3,55
 *   --party-pcb #b63a2e × --party-pco  #a1332b → ΔE76  8,25
 *   --party-mdb #2e8b57 × --party-psd  #2f8f6b → ΔE76  9,54
 *   --party-pcb #b63a2e × --party-pstu #9e2b2b → ΔE76  9,98
 *
 * — e uma sexta, invisível nas bases, que só aparecia nas tintas: PSB e PSOL
 * distavam 10,51 como base (#c9a227 × #d6a400) e **2,51** como texto
 * (#896c00 × #8d6b00), porque escurecer para alcançar 4,5:1 comprime
 * distâncias. Uma correção de a11y tinha criado uma colisão de identidade.
 *
 * O gerador (`scripts/gen-party-scale.ts`, seção 7b) passou a falhar nisso. Mas
 * o gerador só roda quando alguém o roda; este teste refaz a conta sobre o
 * **CSS commitado**, a cada `pnpm test`, com a colorimetria **reimplementada**
 * — um teste que importa a função que quer verificar não verifica nada.
 *
 * Cross-refs:
 *   - Constituição § 2: `docs/constitution.md`
 *   - ADR-0024: `docs/architecture/adrs/0024-paleta-editorial-por-partido.md`
 *   - Gerador, seções 7b (gate) e 7c (solver): `scripts/gen-party-scale.ts`
 *   - Tabela e pares apertados: `docs/design-system/tokens.md`
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// A única coisa importada do gerador é o **texto da mensagem de falha** — e ela
// é justamente o que o último bloco deste arquivo trava. A aritmética abaixo é
// independente de propósito; se as duas divergirem, este teste falha, que é o
// comportamento desejado.
import {
  PARTY_SEPARATION_FLOOR,
  separationFailureMessage,
} from "../../../scripts/gen-party-scale.ts";

// ---------------------------------------------------------------------------
// Contrato numérico
// ---------------------------------------------------------------------------

/**
 * Piso de ΔE76 entre partidos diferentes, no mesmo papel visual.
 *
 * Escrito à mão aqui (e não importado) porque é o **contrato**, não um detalhe
 * de implementação: se alguém abaixar `PARTY_SEPARATION_FLOOR` no gerador para
 * fazer uma colisão passar, o teste abaixo — que compara os dois — reprova.
 *
 * Por que 12 e não outro número: é o mesmo `DELTA_E_FLOOR` que o repositório já
 * usa contra os hexes oficiais (mesma pergunta perceptual, "estas duas cores
 * são a mesma?"), e cai dentro de um vão do próprio dado — ordenados, os pares
 * do kit iam 9,98 · 11,69 · **vão** · 12,09 · 12,13. A tabela completa de
 * custo por piso está no comentário da seção 7b do gerador.
 */
const SEPARATION_FLOOR = 12;

// ---------------------------------------------------------------------------
// Colorimetria — reimplementada de propósito (ver docblock)
// ---------------------------------------------------------------------------

/** sRGB (#rrggbb) → CIE Lab, D65 / observador 2°. */
function hexToLab(hex: string): [number, number, number] {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(Number.parseInt(hex.slice(1, 3), 16));
  const g = lin(Number.parseInt(hex.slice(3, 5), 16));
  const b = lin(Number.parseInt(hex.slice(5, 7), 16));
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > (6 / 29) ** 3 ? Math.cbrt(t) : t / (3 * (6 / 29) ** 2) + 4 / 29);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** ΔE76 (CIE 1976) — distância euclidiana em Lab. */
function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = hexToLab(a);
  const [l2, a2, b2] = hexToLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ---------------------------------------------------------------------------
// Entrada: o CSS commitado
// ---------------------------------------------------------------------------

const ROOT = path.resolve(import.meta.dirname, "../../..");
const TOKENS_CSS = readFileSync(path.join(ROOT, "app/tokens-party.css"), "utf8");

function parseTokens(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /--party-([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6})\s*;/g;
  let m = re.exec(css);
  while (m !== null) {
    if (m[1] && m[2]) map.set(m[1], m[2]);
    m = re.exec(css);
  }
  return map;
}

const TOKENS = parseTokens(TOKENS_CSS);

/** Estados de corrida: não são partido, logo não entram na comparação. */
const STATE_TOKENS = new Set(["tie", "none"]);

const PARTY_SLUGS = [
  ...new Set(
    [...TOKENS.keys()]
      .map((n) => n.replace(/-(?:[1-5]|chip|ink|text)$/, ""))
      .filter((s) => !STATE_TOKENS.has(s)),
  ),
].sort();

/**
 * Os três papéis que **identificam** um partido e aparecem sem rótulo que os
 * desambigue: a cor de identidade, o fundo do chip sólido e a tinta de texto.
 * Exatamente o mesmo conjunto que o gate contra os hexes oficiais cobre.
 *
 * `-ink` fica fora porque é preto ou branco do kit, não cor de partido — dois
 * partidos com a mesma tinta é o esperado, não um defeito.
 */
const ROLES = ["base", "chip", "text"] as const;
type Role = (typeof ROLES)[number];

function tokenName(slug: string, role: Role): string {
  return role === "base" ? `--party-${slug}` : `--party-${slug}-${role}`;
}

function roleHex(slug: string, role: Role): string {
  return TOKENS.get(role === "base" ? slug : `${slug}-${role}`) as string;
}

interface Pair {
  role: Role;
  a: string;
  b: string;
  deltaE: number;
}

const PAIRS: Pair[] = (() => {
  const out: Pair[] = [];
  for (let i = 0; i < PARTY_SLUGS.length; i++) {
    for (let j = i + 1; j < PARTY_SLUGS.length; j++) {
      const a = PARTY_SLUGS[i] as string;
      const b = PARTY_SLUGS[j] as string;
      for (const role of ROLES) {
        out.push({ role, a, b, deltaE: deltaE76(roleHex(a, role), roleHex(b, role)) });
      }
    }
  }
  return out.sort((x, y) => x.deltaE - y.deltaE);
})();

// ---------------------------------------------------------------------------
// Sanidade
// ---------------------------------------------------------------------------

describe("app/tokens-party.css — cobertura da comparação", () => {
  it("compara os 31 partidos em três papéis: 465 pares × 3 = 1395 medições", () => {
    expect(PARTY_SLUGS.length).toBe(31);
    expect(PAIRS.length).toBe(((31 * 30) / 2) * 3);
  });

  it("todo papel comparado existe no CSS de todo partido", () => {
    for (const slug of PARTY_SLUGS) {
      for (const role of ROLES) {
        expect(roleHex(slug, role), `${tokenName(slug, role)} ausente`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("o piso do gerador é o piso deste contrato", () => {
    expect(
      PARTY_SEPARATION_FLOOR,
      "PARTY_SEPARATION_FLOOR mudou em scripts/gen-party-scale.ts. Se a mudança é\n" +
        "deliberada, atualize SEPARATION_FLOOR aqui E a seção de paleta em\n" +
        "docs/design-system/tokens.md, com a tabela de custo por piso refeita.",
    ).toBe(SEPARATION_FLOOR);
  });
});

// ---------------------------------------------------------------------------
// O gate
// ---------------------------------------------------------------------------

describe("constituição § 2 — dois partidos nunca têm a mesma cor", () => {
  it.each(
    ROLES,
  )("papel %s: todo par de partidos fica a ΔE76 ≥ 12 (a paleta diz QUAL partido)", (role) => {
    for (const p of PAIRS.filter((x) => x.role === role)) {
      expect(
        p.deltaE,
        `${separationFailureMessage(
          { token: tokenName(p.a, role), hex: roleHex(p.a, role), nome: p.a.toUpperCase() },
          { token: tokenName(p.b, role), hex: roleHex(p.b, role), nome: p.b.toUpperCase() },
          p.deltaE,
          SEPARATION_FLOOR,
        )}\n\n` +
          "Dois partidos com a mesma cor não respondem a pergunta que a paleta existe para\n" +
          "responder. Rode `pnpm gen:party-scale --suggest`: ele calcula o conjunto MÍNIMO\n" +
          "de hexes a mudar em PARTY_BASE e imprime as linhas prontas. Não relaxe o piso.",
      ).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
    }
  });

  it("nenhum papel esconde uma colisão que os outros não mostram", () => {
    // O caso real que motivou medir os três papéis e não só a base: PSB e PSOL
    // passavam como base e colidiam como texto, porque escurecer para alcançar
    // 4,5:1 comprime distâncias. Este teste é a versão genérica disso.
    const worstByRole = Object.fromEntries(
      ROLES.map((r) => [r, PAIRS.find((p) => p.role === r)?.deltaE ?? 0]),
    );
    for (const [role, worst] of Object.entries(worstByRole)) {
      expect(worst, `pior par no papel ${role}`).toBeGreaterThanOrEqual(SEPARATION_FLOOR);
    }
  });
});

// ---------------------------------------------------------------------------
// Por que os níveis 1..5 NÃO entram no gate
// ---------------------------------------------------------------------------

describe("os níveis de margem ficam fora do gate — e não por esquecimento", () => {
  it("é aritmeticamente impossível separar 31 partidos no nível 1", () => {
    // Os cinco níveis são alvos absolutos de L*/C* iguais para todos os
    // partidos: o nível 1 de todo mundo mora no círculo L* 90 / C* 10. Trinta e
    // um pontos nesse círculo ficam, no melhor arranjo possível, a
    // 2·10·sen(180°/31) ≈ 2,02 um do outro. Exigir 12 ali seria exigir o
    // impossível — e é desnecessário: o nível comunica MARGEM; quem responde
    // "qual partido" é a base, o chip e a tinta, que o gate acima cobre.
    const bestPossible = 2 * 10 * Math.sin(Math.PI / PARTY_SLUGS.length);
    expect(bestPossible).toBeLessThan(SEPARATION_FLOOR);

    const level1 = PARTY_SLUGS.map((s) => TOKENS.get(`${s}-1`) as string);
    let closest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < level1.length; i++) {
      for (let j = i + 1; j < level1.length; j++) {
        closest = Math.min(closest, deltaE76(level1[i] as string, level1[j] as string));
      }
    }
    expect(closest).toBeLessThan(SEPARATION_FLOOR);
  });
});

// ---------------------------------------------------------------------------
// O critério, travado: a mensagem tem que ser acionável
// ---------------------------------------------------------------------------

describe("a mensagem de falha nomeia o par, o ΔE e o piso", () => {
  // **Por que isto é um teste e não uma convenção.** Numa paleta de 31 partidos
  // e 1395 medições, um gate que diz só "há colisões" transfere para quem for
  // corrigir todo o trabalho de descobrir *onde* — e um gate caro de obedecer é
  // um gate que alguém contorna. As quatro informações abaixo são o que torna a
  // correção mecânica: quais dois tokens, com que hexes, a que distância, e de
  // quanto era o piso.
  const A = { token: "--party-pco", hex: "#a1332b", nome: "PCO" };
  const B = { token: "--party-pstu", hex: "#9e2b2b", nome: "PSTU" };
  const msg = separationFailureMessage(A, B, 3.5473, SEPARATION_FLOOR);

  it("nomeia os dois tokens em conflito", () => {
    expect(msg).toContain("--party-pco");
    expect(msg).toContain("--party-pstu");
  });

  it("mostra os dois hexes, para o par ser reproduzível fora do teste", () => {
    expect(msg).toContain("#a1332b");
    expect(msg).toContain("#9e2b2b");
  });

  it("mostra o ΔE76 medido com duas casas", () => {
    expect(msg).toContain("ΔE76 3.55");
  });

  it("mostra o piso e o quanto falta para alcançá-lo", () => {
    expect(msg).toContain(`piso ${SEPARATION_FLOOR}`);
    expect(msg).toContain("faltam 8.45");
  });

  it("usa o piso do gerador quando nenhum é passado", () => {
    expect(separationFailureMessage(A, B, 3.5473)).toContain(`piso ${PARTY_SEPARATION_FLOOR}`);
  });
});
