/**
 * lib/state/theme.ts
 *
 * Contrato do tema claro/escuro (ADR-0025 § 5). Tipo, default, nome do
 * atributo, chave de armazenamento, type guard e o **script anti-flash**.
 *
 * ## Por que este arquivo não importa React
 *
 * `app/layout.tsx` é Server Component e precisa do script anti-flash e do nome
 * do atributo. Um `import { useSyncExternalStore }` aqui faria o Turbopack
 * recusar o build inteiro ("You're importing a module that depends on
 * `useSyncExternalStore` into a React Server Component module") — aconteceu de
 * verdade em 2026-09-08 com `lib/state/view-mode.ts`, e só aparece no
 * `next build`: typecheck, lint e vitest passavam todos. A guarda é o caso
 * `(c2)` de `tests/unit/shell/static-shell.test.ts`.
 *
 * Por isso o contrato mora aqui, sem React e sem `"use client"`, importável dos
 * dois lados; a store com o hook mora em `lib/state/theme-client.ts`.
 *
 * ## Por que localStorage e nunca cookie
 *
 * ADR-0025 § 5, explicitamente: cookie exigiria ler estado por requisição no
 * layout (`cookies()`), e isso tornaria dinâmicas a home e as 54 páginas de UF
 * hoje pré-renderizadas estáticas — o mesmo problema que o `BaseToggle` da
 * Fase 5 já tinha mostrado. A preferência de tema é do visitante, vive no
 * navegador dele e nunca chega ao servidor.
 *
 * `localStorage` também não é PII (constituição § 5): a chave guarda a string
 * `"light"` ou `"dark"`, nada mais, e nunca sai do dispositivo.
 */

export type Theme = "light" | "dark";

/**
 * Tema quando não há escolha salva **e** não dá para perguntar ao sistema —
 * `localStorage` bloqueado, `matchMedia` ausente, JavaScript desligado. É
 * também o tema que o HTML do servidor representa: sem `data-theme` no
 * `<html>`, `app/globals.css` resolve para a paleta clara.
 */
export const THEME_DEFAULT: Theme = "light";

/** Atributo espelhado no `<html>` — a ponte entre a store e a cascata CSS. */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * Chave do `localStorage`. É a mesma do protótipo
 * (`docs/design-system/atlas-menna/ui_kits/atlas-menna/App.jsx:213`), para que
 * quem já usou o kit não perca a preferência.
 */
export const THEME_STORAGE_KEY = "am-theme";

export function isTheme(value: string | null | undefined): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * O script anti-flash, injetado inline por `app/layout.tsx`.
 *
 * ## O problema que ele resolve
 *
 * O tema mora em `localStorage`, que só existe no navegador. O HTML sai do
 * servidor sem `data-theme`, ou seja, **claro**. Se a preferência escura só
 * fosse aplicada na hidratação, todo carregamento de página começaria branco e
 * escureceria depois — o "flash of wrong theme". Não é estética: numa noite de
 * apuração o visitante recarrega a página dezenas de vezes.
 *
 * ## Por que precisa ser inline e síncrono
 *
 * Só um `<script>` inline sem `defer`/`async` roda **antes** do primeiro paint.
 * Um módulo importado, um `useEffect` ou um `next/script` com qualquer
 * estratégia rodam depois. Como ele escreve num atributo do `<html>` e o CSS já
 * está no `<head>`, o primeiro paint já sai no tema certo.
 *
 * ## Precedência
 *
 * 1. escolha salva em `localStorage` (o visitante decidiu);
 * 2. `prefers-color-scheme` do sistema (ele decidiu antes, em outro lugar);
 * 3. `THEME_DEFAULT`.
 *
 * ## Por que o `try/catch`
 *
 * `localStorage` **lança** — não devolve `null` — em janela anônima com
 * cookies bloqueados e em contexto sem origem. Sem a guarda, a exceção
 * interromperia o parsing e a página ficaria sem tema *e* sem os scripts
 * seguintes. No `catch` aplicamos o default e seguimos.
 *
 * Escrito como string de uma linha de propósito: é o corpo de um
 * `dangerouslySetInnerHTML`, e qualquer coisa que o bundler pudesse transformar
 * (JSX, template com `${}`) deixaria de ser auditável no HTML entregue.
 */
export const THEME_INIT_SCRIPT =
  `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `var t=(s==="light"||s==="dark")?s:` +
  `(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");` +
  `document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t);}` +
  `catch(e){document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},${JSON.stringify(THEME_DEFAULT)});}})();`;
