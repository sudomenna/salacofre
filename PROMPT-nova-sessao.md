Continuando o SalaCofre. Leia primeiro, nesta ordem:

1. `docs/_meta/handoff-2026-09-11.md` — estado atual, comece por aqui
2. `docs/architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md` — as decisões de 11/09 e o risco aberto
3. `docs/architecture/overview.md` — o fluxo ponta a ponta, já atualizado
4. `docs/constitution.md` — está em 1.4
5. `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — sprint ativa (Fase 7c é o trabalho de 11/09)
6. `docs/testing/tse-simulados.md` — o **Passo 0** é a coisa mais importante do dia 15

Branch: `main`, árvore limpa (só `tse_docs/Switchcraft.pdf` e `tse_docs/painel-exportar/` soltos,
que são de outro projeto). Hoje é 2026-09-11 — ajuste se for outro dia.
Simulados do TSE em 15–17/09 e 22–24/09; 1º turno em 04/10.

Rodar qualquer coisa que toque o banco exige: `set -a; . ./.env.local; set +a`
Baseline: **1.546 vitest** · **178 pytest** (`.venv-model/bin/python3.14`) · typecheck limpo ·
lint com 5 erros e 5 avisos **pré-existentes** · nenhuma cross-ref quebrada em `docs/`.
Gate OT-4 **reprovando**: MAE@1h PT 2,3623pp (teto 2) / cobertura 82,5% (piso 90).

**O usuário não é engenheiro.** `CLAUDE.md § 0` é regra, não sugestão: fale com ele sem jargão,
comece pela consequência, use analogia concreta. A regra não vale para ADR, commit, spec e
briefing de subagent — ali a precisão de vocabulário é obrigatória.

**Antes de diagnosticar qualquer coisa visual**, cheque servidor órfão na porta 3000
(`lsof -ti:3000` e a idade do processo). E se o sintoma for visual e o código parecer certo,
**peça um print** em vez de insistir: o painel de visualização não é o navegador do usuário.

**Confira no disco tudo que um subagent relatar.** Nesta última sessão cinco erraram de formas
plausíveis — causa raiz errada, datas inventadas, número de alvos trocado, unidade de medida
convertida de timestep para hora com mecanismo inventado junto, e um endpoint descrito lendo
arquivos que não lê. Três também me corrigiram com razão. Recompute você mesmo.

**O que fazer, na ordem:**

1. **`rf-coverage-checker`** — nada bloqueia. É o que decide se a spec 001 pode fechar.
2. **`a11y-perf-auditor`** nas duas rotas de UF — **bloqueado**: o Blob nunca recebeu escrita, o
   painel novo mostra "detalhe indisponível" e não há o que auditar. Destrava com o item 3.
3. **`EDGE_CONFIG_TOKEN`** (pede o usuário) — escopo do **time** `team_AqxGDYz4Zxs5wUBUDzIpcwBm`,
   não pessoal. Com ele: `pnpm edge-config:smoke`. Destrava a gravação nunca exercitada, o Blob
   vazio, o gate de a11y e o usuário conseguir ver a tela nova.
4. **Chamado ao TSE** (pede o usuário, prazo 12/09) — o watch segue sem sinal de 2026.
5. **Decisões pendentes do usuário**: Senador/Deputado (016/017) continuam no escopo? Push dos
   **89 commits** para o GitHub? O código IBGE de Boa Esperança do Norte (MT)? Os dois arquivos
   alheios em `tse_docs/`?

**Não reabra**: ADR-0035 (D1 par como unidade de ingestão, D2 soma exata sem rateio com o modelo
por zona, D3 cron por cargo), o recuo do `TSE_MAX_RPS` para 40, as 8 linhas com capital primeiro
no painel de colégios, e D21/D22/D23 do ADR-0034 com as quatro exceções constitucionais.

**O risco que importa mais que todo o resto**: não foi verificado que o arquivo do par traz a
*fatia* da zona naquele município, e não a zona inteira. Se a premissa cair, a soma multiplica os
votos por até 8× em 62,5% das zonas — invisível nos testes, catastrófico em 04/10. Não teste
sondando URL (§ 1, e um 404 bloqueia o IP por 10 min). O Passo 0 do protocolo do simulado resolve
com três aritméticas; `check_zona_merge_sanity` é a rede enquanto isso.
