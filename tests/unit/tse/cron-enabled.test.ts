/**
 * RF-060 — o cron é desligável por variável de ambiente, e o desligamento
 * precisa ser **provado**, não declarado.
 *
 * ## Por que este arquivo existe
 *
 * O interruptor existe desde sempre (`lib/tse/ingest-handler.ts:399`) e a
 * matriz de rastreabilidade já dava o RF-060 como coberto por teste `unit`.
 * **A matriz estava otimista.** O único teste que exercitava o desligamento
 * vive em `tests/integration/ingest-cycle.test.ts:367` — um dos **cinco
 * arquivos atrás da guarda `ALLOW_DB_WRITE_TESTS`** (`tests/integration/
 * _guarda-banco.ts`), que:
 *
 *   - não roda localmente sem `DATABASE_URL` (falha na **coleta**, junto dos
 *     outros 9 arquivos de integração);
 *   - não roda no CI, que deliberadamente **não** declara a variável — ligar
 *     esses cinco contra um banco real foi o incidente de 17/09, com 1.877
 *     linhas de harness gravadas em produção.
 *
 * Ou seja: a cobertura do RF-060 era **nominal**. O portão via uma linha na
 * matriz e um arquivo com o nome certo; nenhuma máquina jamais executou a
 * asserção. Este arquivo é a versão que roda em toda corrida — sem banco, sem
 * rede, sem guarda.
 *
 * `@/lib/db` é mockado (hoisted) só para que o módulo carregue: o interruptor
 * devolve **antes** de qualquer acesso a banco, e é exatamente isso que o
 * terceiro caso abaixo prova.
 */

import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: { select: vi.fn(() => ({ from: () => Promise.resolve([]) })) },
  schema: {},
}));

// O cliente do TSE é mockado para que o módulo carregue sem rede. Note que
// ele NÃO é asserido — ver o bloco "AQUI FALTA UM CASO" abaixo.
const fetchEA20Spy = vi.fn();
vi.mock("@/lib/tse/client", () => ({
  fetchEA20: (...args: unknown[]) => fetchEA20Spy(...args),
  getClientStats: () => ({ rateLimited: 0, notFound: 0, errors: 0, requests: 0 }),
  resetClientStats: () => {},
}));

import { runIngestCycle } from "@/lib/tse/ingest-handler";

const SEGREDO = "segredo-de-teste";

function req(): NextRequest {
  return new Request("https://exemplo.test/api/ingest", {
    method: "POST",
    headers: { "x-cron-secret": SEGREDO },
  }) as unknown as NextRequest;
}

let cronEnabledOriginal: string | undefined;
let cronSecretOriginal: string | undefined;

beforeEach(() => {
  cronEnabledOriginal = process.env.CRON_ENABLED;
  cronSecretOriginal = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SEGREDO;
  fetchEA20Spy.mockReset();
});

afterEach(() => {
  if (cronEnabledOriginal === undefined) delete process.env.CRON_ENABLED;
  else process.env.CRON_ENABLED = cronEnabledOriginal;
  if (cronSecretOriginal === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = cronSecretOriginal;
});

describe("RF-060 — cron desligável por env var", () => {
  it('CRON_ENABLED="false" devolve 200 { skipped: "cron_disabled" }', async () => {
    process.env.CRON_ENABLED = "false";

    const res = await runIngestCycle(req());

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ skipped: "cron_disabled" });
  });

  // ⚠️ AQUI FALTA UM CASO, e a ausência é deliberada e registrada.
  //
  // A consequência que dá sentido ao RF-060 é "desligado, nenhuma requisição
  // chega ao CDN do TSE" — um interruptor que devolve `skipped` mas ainda faz
  // os GETs não desliga nada, e o custo de errar é bloqueio de IP por 10 min
  // no dia da apuração.
  //
  // Escrevi esse caso como `expect(fetchEA20Spy).not.toHaveBeenCalled()` e ele
  // **não discriminava**: com o banco mockado, o ciclo não tem alvos e a
  // requisição não sairia de qualquer forma. A mutação `enabled = true`
  // deixava o teste verde — ele provava a ausência de uma chamada que nunca
  // aconteceria. Tentei o contrafactual no mesmo caso (ligado ⇒ chama), com
  // `TSE_GRANULARIDADE=uf` para montar alvos da lista estática de 27 UFs: o
  // ciclo ainda para antes do fetch, no lock anti-overlap, que precisa de
  // banco de verdade.
  //
  // Então o caso **não está aqui**, em vez de estar aqui passando por engano.
  // A cobertura real dessa metade vive em
  // `tests/integration/ingest-cycle.test.ts` — que roda contra banco
  // descartável com `ALLOW_DB_WRITE_TESTS=1`, e é justamente por isso que ela
  // não entra em toda corrida. Trocar uma asserção falsa por uma lacuna
  // escrita é o ponto: `docs/_meta/orquestracao-paralela.md` § 7.3.

  it("sem a variável, o ciclo NÃO é pulado — o default é ligado", async () => {
    // Par com os dois acima: sem este caso, um `return { skipped }`
    // incondicional passaria nos dois primeiros.
    delete process.env.CRON_ENABLED;

    const res = await runIngestCycle(req());
    const corpo = (await res.json()) as Record<string, unknown>;

    expect(corpo.skipped).not.toBe("cron_disabled");
  });

  it('🔴 "False" e "0" NÃO desligam — a comparação é exata com "false"', async () => {
    // `process.env.CRON_ENABLED !== "false"` é igualdade exata de string.
    // Quem digitar `False`, `FALSE` ou `0` no painel da Vercel vai acreditar
    // que desligou o cron — e ele vai continuar batendo no TSE. É a mesma
    // classe de defeito silencioso que já mordeu este repositório três vezes
    // em conversores de enum.
    //
    // O teste NÃO propõe tolerar as variantes: propõe que o comportamento
    // esteja escrito e travado. Se alguém decidir aceitá-las, que seja por
    // decisão, quebrando este teste de propósito — não por acidente.
    for (const valor of ["False", "FALSE", "0", "no", " false"]) {
      process.env.CRON_ENABLED = valor;
      const corpo = (await runIngestCycle(req()).then((r) => r.json())) as Record<string, unknown>;
      expect(corpo.skipped, `CRON_ENABLED=${JSON.stringify(valor)}`).not.toBe("cron_disabled");
    }
  });
});
