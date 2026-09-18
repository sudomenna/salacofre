/**
 * RF-057 — alertas quando o pipeline passa do limiar.
 *
 * ## Por que este arquivo existe
 *
 * Até 2026-09-18 o RF-057 tinha **zero teste** — nem unitário, nem de
 * integração. `grep -rln "notifySlack\|tse/alerts" tests/` devolvia **nada**. A
 * matriz de rastreabilidade registrava "manual (forçar)", e o manual também
 * nunca foi feito (a caixa segue aberta na S08 § 1).
 *
 * A causa não era desleixo: as três condições viviam soltas dentro de
 * `runIngestCycle`, **depois** de tudo que exige Postgres, lock anti-overlap e
 * CDN. Não havia como chegar nelas num teste que roda em toda corrida.
 *
 * Duas coisas separadas passaram a ser testáveis separadamente:
 *
 *   - **a regra** — `alertasDoCiclo`, aritmética pura, sem I/O;
 *   - **o transporte** — `notifySlack`, que fala com a rede.
 *
 * 🔴 **Nada aqui depende de `SLACK_WEBHOOK_URL` estar configurada.** A variável
 * não existe em nenhum ambiente (decisão do dono adiada em 18/09) e isso
 * **nunca** foi motivo para o requisito não ter teste: o canal estar mudo é
 * configuração, não impedimento de medir a lógica.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { alertasDoCiclo, ERROS_ALERTA, LAG_ALERTA_SEGUNDOS, notifySlack } from "@/lib/tse/alerts";

const CICLO_CALMO = { lagSegundos: 10, errosConsecutivos: 0, rateLimited: 0 };

describe("alertasDoCiclo — a regra, sem I/O", () => {
  it("ciclo saudável não produz alarme nenhum", () => {
    expect(alertasDoCiclo(CICLO_CALMO)).toEqual([]);
  });

  it(`exatamente ${LAG_ALERTA_SEGUNDOS}s NÃO alarma — o RF diz "> 60", não ">= 60"`, () => {
    // 🔴 O caso NO limiar. Sem ele, trocar `>` por `>=` passa despercebido, e a
    // meta cumprida no limite viraria violação — ruído numa noite em que o
    // operador precisa confiar no canal.
    expect(alertasDoCiclo({ ...CICLO_CALMO, lagSegundos: LAG_ALERTA_SEGUNDOS })).toEqual([]);
  });

  it("um décimo acima do limiar alarma, com o número na mensagem", () => {
    const r = alertasDoCiclo({ ...CICLO_CALMO, lagSegundos: LAG_ALERTA_SEGUNDOS + 0.1 });
    expect(r).toHaveLength(1);
    const a = r[0];
    if (a === undefined) throw new Error("inalcançável: acabamos de exigir 1 item");
    expect(a.severity).toBe("warn");
    expect(a.msg).toContain("60.1s");
    expect(a.ctx?.maxLagSeconds).toBe(LAG_ALERTA_SEGUNDOS + 0.1);
  });

  it('🔴 lag `null` NÃO alarma — "não sei" não é "está ruim"', () => {
    // Ausência de leitura com hora de boletim é ausência de informação. Tratá-la
    // como defasagem enorme confundiria dois dos três estados que este produto
    // se obriga a distinguir (decisão do dono, 14/09).
    expect(alertasDoCiclo({ ...CICLO_CALMO, lagSegundos: null })).toEqual([]);
  });

  it(`${ERROS_ALERTA - 1} erros não alarmam; ${ERROS_ALERTA} alarmam`, () => {
    // Par no limiar, dos dois lados.
    expect(alertasDoCiclo({ ...CICLO_CALMO, errosConsecutivos: ERROS_ALERTA - 1 })).toEqual([]);
    const r = alertasDoCiclo({ ...CICLO_CALMO, errosConsecutivos: ERROS_ALERTA });
    expect(r).toHaveLength(1);
    expect(r[0]?.severity).toBe("error");
  });

  it("um único 429 já alarma — não há limiar de tolerância aqui", () => {
    // 429 sustentado é o sinal mais direto de que a taxa está desalinhada com o
    // limite do TSE, e a penalidade é bloqueio de IP por 10 min. Zero é o único
    // valor aceitável, então o limiar é `> 0` e não um piso qualquer.
    expect(alertasDoCiclo({ ...CICLO_CALMO, rateLimited: 0 })).toEqual([]);
    expect(alertasDoCiclo({ ...CICLO_CALMO, rateLimited: 1 })).toHaveLength(1);
  });

  it("as três condições juntas produzem três alarmes, não um resumo", () => {
    // Cada condição tem conserto diferente: lag alto pede olhar a cadência,
    // erros pedem olhar o parser, 429 pede baixar a taxa. Colapsar em uma
    // mensagem obrigaria o operador a adivinhar qual é qual.
    const r = alertasDoCiclo({ lagSegundos: 200, errosConsecutivos: 5, rateLimited: 7 });
    expect(r).toHaveLength(3);
    expect(r.map((a) => a.severity)).toEqual(["warn", "error", "error"]);
  });

  it("o ctx do chamador é preservado e não sobrescreve o do alarme", () => {
    const r = alertasDoCiclo({
      ...CICLO_CALMO,
      lagSegundos: 999,
      ctx: { env: "production", turno: 1 },
    });
    expect(r).toHaveLength(1);
    expect(r[0]?.ctx).toMatchObject({ env: "production", turno: 1, maxLagSeconds: 999 });
  });
});

describe("notifySlack — o transporte", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let webhookOriginal: string | undefined;

  beforeEach(() => {
    webhookOriginal = process.env.SLACK_WEBHOOK_URL;
    fetchSpy = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (webhookOriginal === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = webhookOriginal;
  });

  it("🔴 sem SLACK_WEBHOOK_URL não faz requisição alguma, e não lança", async () => {
    // É o estado REAL de todos os ambientes hoje. O alarme nasce mudo, e ficar
    // mudo não pode derrubar o ciclo que ele observa.
    delete process.env.SLACK_WEBHOOK_URL;
    await expect(notifySlack({ severity: "warn", msg: "x" })).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("com webhook, faz POST para a URL configurada com a severidade em maiúscula", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.exemplo.test/abc";
    await notifySlack({ severity: "error", msg: "3 erros consecutivos" });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.exemplo.test/abc");
    expect(init.method).toBe("POST");
    const corpo = JSON.parse(String(init.body)) as { text: string };
    expect(corpo.text).toContain("[ERROR] 3 erros consecutivos");
  });

  it("o ctx vai junto como bloco de código, para diagnóstico", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.exemplo.test/abc";
    await notifySlack({ severity: "warn", msg: "lag", ctx: { maxLagSeconds: 93.5 } });

    const corpo = JSON.parse(String((fetchSpy.mock.calls[0] as [string, RequestInit])[1].body)) as {
      text: string;
    };
    expect(corpo.text).toContain("```");
    expect(corpo.text).toContain("93.5");
  });

  it("🔴 falha de rede NÃO lança — alarme que derruba o ciclo é pior que alarme mudo", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.exemplo.test/abc";
    fetchSpy.mockRejectedValue(new Error("ECONNRESET"));
    await expect(notifySlack({ severity: "warn", msg: "x" })).resolves.toBeUndefined();
  });

  it("🔴 resposta 4xx do Slack NÃO lança — webhook revogado não pode parar a apuração", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.exemplo.test/abc";
    fetchSpy.mockResolvedValue(new Response("no_service", { status: 404 }));
    await expect(notifySlack({ severity: "error", msg: "x" })).resolves.toBeUndefined();
  });
});
