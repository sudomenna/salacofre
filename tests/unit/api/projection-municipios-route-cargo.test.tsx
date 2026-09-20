/**
 * tests/unit/api/projection-municipios-route-cargo.test.tsx
 *
 * `GET /api/projection/municipios?uf=&cargo=` — a camada 2 dos ajustes de
 * 2026-09-19.
 *
 * ## O defeito que estes casos trancam
 *
 * `resolveCargoETurno` reconhecia **só** `"gov"`; qualquer outro valor caía no
 * presidencial em silêncio. `?cargo=sen` devolvia os municípios do PRESIDENTE
 * sob o rótulo "Senado", e `?cargo=dep` idem — a terceira reincidência do
 * mesmo molde nesta base (conversor de cargo com ramo `default`, o mesmo que
 * já mandou payload de Senador para a chave do Presidente).
 *
 * As asserções são sobre o ARGUMENTO passado a `readUfDetail` — é ele que
 * escolhe o caminho do Blob (`municipios/uf/<SIGLA>/<cargo>/t<turno>.json`,
 * `lib/blob/paths.ts`). Um teste que só olhasse o corpo da resposta passaria
 * com o cargo trocado.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentPresidentialRace } from "@/lib/config/calendar";

const readUfDetailMock = vi.fn();
const devFixtureMock = vi.fn();
vi.mock("@/lib/blob/uf-detail", () => ({
  readUfDetail: (sigla: string, opts: unknown) => readUfDetailMock(sigla, opts),
  devMunicipiosFixtureFor: (...args: unknown[]) => devFixtureMock(...args),
}));

const simulacaoLigadaMock = vi.fn(() => false);
const simulacaoMunicipiosUfMock = vi.fn();
vi.mock("@/lib/dev/simulacao", () => ({
  simulacaoLigada: () => simulacaoLigadaMock(),
  simulacaoMunicipiosUf: (sigla: string, cargo: string, turno: number) =>
    simulacaoMunicipiosUfMock(sigla, cargo, turno),
}));

const { GET } = await import("@/app/api/projection/municipios/route");

const SEM_DETALHE = { status: "unavailable", reason: "not_found", url: null } as unknown;

describe("GET /api/projection/municipios — resolução de cargo", () => {
  beforeEach(() => {
    readUfDetailMock.mockReset().mockResolvedValue(SEM_DETALHE);
    devFixtureMock.mockReset().mockReturnValue(null);
    simulacaoLigadaMock.mockReset().mockReturnValue(false);
    simulacaoMunicipiosUfMock.mockReset();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("`cargo=sen` passa a ser atendido — lê o caminho de SENADOR, turno 1", async () => {
    // Mutação: remover `sen` da tabela `TURNO_POR_CARGO` faz este caso virar
    // 400; reintroduzir um `default` presidencial o faz falhar na asserção do
    // argumento. As duas formas do defeito ficam trancadas.
    await GET(new Request("http://x/api/projection/municipios?uf=SP&cargo=sen"));

    expect(readUfDetailMock).toHaveBeenCalledTimes(1);
    expect(readUfDetailMock).toHaveBeenCalledWith("SP", { cargo: "sen", turno: 1 });
  });

  it("`cargo=gov` continua no caminho de Governador, turno 1", async () => {
    await GET(new Request("http://x/api/projection/municipios?uf=SP&cargo=gov"));

    expect(readUfDetailMock).toHaveBeenCalledWith("SP", { cargo: "gov", turno: 1 });
  });

  it("sem `cargo` continua presidencial no turno corrente — contrato anterior intacto", async () => {
    await GET(new Request("http://x/api/projection/municipios?uf=SP"));

    expect(readUfDetailMock).toHaveBeenCalledWith("SP", {
      cargo: "pres",
      turno: currentPresidentialRace().turno,
    });
  });

  it("cargo desconhecido é 400 — e o Blob NEM É LIDO", async () => {
    // 🔴 `dep` é o caso real: Deputado Federal tem drill-down próprio
    // (`deputado/uf/<SIGLA>.json`, ADR-0026) e nenhum detalhe municipal.
    // Servir os municípios do Presidente ali seria pintar a corrida errada.
    for (const cargo of ["dep", "pres ", "PRES", "senador", "constructor"]) {
      readUfDetailMock.mockClear();
      const res = await GET(
        new Request(`http://x/api/projection/municipios?uf=SP&cargo=${encodeURIComponent(cargo)}`),
      );
      expect(res.status, `cargo=${cargo}`).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_cargo", cargo });
      expect(readUfDetailMock, `cargo=${cargo}`).not.toHaveBeenCalled();
    }
  });

  it("simulação ligada + `cargo=sen` busca o arquivo de SENADOR e não lê o Blob", async () => {
    simulacaoLigadaMock.mockReturnValue(true);
    simulacaoMunicipiosUfMock.mockReturnValue({
      ts: "2026-10-04T22:15:00-03:00",
      municipios: [{ cod_ibge: "3550308", nome: "SÃO PAULO" }],
    });

    const res = await GET(new Request("http://x/api/projection/municipios?uf=SP&cargo=sen"));

    expect(simulacaoMunicipiosUfMock).toHaveBeenCalledWith("SP", "sen", 1);
    expect(readUfDetailMock).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { status: string; municipios: unknown[] };
    expect(corpo.status).toBe("ok");
    expect(corpo.municipios).toHaveLength(1);
  });

  it("simulação ligada sem arquivo do cargo → `unavailable`, nunca o Blob nem a fixture antiga", async () => {
    simulacaoLigadaMock.mockReturnValue(true);
    simulacaoMunicipiosUfMock.mockReturnValue(null);

    const res = await GET(new Request("http://x/api/projection/municipios?uf=SP&cargo=sen"));

    expect(readUfDetailMock).not.toHaveBeenCalled();
    expect(devFixtureMock).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({
      status: "unavailable",
      reason: "not_found",
      municipios: [],
    });
  });
});
