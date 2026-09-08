---
id: ADR-0017
title: Todos os candidatos do 1T visíveis em 3 camadas fixas, sem collapsible
status: accepted
date: 2026-05-17
amended_by: ADR-0029 # formato de linha das Camadas 2/3; regra "sempre no DOM" reafirmada
---

# ADR-0017 — Todos os candidatos do 1T visíveis em 3 camadas fixas, sem collapsible

## Status

Aceito (parcialmente superado por [ADR-0018](0018-termometros-hero-1t.md) no modo `multi-1t`).

> **Nota 2026-09-05**: não há precedente de supersessão parcial anterior neste repositório — ADRs até aqui eram supersedidos por inteiro ou permaneciam integralmente aceitos. Registra-se aqui o critério adotado: quando um ADR novo altera apenas uma fração de uma decisão anterior, o ADR antigo mantém `status: accepted` no frontmatter (a decisão como um todo continua majoritariamente vigente) e a seção `## Status` narra explicitamente qual parte foi substituída e em qual contexto.
>
> Especificamente: a definição de **Camada 1** (hero) deste ADR — `<HeadlineScore />` top-2 — deixa de valer no modo `multi-1t` (1º turno com >2 candidatos), onde o ADR-0018 a substitui por `<ProjectionThermometers />` (seis termômetros: 1º, 2º, 3º colocados, "Outros", brancos/nulos, abstenção). A regra estrutural deste ADR — **todas as camadas sempre presentes no DOM, sem collapsibles** — permanece **integralmente vigente** em ambos os modos, assim como a definição completa da Camada 2 (`<CandidateRanking />`) e da Camada 3 (`<MinorCandidatesList />`, agora também consumida pelo ADR-0018 como "Composição de Outros"). Para o modo `binary` (2º turno), este ADR aplica-se **sem nenhuma alteração** — `<HeadlineScore />` continua sendo a Camada 1.

> **Nota 2026-09-08 (ADR-0029).** As linhas de candidato das Camadas 2 e 3 adotam o formato visual do componente `CandidateRow` do kit Atlas Menna (parcial e projeção lado a lado, com delta), em vez do formato comprimido pct+IC anterior. A regra central deste ADR — todas as camadas sempre no DOM, sem collapsible — é reafirmada e usada explicitamente para **rejeitar** o botão "Mostrar todos os N candidatos" presente no componente equivalente do kit (`ResultPanel`), que violaria esta regra se copiado sem revisão.

## Contexto

O NYT Live Forecast esconde candidatos com baixa intenção de voto atrás de um controle "Show all candidates" — clique. Para eleições americanas com dois grandes partidos e eventual terceiro candidato irrelevante, essa escolha é justificável: o universo narrativo tem 2 candidatos e o terceiro é ruído.

No 1T presidencial brasileiro de 2026, candidatos com 3–5% de intenção de voto têm relevância política real. Em 2022, Ciro (PDT, 3%) e Tebet (PSDB, 4,2%) capturavam faixas do eleitorado que afetavam a narrativa da disputa e a análise de transferência de votos para o 2T. Escondê-los atrás de interação implica que não merecem atenção, o que é um viés editorial.

Adicionalmente, colapsáveis aumentam a fricção de acesso à informação para usuários de leitores de tela e dispositivos de entrada por voz (constituição § 4 — acessibilidade). Um `<details>` ou botão de toggle quebra a narrativa linear que leitores de tela percorrem.

A restrição real é viewport: em 375px com 11 candidatos, uma lista vertical ingênua empurra conteúdo relevante para scroll profundo. O problema é de density, não de visibilidade.

## Decisão

Estrutura de 3 camadas visuais, todas **sempre presentes no DOM** (sem `display:none`, sem `hidden`, sem `<details>`):

**Camada 1 — hero scoreboard** (top-2 do momento): componente `<HeadlineScore />` existente, dimensionamento grande, exibe pct apurado + IC + probabilidade. Ocupa a faixa superior da tela.

**Camada 2 — ranking compacto** (rank 3 a 6): componente `<CandidateRanking />`, linhas de altura média com paleta `colorForRank()` (ADR-0013). Exibe nome, pct, IC em formato comprimido. Omitida se apenas 2 candidatos existirem (contexto 2T).

**Camada 3 — outros** (rank 7+ ou pct apurado < 1%): componente `<MinorCandidatesList />`, lista horizontal compacta em desktop ("Tebet 4.2% · Ciro 3.1% · ...") e lista vertical compacta em mobile (375px). Fonte menor, sem IC exibido individualmente — apenas pct.

Em **2T binário**, apenas a Camada 1 está presente. As Camadas 2 e 3 são renderizadas condicionalmente com base em `candidateCount` do payload, não em interação do usuário.

A densidade mobile é resolvida via tipografia: Camada 3 usa `font-size: 0.75rem`, line-height 1.2, espaçamento mínimo — aprovado pelo gate `a11y-perf-auditor` antes de shipped.

## Consequências

**Positivas**:
- Cobertura editorial completa: nenhum candidato com representatividade eleitoral é ocultado.
- Acessibilidade preservada: estrutura linear sem toggles é percorrível por leitores de tela sem interação adicional (§ 4).
- Consistência de componente: `<MinorCandidatesList />` pode ser reusada nas páginas de UF (spec 004, spec 005).
- Sem estado de UI para sincronizar: camadas são determinísticas dado o payload.

**Negativas**:
- Em viewport 375px com 11 candidatos, a altura total da seção de candidatos pode superar 60vh — usuário precisa scrollar antes de chegar ao mapa ou à agulha. Mitigado por tipografia compacta na Camada 3, mas não eliminado.
- `<MinorCandidatesList />` com candidatos de CI estreito (pct ~1%) pode dar falsa sensação de precisão — disclaimer na Camada 3 "valores estimados, < 1%" é necessário.
- Três componentes distintos para uma mesma seção aumentam superfície de manutenção e risco de inconsistência visual se tokens de cor mudarem.

## Cross-refs

- ADR-0018 (seis termômetros como Camada 1 em `multi-1t` — supera parcialmente este ADR nesse modo específico): [0018-termometros-hero-1t.md](0018-termometros-hero-1t.md)
- ADR-0013 (tokens por rank — paleta usada pelas 3 camadas): [0013-tokens-multi-candidato-por-rank.md](0013-tokens-multi-candidato-por-rank.md)
- ADR-0014 (p_segundo_turno — Camada 1 pode exibir `<TwoRoundIndicator />`): [0014-p-segundo-turno-primeira-classe.md](0014-p-segundo-turno-primeira-classe.md)
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (seção de candidatos, componente `HeadlineScore`)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (componente `CandidateRow` evolui para as 3 camadas)
- Spec afetada: `docs/specs/005-pagina-uf-governador/spec.md` (herda as 3 camadas para corrida de governador)
- Design system: `docs/design-system/components.md` (novos componentes `CandidateRanking`, `MinorCandidatesList`)
- Constituição § 4 (acessibilidade): [../../constitution.md](../../constitution.md)
- NFR: `docs/nfr/accessibility.md` (WCAG AA para todas as camadas, incluindo `<MinorCandidatesList />`)
- Gate: `a11y-perf-auditor` obrigatório antes de marcar specs 003/004 como shipped com estas camadas
