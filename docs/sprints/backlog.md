---
title: Backlog
description: Chores e ideias não priorizadas pra sprint nenhuma — pegar quando houver folga ou quando virar bloqueio
status: rolling
---

# Backlog

Lista append-only de itens que **vão precisar acontecer** mas ainda não foram alocados a sprint. Mover daqui pra uma sprint quando priorizar.

## Convenções

- Cada item tem `[ ]` (pendente) ou `[~]` (em uma sprint, mas não em `specs_in_flight`).
- Adicione contexto curto e link pra spec/ADR/NFR se aplicável.
- Quando mover para sprint, remova daqui (ou troque por `[→S0N]` se quiser rastrear origem).

## Infra & DX

- [ ] Provisão de domínio `salacofre.com.br` e `.com` (DNS na Vercel)
- [ ] SSL automático via Vercel (default, só confirmar)
- [ ] Setup GitHub repo + branch protection (main exige PR + check verde)
- [ ] CI workflow básico (typecheck + lint + unit em PR)
- [ ] CI gate de bundle (`ANALYZE=true pnpm build` falha se RNF-007a > 150KB)
- [ ] CI gate de Lighthouse (a11y >95) e axe-core (zero críticos)
- [ ] Dev container ou devbox setup (opcional, ajuda onboarding)

## Identidade / Branding

- [ ] Definição de cores finais nos tokens — confirmar PT=vermelho, PL=azul (já em [tokens.md](../design-system/tokens.md))
- [ ] Favicon + ícones (16, 32, 180px)
- [ ] OG image estática de fallback (`public/og-static.png`)
- [ ] Texto institucional curto pra footer ("SalaCofre por <quem>")

## Dados externos

- [ ] Download de shapefile IBGE Municipios 2022 (data-pipeline)
- [ ] Download de shapefile TSE de zonas eleitorais 2024 (mais recente disponível antes do TSE 2026)
- [ ] Carga inicial de `historical_results` 2018 1T+2T (RF-007 — Should)
- [ ] Carga inicial de `historical_results` 2022 1T+2T (RF-006 — Must)
- [ ] Validar mapeamento `municipios.cod_municipio_tse ↔ cod_ibge` (RF-008)

## Conformidade

- [x] ~~Acompanhar publicação da resolução TSE 2026~~ — **publicada**: Res. TSE 23.751/2026,
  arts. 264–269. Diff técnico campo-a-campo já feito em
  [tse-2026-leiautes.md](../reference/tse-2026-leiautes.md). Ver [regulatory.md](../reference/regulatory.md).
- [x] ~~Cadastro como interessado na divulgação (RF-010)~~ — **não existe cadastro** no pleito 2026.
  O acesso ao CDN de divulgação é aberto, sujeito a limites técnicos (100 req/s por IP → bloqueio
  de 10 min). RF-010 reescrito em torno dos arts. 264–269.
- [ ] Advogado revisar a Res. TSE 23.751/2026 arts. 264–269 (constituição § 1) — em especial
  267 §4º (vedado alterar o conteúdo dos dados). **Pedir também o texto integral da resolução**:
  a fonte que temos é um slide oficial do TSE, não a publicação em Diário, e nele o art. 265 tem
  apenas §1º (liberação do resultado presidencial às 17h). A obrigação de tratar válidos /
  anulados / sub judice está confirmada apenas como requisito de **schema** do EA20
  (`v.vvc = v.vv + v.van + v.vansj`) — ver [ADR-0020](../architecture/adrs/0020-conformidade-res-23751-2026.md).
  Não citar "art. 265 §2º": esse parágrafo não foi confirmado em nenhuma fonte.
- [ ] Monitorar mudança de leiaute até o dia D — não há freeze; `pnpm tse:watch --once` diário
  a partir de agendador externo (ver [S08 — Enxergar](./2026-S08-f7-enxergar.md))

## Observabilidade

- [ ] Definir formato exato dos correlation IDs nos logs estruturados (RNF-032)
- [ ] Setup do canal `#salacofre-ops` no Slack (ou alternativa)
- [ ] Webhook de alerta com fallback secundário (atualmente só Slack — ver risco em [risks.md](../reference/risks.md))

## DX dos subagents

- [ ] Considerar criar subagent `sprint-planner` quando o projeto tiver 3+ sprints fechadas (hoje overkill)
- [ ] Hook pre-commit que dispara `constitution-guard` automaticamente

## Ideias / Could (não priorizadas)

- [ ] RF-053 — URL com timestamp pra snapshot histórico (Could no PRD)
- [ ] Modo escuro
- [ ] Export CSV da tabela de UFs
- [ ] Notificação web (push) quando UF é "chamada"
- [ ] Compartilhamento de visualização específica via deep link

## Pós-projeto (D2 +30 dias)

- [ ] Análise comparativa: nossa projeção vs apuração final (relatório público pra construir credibilidade — OP-4)
- [ ] Open-source de partes não-sensíveis (engine de templates? hover-store?)
- [ ] Post-mortem completo
- [ ] Arquivamento ou continuidade pra 2028
