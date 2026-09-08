/**
 * app/(pres)/layout.tsx
 *
 * A moldura persistente da trilha PRESIDENTE (ADR-0033 § 1). Envolve as duas
 * rotas do cargo — `/` (Brasil) e `/uf/[sigla]` — e é o motivo de o mapa não
 * desaparecer no salto entre elas: o App Router não desmonta um segmento de
 * `layout.tsx` quando só o `page.tsx` filho muda.
 *
 * `(pres)` é um GRUPO de rotas: os parênteses tiram o segmento da URL. `/`
 * continua `/` e `/uf/SP` continua `/uf/SP` — nenhum link, `canonical`,
 * sitemap ou `generateStaticParams` muda de valor por causa desta pasta.
 *
 * ## As duas invariantes que este arquivo NÃO pode violar
 *
 * 1. `app/layout.tsx` (`RootLayout`) segue sem `cookies()`, `headers()` ou
 *    `searchParams` — é o que mantém as 54 páginas de UF pré-renderizadas
 *    estáticas (ADR-0025 §§ 2 e 5). Por isso a moldura é um layout ANINHADO,
 *    abaixo do raiz, e não o raiz.
 * 2. Este layout também não lê dado nenhum. Ele é um Server Component puro que
 *    hospeda um Client Component (`<PersistentMapFrame />`); `useParams()` e
 *    `fetch` acontecem lá dentro, no cliente, e não tornam esta rota dinâmica.
 *    Um `layout.tsx` que lesse Edge Config aqui tiraria `/` e as 27 páginas de
 *    UF presidencial do estático — exatamente o que a invariante 1 protege.
 */

import { AppShellSplit } from "@/components/layout/AppShellSplit";
import { PersistentMapFrame } from "@/components/layout/PersistentMapFrame";

export default function PresLayout({ children }: { children: React.ReactNode }) {
  return <AppShellSplit map={<PersistentMapFrame cargo="pres" />}>{children}</AppShellSplit>;
}
