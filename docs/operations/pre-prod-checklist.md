---
title: Checklist Pré-Produção
description: Itens a confirmar antes do dia D (04/10/2026)
status: stable
source: PRD.md § 23.5
---

# Checklist Pré-Produção

## Conformidade TSE

> **Não existe cadastro.** A Res. TSE 23.751/2026 (arts. 264–269) **não prevê** registro ou aprovação de
> "interessado na divulgação" para 2026 — o item que antes constava aqui ("cadastro aprovado pelo TSE")
> descrevia um requisito **inverificável** e foi removido. Fundamento: [ADR-0020](../architecture/adrs/0020-conformidade-res-23751-2026.md).
> Os itens abaixo são as obrigações que **de fato** existem.

- [ ] **User-Agent com contato definido** — `lib/tse/client.ts:60` hoje é `SalaCofre/1.0 (+https://salacofre.com.br; contato: pendente)`. Substituir `contato: pendente` por URL ou e-mail público verificável. **Nunca** reintroduzir menção a cadastro. Owner: Tiago Menna. Prazo: 15/09 (1ª janela do simulado).
- [ ] **`TSE_MAX_RPS` calibrado no simulado** — o default 30 é estimativa de segurança, não medição. Valor final vem das janelas de 15–17/09 e 22–24/09 (ver [tse-simulados.md](../testing/tse-simulados.md)), com `rateLimited == 0` em ciclo completo.
- [ ] **`TSE_COD_ELEICAO` de produção configurado** — formato `ele2026/<n>`, obtido do `ele-c.json` de produção ou de comunicado oficial. Em 05/09 o `ele-c.json` ainda está em `ele2024`. **Jamais adivinhar** — URL malformada pode bloquear o IP por 10 min.
- [ ] **`pnpm tse:watch` rodando externamente** (cron fora da Vercel, diário) até 04/10 — detecta publicação dos códigos de 2026 e mudança em qualquer dos 9 leiautes.
- [ ] **Decisão de fan-out registrada** — UF/BR só, ou híbrido com zona nas UFs sinalizadas pelo EA14 (o modelo precisa de zona para o swing, RF-011/012). Decisão humana, após medir no simulado.
- [ ] **Rotulagem "não oficial" verificada** em todas as superfícies públicas — footer "Não oficial. Fonte: TSE.", OG images e páginas de UF/governador. Projeção precisa ser inconfundível com o resultado oficial (art. 267 § 4º + constituição § 1).
- [ ] **`snapshots.payload` guardando o EA20 cru** — nenhuma transformação antes da persistência, nenhum `UPDATE` (art. 267 § 4º + constituição § 10).

## Pipeline e modelo

- [ ] Replay de 2022 com MAE <2pp em t=1h
- [ ] Simulado oficial TSE executado com sucesso nas duas janelas (15–17/09 e 22–24/09) — critérios de saída em [tse-simulados.md](../testing/tse-simulados.md)
- [ ] Fixtures reais de 2026 (`tests/fixtures/tse/2026-sim/`) incorporadas aos testes, substituindo suposições derivadas de 2022
- [ ] `EDGE_CONFIG` ativa e validada em produção (segue **comentada** em `.env.local` desde 18/05 por timeout do endpoint — dev usa fixture local)

## Frontend e operação

- [ ] Load test 30k VUs com p95 <200ms
- [ ] Lighthouse a11y >95 em todas as páginas
- [ ] Bug bash completo em desktop + mobile (iOS Safari, Chrome Android)
- [ ] Runbook revisado pela equipe ops
- [ ] Alertas Slack testados — **sempre contra o mock local** (`pnpm tse:mock`), nunca forçando erro contra o CDN do TSE
- [ ] Rolling Release configurado com canary 10% inicial
- [ ] OG images dinâmicas testadas em WhatsApp/X/Threads
- [ ] Página de manutenção testada
- [ ] DNS preparado (salacofre.com.br + .com)
- [ ] Backup do Postgres configurado (Neon snapshot)
- [ ] Plano de comunicação pré-D (post Linkedin/X anunciando)

## Cross-refs

- Cada item aponta para a spec ou NFR responsável (ver matriz [../_meta/traceability.md](../_meta/traceability.md)).
- Conformidade TSE: [ADR-0020](../architecture/adrs/0020-conformidade-res-23751-2026.md) · [runbook](./runbook.md#conformidade-tse-rf-010--spec-001)
- Protocolo dos simulados: [../testing/tse-simulados.md](../testing/tse-simulados.md)
