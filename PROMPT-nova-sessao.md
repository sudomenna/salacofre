Continuando o SalaCofre. Leia primeiro, nesta ordem:

1. `docs/_meta/handoff-2026-09-10.md` — estado atual, comece por aqui
2. `docs/architecture/adrs/0034-resultpanel-colapso-visual-corte-fora-do-kit.md` — as decisões D21–D23
3. `docs/architecture/adrs/0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md` — navegação e a emenda do gate OT-4
4. `docs/constitution.md` — está em 1.4
5. `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — sprint ativa

Branch: `main`, árvore limpa. Hoje é 2026-09-10 — ajuste se for outro dia.
Simulados do TSE em 15–17/09 e 22–24/09; 1º turno em 04/10.

Rodar testes exige: `set -a; . ./.env.local; set +a`
Baseline: 1.482 vitest, typecheck e lint limpos (2 erros e 3 avisos pré-existentes),
build limpo, 54 páginas de UF ainda SSG, axe com 18 de 20 combinações limpas.

**Antes de tocar em qualquer coisa visual**, cheque se há servidor órfão na porta 3000:
`lsof -ti:3000` e a idade do processo. Nesta última sessão um `pnpm dev` de 39 horas
serviu build velho e me fez diagnosticar código que estava certo.

**O que fazer, na ordem do handoff:**

1. **Eleitorado por município** — exige autorização do usuário para mexer no backend,
   que na última sessão estava restrito a "só interface". Destrava o painel "Maiores
   colégios eleitorais" e o número de eleitores na folha do município. A tabela colapsa
   62% das zonas num único município; conserto medido em ~1 sessão.
2. **`EDGE_CONFIG` sem token** — pede o usuário. Sem ele, a guarda de tamanho do store
   e a renomeação de chaves nunca foram exercitadas, e o simulado 1 seria o primeiro
   teste real desse caminho. Atenção ao `teamId` ausente na URL do writer.
3. **Gate OT-4** — implementar a faixa de sensibilidade decidida no ADR-0033. O dado de
   2022 para calibrar NÃO existe: verificado, a URL do PRD devolve 404 e o `ele-c.json`
   oficial só lista `ele2024`. Não prometa calibração.
4. **Preparação do simulado** — o chamado ao TSE tem prazo 12/09.

**Não reabra** D21, D22 e D23, nem as quatro exceções constitucionais que resistiram ao
corte (elas estão nomeadas no handoff, com o parágrafo que as obriga).

**Antes de aceitar retorno de subagent, confira no disco.** Nesta sessão um agente
escreveu no documento da sprint que o dark mode fora "adiado para S08+" quando ele
estava entregue e commitado; outro afirmou uma causa raiz que a evidência contradisse.
Um terceiro me corrigiu, e estava certo. Recompute os números você mesmo.

**Se o sintoma for visual e o código parecer certo, peça um print ao usuário.** O mapa
aparecia em branco no meu visualizador e funcionava no navegador dele — gastei várias
rodadas caçando um defeito que não existia.
