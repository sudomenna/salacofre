/**
 * app/(cand)/candidatos/page.tsx — T-13, spec 018 (RF-146 a RF-151).
 *
 * "Quem está concorrendo": nome de urna, foto, partido e número das
 * candidaturas publicáveis, por cargo e por UF. É a superfície que enche o mês
 * anterior a 04/10, quando ainda não há um voto apurado, com a informação que
 * já existe e já é pública.
 *
 * ## Zero JavaScript de aplicação (RF-146, RF-147)
 *
 * **RNF-007a está em 148,7 KiB de 150.** Sobram 1,3 KiB — menos que uma ilha
 * client mínima. Consequências, todas visíveis no código abaixo:
 *
 *   - filtro e busca por `<form method="get">` + `searchParams`. Sem `useState`,
 *     sem `onChange`, sem debounce. Funciona com JavaScript desligado, que é
 *     critério de aceitação do RF-147, não cortesia;
 *   - tudo Server Component, inclusive o campo de busca
 *     (`<SearchField>`, a variante não-controlada de
 *     `components/atoms/controls/SearchInput.tsx`);
 *   - a foto é `<img>` nativo, não `next/image` — ver `<CandidateAvatar>`.
 *
 * ## Sem 5ª aba no `CargoTabs`
 *
 * `components/layout/CargoTabs.tsx` registra que "Deputado Federal" já não cabe
 * em 1/4 de 430px. `/candidatos` é rota de nível superior, como
 * `/sobre-o-modelo`, e **não emite `main[data-trilha]`** — o mecanismo de aba
 * corrente é CSS lendo esse atributo com `:has()`, então a ausência dele é
 * exatamente o estado "nenhuma aba marcada".
 *
 * ## Uma fatia por vez, nunca tudo
 *
 * São ~7.700 candidaturas publicáveis. A página lê **uma** fatia de
 * `(cargo, UF)` do Blob por render. Sem filtro escolhido, o default é
 * Presidente/`BR` — 12 candidaturas, a menor corrida do produto e a única
 * nacional. `readCandidatosUf` nunca lança: fatia ausente vira estado honesto
 * com a moldura da página inteira (constituição § 7), nunca 500.
 *
 * ## Prosa derivada, nunca literal (design 018 § D8)
 *
 * Nenhuma contagem, data ou rótulo de cargo escrito à mão. `fonte_ts` sai do
 * payload, a contagem sai de `candidatos.length`, o rótulo do cargo sai de
 * `lib/config/cargos.ts`. A lição custou quatro frases falsas de uma vez na
 * spec 017 quando a granularidade do Senador mudou.
 */

import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { SearchField } from "@/components/atoms/controls/SearchInput";
import { Panel } from "@/components/atoms/surfaces/Panel";
import { CandidatosGrid } from "@/components/blocks/CandidatosGrid";
import { Footer } from "@/components/layout/Footer";
import {
  type CandidatoIdentidade,
  type CandidatosUnavailableReason,
  readCandidatosUf,
} from "@/lib/blob/candidatos";
import {
  CARGOS,
  type CargoTse,
  cargoInfo,
  cargoToken,
  parseCargoSegment,
} from "@/lib/config/cargos";
import { TZ } from "@/lib/utils/format";

/**
 * 1 hora, o mesmo de `CANDIDATOS_REVALIDATE_SECONDS`.
 *
 * Identidade de candidatura não é dado vivo: quem se candidatou, com que número
 * e por que partido está fechado desde o registro. O único campo que ainda se
 * move é `situacao_julgamento`, e uma defasagem de até 1h nele é honesta desde
 * que a tela date o dado — o que ela faz (RF-150).
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Candidatos 2026 — SalaCofre",
  description:
    "Quem está concorrendo em 2026: nome de urna, partido e número das candidaturas " +
    "registradas no TSE, por cargo e por unidade da federação.",
};

// ---------------------------------------------------------------------------
// Domínio dos filtros
// ---------------------------------------------------------------------------

/**
 * As 27 UFs, mais `BR`.
 *
 * `BR` não é uma UF: é o que o CSV do TSE traz em `SG_UF` para candidatura
 * presidencial, e o que o caminho do Blob usa para o cargo 1
 * (`candidatos/uf/BR/pres.json`). Passa no padrão de duas letras sem caso
 * especial (design 018 § D1).
 *
 * ⚠️ Quinta cópia desta lista no repositório — as outras quatro estão nas
 * páginas de UF e em `lib/tse/targets.ts::TODAS_UFS`, nenhuma exportada.
 * Consolidar em `lib/config/` é limpeza devida; `lib/` está fora do território
 * desta tarefa.
 */
const UFS = [
  "BR",
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const UF_SET = new Set<string>(UFS);

/** Cargo default: a menor corrida do produto e a única nacional. */
const CARGO_DEFAULT: CargoTse = 1;
/** UF default. Presidente mora sob `BR`. */
const UF_DEFAULT = "BR";

/**
 * Resultado de ler os filtros da URL.
 *
 * `invalido` existe separado de "sem resultado" de propósito: o RF-147 exige um
 * estado **nomeado** para `?cargo=99`, `?uf=ZZ` e `?cargo=7` (Deputado
 * Estadual, que existe no TSE e não no produto) — nunca 500, e nunca a lista
 * inteira em silêncio. Entrada inválida degrada fechado, como a
 * publicabilidade do ADR-0040.
 */
interface Filtros {
  cargo: CargoTse;
  uf: string;
  /**
   * O texto de busca, cru. Volta para o campo como `defaultValue` — é o que
   * mantém o formulário preenchido depois do submit (RF-148).
   */
  busca: string;
  invalido: boolean;
}

function primeiro(valor: string | string[] | undefined): string {
  if (Array.isArray(valor)) return valor[0] ?? "";
  return valor ?? "";
}

function lerFiltros(params: Record<string, string | string[] | undefined>): Filtros {
  const cargoRaw = primeiro(params.cargo).trim();
  const ufRaw = primeiro(params.uf).trim().toUpperCase();
  const busca = primeiro(params.q);

  // Ausente é default; presente e irreconhecível é INVÁLIDO. As duas coisas não
  // podem colapsar numa só, ou `?cargo=99` mostraria Presidente como se nada
  // tivesse acontecido.
  const cargo = cargoRaw ? parseCargoSegment(cargoRaw) : CARGO_DEFAULT;
  const ufValida = ufRaw ? UF_SET.has(ufRaw) : true;
  const invalido = cargo === null || !ufValida;

  // Sob filtro inválido os seletores voltam ao default, e não ao valor
  // recusado: repor "99" numa lista que não o contém deixaria o `<select>` num
  // estado que o leitor não consegue reproduzir nem desfazer.
  return {
    cargo: cargo ?? CARGO_DEFAULT,
    uf: ufRaw && ufValida ? ufRaw : UF_DEFAULT,
    busca,
    invalido,
  };
}

// ---------------------------------------------------------------------------
// Busca (RF-148)
// ---------------------------------------------------------------------------

/** Sem acento, sem caixa — é como o leitor digita e não como o TSE grava. */
function dobra(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Casa contra nome de urna **e** nome completo.
 *
 * Os dois, e não só o de urna: quem procura "Luiz Inácio" precisa achar quem
 * está na urna como "LULA". Busca vazia ou só espaços equivale a sem filtro —
 * não a "nenhum resultado" (RF-148).
 */
function filtrarPorNome(
  candidatos: readonly CandidatoIdentidade[],
  busca: string,
): readonly CandidatoIdentidade[] {
  const alvo = dobra(busca.trim());
  if (!alvo) return candidatos;
  return candidatos.filter(
    (c) => dobra(c.nome_urna).includes(alvo) || dobra(c.nome).includes(alvo),
  );
}

// ---------------------------------------------------------------------------
// Frescor da fonte (RF-150)
// ---------------------------------------------------------------------------

/**
 * `fonte_ts` legível, no fuso de Brasília.
 *
 * Devolve `null` quando a string não é data — e aí a tela omite o carimbo em
 * vez de escrever "Invalid Date". "Fonte: TSE" continua, porque aquilo é
 * obrigação da licença cc-by e não depende de o carimbo ser parseável.
 */
function formatarFonteTs(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * Bloco de atribuição — obrigatório sempre que a tela mostra nome ou foto do
 * cadastro (RF-150).
 *
 * Três coisas distintas, e a separação é o ponto:
 *   1. **"Fonte: TSE"** — obrigação da licença cc-by do Portal de Dados
 *      Abertos (ADR-0039), não escolha editorial. É adicional ao "Não oficial.
 *      Fonte: TSE." do footer global (constituição § 1), e fica aqui porque é
 *      aqui que o dado está.
 *   2. **o carimbo de frescor** — `fonte_ts`, o `Last-Modified` da resposta do
 *      arquivo do TSE. É primo do `dado_ts` da apuração (ADR-0038) e **não é**
 *      ele: são relógios diferentes, com cadências diferentes, e fundi-los
 *      confundiria o leitor sobre o que está datado.
 *   3. **o aviso de volatilidade** — a lista muda até o fim da apuração
 *      (RF-141, último critério).
 */
function FonteTse({ fonteTs }: { fonteTs: string | null }) {
  const carimbo = fonteTs ? formatarFonteTs(fonteTs) : null;

  return (
    <p
      data-testid="candidatos-fonte"
      style={{
        font: "var(--type-data)",
        color: "var(--text-secondary)",
        margin: "0 0 var(--space-4)",
      }}
    >
      Fonte: TSE — Portal de Dados Abertos.
      {carimbo ? (
        <>
          {" "}
          Cadastro publicado pelo TSE em <span data-testid="candidatos-fonte-ts">{carimbo}</span>.
        </>
      ) : null}{" "}
      A lista de candidaturas muda até o fim da apuração.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Estados sem grade
// ---------------------------------------------------------------------------

/**
 * O texto de cada motivo de indisponibilidade.
 *
 * "esta corrida não foi publicada" e "não conseguimos falar com o
 * armazenamento" são notícias diferentes para o leitor (constituição § 8), e é
 * por isso que `readCandidatosUf` devolve o motivo em vez de `null`.
 */
const TEXTO_INDISPONIVEL: Record<CandidatosUnavailableReason, string> = {
  not_configured:
    "A lista de candidaturas não está disponível neste ambiente — falta a configuração de " +
    "armazenamento.",
  not_found:
    "Ainda não publicamos a lista de candidaturas desta corrida. Ela entra assim que a " +
    "importação do cadastro do TSE cobrir este cargo e esta unidade da federação.",
  fetch_error:
    "Não conseguimos carregar a lista de candidaturas agora. O problema é nosso, não do TSE — " +
    "tente de novo em alguns minutos.",
  invalid:
    "A lista de candidaturas que recebemos não está no formato esperado, então preferimos não " +
    "mostrá-la.",
};

// ---------------------------------------------------------------------------
// Formulário (RF-147, RF-148)
// ---------------------------------------------------------------------------

/**
 * `<form method="get">`: o navegador monta a query string e navega. Sem
 * `action`, o submit vai para a própria rota.
 *
 * Os valores submetidos voltam como `defaultValue`/`defaultChecked` — é o que
 * mantém o formulário preenchido depois do submit, exigido pelo RF-148. Com
 * campo controlado isso viria de graça e custaria uma ilha client; aqui vem de
 * `searchParams`, que já está na mão.
 *
 * Cada campo tem `<label>` **visível** (RNF-022/RNF-024) e o botão é um
 * `<button type="submit">` de verdade — quem navega por teclado chega nele com
 * Tab e dispara com Enter, sem handler nenhum.
 */
function Filtros({ filtros }: { filtros: Filtros }) {
  const rotulo: CSSProperties = {
    font: "var(--type-kicker)",
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
    display: "block",
    marginBottom: "var(--space-1)",
  };

  const controle = {
    height: "var(--tap-min)",
    width: "100%",
    padding: "0 var(--space-3)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-sm)",
    background: "var(--surface-card)",
    color: "var(--text-primary)",
    font: "var(--type-body)",
  } as const;

  return (
    <form
      method="get"
      data-testid="candidatos-filtros"
      className="grid"
      style={{
        gap: "var(--space-3)",
        gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        alignItems: "end",
      }}
    >
      <div>
        <label htmlFor="filtro-cargo" style={rotulo}>
          Cargo
        </label>
        <select
          id="filtro-cargo"
          name="cargo"
          data-testid="filtro-cargo"
          defaultValue={String(filtros.cargo)}
          style={controle}
        >
          {/*
            Rótulo e código saem de `lib/config/cargos.ts` — nunca literais, e a
            ORDEM é a da tabela canônica (a de exibição nas abas), não a
            numérica do TSE. Deputado Estadual não aparece porque não está na
            tabela: a rota não revela cargos que o produto não cobre (RF-147).
          */}
          {CARGOS.map((c) => (
            <option key={c.cd} value={String(c.cd)}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filtro-uf" style={rotulo}>
          Unidade da federação
        </label>
        <select
          id="filtro-uf"
          name="uf"
          data-testid="filtro-uf"
          defaultValue={filtros.uf}
          style={controle}
        >
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf === "BR" ? "BR — nacional (Presidente)" : uf}
            </option>
          ))}
        </select>
      </div>

      {/*
        `showLabel` — o rótulo fica VISÍVEL, não só no leitor de tela.
        `placeholder` não é nome acessível (WCAG 4.1.2) e some quando o leitor
        começa a digitar, que é justo quando ele mais precisa saber o que o
        campo é.

        O rótulo vai ACIMA (default de `<SearchField>`): inline, "BUSCAR POR
        NOME" quebra em duas linhas dentro da caixa de 44px em 375px e sobra
        menos de um terço da largura para o texto — medido no navegador em
        13/09. Acima, a busca também fica alinhada com os dois `<select>`.
        O componente já emite o próprio `<div>` nessa disposição.
      */}
      <SearchField
        id="filtro-busca"
        name="q"
        label="Buscar por nome"
        showLabel
        placeholder="Nome de urna ou nome completo"
        defaultValue={filtros.busca}
      />

      <button
        type="submit"
        data-testid="filtro-submit"
        style={{
          ...controle,
          background: "var(--surface-inverse)",
          color: "var(--text-inverse)",
          borderColor: "var(--surface-inverse)",
          font: "var(--type-label)",
          cursor: "pointer",
        }}
      >
        Filtrar
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CandidatosPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const filtros = lerFiltros(params);
  const info = cargoInfo(filtros.cargo);

  // Filtro inválido não vai ao Blob: pedir `candidatos/uf/ZZ/pres.json` seria
  // uma ida à origem para confirmar o que já se sabe. Degrada fechado.
  const resultado = filtros.invalido
    ? null
    : await readCandidatosUf(filtros.uf, cargoToken(filtros.cargo));

  const slice = resultado?.status === "ok" ? resultado.slice : null;
  const visiveis = slice ? filtrarPorNome(slice.candidatos, filtros.busca) : [];

  // O rótulo da seção sai do cargo e da UF **lidos**, não dos pedidos: se a
  // fatia veio, ela é autodescritiva e é ela que manda.
  const ufExibida = slice?.uf ?? filtros.uf;
  const tituloCorrida = `${info.label} · ${ufExibida}`;

  return (
    <main
      className="mx-auto flex flex-col"
      style={{
        maxWidth: 960,
        gap: "var(--space-8)",
        padding: "var(--space-10) var(--space-5) 0",
        // A barra de cargos é fixa no rodapé abaixo de 960px e flutua sobre o
        // conteúdo. Esta rota não é `main[data-trilha]`, então não recebe a
        // folga que `globals.css` dá às quatro rotas de corrida — reserva aqui,
        // como `/sobre-o-modelo` faz.
        paddingBottom: "calc(var(--space-16) + env(safe-area-inset-bottom))",
      }}
    >
      <header>
        <p
          style={{
            font: "var(--type-kicker)",
            letterSpacing: "var(--tracking-caps)",
            textTransform: "uppercase",
            color: "var(--accent-text)",
            margin: "0 0 var(--space-2)",
          }}
        >
          Eleições 2026
        </p>
        <h1 style={{ font: "var(--type-headline)", margin: "0 0 var(--space-3)" }}>
          Quem está concorrendo
        </h1>
        <p
          style={{
            font: "var(--type-deck)",
            color: "var(--text-secondary)",
            margin: 0,
            maxWidth: "62ch",
          }}
        >
          As candidaturas que o TSE registrou e colocou na urna, por cargo e por unidade da
          federação. Aparecem também as que estão na urna com o registro sob recurso — elas recebem
          voto, e a situação fica escrita ao lado.
        </p>
      </header>

      <Panel rule="single" title="Filtrar" titleId="candidatos-filtros-heading" headingLevel={2}>
        <Filtros filtros={filtros} />
      </Panel>

      <Panel
        rule="double"
        kicker="Candidaturas"
        title={tituloCorrida}
        titleId="candidatos-corrida-heading"
        headingLevel={2}
      >
        <FonteTse fonteTs={slice?.fonte_ts ?? null} />

        {filtros.invalido ? (
          <p
            data-testid="candidatos-filtro-invalido"
            style={{ font: "var(--type-body)", color: "var(--text-secondary)", margin: 0 }}
          >
            Nenhuma candidatura para este filtro. O SalaCofre cobre quatro cargos — Presidente,
            Governador, Senador e Deputado Federal — nas 27 unidades da federação.
          </p>
        ) : resultado && resultado.status === "unavailable" ? (
          <p
            data-testid="candidatos-indisponivel"
            data-reason={resultado.reason}
            style={{ font: "var(--type-body)", color: "var(--text-secondary)", margin: 0 }}
          >
            {TEXTO_INDISPONIVEL[resultado.reason]}
          </p>
        ) : (
          <CandidatosGrid
            candidatos={visiveis}
            uf={ufExibida}
            rotulo={`Candidaturas a ${info.label} em ${ufExibida}`}
            textoVazio={
              filtros.busca.trim()
                ? "Nenhuma candidatura desta corrida casa com a busca."
                : "Nenhuma candidatura publicada para este filtro."
            }
          />
        )}
      </Panel>

      <Footer />
    </main>
  );
}
