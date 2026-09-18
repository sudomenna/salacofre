/**
 * O gráfico nacional anda junto com o cabeçalho em `pnpm dev:sim`.
 *
 * ## O defeito que este arquivo trava, e como ele foi encontrado
 *
 * Não foi por teste: foi **olhando a tela**. Com as fixtures da Fase 3 recém
 * geradas, a home mostrava o cabeçalho em "agora" e o gráfico parado no
 * horário gravado na fixture, enquanto `/uf/SP` acompanhava — as duas telas da
 * mesma sessão de `dev:sim` discordando sobre que horas são.
 *
 * A causa é que a série por candidatura mora em **dois lugares diferentes**:
 *
 *   - no payload NACIONAL, no topo (`EdgePayload.serie_por_candidato`);
 *   - no detalhe por UF, dentro de `series_temporais.por_candidato`.
 *
 * `comRelogioAgora` só olhava `series_temporais`. O ramo que trata
 * `por_candidato` já existia em `deslocarSeries` — escrito prevendo
 * exatamente este risco, com a nota "o cabeçalho dizendo 'agora' com o
 * gráfico novo plantado horas atrás" — mas nunca era alcançado pelo caminho
 * nacional.
 *
 * ⚠️ É uma armadilha de **dois lugares para a mesma coisa**, a mesma família
 * do `notifySlack`/`_alert_slack` que fez um agente contar 4 alarmes onde há
 * 10. Quando um conceito tem duas casas, toda travessia precisa visitar as
 * duas — e um teste por casa.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { simulacaoMunicipiosUf, simulacaoNacional } from "@/lib/dev/simulacao";

interface Serie {
  eixo: string[];
  cadencia_min: number;
}

beforeEach(() => {
  // Os dois portões de `varianteAtiva()`. `vi.stubEnv` porque `NODE_ENV` é
  // read-only no tipo de `process.env` — atribuição direta não compila.
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("FIXTURE_VARIANT", "sim");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Distância, em minutos, entre o fim da série e o `ts` do payload. */
function defasagemMin(serie: Serie, ts: string): number {
  const fim = Date.parse(serie.eixo[serie.eixo.length - 1] as string);
  return Math.abs(Date.parse(ts) - fim) / 60_000;
}

describe("dev:sim — a série encosta no cabeçalho, nos DOIS lugares", () => {
  it("🔴 nacional: o fim da série fica a uma cadência do `ts` do payload", () => {
    // Antes do conserto de 18/09 esta distância era de HORAS: o eixo saía como
    // gravado na fixture enquanto `ts` era reescrito para agora.
    const p = simulacaoNacional("pres") as unknown as {
      ts: string;
      serie_por_candidato?: Serie;
    } | null;
    expect(p, "simulação desligada — os dois portões não abriram").not.toBeNull();

    const serie = p?.serie_por_candidato;
    expect(serie, "presidente.json sem serie_por_candidato").toBeDefined();
    expect(defasagemMin(serie as Serie, p?.ts as string)).toBeLessThanOrEqual(
      (serie as Serie).cadencia_min,
    );
  });

  it("UF: o mesmo vale para o detalhe, que usa o outro lugar", () => {
    // Par com o de cima. Este caminho já funcionava; ele está aqui para que
    // um refactor que conserte um lado e quebre o outro seja pego.
    const d = simulacaoMunicipiosUf("SP", "pres", 1) as unknown as {
      ts: string;
      series_temporais?: { por_candidato?: Serie };
    } | null;
    expect(d).not.toBeNull();

    const serie = d?.series_temporais?.por_candidato;
    expect(serie, "municipios-pres-t1.json[SP] sem por_candidato").toBeDefined();
    expect(defasagemMin(serie as Serie, d?.ts as string)).toBeLessThanOrEqual(
      (serie as Serie).cadencia_min,
    );
  });

  it("a forma não muda: o deslocamento é rígido, não um esticão", () => {
    // Se o deslocamento fosse aplicado a cada ponto com um delta diferente, a
    // distância entre baldes mudaria e a linha ficaria distorcida — o gráfico
    // continuaria "encostando no cabeçalho" e ainda assim estaria errado.
    const p = simulacaoNacional("pres") as unknown as {
      serie_por_candidato?: Serie;
    } | null;
    const serie = p?.serie_por_candidato as Serie;
    for (let i = 1; i < serie.eixo.length; i++) {
      const dt =
        (Date.parse(serie.eixo[i] as string) - Date.parse(serie.eixo[i - 1] as string)) / 60_000;
      expect(dt, `balde ${i} fora da grade após o deslocamento`).toBe(serie.cadencia_min);
    }
  });
});
