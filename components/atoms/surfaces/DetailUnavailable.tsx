/**
 * components/atoms/surfaces/DetailUnavailable.tsx
 *
 * Estado "detalhe indisponível" de uma seção — o que uma seção mostra quando a
 * fonte que a alimenta não respondeu.
 *
 * ## Por que existe
 *
 * Desde o [ADR-0032](../../../docs/architecture/adrs/0032-detalhe-municipal-vercel-blob.md)
 * a página de UF tem **dois** read paths com modos de falha diferentes: o
 * resumo vem do Global Config, o detalhe municipal e as séries vêm do Vercel
 * Blob. Eles falham de forma independente, e o ADR é explícito sobre o que a
 * UI deve fazer quando o segundo falha:
 *
 *   > "seções de detalhe municipal (...) renderizam em estado 'detalhe
 *   > indisponível' explícito, **sempre no DOM** (mesmo princípio do ADR-0017
 *   > aplicado a uma fonte de dado, não só a uma camada de candidato) — nunca
 *   > escondem o bloco nem mostram silenciosamente vazio."
 *
 * É a diferença entre "não temos esse dado agora" e "esse dado não existe".
 * Esconder o bloco comunica a segunda coisa quando a verdade é a primeira —
 * e, na noite da apuração, um bloco que some é indistinguível de um bloco que
 * nunca deveria estar lá.
 *
 * ## Por que não é um `role="status"`
 *
 * O conteúdo é renderizado no servidor e não muda depois da hidratação: uma
 * live region anunciaria o texto sem que nada tenha acontecido. Texto normal já
 * é percorrido por leitor de tela na ordem do documento — que é o que o
 * ADR-0017 pede.
 *
 * Server Component puro: zero estado, zero evento, zero JS novo no bundle.
 */

import type { CSSProperties } from "react";

import type { UfDetailUnavailableReason } from "@/lib/blob/uf-detail";
import { formatTimeHMS } from "@/lib/utils/format";

/**
 * Os quatro motivos de falha de leitura ({@link UfDetailUnavailableReason})
 * mais `"empty"` e `"sem_serie"`.
 *
 * Os dois últimos não são falha de leitura: são a leitura ter dado **certo** e
 * o que se procurava não estar lá. Cada um merece texto próprio pela mesma
 * razão — a notícia é outra, e a ação de quem lê (e de quem opera) é outra.
 *
 * `"empty"` — o detalhe chegou e nenhum município tem dado apurado. Caso real
 * de uma UF cuja cobertura municipal ainda é 0% (39% de cobertura nacional
 * hoje, constituição § 8).
 *
 * `"sem_serie"` — o detalhe chegou e o produtor não emitiu a série por
 * candidatura (spec 020). Sem este motivo, "o Blob não respondeu"
 * (`fetch_error`) e "o Blob respondeu sem a série" cairiam no mesmo texto, e na
 * noite da apuração o operador iria caçar rede quando o que faltou foi
 * publicação — duas causas com correções opostas.
 *
 * Os dois recebem o mesmo tratamento de "sempre no DOM" que as falhas:
 * esconder um bloco vazio é a mesma mentira que esconder um que falhou.
 */
export type DetailUnavailableReason = UfDetailUnavailableReason | "empty" | "sem_serie";

/**
 * Uma frase por motivo. Escritas para o leitor do site, não para o operador:
 * dizem o que aconteceu com o dado, sem jargão de infraestrutura.
 */
const REASON_TEXT: Record<DetailUnavailableReason, string> = {
  not_configured: "este ambiente não tem a fonte de detalhe configurada",
  not_found: "o detalhe ainda não foi publicado para esta corrida",
  fetch_error: "não conseguimos buscar o arquivo de detalhe agora",
  invalid: "o arquivo de detalhe chegou fora do formato esperado",
  empty: "ainda não há município com dado apurado nesta corrida",
  sem_serie: "o arquivo de detalhe chegou, mas ainda sem a série por candidatura",
};

export interface DetailUnavailableProps {
  /** O que não veio, como sujeito da frase — ex. "O detalhe por município". */
  label: string;
  reason: DetailUnavailableReason;
  className?: string;
  style?: CSSProperties;
}

export function DetailUnavailable({ label, reason, className, style }: DetailUnavailableProps) {
  return (
    <div
      data-testid="detail-unavailable"
      data-reason={reason}
      className={className}
      style={{
        borderTop: "1px solid var(--border-hairline)",
        paddingTop: "var(--space-3)",
        color: "var(--text-muted)",
        font: "var(--type-body-sm)",
        ...style,
      }}
    >
      <p style={{ margin: 0 }}>
        {label} está indisponível — {REASON_TEXT[reason]}.
      </p>
      <p style={{ margin: "var(--space-1) 0 0" }}>
        Os números do resumo acima vêm de outra fonte e não são afetados por isto.
      </p>
    </div>
  );
}

/**
 * Rótulo de frescor do detalhe, com a defasagem contra o resumo quando ela
 * existe.
 *
 * O ADR-0032 exige isto e diz por quê: o objeto Blob tem `ts` **próprio**,
 * porque as duas escritas (Global Config e Blob) não são atômicas entre si e o
 * CDN pode servir uma versão anterior além do `revalidate`. O detalhe municipal
 * pode ficar visivelmente mais velho que o resumo —
 *
 *   > "e a UI **não deve** silenciar essa diferença."
 *
 * Por isso a defasagem é texto, não um estilo sutil: quem lê a tabela de
 * municípios precisa saber que ela pode não corresponder ao percentual apurado
 * exibido no topo.
 *
 * Abaixo de {@link DETAIL_LAG_TOLERANCE_MINUTES} nada é dito sobre defasagem —
 * a cadência de escrita é de 60 s (ADR-0011) e anunciar "1 minuto mais antigo"
 * a cada carregamento seria ruído constante, não transparência.
 *
 * ## O que este sinal NÃO mede — e o segundo sinal que entra ao lado dele
 *
 * O [ADR-0038](../../../docs/architecture/adrs/0038-dado-ts-hora-do-dado-nao-hora-do-calculo.md)
 * D5 investigou este mecanismo e **confirmou que ele está correto para o que
 * mede**: os dois `ts` comparados aqui são relógios de **escrita**, e a
 * divergência entre eles é uma falha real e específica — o Blob ficou para trás
 * da escrita do resumo. Nada aqui muda.
 *
 * O que ele não pode detectar, por construção, é a ingestão parada: se o TSE
 * some, os dois relógios continuam avançando em sincronia a cada ciclo e este
 * texto fica mudo com o dado congelado há horas. Esse é outro sinal, com outra
 * causa e outro gatilho (`dado_ts`), e mora no `<DadoParadoBanner>`. As páginas
 * de UF renderizam os **dois**, lado a lado e em frases separadas: fundir
 * "o Blob está mais velho que o resumo" com "o TSE parou de publicar" numa
 * sentença só obrigaria o leitor a adivinhar qual das duas está acontecendo.
 */
export const DETAIL_LAG_TOLERANCE_MINUTES = 2;

export interface DetailFreshnessProps {
  /** `ts` do objeto de detalhe (Blob). */
  ts: string;
  /** `ts` do resumo (Global Config), para calcular a defasagem. */
  resumoTs: string;
  className?: string;
  style?: CSSProperties;
}

export function DetailFreshness({ ts, resumoTs, className, style }: DetailFreshnessProps) {
  const detalheMs = Date.parse(ts);
  const resumoMs = Date.parse(resumoTs);
  // `Math.max(0, …)` — ADR-0038 D5, correção cosmética.
  //
  // No ciclo SAUDÁVEL o detalhe é carimbado alguns instantes DEPOIS do resumo
  // (o Python carimba `ts_iso` → POST → o Node carimba o Blob), então a
  // subtração dá −1 no caso normal. Era inofensivo no texto, que só aparece a
  // partir de 2 minutos — mas vazava para `data-lag-minutes` logo abaixo, um
  // atributo cujo nome promete "minutos de defasagem" e entregava um número
  // negativo a quem o lesse (teste, inspetor, ferramenta de operação). O clamp
  // vale no valor exibido E no atributo: são o mesmo número, e um negativo
  // sobreviver em só um dos dois é como o defeito começa de novo.
  const lagMinutes =
    Number.isFinite(detalheMs) && Number.isFinite(resumoMs)
      ? Math.max(0, Math.floor((resumoMs - detalheMs) / 60_000))
      : 0;
  const atrasado = lagMinutes >= DETAIL_LAG_TOLERANCE_MINUTES;

  return (
    <p
      data-testid="detail-freshness"
      data-lag-minutes={String(lagMinutes)}
      className={className}
      style={{ margin: 0, font: "var(--type-body-sm)", color: "var(--text-muted)", ...style }}
    >
      Detalhe atualizado às {formatTimeHMS(ts)}
      {atrasado ? ` — ${lagMinutes} min mais antigo que o resumo desta página.` : "."}
    </p>
  );
}
