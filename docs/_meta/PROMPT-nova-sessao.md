---
title: Prompt para iniciar a próxima sessão
description: Copie o bloco abaixo inteiro como primeira mensagem de uma sessão zerada
status: stable
---

# Prompt para a próxima sessão

Copie **tudo** dentro do bloco abaixo como a primeira mensagem.

---

```
Continuando o SalaCofre. Leia primeiro, em ordem:

1. docs/_meta/handoff-2026-09-07.md   (estado atual — comece por aqui)
2. docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md  (plano do modelo; Fases 0–5
   feitas, sobram 3 itens que o handoff lista)
3. docs/sprints/2026-S07-f6-simulado-hero-1t.md  (sprint ativa)

Estamos na branch s07/simulado-ready-hero-1t. Os 12 commits antigos estão em origin,
mas TODO o trabalho das Fases 3b e 5 está na árvore, NÃO COMMITADO — são ~43 arquivos.
Confirme com `git status` antes de qualquer coisa. Hoje é 2026-09-07 (ajuste se for
outro dia). Simulados oficiais do TSE em 15-17/09 e 22-24/09; 1º turno em 04/10.

Gates medidos em 07/09 com a árvore parada: 545 vitest (1 skipped, 71 arquivos),
145 pytest, typecheck limpo, lint 0 erros e 5 warnings pré-existentes. O gate OT-4
do replay REPROVA — isso é esperado e está explicado no handoff.
Rodar testes exige: set -a; . ./.env.local; set +a

CONTEXTO EM UMA FRASE: o modelo deixou de projetar por "swing vs. 2022" e passou a
extrapolar do que cada zona já apurou (k = te/esi), somando zona → UF → Brasil, com
pós-estratificação por tercis de porte de zona. 2022 saiu do cálculo e ficou só como
comparação na tela. ADR-0021 e ADR-0023; a constituição foi para 1.2.

O que falta, em ordem de prioridade:

A) COMMITAR. São duas sessões de trabalho não versionado, incluindo a correção de um
   bug de produção. Sugestão de quebra temática: replay regenerado; fix do pct_apurado;
   estratificação + ADR-0023; ADR-0022 e bloco do /governador; docs do método
   (/sobre-o-modelo, specs 002/011); User-Agent; sprints e riscos.

B) RODAR OS TRÊS GATES que não rodaram sobre o estado final: constitution-guard,
   a11y-perf-auditor e rf-coverage-checker. (O spec-syncer já rodou.)
   Rode `rm -rf .next` antes do gate visual.

C) TENTATIVA 3 DO GATE OT-4 — decisão do usuário, pergunte cedo. MAE@1h está em
   2,590pp (Lula) e 2,070pp (Bolsonaro) contra limiar de 2pp, e a cobertura do IC95
   em 79,5% contra 90%. A estratificação (tentativa 2) cortou 20% do erro no ponto e
   não moveu a cobertura. LEIA a ressalva do handoff antes de opinar: a ordem de
   apuração do replay é sintética, inventada por nós, e o limiar de 2pp nunca teve
   base empírica. Os três caminhos são estratos mais finos, atacar a largura do
   intervalo, ou recalibrar o limiar com dado do simulado. Isso bloqueia a spec 002.

D) TRÊS ITENS PEQUENOS da Fase 5: compute_swing_descritivo (hoje só existe em
   comentário), brancos_nulos no mesmo idx dos candidatos, e o assert de percentil
   do RF-015. Mais a lacuna do RF-017 catalogada em risks.md.

E) PREPARAR O SIMULADO (Fase 4 da sprint): env de preview, whitelist mínima,
   ciclo manual antes de ligar o cron.

DECISÕES QUE SÓ O USUÁRIO TOMA:
1. A caixa contato@salacofre.com.br precisa existir e ser lida antes de 15/09 — o
   código já envia esse endereço no User-Agent do TSE.
2. Tentativa 3 do OT-4 (item C).
3. Chamado ao TSE em 12/09 se as URLs do simulado não saírem — o usuário decidiu
   não redigir antes. Em 30308800.tse.jus.br, descrição começando em
   "Resultados - Divulgação".
4. Visão municipal: hoje cobre ~39% dos municípios (agregação por zona-sede) e a
   interface não avisa. O handoff tem os números e as duas saídas.

MONITORAR O TSE DIARIAMENTE: pnpm tse:watch --once. Rodou em 05/09 e 07/09 sem
mudança; ele-c.json de produção ainda em ele2024.

REGRAS CRÍTICAS:
- Nunca sondar URL adivinhada contra resultados.tse.jus.br ou
  resultados-sim.tse.jus.br. Um 404 malformado pode bloquear nosso IP por 10
  minutos. Use scripts/tse-mock-server.ts para qualquer teste de ingestão.
- Não mudar o contrato de `estimates` (share fracionário pareado) — votos absolutos
  nos arrays quebram p_fecha_1t em silêncio.
- Não mexer em --color-cand-*, colorForRank, bandForRank (ADR-0013), nem no layout
  binary do 2º turno.
- O rótulo da base é "votáveis", nunca "válidos".
- rm -rf .next antes de qualquer gate visual.
- Relatório de subagent é hipótese: confira no disco. Nesta rodada a matriz de
  rastreabilidade citava seis testes que não existiam e o rf-coverage-checker deu
  verde sobre eles.

COISAS QUE PARECEM BUG E NÃO SÃO: swing_vs_2022 sai None de propósito; os tokens
--color-pt-band e --color-pl-band seguem invertidos em globals.css:22-23,
deliberadamente e sem consumidor; UFs com menos de 12 zonas (RR, AC, ZT, AP) não são
estratificadas por desenho; e o BaseToggle está pronto e desligado de propósito —
ligá-lo derrubaria 54 páginas de estático para dinâmico.

SE A SUÍTE DE TESTES FICAR LENTA: na madrugada de 06→07/09 o Neon degradou e a suíte
levou 70 minutos com falhas espúrias de timeout. A suíte sadia roda em ~140s. Meça o
tempo antes de concluir que há regressão.

Comece por A, delegando conforme o CLAUDE.md.
```
