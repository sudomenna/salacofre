/**
 * tests/unit/components/candidate-result-row-cor.test.ts
 *
 * A cor da lista de resultado vem do PARTIDO, nunca da colocação.
 *
 * ## O defeito
 *
 * `candidateResultRowProps` lia `candidato.cor` direto do payload, e o produtor
 * grava ali `var(--color-cand-N)` — a paleta por **colocação**. Resultado, visto
 * pelo dono em 2026-09-19 na mesma tela: **CAIADO/PSD laranja na lista**
 * (`--color-cand-3`, `#c97c1f`) **e verde na legenda do mapa** (`--party-psd`,
 * `#2f8f6b`), que resolve pela sigla.
 *
 * ## 🔴 Por que o caso do 3º colocado é obrigatório aqui
 *
 * `--color-cand-1` é vermelho e `--color-cand-2` é azul — exatamente o que PT e
 * PL receberiam pela paleta de partido. **Um teste que só olhasse o 1º e o 2º
 * passaria com o defeito no ar.** Foi essa coincidência que deixou a divergência
 * sobreviver ao ADR-0024.
 *
 * Vale como regra além deste arquivo: quando duas fontes coincidem nos casos
 * mais comuns, o teste tem de ir buscar o caso em que elas discordam.
 *
 * ## A regra que isto protege
 *
 * Constituição § 2: a cor de um partido é **estável durante toda a noite** e
 * "não muda por rank, por ordem de apuração, por margem ou por qualquer evento
 * da corrida — apenas a intensidade pode variar". A cor gravada no payload É o
 * rank: com ela, o 3º que ultrapassa o 2º ao vivo faz os dois **trocarem de
 * cor** no meio da apuração, enquanto o mapa não troca.
 */

import { describe, expect, it } from "vitest";

import { candidateResultRowProps } from "@/components/atoms/tables/CandidateResultRow";
import { colorForRank } from "@/lib/utils/cand-color";
import { colorForParty } from "@/lib/utils/party-color";

/** Candidato no formato do payload, com a `cor` de rank que o produtor grava. */
function candidato(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 13,
    nome: "RONALDO CAIADO",
    partido: "PSD",
    rank: 3,
    cor: "var(--color-cand-3)", // o que o produtor grava — e o que NÃO pode vazar
    pct_atual: 16.4,
    pct_projetado: 16.1,
    votos_atuais: 4_830_236,
    ...over,
  } as Parameters<typeof candidateResultRowProps>[0];
}

describe("CandidateResultRow — a cor sai do partido", () => {
  it("o 3º colocado recebe a cor do PSD, não o laranja de rank 3", () => {
    const props = candidateResultRowProps(candidato(), 3);
    expect(props.cor).toBe(colorForParty("PSD"));
    expect(props.cor).not.toBe(colorForRank(3));
  });

  it("a `cor` do payload é ignorada mesmo quando contradiz a sigla", () => {
    // Blindagem contra a regressão exata: alguém volta a ler o campo.
    const props = candidateResultRowProps(
      candidato({ cor: "var(--color-cand-9)", partido: "PSD" }),
      3,
    );
    expect(props.cor).toBe(colorForParty("PSD"));
  });

  it("o 1º e o 2º também — ainda que a coincidência os salvasse", () => {
    // Estes dois passariam com o defeito no ar. Estão aqui para deixar
    // registrado que a coincidência é conhecida, não para provar a correção.
    expect(candidateResultRowProps(candidato({ partido: "PT", rank: 1 }), 1).cor).toBe(
      colorForParty("PT"),
    );
    expect(candidateResultRowProps(candidato({ partido: "PL", rank: 2 }), 2).cor).toBe(
      colorForParty("PL"),
    );
  });

  it("sigla fora da paleta editorial cai no rank — o fallback legítimo", () => {
    const props = candidateResultRowProps(candidato({ partido: "SIGLA-QUE-NAO-EXISTE" }), 7);
    expect(props.cor).toBe(colorForRank(3)); // usa o `rank` do candidato, 3
  });

  it("sem `rank` no candidato, usa o `fallbackRank` do caller", () => {
    const props = candidateResultRowProps(
      candidato({ partido: "SIGLA-QUE-NAO-EXISTE", rank: undefined }),
      5,
    );
    expect(props.cor).toBe(colorForRank(5));
  });

  it("dois candidatos do MESMO partido recebem a MESMA cor, em ranks diferentes", () => {
    // É a forma direta da regra da constituição § 2: a cor descreve o partido,
    // não a posição. Com a cor de rank, estes dois sairiam diferentes.
    const a = candidateResultRowProps(candidato({ partido: "PSD", rank: 3 }), 3);
    const b = candidateResultRowProps(candidato({ partido: "PSD", rank: 8 }), 8);
    expect(a.cor).toBe(b.cor);
  });
});
