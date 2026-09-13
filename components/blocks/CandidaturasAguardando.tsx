/**
 * components/blocks/CandidaturasAguardando.tsx
 *
 * **RF-149 (T-14)** — a grade de "quem está concorrendo" dentro do estado
 * "aguardando dados" de uma página de cargo.
 *
 * No mês anterior a 04/10 as páginas de cargo exibem um parágrafo honesto
 * dizendo que o primeiro boletim não chegou, e mais nada. Este bloco enche
 * aquele vazio com a informação que já existe e já é pública: o cadastro de
 * candidaturas do TSE (spec 018, ADR-0039).
 *
 * ## Acrescentar, nunca substituir
 *
 * O parágrafo honesto de cada página **permanece, primeiro, sem reescrita**;
 * este bloco entra **abaixo** dele. Não é preferência de layout: aquele texto
 * foi corrigido três vezes neste projeto, e o teste do RF-149 é de **ordem**,
 * não de presença — um teste que só verificasse "o parágrafo existe" passaria
 * com a grade enfiada por cima dele
 * (`tests/unit/pages/aguardando-candidatos.test.tsx`).
 *
 * ## Some quando chega voto, e some quando o Blob falha
 *
 * Duas saídas por `null`, com o mesmo efeito visual e razões opostas:
 *
 *   - **chegou boletim** — o chamador nem monta este bloco, porque saiu do
 *     ramo "aguardando". A grade é o preenchimento de um vazio, não um bloco
 *     permanente (RF-149, 2º critério);
 *   - **a fatia não veio** (`not_found`, `fetch_error`, `not_configured`,
 *     `invalid`) — a página mostra só o texto de espera e **não quebra**
 *     (constituição § 7). Aqui o `null` é deliberado e **não** viola o
 *     ADR-0017: aquele ADR proíbe que um bloco de uma página COM payload suma
 *     quando a fonte dele falha. Nesta tela o bloco permanente é o parágrafo
 *     honesto, que é da página e não desta fatia; anunciar "não conseguimos
 *     carregar a lista de candidaturas" logo abaixo de "aguardando o primeiro
 *     boletim" dobraria a notícia de vazio sem acrescentar nada que o leitor
 *     possa fazer. Em `/candidatos` (T-13) a fatia É a tela, e lá o motivo
 *     aparece nomeado — a assimetria é intencional.
 *
 * ## No máximo 60, e o resto em `/candidatos`
 *
 * Este bloco desenha **`CANDIDATOS_POR_PAGINA` candidaturas**, nunca a corrida
 * inteira. O motivo tem número: `/uf/SP/deputado-federal` neste estado
 * prerenderizava 4.015.398 bytes de HTML com 1.061 `<img>` (medido em 13/09 no
 * build de produção). Gzip resolve a rede — 109 KB na linha —, não a construção
 * do DOM no celular fraco, que é onde o custo aparece.
 *
 * E aqui **não há "carregar mais"**. A tela é de apuração; expandir uma lista
 * de cadastro dentro dela empurraria o resultado — a coisa pela qual o leitor
 * veio — para baixo de mil cartões. Quem quer a lista completa vai para
 * `/candidatos?cargo=…&uf=…`, que é a tela feita para isso, tem busca e tem
 * paginação. O link já existia (RF-149, 4º critério); o que ele ganhou foi a
 * frase honesta ao lado dizendo quantas ficaram de fora.
 *
 * ## Zero JavaScript de aplicação
 *
 * Async Server Component. `<CandidatosGrid>` e `<CandidateCard>` já são RSC
 * puros e a rota `/candidatos` provou o padrão. Medido em 13/09: `/candidatos`
 * baixa exatamente o piso de framework (RNF-007a-floor, 153.482 B), então o
 * above-the-fold **de aplicação** é zero pela definição vigente do RNF-007a
 * (ADR-0030: total medido − piso) — a folga é o orçamento inteiro de 150 KB,
 * não os "1,3 KiB" que este bloco afirmava com a métrica de escopo antigo.
 * A consequência é que não mudou: abrir fronteira de cliente aqui tiraria a
 * rota do zero.
 *
 * ## Por que a leitura mora no bloco, e não em cada página
 *
 * São cinco chamadores (`/`, `/uf/[sigla]`, e as três rotas de UF de gov, sen
 * e dep). Repetir `readCandidatosUf` + `Panel` + atribuição em cinco arquivos
 * é como a regra de degradação passa a ter cinco interpretações. O `fetch` do
 * leitor é cacheado pelo Data Cache do Next (12 h,
 * `CANDIDATOS_REVALIDATE_SECONDS`), então a leitura não custa uma ida à origem
 * por render.
 */

import { Panel } from "@/components/atoms/surfaces/Panel";
import {
  CANDIDATOS_POR_PAGINA,
  CandidatosGrid,
  formatarContagem,
  ordenarCandidatosPorNumero,
} from "@/components/blocks/CandidatosGrid";
import { CandidaturasFonte } from "@/components/blocks/CandidaturasFonte";
import { readCandidatosUf } from "@/lib/blob/candidatos";
import { type CargoTse, cargoInfo, cargoToken } from "@/lib/config/cargos";

export interface CandidaturasAguardandoProps {
  /** Cargo da corrida — código do TSE, como em todo payload do produto. */
  cargo: CargoTse;
  /**
   * Sigla da UF da corrida. **`"BR"` em Presidente** — é o que o CSV do TSE traz
   * em `SG_UF` para candidatura presidencial e o que endereça a fatia
   * (`candidatos/uf/BR/pres.json`, design 018 § D1). Numa página de UF em
   * trilha presidencial (`/uf/SP`) a corrida continua sendo a nacional: as 12
   * candidaturas na cédula de São Paulo são as mesmas do país inteiro.
   */
  uf: string;
}

/** "no Brasil" / "em SP" — derivado, nunca escrito à mão (design 018 § D8). */
function onde(uf: string): string {
  return uf === "BR" ? "no Brasil" : `em ${uf}`;
}

export async function CandidaturasAguardando({ cargo, uf }: CandidaturasAguardandoProps) {
  const resultado = await readCandidatosUf(uf, cargoToken(cargo));

  // `readCandidatosUf` nunca lança — por contrato, e é o que mantém a página
  // inteira de pé quando o Blob não responde.
  if (resultado.status !== "ok") return null;

  const { slice } = resultado;
  // ⚠️ ORDENA ANTES DE CORTAR — as 60 exibidas têm que ser as 60 de menor
  // número, e não as 60 primeiras na ordem de leitura do Blob (constituição
  // § 2). A grade reordena depois; a operação é idempotente.
  const candidatos = ordenarCandidatosPorNumero(slice.candidatos);
  if (candidatos.length === 0) return null;

  const total = candidatos.length;
  const exibidos = candidatos.slice(0, CANDIDATOS_POR_PAGINA);
  const cortou = total > exibidos.length;

  // A UF exibida sai da fatia **lida**, não da pedida: a fatia é
  // autodescritiva, e é ela que manda (mesma regra de `/candidatos`).
  const ufExibida = slice.uf;
  const info = cargoInfo(cargo);
  const lugar = onde(ufExibida);

  // O `data-testid` fica no invólucro, e não no `<Panel>`: o `Panel` já emite
  // `data-testid="panel"` e não aceita props arbitrários. É este nó que o teste
  // de ORDEM compara contra o parágrafo honesto de cada página.
  return (
    <div data-testid="candidaturas-aguardando">
      <Panel
        rule="single"
        kicker="Enquanto não há votos"
        title={`Quem está concorrendo a ${info.label} ${lugar}`}
        titleId={`candidaturas-aguardando-${cargoToken(cargo)}-${ufExibida.toLowerCase()}-heading`}
        headingLevel={2}
      >
        {/*
        Primeira frase do bloco, e ela existe para uma coisa só: separar
        **cadastro** de **apuração**. Duas telas de lista com foto, lado a lado
        no mesmo produto, uma delas com porcentagem — a que não tem precisa
        dizer por que não tem, ou o leitor lê ordem de número como ordem de
        votação (constituição § 8).
      */}
        <p
          className="max-w-prose"
          data-testid="candidaturas-aguardando-ressalva"
          style={{ margin: "0 0 var(--space-3)", font: "var(--type-body-sm)" }}
        >
          Esta é a lista de candidaturas registrada pelo TSE — <strong>não é resultado</strong>.
          Ninguém está na frente porque nenhum voto foi contado ainda; a ordem abaixo é a do número
          na urna.
        </p>

        <CandidaturasFonte fonteTs={slice.fonte_ts} />

        <CandidatosGrid
          candidatos={exibidos}
          // O total REAL da corrida, não o da fatia desenhada: a contagem no
          // topo da grade diz 1.061 mesmo quando só 60 cartões aparecem. Passar
          // `exibidos.length` aqui faria a tela afirmar que São Paulo elege
          // deputado entre 60 candidatos.
          total={total}
          uf={ufExibida}
          rotulo={`Candidaturas a ${info.label} ${lugar}`}
          // Inalcançável por construção (a lista vazia sai por `null` acima), e
          // o prop é obrigatório: o texto fica honesto em vez de vazio, para o
          // caso de a guarda acima mudar.
          textoVazio="Nenhuma candidatura publicada para esta corrida."
        />

        {/*
        RF-149, 4º critério: a grade leva a `/candidatos` com o filtro **desta**
        corrida já aplicado. `cargo` vai como código do TSE porque é o que
        `parseCargoSegment` aceita ao lado do slug.

        A frase de corte vem ANTES do link, e só quando houve corte. Ela é o que
        impede a grade de mentir por omissão: 60 cartões sem aviso se leem como
        "são estes". Os dois números saem do dado (design 018 § D8).
      */}
        {cortou ? (
          <p
            data-testid="candidaturas-aguardando-corte"
            data-mostrando={exibidos.length}
            data-total={total}
            style={{
              margin: "var(--space-4) 0 0",
              font: "var(--type-data)",
              color: "var(--text-secondary)",
            }}
          >
            Mostrando {formatarContagem(exibidos.length)} de {formatarContagem(total)}, em ordem de
            número na urna.
          </p>
        ) : null}

        <p style={{ margin: "var(--space-2) 0 0", font: "var(--type-body-sm)" }}>
          <a
            data-testid="candidaturas-aguardando-link"
            href={`/candidatos?cargo=${cargo}&uf=${ufExibida}`}
            style={{ color: "var(--accent-text)" }}
          >
            Ver e buscar todas as candidaturas a {info.label} {lugar}
          </a>
        </p>
      </Panel>
    </div>
  );
}
