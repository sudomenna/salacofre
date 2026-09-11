"use client";

/**
 * components/layout/UfPicker.tsx
 *
 * O seletor de UF do protótipo — botão sobreposto ao canto superior direito do
 * mapa (`ui_kits/atlas-menna/App.jsx:316`) que abre uma `<Sheet>` com kicker
 * "Escolher UF" e a grade das 27 unidades federativas ordenadas por nome
 * (`App.jsx:362-369`).
 *
 * ## Uma divergência que é melhoria, não porte
 *
 * No kit **só São Paulo é clicável** — os outros 26 nascem `disabled`, com a
 * nota "no protótipo, candidaturas estaduais estão carregadas apenas para São
 * Paulo". Aqui as 27 são links reais: a rota de UF existe para todas.
 *
 * São `<Link>` do `next/link`, não `<button onClick={router.push}>`, por dois
 * motivos que se somam:
 *   - **a moldura do mapa não pode desmontar.** O ADR-0033 § 1 põe o mapa num
 *     `layout.tsx` de grupo de rotas exatamente para ele sobreviver à troca de
 *     UF. Navegação client-side do App Router preserva o segmento de layout;
 *     um `window.location` recarregaria a página e destruiria a instância
 *     MapLibre — que é o custo que o ADR existe para evitar.
 *   - **é um link, e o usuário sabe disso.** Botão do meio, Cmd+clique, "abrir
 *     em nova aba", pré-visualização de destino na barra de status: tudo isso
 *     vem de graça com `<a href>` e teria que ser reimplementado (mal) com um
 *     `onClick`.
 *
 * ## Forma da folha
 *
 * `<Sheet>` na variante MODAL (bottom sheet com scrim), não na `side`. O kit
 * usa `side={desktop}` — cartão flutuante ancorado ao mapa no desktop. Aqui:
 *   - a variante `side` é `position: absolute` e não-modal; ancorada dentro da
 *     moldura do mapa ela cobriria o próprio mapa que o leitor está usando
 *     para se localizar, e ficaria sem scrim para dizer que está por cima;
 *   - a folha do MUNICÍPIO (`<MunicipioExplorer>`) já é modal nos dois
 *     breakpoints desde S07/Bloco 2. Duas folhas com comportamento diferente
 *     na mesma tela custam mais do que a fidelidade ao kit rende.
 * O `<Sheet>` modal já resolve Esc, foco de entrada, foco de retorno e
 * `aria-modal` (WCAG 2.1.2 / RNF-022).
 *
 * ## Alvo de toque
 *
 * O botão é `<Button size="md">` = `--tap-min` (44px). `size="sm"` (32px) é
 * densidade de painel no desktop e não serve como alvo primário sobre o mapa,
 * que é a superfície mais tocada no mobile. Cada UF da grade tem 44px pela
 * mesma razão.
 */

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/atoms/controls/Button";
import { ufsPorNome } from "@/components/atoms/maps/_shared";
import { Sheet } from "@/components/atoms/overlays/Sheet";

export interface UfPickerProps {
  /**
   * Qual corrida está aberta — decide o destino de cada UF:
   * `pres` → `/uf/<SIGLA>`, `gov` → `/uf/<SIGLA>/governador`.
   */
  cargo: "pres" | "gov";
  /** UF corrente, quando a rota já é de UF. Ganha `aria-current="page"`. */
  atual?: string | null;
}

/** Destino da UF na corrida corrente. */
export function ufHref(cargo: "pres" | "gov", sigla: string): string {
  return cargo === "gov" ? `/uf/${sigla}/governador` : `/uf/${sigla}`;
}

const ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "var(--space-2)",
  minHeight: "var(--tap-min)",
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-hairline)",
  borderRadius: "var(--radius-sm)",
  font: "var(--type-body-sm)",
  color: "var(--text-primary)",
  textDecoration: "none",
};

const ITEM_ATUAL_STYLE: React.CSSProperties = {
  ...ITEM_STYLE,
  background: "var(--surface-inverse)",
  color: "var(--text-inverse)",
  borderColor: "var(--surface-inverse)",
};

/**
 * A grade em si, separada do botão por um motivo de teste: o `<Sheet>` só
 * existe depois de um clique, e a suíte unitária renderiza por
 * `renderToStaticMarkup`, que não hidrata nem dispara eventos. Exportando a
 * grade, o contrato dela (27 destinos, ordem, `href`, alvo de toque) é medido
 * sem browser; a ABERTURA fica para o e2e.
 */
export function UfPickerGrid({
  cargo,
  atual,
  onNavigate,
}: {
  cargo: "pres" | "gov";
  atual?: string | null;
  onNavigate?: () => void;
}) {
  const ufs = ufsPorNome();
  const atualUpper = atual?.toUpperCase() ?? null;

  return (
    <nav aria-label="Unidades federativas">
      <ul
        data-testid="uf-picker-grid"
        className="grid"
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          gap: "var(--space-2)",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        }}
      >
        {ufs.map((uf) => {
          const eAtual = uf.sigla === atualUpper;
          return (
            <li key={uf.sigla}>
              <Link
                href={ufHref(cargo, uf.sigla)}
                data-testid="uf-picker-item"
                data-sigla={uf.sigla}
                aria-current={eAtual ? "page" : undefined}
                onClick={onNavigate}
                style={eAtual ? ITEM_ATUAL_STYLE : ITEM_STYLE}
              >
                <span className="min-w-0 truncate">{uf.nome}</span>
                <span className="flex-none" style={{ font: "var(--type-figure-sm)" }}>
                  {uf.sigla}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function UfPicker({ cargo, atual }: UfPickerProps) {
  const [aberto, setAberto] = useState(false);
  const atualUpper = atual?.toUpperCase() ?? null;

  return (
    <>
      <Button
        variant="secondary"
        size="md"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        // A moldura é `--surface-page`: sem fundo próprio o botão sumiria
        // contra o mapa. Mesma razão do `background` que o kit crava no botão
        // equivalente (`App.jsx:316`), aqui via token.
        style={{ background: "var(--surface-card)" }}
      >
        {atualUpper ?? "Escolher UF"}
      </Button>

      {aberto ? (
        <Sheet
          open
          onClose={() => setAberto(false)}
          kicker="Escolher UF"
          title={cargo === "gov" ? "Governador" : "Presidente"}
          headingLevel={2}
        >
          <UfPickerGrid cargo={cargo} atual={atualUpper} onNavigate={() => setAberto(false)} />
          <p
            style={{
              margin: "var(--space-3) 0 0",
              font: "var(--type-body-sm)",
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
            }}
          >
            As 27 unidades federativas, em ordem alfabética de nome. Abrir uma delas troca a página
            sem recarregar o mapa.
          </p>
        </Sheet>
      ) : null}
    </>
  );
}
