---
title: Checklist Pré-Produção
description: Itens a confirmar antes do dia D (04/10/2026)
status: stable
source: PRD.md § 23.5
---

# Checklist Pré-Produção

- [ ] Cadastro como interessado na divulgação aprovado pelo TSE
- [ ] Replay de 2022 com MAE <2pp em t=1h
- [ ] Load test 30k VUs com p95 <200ms
- [ ] Simulado oficial TSE executado com sucesso
- [ ] Lighthouse a11y >95 em todas as páginas
- [ ] Bug bash completo em desktop + mobile (iOS Safari, Chrome Android)
- [ ] Runbook revisado pela equipe ops
- [ ] Alertas Slack testados (forçar falsos positivos)
- [ ] Rolling Release configurado com canary 10% inicial
- [ ] OG images dinâmicas testadas em WhatsApp/X/Threads
- [ ] Página de manutenção testada
- [ ] DNS preparado (atlasmenna.com.br + .com)
- [ ] Backup do Postgres configurado (Neon snapshot)
- [ ] Plano de comunicação pré-D (post Linkedin/X anunciando)

## Cross-refs

- Cada item aponta para a spec ou NFR responsável (ver matriz [../_meta/traceability.md](../_meta/traceability.md)).
