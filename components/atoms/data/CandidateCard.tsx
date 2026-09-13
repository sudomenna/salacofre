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
import { blobUrlFor, candidatoFotoBlobPathname } from "@/lib/blob/paths";
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
 * Duas portas para `null`, e as duas são estado normal, não erro: a fatia diz
 * que o TSE não publicou foto para este `sqcand` (`foto_ok === false`), ou o
 * ambiente não tem Blob configurado (`blobUrlFor` → `null`, ADR-0032 item 3).
 * `candidatoFotoBlobPathname` lança com sigla malformada — aqui isso vira
 * fallback, não 500: a moldura da página é obrigação da constituição § 7.
 */
function fotoUrlDe(candidato: CandidatoIdentidade, uf: string): string | null {
  if (!candidato.foto_ok) return null;
  try {
    return blobUrlFor(candidatoFotoBlobPathname(uf, candidato.sqcand));
  } catch {
    return null;
  }
}

export function CandidateCard({ candidato, uf, eager = false }: CandidateCardProps) {
  const { background, ink } = partyChipInk(candidato.partido);
  const fotoUrl = fotoUrlDe(candidato, uf);

  // Montado do dado, nunca escrito à mão — design 018 § D8.
  const nomeAcessivel = `${candidato.nome_urna}, ${candidato.partido}, número ${candidato.numero}`;

  return (
    <article
      aria-label={nomeAcessivel}
      data-testid="candidate-card"
      data-sqcand={candidato.sqcand}
      className="flex flex-col"
      style={{ gap: "var(--space-2)" }}
    >
      <CandidateAvatar nome={candidato.nome_urna} fotoUrl={fotoUrl} eager={eager} />

      <div className="flex min-w-0 flex-col" style={{ gap: "var(--space-1)" }}>
        <strong
          data-testid="candidate-card-nome"
          style={{ font: "var(--type-body-sm)", fontWeight: 600, textWrap: "pretty" }}
        >
          {candidato.nome_urna}
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
