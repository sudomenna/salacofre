/**
 * components/atoms/data/CandidateCard.tsx
 *
 * RF-148 / RF-151 — uma candidatura na grade: foto (ou iniciais), nome de urna,
 * chip de partido, número na urna e, quando houver, a situação de julgamento.
 *
 * Server Component puro (RF-146: zero JavaScript de aplicação novo).
 *
 * ## O que este componente NÃO decide
 *
 * **A regra editorial da situação já vem decidida na fatia.** `sob_ressalva` é
 * calculado na publicação (`lib/blob/candidatos.ts`), nunca aqui: o ADR-0040
 * proíbe usar a situação como filtro e manda exibi-la como texto honesto — 743
 * candidaturas estão na urna com registro indeferido sob recurso e recebem voto
 * de eleitor real em 04/10. Uma regra dessa delicadeza espalhada em `if`s de
 * JSX seria interpretada de um jeito por tela. Aqui só se exibe.
 *
 * O texto vem **cru do TSE**, sem normalização. Um conversor de enum com
 * `default` silencioso já mordeu este repositório mais de uma vez; valor
 * desconhecido passa adiante como veio (design 018 § D2).
 *
 * ## Cor
 *
 * Só `partyChipInk(sigla)` — o par `background` + `ink` que o gerador mediu em
 * ≥ 4,5:1. `colorForParty` como preenchimento de área é **proibido nesta spec**:
 * PSOL (2,08:1) e NOVO (2,72:1) reprovam o piso de 3:1 da WCAG 1.4.11 como
 * cor-base, risco aberto em `docs/reference/risks.md` (design 018 § D7).
 *
 * ## Nome acessível
 *
 * O card carrega `aria-label` com nome de urna + partido + número numa string
 * só. Sem ele, quem navega por leitor de tela recebe três fragmentos soltos e
 * precisa remontá-los. O rótulo **contém** o texto visível, como WCAG 2.5.3
 * exige, e é montado a partir do dado — nunca literal (design 018 § D8).
 */

import type { CandidatoIdentidade } from "@/lib/blob/candidatos";
import { candidatoFotoUrl } from "@/lib/blob/paths";
import { nomeExibicao } from "@/lib/utils/nome-candidato";
import { partyChipInk } from "@/lib/utils/party-color";
import { CandidateAvatar } from "./CandidateAvatar";
import { PartyTag } from "./PartyTag";

export interface CandidateCardProps {
  candidato: CandidatoIdentidade;
  /**
   * Sigla da UF da fatia — `"BR"` em Presidente. Endereça a foto; **não** é
   * derivável do candidato, porque `CandidatoIdentidade` não carrega a UF (ela
   * está no envelope da fatia, uma vez só, em vez de repetida 1.131 vezes).
   */
  uf: string;
  /** `true` só nas primeiras células da grade — ver `<CandidateAvatar>`. */
  eager?: boolean;
}

/**
 * URL da foto, ou `null`.
 *
 * Três portas para `null`, todas estado normal e nenhuma erro. Duas moram em
 * {@link candidatoFotoUrl} (ambiente sem Blob; sigla malformada) desde 14/09,
 * quando a mesma derivação nasceria pela terceira vez no `<ResultPanel>`.
 *
 * A que fica AQUI é a única que este componente sabe: `foto_ok === false` — a
 * fatia diz que o TSE não publicou foto para este `sqcand`. O campo só existe
 * em `CandidatoIdentidade`; o payload de apuração não o carrega, e é por isso
 * que a checagem não pôde descer junto.
 */
function fotoUrlDe(candidato: CandidatoIdentidade, uf: string): string | null {
  if (!candidato.foto_ok) return null;
  return candidatoFotoUrl(uf, candidato.sqcand);
}

export function CandidateCard({ candidato, uf, eager = false }: CandidateCardProps) {
  const { background, ink } = partyChipInk(candidato.partido);
  const fotoUrl = fotoUrlDe(candidato, uf);

  // O nome de exibição (`lib/utils/nome-candidato.ts`) — o MESMO texto do card,
  // da linha do placar e do balão do mapa. É o ponto de o helper existir.
  const nome = nomeExibicao(candidato.nome_urna, candidato.sqcand);

  // Montado do dado, nunca escrito à mão — design 018 § D8.
  //
  // Sobre o nome de EXIBIÇÃO, e não sobre o cru: este `aria-label` SUBSTITUI o
  // conteúdo do `<article>` para quem usa leitor de tela, então o cru faria a
  // mesma pessoa ser anunciada com um nome e vista com outro, sem nada ligando
  // os dois. (Onde o rótulo curto é uma TRUNCAGEM — a pílula do `<Strongholds>`
  // — a decisão é a inversa, e está comentada lá: ali o canal só para leitor de
  // tela existe justamente para expandir.)
  const nomeAcessivel = `${nome}, ${candidato.partido}, número ${candidato.numero}`;

  return (
    <article
      aria-label={nomeAcessivel}
      data-testid="candidate-card"
      data-sqcand={candidato.sqcand}
      className="flex flex-col"
      style={{ gap: "var(--space-2)" }}
    >
      <CandidateAvatar nome={nome} fotoUrl={fotoUrl} eager={eager} />

      <div className="flex min-w-0 flex-col" style={{ gap: "var(--space-1)" }}>
        <strong
          data-testid="candidate-card-nome"
          style={{ font: "var(--type-body-sm)", fontWeight: 600, textWrap: "pretty" }}
        >
          {nome}
        </strong>

        <div className="flex flex-wrap items-center" style={{ gap: "var(--space-2)" }}>
          <PartyTag sigla={candidato.partido} size="sm" filled color={background} ink={ink} />
          <span
            data-testid="candidate-card-numero"
            className="tabular-nums"
            style={{ font: "var(--type-figure-sm)", color: "var(--text-secondary)" }}
          >
            {candidato.numero}
          </span>
        </div>

        {candidato.federacao ? (
          <span
            data-testid="candidate-card-federacao"
            style={{ font: "var(--type-data)", color: "var(--text-secondary)" }}
          >
            {candidato.federacao}
          </span>
        ) : null}

        {/*
          RF-141 — a situação aparece, sem alarde e sem esconder. Nem badge
          vermelho (alarmismo sobre quem pode perfeitamente estar na urna e
          deferido em recurso), nem omissão (mentiria por generalização sobre
          743 candidaturas que recebem voto). Texto, na cor secundária, com o
          valor cru do TSE.
        */}
        {candidato.sob_ressalva ? (
          <span
            data-testid="candidate-card-ressalva"
            style={{ font: "var(--type-data)", color: "var(--text-secondary)" }}
          >
            Registro: {candidato.situacao_julgamento}
          </span>
        ) : null}
      </div>
    </article>
  );
}
