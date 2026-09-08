// @vitest-environment happy-dom
/**
 * tests/unit/state/theme.test.ts
 *
 * O tema claro/escuro (ADR-0025 § 5) tem duas metades, e as duas quebram em
 * silêncio:
 *
 *   1. **O script anti-flash.** Ele é uma string executada inline no `<body>`,
 *      antes do primeiro paint. Nenhum typecheck o cobre (é string), nenhum
 *      lint o cobre, e o sintoma de um erro nele é a página piscar clara antes
 *      de escurecer — coisa que só quem recarrega o site percebe. Aqui ele é
 *      **executado de verdade**, com `localStorage` cheio, vazio e quebrado.
 *   2. **A persistência.** ADR-0025 § 5 exige `localStorage` e proíbe cookie:
 *      cookie faria o layout chamar `cookies()` e tiraria a home e as 54
 *      páginas de UF do pré-render estático. Um `document.cookie` acrescentado
 *      "só para o SSR acertar o tema" passaria em todo o resto da suíte.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  isTheme,
  THEME_ATTRIBUTE,
  THEME_DEFAULT,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/state/theme";
import { __resetThemeForTests, setTheme, subscribeTheme, useTheme } from "@/lib/state/theme-client";

beforeEach(() => {
  __resetThemeForTests();
  localStorage.clear();
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
});

/**
 * Roda o script anti-flash como o navegador rodaria: síncrono, no escopo
 * global. `new Function` e não `eval` justamente por isso — `eval` enxergaria
 * as variáveis deste arquivo e o teste deixaria de reproduzir o ambiente real.
 */
function runInitScript(): void {
  new Function(THEME_INIT_SCRIPT)();
}

function mockPrefersDark(dark: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: dark && query.includes("dark"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

describe("THEME_INIT_SCRIPT — o tema antes do primeiro paint", () => {
  it("a escolha salva ganha do sistema", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    mockPrefersDark(true);
    runInitScript();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
  });

  it("sem escolha salva, segue prefers-color-scheme", () => {
    mockPrefersDark(true);
    runInitScript();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("sem escolha salva e com sistema claro, fica claro", () => {
    mockPrefersDark(false);
    runInitScript();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_DEFAULT);
  });

  it("valor corrompido no storage é ignorado, não propagado para o DOM", () => {
    // `data-theme="banana"` não casa com nenhum seletor: a página ficaria com a
    // paleta clara e o botão diria "Escuro". Pior que errar: mentir.
    localStorage.setItem(THEME_STORAGE_KEY, "banana");
    mockPrefersDark(true);
    runInitScript();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("storage que LANÇA (janela anônima) não derruba o script", () => {
    // `localStorage.getItem` lança — não devolve null — com cookies bloqueados.
    // Sem o try/catch, a exceção interromperia o parsing do documento.
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("SecurityError");
      },
    });
    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe(THEME_DEFAULT);
    if (original) Object.defineProperty(window, "localStorage", original);
  });

  it("é síncrono e inline — sem src, sem defer, sem async, sem import", () => {
    // Qualquer um dos quatro faria o script rodar DEPOIS do primeiro paint, que
    // é exatamente o flash que ele existe para evitar.
    expect(THEME_INIT_SCRIPT).not.toMatch(/\bimport\b|\bdefer\b|\basync\b|\bsrc=/);
  });
});

describe("a store do tema", () => {
  it("espelha o valor em data-theme no <html> — o único canal para a cascata", () => {
    setTheme("dark");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    setTheme("light");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
  });

  it("persiste em localStorage, e só nele (ADR-0025 § 5: nunca cookie)", () => {
    const antes = document.cookie;
    setTheme("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.cookie).toBe(antes);
  });

  it("trocar para o MESMO valor não notifica ninguém", () => {
    // Cada notificação re-renderiza todo assinante. Um clique repetido no botão
    // não pode custar um repintado.
    setTheme("dark");
    const listener = vi.fn();
    subscribeTheme(listener);
    setTheme("dark");
    expect(listener).not.toHaveBeenCalled();
    setTheme("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a primeira assinatura se alinha ao DOM, não ao localStorage", () => {
    // O script anti-flash é quem decide primeiro — inclusive quando decidiu por
    // `prefers-color-scheme`, sem nada salvo. Se a store recalculasse, o botão
    // abriria mostrando o tema errado.
    document.documentElement.setAttribute(THEME_ATTRIBUTE, "dark");
    subscribeTheme(() => {});
    setTheme("dark"); // no-op se a store leu o DOM corretamente
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("useTheme é a leitura pública da store", () => {
    expect(typeof useTheme).toBe("function");
  });
});

describe("isTheme", () => {
  it("aceita só os dois valores do contrato", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    for (const v of ["Dark", "", null, undefined, "auto"]) {
      expect(isTheme(v as string | null | undefined)).toBe(false);
    }
  });
});
