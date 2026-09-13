/**
 * lib/blob/candidatos.ts
 *
 * Leitura das fatias de **identidade de candidatura** no Vercel Blob — nome de
 * urna, número, partido e situação de julgamento de quem concorre numa UF e num
 * cargo (spec 018; [ADR-0039](../../docs/architecture/adrs/0039-portal-dados-abertos-tse-identidade-candidatura.md),
 * [ADR-0040](../../docs/architecture/adrs/0040-publicabilidade-candidatura-fail-closed.md),
 * [ADR-0042](../../docs/architecture/adrs/0042-cargo-uf-numero-chave-identidade-candidatura.md)).
 *
 * ## Por que Blob, e não Global Config
 *
 * Mesma linha divisória do
 * [ADR-0032](../../docs/architecture/adrs/0032-detalhe-municipal-vercel-blob.md)
 * e do drill-down de Deputado: **estado atual resumido e limitado por
 * construção** fica no Global Config; **detalhe que cresce com a cobertura** vai
 * para o Blob. São ~8.400 candidaturas nacionais, e o limite de 1 MB do store já
 * é dividido entre quatro cargos de apuração.
 *
 * ## Molde deliberado, não segunda convenção
 *
 * Este arquivo é uma cópia estrutural de `lib/blob/deputado-uf.ts::readDeputadoUfDetail`
 * — resultado discriminado com o MOTIVO, nunca exceção, nunca `null` cru; guard
 * estrutural contra blob trocado; `fetch` no servidor sem `AbortSignal`. Cada
 * uma dessas escolhas está justificada lá e reaplicada aqui de propósito: um
 * terceiro leitor que inventasse a própria forma de degradar seria exatamente o
 * "segundo padrão ad hoc" que o ADR-0032 existe para impedir.
 *
 * ## A cadência aqui é OUTRA — 1 hora, não 60 segundos
 *
 * Os leitores irmãos revalidam a cada 60 s porque leem **apuração**, que muda a
 * cada ciclo (ADR-0011). Identidade de candidatura **não é dado vivo**: quem se
 * candidatou, com que número e por que partido, está fechado desde o registro, e
 * só muda quando o TSE republica o Portal de Dados Abertos — o que acontece em
 * escala de dias, não de minutos. Revalidar de minuto em minuto seria ida à
 * origem sem chance de encontrar novidade. A única coisa que se move é
 * `situacao_julgamento`, e uma defasagem de até 12 h nela é honesta **desde que
 * a tela date o dado** (`fonte_ts`, `gerado_ts`) — constituição § 8. Essa
 * ressalva não é decorativa: é ela que separa "dado de ontem, e está escrito"
 * de "dado de ontem apresentado como de agora".
 *
 * Nota de honestidade sobre o argumento acima: uma versão anterior deste
 * comentário dizia que revalidar rápido custaria latência "exatamente na noite
 * em que a latência importa". **Isso não se sustenta** — este leitor serve a
 * rota `/candidatos`, que não está no caminho das telas de apuração. O
 * argumento que vale é o outro: a fonte só muda uma vez por dia.
 */

import type { Cargo } from "@/lib/config/calendar";

import { blobUrlFor, candidatosUfBlobPathname } from "./paths";

// ---------------------------------------------------------------------------
// Contrato do objeto publicado
// ---------------------------------------------------------------------------

/** Uma candidatura, como publicada na fatia de UF × cargo. */
export interface CandidatoIdentidade {
  /**
   * `SQ_CANDIDATO` do TSE — a identidade global da candidatura (ADR-0042).
   *
   * **`string`, nunca `number`**: são 11 ou 12 dígitos e o tipo no banco é `bigint`.
   * Converter para `number` em qualquer ponto do trajeto é convidar uma perda
   * de precisão que só apareceria como candidato trocado — e é também a chave
   * que endereça a foto (`candidatoFotoBlobPathname`).
   */
  sqcand: string;
  /**
   * Número de urna. Repete entre UFs e entre cargos, então **não é identidade**
   * — é o que o eleitor digita, e só é único dentro de (cargo, UF) (ADR-0042).
   */
  numero: number;
  nome_urna: string;
  /**
   * `NM_CANDIDATO` — o nome civil completo. **Não é o que a tela mostra**
   * (`nome_urna` é), e existe por um motivo só: a busca do RF-148 casa os
   * dois. Quem procura "Luiz Inácio" precisa achar quem está na urna como
   * "LULA". Sem este campo a busca fica cega para metade das formas pelas
   * quais o eleitor conhece o candidato.
   *
   * Custo medido: ~25 B por candidatura; na maior fatia (cargo 6 em SP, 1.131
   * publicáveis) são ~28 KB — folgado num objeto de Blob.
   */
  nome: string;
  /** Sigla do partido. Dentro de uma federação, não é a sigla da agremiação. */
  partido: string;
  /**
   * Sigla da federação (`UNIÃO/PP`, `PT/PC do B/PV`, …), ausente quando a
   * candidatura não integra nenhuma. **Não vira cor**: `normalizePartySlug`
   * manda sigla composta para `outros` por decisão do ADR-0024, e a cor sai
   * sempre de `partido`. Está aqui para o texto do card, não para a paleta.
   */
  federacao?: string;
  /** Ausente quando a candidatura não integra coligação. */
  coligacao?: string;
  /**
   * Derivado de `situacao_julgamento`: o registro não está simplesmente
   * deferido (está sob recurso, aguardando julgamento, etc.).
   *
   * É **calculado na publicação, nunca no componente**, e essa é a decisão:
   * o ADR-0040 proíbe usar a situação como filtro e manda exibi-la como texto
   * honesto — 743 candidaturas estão na urna com registro indeferido sob
   * recurso, e recebem voto. Uma regra editorial dessa delicadeza não pode
   * viver espalhada em `if`s de JSX, onde cada tela a interpretaria à sua
   * maneira. Mora num lugar só.
   */
  sob_ressalva: boolean;
  /**
   * Se existe foto publicada para este `sqcand`.
   *
   * **Não guardamos a URL**: `blobUrlFor(candidatoFotoBlobPathname(uf, sqcand))`
   * é determinística, então a URL é derivável e duplicá-la custaria ~90 B por
   * candidatura para repetir uma verdade que já temos. O que NÃO é derivável é
   * se a foto existe — daí o booleano. Medido em 13/09: a cobertura do TSE foi
   * 387/387 no Acre, então `false` é caso de borda (substituição tardia), não
   * caminho quente. O componente cai nas iniciais quando `false`.
   */
  foto_ok: boolean;
  /**
   * Situação de julgamento do registro no TSE. É o único campo desta fatia que
   * ainda se move depois do registro — e a razão de a revalidação ser de 1 hora
   * em vez de nunca.
   */
  situacao_julgamento: string;
}

/**
 * O JSON gravado em `candidatos/uf/<SIGLA>/<cargo>.json`.
 *
 * `uf` e `cargo` são redundantes com o caminho, e é o ponto: um objeto servido
 * do CDN precisa ser autodescritivo para o consumidor poder detectar que
 * recebeu a fatia errada — ver {@link isCandidatosUfSlice}.
 */
export interface CandidatosUfSlice {
  uf: string;
  cargo: Cargo;
  /**
   * Instante do dado **na fonte** — a publicação do Portal de Dados Abertos do
   * TSE de que esta fatia derivou (ADR-0039).
   */
  fonte_ts: string;
  /**
   * Instante da **nossa** gravação. Separado de `fonte_ts` de propósito: a
   * tela precisa poder dizer "dado do TSE de X, importado por nós em Y" sem
   * fundir as duas datas numa só (constituição § 8).
   */
  gerado_ts: string;
  candidatos: CandidatoIdentidade[];
}

/**
 * Cadência de revalidação do `fetch`, em segundos. **12 horas** — ver o
 * cabeçalho deste arquivo para por que difere dos 60 s dos leitores irmãos.
 *
 * Decisão do dono do produto em 2026-09-13, contra a recomendação registrada
 * (5 min). O argumento a favor é sólido: o TSE republica o Portal de Dados
 * Abertos **uma vez por dia**, então revalidar duas vezes ao dia já cobre
 * toda novidade que pode existir na fonte; o resto seria ida à origem sem
 * chance de achar nada.
 *
 * ⚠️ O preço, e ele é real: quando **nós** republicamos (`candidatos:publish`),
 * o site continua servindo a fatia anterior por até 12 h — sem erro e sem
 * aviso, a página renderiza normal com o dado velho. Isso já custou uma hora
 * de diagnóstico com a janela de 1 h (fotos no ar, fatia dizendo
 * `foto_ok: true`, tela mostrando iniciais). Com 12 h, o sintoma dura o dia
 * inteiro. **O caminho para ver o dado novo imediatamente é um redeploy**, que
 * zera o Data Cache — está no runbook, seção "Publicar não é o mesmo que
 * aparecer".
 */
export const CANDIDATOS_REVALIDATE_SECONDS = 43_200;

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Por que a fatia não veio. A UI usa isto para escolher o texto — e a escolha
 * importa: "esta UF/cargo não foi importada" e "não conseguimos falar com o
 * armazenamento" são notícias diferentes para o leitor.
 */
export type CandidatosUnavailableReason =
  /** Ambiente sem Blob configurado (dev/preview sem `BLOB_READ_WRITE_TOKEN`). */
  | "not_configured"
  /** 404 — a fatia nunca foi escrita (importador não rodou para esta UF/cargo). */
  | "not_found"
  /** Rede, timeout, 5xx — a fatia pode existir, mas não chegou. */
  | "fetch_error"
  /** 200 com corpo fora do contrato (JSON inválido, ou UF/cargo trocados). */
  | "invalid";

export type CandidatosUfResult =
  | { status: "ok"; slice: CandidatosUfSlice; url: string }
  | { status: "unavailable"; reason: CandidatosUnavailableReason; url: string | null };

/**
 * Guard estrutural mínimo — o shape canônico é {@link CandidatosUfSlice}.
 *
 * Confere `uf` **e** `cargo` contra o que foi pedido. As duas checagens são o
 * que detecta blob trocado, e nenhuma cobre a outra: `candidatos/uf/SP/dep.json`
 * e `candidatos/uf/SP/sen.json` têm a mesma UF, e uma troca entre eles
 * publicaria a lista do Senado sob o rótulo da Câmara sem nenhum erro em lugar
 * nenhum.
 */
function isCandidatosUfSlice(
  value: unknown,
  expectedUf: string,
  expectedCargo: Cargo,
): value is CandidatosUfSlice {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<CandidatosUfSlice>;
  return (
    typeof v.fonte_ts === "string" &&
    typeof v.gerado_ts === "string" &&
    typeof v.uf === "string" &&
    v.uf.toUpperCase() === expectedUf.toUpperCase() &&
    v.cargo === expectedCargo &&
    Array.isArray(v.candidatos)
  );
}

/**
 * Lê a fatia de candidaturas de UMA UF e UM cargo do Blob, no servidor.
 *
 * **Nunca lança.** O caller recebe sempre um {@link CandidatosUfResult} e decide
 * o texto do estado indisponível — o bloco correspondente **continua no DOM** em
 * todos os casos (ADR-0017, ADR-0032 item 3, constituição § 7).
 *
 * Deve ser chamado **em paralelo** com a leitura da apuração: a página não
 * espera a identidade para renderizar o resultado.
 *
 * Sem `AbortSignal`, pela mesma razão de `readUfDetail` e `readDeputadoUfDetail`:
 * um `signal` desabilita o Data Cache do Next para esse `fetch`, trocando uma
 * proteção de latência por uma ida à origem a cada request na noite da apuração.
 */
export async function readCandidatosUf(sigla: string, cargo: Cargo): Promise<CandidatosUfResult> {
  let url: string | null;
  try {
    url = blobUrlFor(candidatosUfBlobPathname(sigla, cargo));
  } catch {
    // Sigla malformada — mesma degradação de qualquer outra falha de leitura.
    return { status: "unavailable", reason: "invalid", url: null };
  }

  if (!url) return { status: "unavailable", reason: "not_configured", url: null };

  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: CANDIDATOS_REVALIDATE_SECONDS } });
  } catch {
    return { status: "unavailable", reason: "fetch_error", url };
  }

  if (response.status === 404) return { status: "unavailable", reason: "not_found", url };
  if (!response.ok) return { status: "unavailable", reason: "fetch_error", url };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { status: "unavailable", reason: "invalid", url };
  }

  if (!isCandidatosUfSlice(body, sigla, cargo)) {
    return { status: "unavailable", reason: "invalid", url };
  }

  return { status: "ok", slice: body, url };
}

// ---------------------------------------------------------------------------
// Acessores de conveniência
// ---------------------------------------------------------------------------

/** Candidaturas do resultado, ou `[]` quando indisponível. */
export function candidatosFrom(result: CandidatosUfResult): CandidatoIdentidade[] {
  return result.status === "ok" ? result.slice.candidatos : [];
}
