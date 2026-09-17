// @vitest-environment happy-dom
/**
 * tests/unit/components/DeputadoMetodologia.test.tsx
 *
 * **O terceiro zero fabricado da emenda de 2026-09-14.**
 *
 * `app/(dep)/deputado-federal/page.tsx` monta este bloco no ramo de espera com
 * `pctApurado={0} temDado={false}` — e até hoje ele imprimia, naquele estado,
 * **"Com 0% apurado, ela ainda muda"**. O zero não foi medido: sem payload não
 * sabemos se a apuração está parada em zero ou se a leitura do Global Config
 * falhou com a contagem em curso. É a mesma classe do "Modelo 100% / Apuração
 * 0%" da home e do `emptyPayload()` de `/governador`.
 *
 * ## O teste tem os DOIS lados, de propósito
 *
 * O recorte da emenda é estreito: sai **o número**, fica o resto. As outras
 * ocorrências de vocabulário de medição deste bloco são honestas — "não são
 * uma projeção" é uma NEGAÇÃO, e "votos já apurados" descreve o MÉTODO desta
 * tela, verdadeiro em qualquer dia do calendário. Um teste só do lado negativo
 * passaria com o parágrafo inteiro apagado, que é a correção errada.
 *
 * 🔴 E cada asserção negativa tem o par positivo no estado oposto
 * (`temDado` verdadeiro), porque um `queryBy…`/`toContain` sobre um seletor ou
 * uma string escrita errada passa em qualquer asserção negativa.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DeputadoMetodologia } from "@/components/blocks/DeputadoMetodologia";

function texto(node: React.ReactElement): string {
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(node), "text/html");
  return doc.body.textContent ?? "";
}

/** O que o ramo de espera de `/deputado-federal` passa, literalmente. */
function semDado() {
  return texto(<DeputadoMetodologia pctApurado={0} cadenciaMinutos={0} temDado={false} />);
}

describe("DeputadoMetodologia — sem dado, nenhum número na tela", () => {
  it("🔴 a frase com o percentual NÃO ocorre, e nem o percentual", () => {
    // Mutação que derruba: tirar a guarda `temDado ?` da frase — é a linha
    // exata que a emenda acrescentou.
    const t = semDado();

    expect(t).not.toContain("ela ainda muda");
    expect(t, "percentual fabricado").not.toContain("%");
    // O zero solto, medido com a regex que não usa `\b` (o caractere anterior
    // é uma letra quando `textContent` concatena nós vizinhos).
    expect([...t.matchAll(/(?<!\d)0(?!\d)/g)]).toEqual([]);
  });

  it("o resto do bloco FICA — a emenda não apagou o parágrafo", () => {
    // Mutação que derruba: devolver `null` (ou um parágrafo vazio) quando
    // `temDado` é falso. A constituição § 8 pede que o leitor saiba de onde
    // vem o número; calar sobre o método não é o mesmo que calar sobre a
    // medição.
    const t = semDado();

    expect(t).toContain("não são uma projeção");
    expect(t).toContain("já apurados");
    expect(t).toContain("como ficaria a bancada se a contagem parasse agora");
    // O título do bloco, que é o que a navegação por headings encontra.
    expect(t).toContain("Como esta contagem é feita");
  });

  it("continua calando sobre granularidade e cadência (defeito de 13/09)", () => {
    const t = semDado();

    expect(t).not.toContain("lemos o boletim");
    expect(t).not.toContain("atualizados a cada");
  });
});

describe("DeputadoMetodologia — 🔴 (controle) com dado, a frase e o número voltam", () => {
  it("a frase do percentual é impressa, com o número do payload", () => {
    // Sem este controle, as três asserções negativas acima passariam com a
    // string escrita errada — e passariam também se alguém apagasse a frase de
    // vez, que é a regressão barata desta emenda (a noite de 04/10 precisa
    // dela).
    const t = texto(
      <DeputadoMetodologia pctApurado={71.4} cadenciaMinutos={15} temDado temIntervalo />,
    );

    expect(t).toContain("ela ainda muda");
    expect(t).toContain("71,4%");
    expect(t).toContain("%");
    // E as duas frases que o estado sem dado cala.
    expect(t).toContain("O intervalo ao lado de cada bancada");
    expect(t).toContain("atualizados a cada 15 minutos");
  });

  it("o número vem do prop, não é literal no JSX", () => {
    // Mutação que derruba: escrever o percentual à mão na frase.
    expect(texto(<DeputadoMetodologia pctApurado={12.5} cadenciaMinutos={0} temDado />)).toContain(
      "12,5%",
    );
    expect(texto(<DeputadoMetodologia pctApurado={99} cadenciaMinutos={0} temDado />)).toContain(
      "99,0%",
    );
  });
});
