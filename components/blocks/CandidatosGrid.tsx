/**
 * components/blocks/CandidatosGrid.tsx
 *
 * RF-146 / RF-148 / RF-149 — a grade de candidaturas de UMA corrida
 * (um cargo, uma UF), já filtrada pelo chamador.
 *
 * **Puro e burro de propósito.** Não lê Blob, não conhece `searchParams`, não
 * decide publicabilidade nem situação. Recebe a lista pronta e a desenha — é o
 * que permite o mesmo bloco servir `/candidatos` (T-13) e o estado "aguardando
 * dados" das páginas de cargo (T-14, RF-149) sem uma segunda implementação.
 *
 * Server Component puro: zero JS novo (RF-146, RNF-007a em 148,7 KiB de 150).
 *
 * ## `<ul>`/`<li>`, não tabela
 *
 * Não há relação linha × coluna aqui: cada célula é uma candidatura inteira, e
 * as colunas são acidente de largura de viewport. Marcar como `<table>` faria o
 * leitor de tela anunciar coordenadas que não significam nada. Lista semântica
 * com nome e partido em texto é o que o RNF-023 pede (RF-149, último critério).
 *
 * ## Ordem: por número, sempre
 *
 * Constituição § 2 — "nomes e siglas aparecem sempre na mesma ordem dentro de
 * uma mesma corrida" — e § 6 (determinismo). Ordenar por nome, por partido ou
 * por "relevância" introduziria critério editorial onde não pode haver nenhum.
 * O desempate por `sqcand` existe porque `(cargo, uf, numero)` **não é única
 * nem na fonte oficial**: 4 colisões sobrevivem ao filtro de publicabilidade,
 * todas cargo 6 na Bahia, duas delas com o mesmo nome no mesmo número
 * (ADR-0042 item 5). Sem ele, a ordem de duas candidaturas com o mesmo número
 * dependeria da ordem de leitura do banco.
 *
 * ## `content-visibility`
 *
 * Cargo 6 em São Paulo tem ~1.131 candidaturas publicáveis. Sem
 * `content-visibility: auto`, o navegador faz layout e paint das 1.131 células
 * de uma vez. `contain-intrinsic-size` dá a altura estimada de uma célula
 * ainda não renderizada — sem ela, a barra de rolagem salta durante o scroll,
 * que é CLS (RNF-002) só que pior, porque acontece enquanto o leitor lê.
 */

import { CandidateCard } from "@/components/atoms/data/CandidateCard";
import type { CandidatoIdentidade } from "@/lib/blob/candidatos";

/**
 * Quantas células saem com `loading="eager"`.
 *
 * ~6 é o que cabe acima da dobra em desktop; abaixo disso o LCP espera uma
 * imagem preguiçosa, acima disso a rede fica ocupada com foto que ninguém vê.
 * Nenhuma delas usa `priority` — ver `<CandidateAvatar>`, bloco 4.
 */
export const CANDIDATOS_GRID_EAGER_CELLS = 6;

/**
 * Altura estimada de uma célula, para `contain-intrinsic-size`.
 *
 * A foto é 161×225 numa coluna de ~160px, mais nome, chip e número. É
 * estimativa declarada, não medição — e é exatamente para isso que a
 * propriedade serve: errar aqui custa um salto de barra de rolagem, não um
 * erro de layout.
 */
const CELULA_INTRINSIC_SIZE = "auto 320px";

export interface CandidatosGridProps {
  /** A fatia já filtrada por cargo, UF e busca. Pode vir vazia. */
  candidatos: readonly CandidatoIdentidade[];
  /** Sigla da UF da fatia — `"BR"` em Presidente. Endereça a foto. */
  uf: string;
  /** Nome acessível da lista — ex. "Candidaturas a Deputado Federal na Bahia". */
  rotulo: string;
  /**
   * O que dizer quando não há nada a mostrar. Estado **nomeado**: o RF-147
   * proíbe tanto o 500 quanto a grade vazia em silêncio, e o chamador é quem
   * sabe se o vazio é "filtro sem resultado" ou "esta corrida não foi
   * publicada" — são notícias diferentes para o leitor (constituição § 8).
   */
  textoVazio: string;
  className?: string;
}

/** Ordem canônica — ver o bloco "Ordem" no cabeçalho. */
function porNumero(a: CandidatoIdentidade, b: CandidatoIdentidade): number {
  if (a.numero !== b.numero) return a.numero - b.numero;
  return a.sqcand.localeCompare(b.sqcand);
}

export function CandidatosGrid({
  candidatos,
  uf,
  rotulo,
  textoVazio,
  className,
}: CandidatosGridProps) {
  const ordenados = [...candidatos].sort(porNumero);
  const total = ordenados.length;

  return (
    <div data-testid="candidatos-grid" className={className}>
      {/*
        A contagem sai de `total`, nunca de constante (design 018 § D8: quatro
        frases da spec 017 viraram falsas de uma vez quando a granularidade
        mudou). `aria-live` porque o filtro é `<form method="get">`: em
        navegação com leitor de tela, a contagem é a confirmação de que o
        submit fez alguma coisa.
      */}
      <p
        data-testid="candidatos-grid-contagem"
        aria-live="polite"
        style={{
          font: "var(--type-data)",
          color: "var(--text-secondary)",
          margin: "0 0 var(--space-3)",
        }}
      >
        {total === 1 ? "1 candidatura" : `${total} candidaturas`}
      </p>

      {total === 0 ? (
        <p
          data-testid="candidatos-grid-vazio"
          style={{ font: "var(--type-body)", color: "var(--text-secondary)", margin: 0 }}
        >
          {textoVazio}
        </p>
      ) : (
        <ul
          aria-label={rotulo}
          data-testid="candidatos-grid-lista"
          className="grid list-none"
          style={{
            gap: "var(--space-5) var(--space-4)",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            margin: 0,
            padding: 0,
          }}
        >
          {ordenados.map((candidato, i) => (
            <li
              key={candidato.sqcand}
              style={{ contentVisibility: "auto", containIntrinsicSize: CELULA_INTRINSIC_SIZE }}
            >
              <CandidateCard
                candidato={candidato}
                uf={uf}
                eager={i < CANDIDATOS_GRID_EAGER_CELLS}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
