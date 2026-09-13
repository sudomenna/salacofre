# Prompt de retomada — cole isto numa sessão nova

> Gerado em 2026-09-12. Substitui a versão anterior (estado de 11/09).
> Se hoje **não** for 12/09, ajuste as datas e recalcule os dias até 15/09 e 04/10.

---

Continuando o SalaCofre. Leia primeiro, nesta ordem:

1. `docs/_meta/handoff-2026-09-12.md` — estado atual, comece por aqui
2. `docs/_meta/handoff-2026-09-11-noite.md` — os cinco defeitos silenciosos da
   véspera e as lições; leia as seções **"Lições desta sessão"** e
   **"A prosa que ficou para trás"**
3. `docs/architecture/adrs/0027-conversao-votos-em-cadeiras-deputado-federal.md` —
   o método de cadeiras, com o texto legal vigente e a jurisprudência
4. `docs/specs/017-deputado-federal/spec.md` — a tabela do `## Status` diz o que
   falta
5. `docs/constitution.md` — está em **1.4**
6. `docs/sprints/2026-S07-f6-simulado-hero-1t.md` — sprint ativa, **Fase 8**
7. `docs/testing/tse-simulados.md` — **o Passo 0 é a coisa mais importante do dia 15**

Branch `main`, árvore limpa exceto três arquivos soltos em `tse_docs/` que **não
são do projeto**. **Dois commits ainda não empurrados** (`e896114`, `562a4ab`).

Hoje é **2026-09-12** — ajuste se for outro dia. Simulados do TSE em 15–17/09 e
22–24/09; 1º turno em **04/10**.

Qualquer coisa que toque o banco exige `set -a; . ./.env.local; set +a` antes.

**Baselines**: **1.629 vitest** · **277 pytest** (`.venv-model/bin/python3.14`) ·
typecheck limpo · lint com **5 erros e 5 avisos pré-existentes** (não tente
consertá-los) · nenhuma cross-ref quebrada.
Gate OT-4 **reprovando**: MAE@1h PT 2,3623pp (teto 2) / cobertura 82,5% (piso 90).
Ele bloqueia a **spec 002**, não as 016/017.

---

## Como falar comigo

**Não sou engenheiro.** `CLAUDE.md § 0` é regra: comece pela consequência, não
pelo mecanismo; termo técnico só sem substituto e explicado na mesma frase;
analogia concreta antes de abstração. A regra **não** vale para ADR, commit, spec
nem briefing de subagent — ali a precisão de vocabulário é obrigatória. Quando eu
perguntar algo técnico direto, responda no nível da pergunta.

---

## O que fazer, na ordem

**1. Terminar a spec 017 (Deputado Federal).** O cálculo de cadeiras está pronto
e **validado contra a eleição de 2022: 511 das 513 cadeiras**, com a fase do
quociente partidário exata nas 27 UFs. A régua de desistência de 19/09 **não
será acionada por causa do método**. Falta, nesta ordem:

- **Payload** — não existe nenhum tipo de agremiação, cadeira, legenda ou
  quociente em `lib/edge-config/types.ts`.
  ⚠️ `cadeiras` vai à tela; `vagas_obtidas` **nunca** (ADR-0027, caso 2b) — numa
  UF de 10 vagas a segunda exibiria 11.
- **Ligar o modelo** — hoje `cargo=6` roda em `api/model/project.py` e produz
  **lixo no agregado nacional**: `compute_national` não tem branch por cargo e
  agrega por número de urna, que colide entre UFs. Nenhuma chamada a
  `api/model/cadeiras.py` existe em `_do_project`.
- **Read path do Blob** — `deputadoUfBlobPathname` existe em
  `lib/blob/paths.ts:168-171` e **não tem caller**. Molde:
  `lib/blob/uf-detail.ts::readUfDetail`.
- **Telas** `/deputado-federal` e `/uf/[sigla]/deputado-federal`, e habilitar a
  aba `"dep"` em `components/layout/CargoTabs.tsx` (hoje `disabled: true`, sem
  `href`).

**2. Gates**: `rf-coverage-checker`, `constitution-guard`, `a11y-perf-auditor`,
`spec-syncer`.

**3. Minhas pendências** — `docs/reference/risks.md` § "Tarefas do usuário":
o chamado ao TSE (**prazo venceu em 12/09**) e o `EDGE_CONFIG_TOKEN`, que
destrava **só** a gravação no Global Config.

---

## Não reabra

ADR-0035 (D1 par como unidade de ingestão, D2 soma exata sem rateio, D3 cron por
cargo); as **duas emendas ao ADR-0026** — (a) cron por segmento de rota, não
`?cargos=`; (b) Senador ingerido por **zona**, não UF; o teto de requisições por
cargo (**25** rps para Presidente/Governador/Senador, **5** para Deputado — pior
caso agregado 80, contra o teto de 100 do TSE); as 8 linhas com capital primeiro
no painel de colégios; D21/D22/D23 do ADR-0034 e as quatro exceções
constitucionais; a degradação pré-acordada da 017.

---

## O risco que ainda importa mais que todo o resto

**Não foi verificado que o arquivo do par traz a *fatia* da zona naquele
município, e não a zona inteira.** Se a premissa cair,
`merge_pairs_into_zonas` **multiplica os votos por até 8×** em ~62% das zonas.

Quatro linhas de evidência convergem a favor, nenhuma é prova. **Não teste
sondando URL** — a constituição § 1 proíbe e um 404 malformado bloqueia o IP por
10 minutos. O **Passo 0** do protocolo resolve, e virou um comando:

```bash
pnpm verify-fatia-premise --fixtures tests/fixtures/tse/2026-sim
```

exit 0 = fatia · exit 2 = multiplicação, **pare** · exit 1 = inconclusivo (que
**não** é sinal verde). `check_zona_merge_sanity` (`api/model/zona_merge.py`) é a
rede enquanto isso.

---

## Armadilhas que estas sessões pagaram para aprender

1. **Relatório de subagent é hipótese.** Em 11–12/09, **nove** erraram de formas
   plausíveis — arquivo de teste trocado, cobertura falsa afirmada, um arquivo
   dado como renomeado que existia, contagem de alvos errada. **Confira no disco,
   inclusive o que o handoff afirma.**
2. **Teste que passa não prova nada; teste que reprova, sim.** Seis testes meus
   passavam sem discriminar o que diziam cobrir. **Verifique por mutação**: quebre
   o código de propósito e confirme que o teste cai.
3. **Um teste de referência pode estar medindo com defeito e parecer bom.** O
   golden de cadeiras deu 505/513 até eu achar que os votos de legenda entravam
   como zero — o cargo 6 não está no arquivo `_BR` do TSE, só nos de UF. **98% é
   exatamente a faixa em que isso passa despercebido.**
4. **A prosa fica para trás quando o dado muda.** Quatro frases na tela viraram
   falsas ao mudar a granularidade do Senador — uma delas atribuía ao TSE uma
   limitação que era escolha nossa. Contramedida: asserção **negativa** (o teste
   proíbe a frase errada) e valores derivados da tabela canônica, nunca literais
   na página.
5. **`Map.set` sobre linhas de par** é o modo de falha padrão desde a migration
   0006. Toda leitura por `(uf, cod_zona)` precisa de `SUM(...) GROUP BY`.
6. **Não rode `constitution-guard` em paralelo com agente de implementação** — ele
   faz `git stash` e o working tree some por alguns minutos.
7. **`*/5` dentro de comentário JSDoc fecha o bloco** e o formatador destrói o
   arquivo ao tentar formatar o que sobrou. Escreva cadência de cron em prosa.
8. **Derrube o que subir.** O mock do TSE ficou 1h06 de pé, esquecido.
9. **Podem existir outras sessões do Claude na mesma pasta.** Confira antes.
10. **Sites oficiais bloqueiam automação**: `www.tse.jus.br`, `cdn.tse.jus.br`,
    `ibge.gov.br` e `planalto.gov.br` respondem **403** ou resetam a conexão para
    cliente não-navegador. O navegador embutido às vezes passa onde o `curl`
    falha. Por isso os PDFs do TSE estão versionados em `tse_docs/`.

---

## Disco

**16 GB livres.** Em `build/` (git-ignored) há **8,3 GB** de dataset do TSE.
**Pode apagar**: o golden commitado tem 232 KB e não depende dos CSVs — eles só
servem para regerar a fixture, e `scripts/build-cadeiras-golden.py` diz de onde
baixar de novo (à mão, pelo portal de dados abertos; o CDN recusa automação).

---

## Comandos

```bash
set -a; . ./.env.local; set +a            # obrigatório antes de tudo que toque o banco
pnpm typecheck && pnpm lint && pnpm test  # 1.629 verdes
.venv-model/bin/python3.14 -m pytest -q   # 277 verdes
pnpm list-targets --env production --cargo 6   # 27 (exige TSE_COD_ELEICAO)
pnpm replay-2022 --dataset tests/fixtures/replay-2022/snapshots.json \
                 --ground-truth tests/fixtures/replay-2022/ground-truth.json
pnpm tse:watch --once                     # exit 0 = TSE sem mudança, 2 = mudou
```

**Push** — o `gh` tem duas contas; a ativa é `cneeducacao`, o repositório é
`sudomenna/salacofre`, e a conta errada dá 403:

```bash
gh auth switch --user sudomenna && git push origin main && gh auth switch --user cneeducacao
```
