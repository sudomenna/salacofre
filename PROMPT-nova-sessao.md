Continuando o SalaCofre. Leia primeiro, nesta ordem:

1. `docs/_meta/handoff-2026-09-11.md` — estado atual, comece por aqui
2. `docs/architecture/adrs/0035-par-municipio-zona-unidade-de-ingestao.md` — as decisões de 11/09 e o risco aberto
3. `docs/architecture/overview.md` — o fluxo ponta a ponta, já atualizado
4. `docs/constitution.md` — está em 1.4
5. `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — sprint ativa (Fase 7c é o trabalho de 11/09)
6. `docs/testing/tse-simulados.md` — o **Passo 0** é a coisa mais importante do dia 15

Branch `main`, árvore limpa e **sincronizada com o GitHub**. Hoje é 2026-09-11 — ajuste se for outro
dia. Simulados do TSE em 15–17/09 e 22–24/09; 1º turno em 04/10.

Qualquer coisa que toque o banco exige `set -a; . ./.env.local; set +a` antes.
Baseline: **1.548 vitest** · **178 pytest** (`.venv-model/bin/python3.14`) · typecheck limpo ·
lint com **5 erros e 5 avisos pré-existentes** (não tente consertá-los) · nenhuma cross-ref quebrada.
Gate OT-4 **reprovando** no ponto oficial: MAE@1h PT 2,3623pp (teto 2) / cobertura 82,5% (piso 90).

---

## Como falar com o usuário

**Ele não é engenheiro.** `CLAUDE.md § 0` é regra, não sugestão: comece pela consequência, não pelo
mecanismo; termo técnico só sem substituto e explicado na mesma frase; analogia concreta antes de
abstração. A regra **não** vale para ADR, commit, spec e briefing de subagent — ali a precisão de
vocabulário é obrigatória. Quando ele perguntar algo técnico direto, responda no nível da pergunta.

---

## O que fazer, na ordem

**1. PRIMEIRA COISA: decidir se a spec 001 (ingestão TSE) fecha.**
O `rf-coverage-checker` rodou em 11/09: 15 de 16 RFs cobertos, e o único buraco (RF-010.3 item 2, a
restrição agregada de 80 rps) **foi fechado na mesma sessão**. A spec chega aqui sem pendência
conhecida. Confronte o handoff com o disco, e leve a decisão ao usuário — promover spec é ato de
gate, não rotina.

**2. Specs 016 (Senador) e 017 (Deputado Federal).**
O usuário decidiu em 11/09 que **entram nesta sessão**. `docs/architecture/adrs/0026-cargos-senador-deputado-ingestao-e-read-path.md`
fixa ingestão e read path. Pré-requisito de qualquer código: resolver "corrida ativa única" em
`lib/config/calendar.ts`. **A degradação pré-acordada em 07/09 não se reabre**: se o módulo de
cadeiras da 017 não passar nos golden de 2022, ela shippa parcial por partido, sem projeção de
cadeiras; se nem isso, a aba fica desabilitada e o cargo vai para 2030.

**3. `a11y-perf-auditor` nas duas rotas de UF.**
Foi despachado em 11/09 mas o resultado **não foi conferido** antes do fim da sessão — verifique o
handoff e refaça se necessário. Limitação medida: o painel municipal **não renderiza em dev** porque
o Blob nunca recebeu escrita. Destrava com o item 4.

**4. Tarefas do usuário** — `docs/reference/risks.md` § "Tarefas do usuário".
Chamado ao TSE (prazo **12/09**) e `EDGE_CONFIG_TOKEN`. O segundo destrava três coisas de uma vez: a
gravação no Global Config que **nunca rodou**, o Blob vazio, e com ele o gate de a11y e o usuário
conseguir ver a tela nova.

---

## Não reabra

ADR-0035 (D1 par como unidade de ingestão, D2 soma exata sem rateio com o modelo por zona, D3 cron
por cargo); o recuo do `TSE_MAX_RPS` para 40; as 8 linhas com capital primeiro no painel de colégios;
D21/D22/D23 do ADR-0034 e as quatro exceções constitucionais; a degradação pré-acordada das specs
016/017.

---

## O risco que importa mais que todo o resto

**Não foi verificado que o arquivo do par traz a *fatia* da zona naquele município, e não a zona
inteira.** A spec do EA20 diz só "na abrangência da zona eleitoral", embora o nome do arquivo exija
um município. Se a premissa cair, `merge_pairs_into_zonas` **multiplica os votos por até 8×** em
62,5% das zonas — invisível nos testes, porque as fixtures são sintéticas, e catastrófico em 04/10.

**Não teste sondando URL**: a constituição § 1 proíbe e um 404 malformado bloqueia o IP por 10 min.
O **Passo 0** do protocolo do simulado resolve com três aritméticas. `check_zona_merge_sanity`
(`api/model/zona_merge.py:526`) é a rede enquanto isso — compara Σ`e.te` dos pares com o eleitorado
da zona e grita se a razão indicar multiplicação.

---

## Armadilhas que a sessão de 11/09 pagou para aprender

1. **Relatório de subagent é hipótese.** Naquele dia **seis** erraram de formas plausíveis: causa
   raiz trocada (era um `SUM` ausente, não o filtro de turno); datas de commit inventadas; contagem
   de alvos errada; a faixa de sensibilidade descrita em **horas** quando a unidade é **timestep**,
   com um mecanismo inventado junto; um endpoint descrito lendo arquivos que ele não lê; e um campo
   de resposta de API que não existe. **Quatro também corrigiram o orquestrador, com razão.** Confira
   no disco — inclusive o que o handoff afirma.
2. **`Map.set` sobre linhas de par é o modo de falha padrão** desde a migration 0006. Toda leitura
   chaveada por `(uf, cod_zona)` precisa de `SUM(...) GROUP BY`. Já mordeu três vezes, e nenhuma deu
   erro: só número errado.
3. **Os números do gate mudam quando o banco muda.** `replay-2022:sensitivity` **regenera** o fixture
   a partir do Postgres; `pnpm replay-2022` contra o fixture commitado é a medição de controle. Se
   divergirem, é o banco, não o modelo.
4. **Antes de diagnosticar qualquer coisa visual**, cheque servidor órfão na porta 3000 (`lsof -ti:3000`
   e a idade do processo). E se o sintoma for visual e o código parecer certo, **peça um print**: o
   painel de visualização não é o navegador do usuário.
5. **`git push` exige a conta certa.** O `gh` tem **duas** contas logadas nesta máquina; a ativa é
   `cneeducacao`, mas o repositório é `sudomenna/salacofre`. Push com a conta errada dá 403. O
   caminho é `gh auth switch --user sudomenna`, empurrar, e **devolver** com
   `gh auth switch --user cneeducacao` — há outro projeto na máquina que depende dela.
6. **O disco está a 98%** (~5 GiB livres).
7. **Sites oficiais bloqueiam automação**: `www.tse.jus.br`, `cidades.ibge.gov.br` e
   `ibge.gov.br` respondem **403** a cliente não-navegador. Por isso os PDFs do TSE estão versionados
   em `tse_docs/`. Quando precisar de dado oficial, procure a fonte alternativa (a prefeitura do
   município publicou o código IBGE que o IBGE não deixou buscar).

---

## Comandos

```bash
set -a; . ./.env.local; set +a            # obrigatório antes de tudo que toque o banco
pnpm typecheck && pnpm lint && pnpm test  # 1.548 verdes
.venv-model/bin/python3.14 -m pytest -q   # 178 verdes
pnpm replay-2022 --dataset tests/fixtures/replay-2022/snapshots.json \
                 --ground-truth tests/fixtures/replay-2022/ground-truth.json
pnpm list-targets --env production --cargo 1   # esperado 6.110
pnpm tse:watch --once                     # exit 0 = TSE sem mudança, 2 = mudou
```

Solto no repositório e **não é do projeto** (decisão do usuário sobre o destino): `tse_docs/Switchcraft.pdf`,
`tse_docs/painel-exportar.zip` e `tse_docs/painel-exportar/` — é o "Painel IZS Advocacia".
