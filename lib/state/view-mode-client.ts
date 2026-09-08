"use client";

/**
 * lib/state/view-mode-client.ts
 *
 * A store do controle "Parcial / Projeção" (ADR-0029 § 2). O contrato — tipo,
 * default, nome do atributo e type guard — vive em `lib/state/view-mode.ts`,
 * que é neutro e importável pelo Server Component do layout; aqui mora só o
 * que depende de React e de DOM.
 *
 * A separação não é estética: `app/layout.tsx` importa `VIEW_MODE_DEFAULT`, e
 * um módulo que importa `useSyncExternalStore` não pode ser alcançado por um
 * Server Component — o `next build` falha, e falha SÓ no build (typecheck,
 * lint e vitest passam).
 *
 * Store própria em vez de `zustand` (que já é dependência): este módulo entra
 * acima da dobra em todas as rotas via o shell, e `useSyncExternalStore` (React,
 * já no bundle) resolve o caso em poucas linhas.
 */

import { useSyncExternalStore } from "react";

import { isViewMode, VIEW_MODE_ATTRIBUTE, VIEW_MODE_DEFAULT, type ViewMode } from "./view-mode";

const listeners = new Set<() => void>();

/**
 * Cache do snapshot. `useSyncExternalStore` exige que `getSnapshot()` retorne
 * um valor **estável por referência** enquanto nada mudou — ler o atributo do
 * DOM a cada chamada seria estável para strings, mas manter o cache aqui
 * evita um `getAttribute` por render de cada assinante.
 */
let snapshot: ViewMode = VIEW_MODE_DEFAULT;
let hydratedFromDom = false;

function syncFromDom(): void {
  if (typeof document === "undefined") return;
  const attr = document.documentElement.getAttribute(VIEW_MODE_ATTRIBUTE);
  snapshot = isViewMode(attr) ? attr : VIEW_MODE_DEFAULT;
  hydratedFromDom = true;
}

/**
 * Assinatura crua da store. Exportada porque `useSyncExternalStore` a esconde
 * atrás de um hook, e o teste precisa provar a regra que importa: um
 * `setViewMode` com o MESMO valor não pode notificar ninguém (senão cada
 * clique repetido no controle re-renderiza o mapa inteiro à toa).
 */
export function subscribeViewMode(onStoreChange: () => void): () => void {
  return subscribe(onStoreChange);
}

function subscribe(onStoreChange: () => void): () => void {
  // Primeira assinatura: alinha a store com o que o servidor escreveu no
  // `<html>`. Sem isto, um futuro script anti-flash (que restaure a
  // preferência antes da hidratação, como o `ThemeToggle` do ADR-0025 § 5
  // fará) veria a store discordar do DOM.
  if (!hydratedFromDom) syncFromDom();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function getSnapshot(): ViewMode {
  return snapshot;
}

/**
 * Snapshot do servidor E do primeiro render do cliente. Tem que ser o
 * default literal: qualquer leitura de DOM aqui quebraria a hidratação.
 */
function getServerSnapshot(): ViewMode {
  return VIEW_MODE_DEFAULT;
}

/** Troca a base enfatizada. No-op quando o valor não mudou. */
export function setViewMode(next: ViewMode): void {
  if (snapshot === next) return;
  snapshot = next;
  hydratedFromDom = true;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(VIEW_MODE_ATTRIBUTE, next);
  }
  for (const listener of listeners) listener();
}

/**
 * Assina a base enfatizada. Use **apenas** quando o valor precisa existir em
 * JavaScript (hoje: o repintado do choropleth). Para diferença puramente
 * visual, prefira os atributos `data-view-cell` / `data-view-when` e deixe o
 * CSS resolver — custa zero JS e funciona antes da hidratação.
 */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Só para testes: devolve a store ao estado inicial. */
export function __resetViewModeForTests(): void {
  snapshot = VIEW_MODE_DEFAULT;
  hydratedFromDom = false;
  listeners.clear();
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(VIEW_MODE_ATTRIBUTE, VIEW_MODE_DEFAULT);
  }
}
