# Prompt de abertura — próxima sessão do SalaCofre

Copie o texto abaixo na primeira mensagem da sessão nova.

---

Continuando o SalaCofre. Leia primeiro, nesta ordem:

1. `docs/_meta/handoff-2026-09-08.md` — estado atual, comece por aqui
2. `docs/_meta/plano-redesign-2026-09-08.md` — o plano vivo, com a seção "Reordenação de 08/09"
3. `docs/constitution.md` — está em **1.4**; os §§ 2 e 3 mudaram em 07 e 08/09
4. `docs/architecture/adrs/0032-detalhe-municipal-vercel-blob.md` — a próxima tarefa
5. `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — sprint ativa, Fases 7 e 7b

Branch: `main` (a `s07/simulado-ready-hero-1t` foi mesclada). Hoje é 2026-09-08 — ajuste se for
outro dia. Simulados do TSE em 15–17/09 e 22–24/09; 1º turno em 04/10.

Rodar testes exige: `set -a; . ./.env.local; set +a`
Baseline: 1.175 vitest, 145 pytest (dentro de `.venv-model`), typecheck limpo, lint 0 erros,
build limpo, axe 0 violações em 5 rotas × 2 viewports, orçamento de aplicação 4.019 B de 153.600.

**O que fazer primeiro, na ordem do handoff:**

1. **Migrar detalhe municipal e séries para o Vercel Blob** (ADR-0032). O payload mede 2,19 MB
   contra 1 MB de limite e cresce conforme a cobertura melhora; a escrita seria recusada na noite
   da apuração. Decisão do usuário: **antes do simulado 1**.
2. **Investigar a tabela `eleitorado`** com `model-validator`: está inflada 21,8% de forma desigual
   por UF porque o importador não filtra o turno, e alimenta o peso de cada UF na agregação
   nacional. É a primeira hipótese para o gate OT-4, que reprova desde 07/09.
3. Depois: dark mode (13 das 31 bases de partido reprovam 3:1 no escuro), rótulos de UF no mapa
   (aprovados pelo usuário; exigem glyphs PBF), specs 016 e 017.

**Não reabra** as decisões D1–D16 listadas no handoff.

**Antes de aceitar retorno de subagent, confira no disco.** Nesta última sessão, agentes reportaram
lista errada de partidos, nomes de função inexistentes e contrastes calculados só para o caso mais
favorável — tudo plausível, tudo falso. Recompute os números você mesmo.
