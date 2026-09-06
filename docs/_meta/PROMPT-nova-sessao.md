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

1. docs/_meta/handoff-2026-09-05-fase3b.md   (estado atual — comece por aqui)
2. docs/_meta/plano-modelo-regra-de-tres-2026-09-05.md  (plano aprovado; Fases 0–4 feitas, Fase 5 é o que falta)
3. docs/sprints/2026-S07-f6-simulado-hero-1t.md  (sprint ativa, com o que já foi ticado)

Estamos na branch s07/simulado-ready-hero-1t, 12 commits, já publicada em
origin. Árvore limpa. Hoje é 2026-09-05 (ajuste se for outro dia).
Simulados oficiais do TSE em 15-17/09 e 22-24/09. 1º turno em 04/10.

Gates: 520 vitest (1 skipped), 138 pytest, typecheck limpo, lint com 5
warnings pré-existentes. Rodar testes exige: set -a; . ./.env.local; set +a

CONTEXTO EM UMA FRASE: na sessão anterior a projeção dos candidatos deixou de
ser "swing vs. 2022" e passou a ser regra de três por zona — cada zona
extrapola do que já apurou (k = te/esi), soma zona → UF → Brasil. O 2022 saiu
do cálculo e ficou só como comparação na tela. Isso foi pedido pelo usuário,
está no ADR-0021, e versionou a constituição para 1.2.

O que falta, em ordem de prioridade:

A) FASE 5 do plano do modelo. O item que destrava os outros é REGENERAR O
   REPLAY (scripts/build-replay-fixtures.ts) com envelope EA20 real (vap, e,
   v, s), ordem de apuração enviesada e apuração parcial dentro da zona —
   hoje `pnpm replay-2022` roda mas devolve MAE@1h vazio, e o gate OT-4 está
   suspenso. Atenção: o "OT-4 PASS 0,998pp" dos handoffs antigos era
   tautológico (o dataset era construído do próprio 2022), então espere um
   MAE maior quando regenerar — isso é o gate ficando honesto.
   Depois: compute_swing_descritivo (swing_vs_2022 hoje sai None de
   propósito), BaseToggle + ?base=comparecimento, /sobre-o-modelo e spec 011
   (ainda descrevem swing, e a constituição § 8 obriga a corrigir), spec 002
   em EARS, brancos_nulos no mesmo idx, e um assert de percentil para RF-015.

B) DECISÕES QUE SÓ O USUÁRIO TOMA — pergunte cedo, duas travam coisas:
   1. Texto de contato do User-Agent (lib/tse/client.ts:60, hoje
      "contato: pendente") — bloqueia o simulado de 15/09.
   2. Exceção do /governador ao ADR-0018 (app/governador/page.tsx:203) —
      bloqueia promover a spec 006. Vira ADR ou reverte.
   3. Perguntar ao TSE se resposta 304 consome cota de requisições.
   4. Spec 012 (/_status) ficou fora da S08.

C) MONITORAR O TSE diariamente: pnpm tse:watch --once. Ele avisa em
   maiúsculas quando surgir eleição geral 2026 no ele-c.json. Se nada sair
   até 12/09, abrir chamado em 30308800.tse.jus.br com a descrição começando
   em "Resultados - Divulgação".

REGRAS CRÍTICAS:
- Nunca sondar URL adivinhada contra resultados.tse.jus.br ou
  resultados-sim.tse.jus.br. Um 404 malformado pode bloquear nosso IP por 10
  minutos. Use scripts/tse-mock-server.ts para qualquer teste de ingestão.
- Não mudar o contrato de `estimates` (share fracionário pareado) — votos
  absolutos nos arrays quebram p_fecha_1t em silêncio.
- Não mexer em --color-cand-*, colorForRank, bandForRank (ADR-0013), nem no
  layout binary do 2º turno.
- O rótulo da base é "votáveis", nunca "válidos".
- rm -rf .next antes de qualquer gate visual.

DUAS COISAS QUE PARECEM BUG E NÃO SÃO: swing_vs_2022 sai None de propósito
(0.0 afirmaria que nenhuma UF mudou desde 2022); e --color-pt-band /
--color-pl-band seguem invertidos em globals.css:22-23, deliberadamente, já
sem consumidor.

Comece por A, delegando conforme o CLAUDE.md.
```

---

## Por que o prompt é assim

- **Aponta um documento, não vinte.** O handoff da Fase 3b encadeia o resto na
  ordem certa; a sessão nova não precisa adivinhar por onde começar.
- **Diz o contexto em uma frase antes de pedir qualquer coisa.** Sem isso, a
  primeira ação de um agente novo diante de `api/model/` seria tentar entender
  por que não há mais swing.
- **Avisa das armadilhas que custam tempo**: o OT-4 tautológico faria a sessão
  nova achar que quebrou o modelo; `swing_vs_2022: None` e os tokens invertidos
  parecem bug e seriam "consertados" de volta.
- **Separa o que é decisão humana** do que é trabalho — duas delas travam
  entregas e precisam ser perguntadas cedo, não descobertas no fim.
