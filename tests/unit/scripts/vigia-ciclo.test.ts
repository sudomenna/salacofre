/**
 * tests/unit/scripts/vigia-ciclo.test.ts
 *
 * Testes do núcleo puro do vigia externo (S08 item 2).
 *
 * O que estes testes precisam discriminar, e por quê:
 *
 *  1. **A ordem das guardas.** `avaliarCiclo` decide numa ordem deliberada
 *     (credencial → pré-eleição → janela → frescura). Trocar duas delas produz
 *     um vigia que parece funcionar nos casos comuns e mente nos casos que
 *     importam. Há um teste por par crítico.
 *  2. **O limiar, NO limiar.** Um caso "bem fresco" e um "bem velho" passam
 *     mesmo com `>` trocado por `>=` ou com o limite errado por um minuto. Só o
 *     caso exatamente em cima do limite mata essas mutações. Regra desta casa,
 *     aprendida na spec 019.
 *  3. **Os três estados.** "Não começou", "não sabemos" e "apurando" são três
 *     (decisão do dono, 14/09). Um vigia que colapsa "não sabemos" em "parado"
 *     grita quando está cego — e foi um 403 lido como "ainda não publicado" que
 *     custou dois dias da janela de 15–17/09.
 */

import { describe, expect, it } from "vitest";
import type { IngestWindow } from "../../../lib/tse/ingest-window";
import { avaliarCiclo, LIMITE_SILENCIO_MIN_PADRAO } from "../../../scripts/vigia-ciclo";

/** Janela do simulado: 9h–17h BRT. */
const JANELA: IngestWindow = { startHourBrt: 9, endHourBrt: 17 };

/** 2026-09-22, 10h BRT = 13:00 UTC — dentro da janela. */
const DENTRO = new Date("2026-09-22T13:00:00.000Z");
/** 2026-09-22, 03h BRT = 06:00 UTC — fora da janela. */
const FORA = new Date("2026-09-22T06:00:00.000Z");

/** Constrói um `dado_ts` a N minutos antes de `agora`. */
function carimboHaMin(agora: Date, min: number): string {
  return new Date(agora.getTime() - min * 60_000).toISOString();
}

describe("avaliarCiclo — os três estados não colapsam", () => {
  it("sem credencial devolve indeterminado e exit 1, NUNCA alarme", () => {
    const v = avaliarCiclo({
      payload: null,
      credencialOk: false,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("indeterminado");
    expect(v.exitCode).toBe(1);
    expect(v.mensagem).toMatch(/cego/i);
  });

  it("a guarda de credencial vem ANTES de tudo — mesmo com payload parado", () => {
    // Se a ordem das guardas for trocada, este caso vira "parado"/exit 2:
    // o vigia gritaria "a série parou" quando na verdade não conseguiu olhar.
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: carimboHaMin(DENTRO, 999) },
      credencialOk: false,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("indeterminado");
    expect(v.exitCode).toBe(1);
  });

  it("cego + payload de pré-eleição ainda é indeterminado, não silêncio", () => {
    // 🔴 Este caso foi ACRESCENTADO depois de uma mutação sobreviver (18/09).
    // A primeira versão da suíte só testava a precedência da credencial com um
    // payload de fase `normal` — e com isso, trocar a guarda de credencial pela
    // de pré-eleição deixava os 12 testes verdes. O defeito que passava: o vigia
    // relataria "não há o que apurar, silêncio é o certo" quando na verdade não
    // tinha conseguido ler nada. Um payload obsoleto em cache bastaria.
    const v = avaliarCiclo({
      payload: { fase: "pre_eleicao", dado_ts: null },
      credencialOk: false,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("indeterminado");
    expect(v.exitCode).toBe(1);
  });

  it("pré-eleição é silêncio, mesmo dentro da janela e sem carimbo nenhum", () => {
    const v = avaliarCiclo({
      payload: { fase: "pre_eleicao", dado_ts: null },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("nao_comecou");
    expect(v.exitCode).toBe(0);
  });

  it("a guarda de pré-eleição vem ANTES da de frescura", () => {
    // Sem esta ordem, o vigia alarmaria todo dia antes de 04/10 — e um vigia
    // que grita sem motivo é um vigia que ninguém lê no dia D.
    const v = avaliarCiclo({
      payload: { fase: "pre_eleicao", dado_ts: carimboHaMin(DENTRO, 10_000) },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("nao_comecou");
    expect(v.exitCode).toBe(0);
  });
});

describe("avaliarCiclo — a janela de ingestão", () => {
  it("fora da janela não cobra frescura, por mais velho que esteja", () => {
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: carimboHaMin(FORA, 600) },
      credencialOk: true,
      agora: FORA,
      janela: JANELA,
    });
    expect(v.estado).toBe("fora_da_janela");
    expect(v.exitCode).toBe(0);
  });

  it("o MESMO payload velho dentro da janela vira alarme", () => {
    // Par com o teste acima: isola a janela como a única variável. Se a guarda
    // de janela for removida, o teste anterior quebra; se ela engolir tudo,
    // este quebra.
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: carimboHaMin(DENTRO, 600) },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("parado");
    expect(v.exitCode).toBe(2);
  });
});

describe("avaliarCiclo — o limiar, medido NO limiar", () => {
  it("exatamente no limite ainda é fresco", () => {
    const v = avaliarCiclo({
      payload: {
        fase: "normal",
        dado_ts: carimboHaMin(DENTRO, LIMITE_SILENCIO_MIN_PADRAO),
      },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("fresco");
    expect(v.exitCode).toBe(0);
  });

  it("um minuto além do limite é alarme", () => {
    const v = avaliarCiclo({
      payload: {
        fase: "normal",
        dado_ts: carimboHaMin(DENTRO, LIMITE_SILENCIO_MIN_PADRAO + 1),
      },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("parado");
    expect(v.exitCode).toBe(2);
    expect(v.idadeMin).toBeCloseTo(LIMITE_SILENCIO_MIN_PADRAO + 1, 5);
  });

  it("o limite é configurável e manda sobre o padrão", () => {
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: carimboHaMin(DENTRO, 30) },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
      limiteMin: 60,
    });
    expect(v.estado).toBe("fresco");
  });
});

describe("avaliarCiclo — ausências dentro da janela", () => {
  it("payload inexistente dentro da janela é alarme, não silêncio", () => {
    const v = avaliarCiclo({
      payload: null,
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("sem_payload");
    expect(v.exitCode).toBe(2);
  });

  it("payload sem hora de boletim é alarme — a série não desenha nada", () => {
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: null },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("parado");
    expect(v.exitCode).toBe(2);
  });

  it("hora de boletim ilegível é alarme, não 'fresco por acidente'", () => {
    // Se `Date.parse` devolvesse NaN e o código não tratasse, a subtração daria
    // NaN, `NaN > limite` seria false, e o vigia diria "fresco" — o pior
    // resultado possível: silêncio exatamente quando o TSE mudou o formato.
    const v = avaliarCiclo({
      payload: { fase: "normal", dado_ts: "22/09/2026 10:00" },
      credencialOk: true,
      agora: DENTRO,
      janela: JANELA,
    });
    expect(v.estado).toBe("parado");
    expect(v.exitCode).toBe(2);
    expect(v.mensagem).toMatch(/ileg[íi]vel/i);
  });
});
