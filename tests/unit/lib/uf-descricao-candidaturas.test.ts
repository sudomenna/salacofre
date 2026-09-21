/**
 * tests/unit/lib/uf-descricao-candidaturas.test.ts
 *
 * O texto que um leitor de tela ouve ao parar numa célula de UF da
 * `<StateGroupedTable>` — o equivalente falado do balão de hover do mapa
 * nacional (WCAG SC 1.4.13 / RNF-022).
 *
 * ## O defeito que este arquivo trava
 *
 * Até 2026-09-20 o balão nomeava **4 candidaturas + "Outros (N)"** por estado
 * e a tabela nomeava **uma** (o líder, e só no cabeçalho da coluna). Mouse
 * alcançava quatro nomes por estado; teclado e leitor de tela alcançavam um.
 *
 * ## Por que os casos estão aqui e não num teste de render
 *
 * O defeito é de CONTEÚDO — quais nomes saem e quantos. Um teste de render
 * provaria que existe um `<span class="sr-only">`; só um teste sobre o texto
 * prova que ele nomeia quatro candidaturas em vez de uma. O par que garante a
 * fiação no DOM (`aria-describedby` → `id`) vive em
 * `tests/unit/components/StateGroupedTable.descricaoAcessivel.test.tsx`.
 *
 * ## Mutações que estes casos matam
 *
 *   - nomear só o líder, como antes de 2026-09-20
 *   - ⚠️ **INVERTIDA em 2026-09-21**: era "sem corte → payload com N maior
 *     estoura a célula"; virou "reintroduzir `.slice(0, 4)` → os resgatados
 *     do RF-190 somem para quem usa leitor de tela". Ver o caso próprio
 *     abaixo pelo porquê da inversão
 *   - ler nome de `national.candidatos` em vez de `top_candidatos` (ADR-0042)
 *   - renderizar "Outros" incondicionalmente quando `row.outros` é ausente
 *   - dizer "por projeção" numa lista cuja ordem o resgate por apurado muda
 */

import { describe, expect, it } from "vitest";

import type { EdgeUfRow } from "@/lib/edge-config/types";
import { descricaoCandidaturasUf } from "@/lib/utils/uf-descricao-candidaturas";

type TopCandidatos = EdgeUfRow["top_candidatos"];

function mkRow(top: TopCandidatos, outros?: EdgeUfRow["outros"]): EdgeUfRow {
  return {
    sigla: "SP",
    pct_apurado: 42,
    lider: top[0]?.id ?? 13,
    margem_atual: 5,
    margem_projetada: 5,
    margem_projetada_ci: [3, 7],
    chamada: false,
    swing_vs_2022: null,
    top_candidatos: top,
    outros,
    vai_a_2t: null,
    bucket: "indefinido",
  };
}

const QUATRO: TopCandidatos = [
  { id: 13, pct: 40.5, nome: "FERNANDA DA SILVA", partido: "PT" },
  { id: 22, pct: 30.25, nome: "ROBERTO ALMEIDA", partido: "PL" },
  { id: 12, pct: 15.1, nome: "CARLA MENDES", partido: "PDT" },
  { id: 50, pct: 6.4, nome: "JOAO BATISTA", partido: "PSOL" },
];

describe("descricaoCandidaturasUf — as 4 candidaturas viram texto", () => {
  it("🔴 nomeia AS QUATRO, não só o líder [mutação: `.slice(0, 1)`]", () => {
    const texto = descricaoCandidaturasUf(mkRow(QUATRO));

    // Este é o caso central do arquivo: o comportamento anterior (só o líder)
    // passa no 1º expect e reprova nos três seguintes.
    expect(texto).toContain("FERNANDA DA SILVA");
    expect(texto).toContain("ROBERTO ALMEIDA");
    expect(texto).toContain("CARLA MENDES");
    expect(texto).toContain("JOAO BATISTA");
  });

  it("cada candidatura sai com partido e percentual projetado, em pt-BR", () => {
    const texto = descricaoCandidaturasUf(mkRow(QUATRO));
    expect(texto).toContain("FERNANDA DA SILVA (PT) 40,5%");
    expect(texto).toContain("ROBERTO ALMEIDA (PL) 30,3%"); // 30,25 arredonda p/ 1 casa
    expect(texto).toContain("JOAO BATISTA (PSOL) 6,4%");
  });

  it('🔴 a linha "Outros (N)" entra com a contagem E o percentual', () => {
    const texto = descricaoCandidaturasUf(
      mkRow(QUATRO, { pct: 7.75, n_candidatos: 7, votos_atuais: 0 }),
    );
    expect(texto).toContain("Outros (7) 7,8%");
  });

  it('🔴 `outros` AUSENTE ⇒ nenhuma menção a "Outros" [mutação: renderizar incondicionalmente]', () => {
    // Campo faltando significa "a cauda é vazia" (UF com ≤ 4 candidaturas no
    // cargo), não "os demais somam zero" — `EdgeUfRow.outros` em
    // `lib/edge-config/types.ts`. "Outros (0) 0,0%" seria uma linha falsa.
    const texto = descricaoCandidaturasUf(mkRow(QUATRO));
    expect(texto).not.toContain("Outros");
  });

  /**
   * 🔴 **Este caso foi INVERTIDO em 2026-09-21.** Ele exigia o oposto:
   * *"o corte é em 4 mesmo com payload maior [mutação: remover o `.slice`]"* —
   * e travava um `.slice(0, CANDIDATURAS_NOMEADAS)` que, com o RF-190, passou
   * a **esconder de quem usa leitor de tela exatamente as candidaturas que o
   * RF-190 existe para deixar de esconder**.
   *
   * O RF-190 fez `top_candidatos` virar a união top-4-por-projeção ∪
   * top-2-por-apurado. Numa UF em que as ordens divergem, a tela passou a
   * nomear 6 e o `sr-only` continuava nomeando 4, dizendo "Outros (6)".
   * Achado pelo `a11y-perf-auditor` no portão, medido em navegador.
   *
   * A justificativa do corte não era boba — "são 27 células, e cada nome a
   * mais é falado em toda parada de tabulação" —, mas ela mesma dizia que um
   * payload com N maior exigiria **alguém decidir**. O dono decidiu (o balão
   * cresce), e o texto acessível tem de acompanhar: RF-025 existe para a
   * lista falada ser **paralela** à visível.
   *
   * O caso agora guarda a AUSÊNCIA do corte, porque reintroduzi-lo reabre o
   * defeito em silêncio — ninguém percebe um nome que não é falado.
   */
  it("🔴 nomeia TODO o `top_candidatos`, inclusive os resgatados do RF-190 [mutação: voltar o `.slice(0, 4)`]", () => {
    const seis: TopCandidatos = [
      ...QUATRO,
      // Os dois resgatados: entram ao FIM, com `pct` (projeção) baixo, porque
      // quem os trouxe foi o apurado. São eles que sumiam.
      { id: 77, pct: 2.2, nome: "SAMARA RESGATADA", partido: "PV" },
      { id: 88, pct: 1.1, nome: "EDMILSON RESGATADO", partido: "PCB" },
    ];
    const texto = descricaoCandidaturasUf(mkRow(seis));
    expect(texto).toContain("JOAO BATISTA");
    expect(texto).toContain("SAMARA RESGATADA");
    expect(texto).toContain("EDMILSON RESGATADO");
  });

  it("🔴 a frase de abertura não promete mais ORDEM de projeção — só o percentual é projetado", () => {
    // Com um resgatado ao fim, a lista não está em ordem de `pct_projetado`:
    // ele entrou por ter o maior APURADO. "por projeção" descreveria errado
    // exatamente a UF em que o resgate acontece, que é onde importa.
    const texto = descricaoCandidaturasUf(mkRow(QUATRO));
    expect(texto).not.toContain("por projeção");
    expect(texto).toContain("percentual projetado");
  });

  it('🔴 `nome` AUSENTE cai em "Cand {id}", nunca no nome de outro estado (ADR-0042)', () => {
    // Payload pré-spec-018 e `model_fallback_tier` não trazem `nome`. O
    // placeholder é o mesmo de `<GovernorCard>`: feio e verdadeiro.
    const texto = descricaoCandidaturasUf(
      mkRow([
        { id: 13, pct: 40 },
        { id: 22, pct: 30, partido: "PL" },
      ]),
    );
    expect(texto).toContain("Cand 13 40,0%");
    // Sem `nome` mas COM partido: o parêntese sobrevive.
    expect(texto).toContain("Cand 22 (PL) 30,0%");
  });

  it("partido ausente ⇒ o parêntese SOME, não vira “(—)”", () => {
    const texto = descricaoCandidaturasUf(mkRow([{ id: 13, pct: 40, nome: "FERNANDA DA SILVA" }]));
    expect(texto).toContain("FERNANDA DA SILVA 40,0%");
    expect(texto).not.toContain("(—)");
  });

  it("payload antigo com 3 entradas e sem `outros` sai inteiro, sem reclamar", () => {
    const texto = descricaoCandidaturasUf(mkRow(QUATRO.slice(0, 3)));
    expect(texto).toContain("FERNANDA DA SILVA");
    expect(texto).toContain("CARLA MENDES");
    expect(texto).not.toContain("JOAO BATISTA");
  });

  it('🔴 sem `top_candidatos` e sem `outros` ⇒ "" (o chamador não pendura `aria-describedby`)', () => {
    // Um `aria-describedby` apontando para elemento vazio anuncia uma
    // descrição que não existe — pior que não descrever.
    expect(descricaoCandidaturasUf(mkRow([]))).toBe("");
  });

  it("sem `top_candidatos` mas COM `outros`: a cauda ainda é dita", () => {
    const texto = descricaoCandidaturasUf(mkRow([], { pct: 12.3, n_candidatos: 4 }));
    expect(texto).toContain("Outros (4) 12,3%");
  });
});
