---
id: 2026-S08
title: Sprint 08 — Estabilização + D-1
status: planned
start: 2026-09-25
end: 2026-10-03
phase: F7
goal: Levar o sistema ao estado deployable para o 1º turno — checklist pré-prod 100% verde, load test aprovado, alertas e página de manutenção no ar, sem feature nova.
specs_in_flight: [009-compartilhamento-meta, 010-operacao-monitoramento, 013-pagina-manutencao]
specs_deferred:
  - 012-dashboard-status (ver "Spec diferida" — decisão do usuário pendente)
specs_planned_next: []
plano: ../_meta/plano-s07-2026-09-05.md
---

# Sprint 08 — Estabilização + D-1

> **Sprint re-baselinada em 05/09/2026** (decisão D9 do plano). A janela anterior
> (31/08 → 06/09) venceu e deixava um buraco de quase um mês até o dia D. A nova janela
> 25/09 → 03/10 encosta o fim da sprint na véspera do 1º turno.

## Objetivo único

Levar o sistema ao estado **deployable** para o dia D. **Não entra feature nova** — só as
specs de pré-produção herdadas da S07 antiga, bug fix, ajuste de UX e fechamento do
checklist pré-prod.

## Calendário

| Data | Evento |
|---|---|
| **25/09** | início — o simulado 2 acabou em 24/09, os dados reais já estão medidos |
| **03/10** | fim da sprint. **O TSE insere os parâmetros oficiais no data center neste dia.** |
| **04/10 17h** | **D1 — 1º turno** ([_D1-04out2026.md](./_D1-04out2026.md)) |

## Specs in-flight

São a Fase 7 do plano. Nenhuma delas é feature de produto nova: são o encanamento de
pré-produção que já estava especificado e ficou parado na S07 antiga.

- [ ] **009-compartilhamento-meta** (`draft`) — OG dinâmica, share buttons, sitemap, footer canônico.
- [ ] **010-operacao-monitoramento** (`draft`) — alertas, cron toggle, rolling release.
- [ ] **013-pagina-manutencao** (`ready`) — `/manutencao` como fallback; `<TurnoTransitionBanner />`,
      `<MaintenancePageMessage />`, flag `maintenance:mode` no Edge Config.
      RFs 058/058.1/058.2 já em `traceability.md` sem código (carry-over da S06).

### Spec diferida

- **012-dashboard-status** (`/_status`, T-07) — **não cabe na janela** e não consta da Fase 7 do
  plano. Com 9 dias corridos para 3 specs + load test + checklist pré-prod, o dashboard operacional
  é o item que sai. Na noite do 1º turno a operação passa a depender dos logs da Vercel + alertas
  Slack da spec 010.
  ⚠️ **Decisão do usuário pendente**: `/_status` tem valor sobretudo *durante* o D1 — empurrá-la
  para depois do 1º turno esvazia boa parte do seu propósito. As alternativas são (a) aceitar a
  diferição, (b) encaixar uma versão mínima (read-only, sem os botões "Pausar Cron"/"Forçar refresh")
  como stretch da S08, ou (c) trocar 009 por 012 na S08.

## Foco da sprint

- **Checklist pré-produção** ([pre-prod-checklist.md](../operations/pre-prod-checklist.md)) — 100% checado:

  - [ ] Replay 2022 com MAE <2pp em t=1h (já **PASS**: 0,998pp — reconfirmar sem regressão)
  - [ ] Load test 30k VUs com p95 <200ms ([load.md](../testing/load.md))
  - [ ] Simulados oficiais TSE executados com sucesso (S07 — 15–17/09 e 22–24/09)
  - [ ] Lighthouse a11y >95 em todas as páginas (⚠️ `rm -rf .next` antes)
  - [ ] Bug bash completo em desktop + mobile
  - [ ] Runbook revisado
  - [ ] Alertas Slack testados (forçar falsos positivos)
  - [ ] Rolling Release configurado com canary 10% inicial
  - [ ] OG images dinâmicas testadas em WhatsApp/X/Threads
  - [ ] Página de manutenção testada (forçar via flag)
  - [ ] DNS preparado (`salacofre.com.br` + `.com` apontando pro Vercel)
  - [ ] Backup Postgres configurado
  - [ ] Plano de comunicação pré-D

- **Env de produção**:
  - [ ] `TSE_COD_ELEICAO` real — só existe quando o TSE publicar; `ele-c.json` de produção ainda
        está em `ele2024`. **Rodar `pnpm tse:watch --once` diariamente**, agora a partir de um
        agendador externo (não depender de execução manual).
  - [ ] `TSE_BASE_URL` de volta para `https://resultados.tse.jus.br/oficial`
  - [ ] `INGEST_WINDOW=17-04` (a janela diurna era só do simulado)
  - [ ] `TSE_MAX_RPS`, `INGEST_CONCURRENCY` e `maxDuration` nos valores calibrados no simulado
  - [ ] Decisão de orçamento de ciclo aplicada (EA15 gating vs. lock anti-overlap)
  - [ ] User-Agent com o texto de contato definitivo — **sem declarar cadastro** (não existe cadastro
        no pleito 2026)

- **Bug bash exaustivo**:
  - Desktop: Chrome, Firefox, Safari, Edge — última versão.
  - Mobile: iOS Safari (último iPhone), Chrome Android (último Pixel/Samsung).
  - Slow 3G simulado.
  - `prefers-reduced-motion` ON.
  - VoiceOver + NVDA — passada manual.
  - Cobrir explicitamente o hero 1T entregue na S07: legibilidade da faixa de incerteza a 375px,
    estados "aguardando projeção", `data-trilha` nas 4 rotas.

- **Runbook D-1**:
  - [ ] Ensaio operacional: simular incidente "TSE down >5min" e responder via runbook
  - [ ] Ensaio: bloqueio de IP por 10 min durante a apuração — qual é a resposta?
  - [ ] Documentar processo de hotfix no dia D (quem aprova, como deploy emergencial)
  - [ ] Congelar `main` — último commit pelo menos 24h antes do dia D

## Definition of Done

- ✅ Specs 009, 010 e 013 com `status: shipped` (4 gates cada)
- ✅ Checklist pré-prod 100% verde
- ✅ Env de produção configurada, incluindo `TSE_COD_ELEICAO` real
- ✅ Load test 30k VUs aprovado (p95 <200ms, error rate <0.1%)
- ✅ Zero bug crítico aberto; zero bug `HIGH` sem mitigação aceita
- ✅ Hotfix process documentado e ensaiado
- ✅ Último commit em `main` ≥24h antes do dia D

## Não-objetivos (regra de ferro)

❌ **Não entra feature nova nesta sprint.** Qualquer "podemos só adicionar..." vai pro backlog
pra pós-2T. Specs 014 (boca de urna) e 015 (drill-down município) seguem diferidas para pós-D1;
spec 008 (brushing & linking) idem.

## Riscos da sprint

- **Bug crítico descoberto tarde** — a janela é de 9 dias corridos e termina na véspera do 1º
  turno. Um bug encontrado em 02/10 pode não ter conserto seguro.
- **`TSE_COD_ELEICAO` real só aparece em 03/10** — o TSE insere os parâmetros oficiais no data
  center no último dia da sprint. Mitigação: a env é um valor único, validado por regex
  (`/^ele\d{4}\/\d+$/`); trocar não exige redeploy de código, e o `tse:watch` avisa assim que
  o `ele-c.json` mudar.
- **Mudança de leiaute entre o simulado 2 e o dia D** — não há freeze. Mitigação: envelope
  `.passthrough()`, `f` como string livre, `tse:watch` diário.
- **Load test pode revelar gargalo** — se Edge Config ou a função estourar, escalar na Vercel ou
  redimensionar o payload (meta: nacional <75 KB).
- **Carry-over da S07** — se o simulado 1 (15–17/09) for perdido por indisponibilidade do TSE,
  a calibração inteira desliza para 22–24/09 e a S08 começa sem números medidos.

## Replanejamentos mid-sprint

- **2026-09-05 — re-baseline (decisão D9).** Janela movida de 31/08 → 06/09 para 25/09 → 03/10;
  título de "Estabilização final" para "Estabilização + D-1"; conteúdo alinhado à Fase 7 do plano.
  Recebeu as specs 009, 010 e 013 vindas da S07 antiga; a 012 ficou diferida. Removidas as
  referências a "cadastro TSE aprovado" (não existe cadastro no pleito 2026) e ao risco
  "resolução TSE 2026 publicada agora" (a Res. 23.751/2026 já está publicada e o diff técnico
  já foi feito — ver [`tse-2026-leiautes.md`](../reference/tse-2026-leiautes.md)).

## Retrospective (preencher ao fechar)

- O que funcionou:
- O que melhorar:
- Carry-over pra dia D / S09:

## Cross-refs

- Plano aprovado: [../_meta/plano-s07-2026-09-05.md](../_meta/plano-s07-2026-09-05.md)
- Sprint anterior: [2026-S07-f6-simulado-hero-1t.md](./2026-S07-f6-simulado-hero-1t.md)
- Próximo marco: [_D1-04out2026.md](./_D1-04out2026.md)
- Checklist pré-prod: [../operations/pre-prod-checklist.md](../operations/pre-prod-checklist.md)
- Runbook: [../operations/runbook.md](../operations/runbook.md)
