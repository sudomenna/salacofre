"use client";

/**
 * lib/state/theme-client.ts
 *
 * A store do tema claro/escuro (ADR-0025 § 5). O contrato — tipo, default,
 * atributo, chave de storage, type guard e o script anti-flash — vive em
 * `lib/state/theme.ts`, que é neutro e importável pelo Server Component do
 * layout; aqui mora só o que depende de React e de DOM.
 *
 * A separação não é estética: `app/layout.tsx` importa `THEME_INIT_SCRIPT`, e
 * um módulo que importa `useSyncExternalStore` não pode ser alcançado por um
 * Server Component — o `next build` falha, e falha SÓ no build (typecheck, lint
 * e vitest passam). Mesma lição de `lib/state/view-mode-client.ts`.
 *
 * Store própria em vez de `zustand` (que já é dependência): este módulo entra
 * acima da dobra em todas as rotas via o shell, e `useSyncExternalStore`
 * (React, já no bundle) resolve o caso em poucas linhas.
 *
 * ## A fonte de verdade é o DOM, não esta store
 *
 * Quem escreve `data-theme` primeiro é o script anti-flash, antes do primeiro
 * paint. A store se alinha a ele na primeira assinatura, em vez de recalcular a
 * preferência — se as duas leituras divergissem (o script leu
 * `prefers-color-scheme`, a store leria `localStorage` vazio), o botão abriria
 * mostrando o tema errado.
 */

import { useSyncExternalStore } from "react";

import { isTheme, THEME_ATTRIBUTE, THEME_DEFAULT, THEME_STORAGE_KEY, type Theme } from "./theme";

const listeners = new Set<() => void>();

/**
 * Cache do snapshot. `useSyncExternalStore` exige que `getSnapshot()` devolva
 * um valor estável enquanto nada mudou; manter o cache aqui evita um
 * `getAttribute` por render de cada assinante.
 */
let snapshot: Theme = THEME_DEFAULT;
let hydratedFromDom = false;

function syncFromDom(): void {
  if (typeof document === "undefined") return;
  const attr = document.documentElement.getAttribute(THEME_ATTRIBUTE);
  snapshot = isTheme(attr) ? attr : THEME_DEFAULT;
  hydratedFromDom = true;
}

function subscribe(onStoreChange: () => void): () => void {
  // Primeira assinatura: alinha a store com o que o script anti-flash escreveu
  // no `<html>` antes do primeiro paint.
  if (!hydratedFromDom) syncFromDom();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * Assinatura crua da store. Exportada porque `useSyncExternalStore` a esconde
 * atrás de um hook, e o teste precisa provar que `setTheme` com o MESMO valor
 * não notifica ninguém.
 */
export function subscribeTheme(onStoreChange: () => void): () => void {
  return subscribe(onStoreChange);
}

function getSnapshot(): Theme {
  return snapshot;
}

/**
 * Snapshot do servidor E do primeiro render do cliente. Tem que ser o default
 * literal: qualquer leitura de DOM aqui quebraria a hidratação, porque o HTML
 * do servidor não conhece a preferência do visitante.
 */
function getServerSnapshot(): Theme {
  return THEME_DEFAULT;
}

/**
 * Troca o tema: escreve no `<html>` (a cascata faz o resto) e persiste em
 * `localStorage`. No-op quando o valor não mudou.
 *
 * A escrita em `localStorage` é a ÚNICA persistência — nunca cookie
 * (ADR-0025 § 5): cookie exigiria `cookies()` no layout e tiraria as 54 páginas
 * de UF do pré-render estático. E ela é a última coisa a acontecer, dentro de
 * `try/catch`: em janela anônima com storage bloqueado o `setItem` lança, e o
 * tema deve trocar assim mesmo — só não sobrevive ao reload.
 */
export function setTheme(next: Theme): void {
  if (snapshot === next) return;
  snapshot = next;
  hydratedFromDom = true;
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, next);
  }
  for (const listener of listeners) listener();
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage indisponível (janela anônima, cookies bloqueados). A preferência
    // vale para esta sessão e some no reload — melhor que não trocar.
  }
}

/** Assina o tema ativo. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Só para testes: devolve a store ao estado inicial. */
export function __resetThemeForTests(): void {
  snapshot = THEME_DEFAULT;
  hydratedFromDom = false;
  listeners.clear();
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  }
}
