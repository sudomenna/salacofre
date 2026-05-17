# AtlasMenna — PRD Pré-Build

> **🗄️ ARQUIVADO — Snapshot v0.1 (2026-05-17)**
>
> Este PRD foi picotado em specs Spec-Driven Development em [`docs/specs/`](./specs/), [`docs/architecture/`](./architecture/), [`docs/nfr/`](./nfr/), [`docs/design-system/`](./design-system/), [`docs/mapas/`](./mapas/), [`docs/testing/`](./testing/), [`docs/operations/`](./operations/), [`docs/reference/`](./reference/) e [`docs/_meta/`](./_meta/).
>
> **Não edite este arquivo.** Edições de escopo vão diretamente nas specs (frontmatter + EARS) ou nos documentos canônicos respectivos (NFR, ADR, design-system).
>
> Comece em [README.md](./README.md) · Princípios em [constitution.md](./constitution.md) · Matriz de rastreabilidade em [_meta/traceability.md](./_meta/traceability.md) · Índice machine-readable em [_meta/index.json](./_meta/index.json).

---

> **Produto**: AtlasMenna — Apuração eleitoral em tempo real com projeção estatística
> **Versão**: 0.1 (Pré-Build)
> **Data**: 2026-05-17
> **Owner**: Tiago Menna (menna@outsiders.digital)
> **Alvo de produção**: Eleição Geral 2026 (1º turno em 04/10/2026, 2º turno em 25/10/2026)
> **Inspiração de referência**: NYT "Live Presidential Forecast" — adaptada ao contexto brasileiro

---

## 1. Sumário Executivo

AtlasMenna é uma plataforma web pública para acompanhar a apuração das eleições brasileiras de 2026 (Presidente + 27 Governadores) com **projeção estatística em tempo real**, **mapas coordenados** (brushing & linking), e **transparência metodológica** total.

Diferencial central: enquanto Globo, UOL e TSE mostram o **parcial atual**, AtlasMenna mostra o **resultado final projetado** com intervalo de confiança, baseado em comparação zona-a-zona com 2022 — o equivalente brasileiro do "election needle" do NYT, mas tecnicamente mais simples e jornalisticamente mais defensável porque o Brasil tem dados melhores.

O produto deve suportar 20.000+ acessos simultâneos no pico da noite eleitoral, com latência percebida abaixo de 100ms globalmente, sustentado por arquitetura "estado quente na borda" (Vercel Edge Config) + invalidação por tag.

---

## 2. Contexto e Problema

### 2.1 Problema

No Brasil de 2026, o eleitor que quer acompanhar a apuração com profundidade enfrenta uma fragmentação irritante:

1. **TSE Divulga** mostra números brutos sem narrativa nem projeção
2. **TV** mostra projeção mas não permite explorar drill-downs
3. **Portais (G1, UOL, Folha)** competem entre si com layouts confusos e contagem manual de tempos de apuração
4. **Twitter/X** vira fonte primária de gente que faz "regra de três no Excel" sem rigor
5. **Ninguém** mostra **probabilidade de vitória** com intervalo de confiança, comparação visual com 2022, ou mapa coordenado de drill-down

### 2.2 Oportunidade

O TSE expõe **dados públicos extraordinários** em near-real-time via CDN:
- Granularidade até seção eleitoral
- Histórico completo de 2018, 2022, 2024
- Atualizações a cada poucos segundos
- Sem rate limit prático para "interessados na divulgação" cadastrados (Resolução 23.736/2024)

A infraestrutura brasileira é **mais favorável** que a americana para construir um needle: tudo eletrônico, sem voto antecipado, sem voto por correio, totalização centralizada. O NYT precisa modelar viés temporal por estado — nós não.

### 2.3 Visão de Produto

> "A página que todo brasileiro vai abrir às 17h01 do dia da eleição."

Uma narrativa visual única que combina: **projeção** (onde vamos parar) + **apuração** (onde estamos agora) + **comparação** (como isso se compara a 2022) — em uma interface coordenada onde hover em qualquer entidade conecta automaticamente todas as visualizações da mesma entidade.

---

## 3. Objetivos e Métricas de Sucesso

### 3.1 Objetivos de Produto

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| OP-1 | Ser fonte primária de apuração para o eleitor engajado | Usuários únicos no 1º turno | 500k+ |
| OP-2 | Maximizar engajamento por sessão | Tempo médio na sessão | >8min |
| OP-3 | Reter audiência entre 1º e 2º turno | Taxa de retorno | >60% |
| OP-4 | Construir credibilidade de marca | Citações em mídia jornalística | 10+ |

### 3.2 Objetivos Técnicos

| ID | Objetivo | Métrica | Meta |
|---|---|---|---|
| OT-1 | Suportar pico de tráfego | Acessos simultâneos sustentados | 20.000+ |
| OT-2 | Latência percebida baixa | LCP p95 global | <2.5s |
| OT-3 | Fidelidade temporal aos dados | Defasagem TSE → tela do usuário | <30s |
| OT-4 | Acurácia da projeção | Erro absoluto da projeção em t=1h | <2pp |
| OT-5 | Disponibilidade na noite D | Uptime entre 17h e 03h | 99,9% |

---

## 4. Personas e Casos de Uso

### 4.1 Personas

**P1 — Eleitor Engajado (alvo primário, ~60% do tráfego)**
- 25–55 anos, votou consciente, acompanha política
- Quer mais profundidade que TV mas não é especialista
- Multi-screen: TV ligada + laptop/celular
- Comportamento: deixa a aba aberta por 1–3 horas, recarrega frequentemente

**P2 — Jornalista (alvo secundário, ~5% do tráfego mas alto valor de alcance)**
- Repórter de portal/TV usando o produto como fonte
- Quer screenshots compartilháveis, drill-down rápido, dados defensáveis
- Comportamento: alta densidade de navegação por UFs, foco em swing vs 2022

**P3 — Analista Político / Cientista de Dados (~3% do tráfego, alto LTV)**
- Acadêmico, consultor, marketing político
- Quer drill-down até zona eleitoral, exportar dados, ver modelo
- Comportamento: passa horas, navega por dezenas de UFs

**P4 — Curioso Ocasional (~32% do tráfego)**
- Acessa via link compartilhado em WhatsApp
- Quer saber só "quem está ganhando" em 5 segundos
- Comportamento: olha a home, sai

### 4.2 Casos de Uso

| ID | Caso de Uso | Persona | Frequência |
|---|---|---|---|
| UC-01 | Visualizar projeção nacional presidencial | P1, P4 | Sempre |
| UC-02 | Ver UFs decisivas com status rápido | P1, P4 | Alta |
| UC-03 | Drill-down em UF específica | P1, P2, P3 | Alta |
| UC-04 | Comparar resultado atual com 2022 | P1, P2, P3 | Média |
| UC-05 | Acompanhar 27 governadores em paralelo | P1, P2 | Média |
| UC-06 | Ver mapa de swing por município | P2, P3 | Média |
| UC-07 | Entender como o modelo funciona | P2, P3 | Baixa mas crítica para credibilidade |
| UC-08 | Compartilhar snapshot atual em redes | P1, P2 | Alta |
| UC-09 | Drill-down de município (capitais) | P3 | Baixa |
| UC-10 | Acompanhar % apurado por UF | P1 | Alta |
| UC-11 | Ver série temporal da projeção | P2, P3 | Média |
| UC-12 | Ver o que está "movendo" o modelo agora | P2, P3 | Baixa |
| UC-13 | Acompanhar paralelamente em segunda tela | P1 | Alta |
| UC-14 | Recarregar página/aba aberta por horas | P1 | Constante |

---

## 5. Requisitos Funcionais (RF)

Prioridade: **M**ust / **S**hould / **C**ould

### 5.1 Ingestão e dados

| ID | Descrição | Prioridade |
|---|---|---|
| RF-001 | Sistema deve consumir feed de arquivos EA20 do TSE via CDN pública | M |
| RF-002 | Polling automático a cada 15s durante janela de apuração (17h–04h) | M |
| RF-003 | Suportar uso de ETag para evitar redownload de arquivos inalterados | M |
| RF-004 | Persistir cada snapshot recebido como evento append-only | M |
| RF-005 | Permitir replay completo da apuração para validação | M |
| RF-006 | Armazenar referência histórica de 2022 (1T e 2T) em granularidade de zona | M |
| RF-007 | Armazenar referência histórica de 2018 em granularidade de zona | S |
| RF-008 | Carregar mapeamento zona ↔ município ↔ UF do IBGE | M |
| RF-009 | Capturar quantitativo de eleitores aptos por zona/seção do TSE | M |
| RF-010 | Sistema deve estar cadastrado como "interessado na divulgação" conforme Res. TSE 23.736/2024 | M |

### 5.2 Modelo estatístico

| ID | Descrição | Prioridade |
|---|---|---|
| RF-011 | Calcular swing zona-a-zona vs 2022 a cada novo snapshot | M |
| RF-012 | Agregar swing para UF via média ponderada por eleitores aptos | M |
| RF-013 | Projetar resultado da UF como `resultado_2022 + swing_UF` | M |
| RF-014 | Projetar resultado nacional como soma das projeções por UF | M |
| RF-015 | Calcular intervalo de confiança via bootstrap (1000 resamples) | M |
| RF-016 | Calcular probabilidade de vitória (P(>50%)) por candidato | M |
| RF-017 | Tratar UFs com 0% apurado mantendo projeção igual a 2022 | M |
| RF-018 | Tratar UFs com <5% apurado com penalização de confiança | S |
| RF-019 | Recalcular projeção a cada novo snapshot ingerido | M |
| RF-020 | Persistir cada cálculo de projeção com timestamp | M |

### 5.3 Visualização — Home Nacional

| ID | Descrição | Prioridade |
|---|---|---|
| RF-021 | Exibir agulha hero com probabilidade de vitória | M |
| RF-022 | Exibir votos absolutos projetados por candidato | M |
| RF-023 | Exibir percentual projetado por candidato com intervalo de confiança | M |
| RF-024 | Listar UFs decisivas (top 6 por contribuição ao swing) | M |
| RF-025 | Exibir tabela completa das 27 UFs com dot-plot inline | M |
| RF-026 | Indicar timestamp de última atualização | M |
| RF-027 | Atualização do payload sem reload da página | M |
| RF-028 | Indicador visual de "ao vivo" pulsante | S |
| RF-029 | Tabs para alternar entre Presidente e Governador | M |
| RF-030 | Switch para alternar entre 1º e 2º turno | M (no 2T) |
| RF-030.1 | Mapa coroplético do Brasil em destaque (hero) na home, com UFs coloridas pelo líder projetado | M |
| RF-030.2 | Toggles do mapa nacional: "Por vencedor" / "Margem" / "Swing vs 2022" / "% apurado" | M |
| RF-030.3 | Hover/tap em UF do mapa nacional abre tooltip com votos, % e contribuição; click navega para `/uf/[sigla]` | M |
| RF-030.4 | Hachura/pattern em UFs que viraram (flip) vs 2022 | S |
| RF-030.5 | Placar headline grande (scoreboard) com totais projetados dos 2 candidatos líderes e barra com marca dos 50%+1 (gatilho de 2º turno) | M |
| RF-030.6 | Tabela "Resultados por estado" agrupada por margem: Lula confortável / Lula apertado / Em disputa / Bolsonaro apertado / Bolsonaro confortável | M |

### 5.4 Visualização — Página de UF

| ID | Descrição | Prioridade |
|---|---|---|
| RF-031 | Breadcrumb para voltar ao nacional | M |
| RF-032 | Winner banner colorido quando P(vitória) > 95% | M |
| RF-033 | Tabela de candidatos com avatar, partido, votos, % e barra | M |
| RF-034 | Mapa do estado em granularidade de município (choropleth) | M |
| RF-035 | Mapa "Votos reportados" com bubbles proporcionais | M |
| RF-036 | Mapa "Estimativa do que falta" com choropleth | M |
| RF-037 | Tabela de municípios com paginação/virtualização | M |
| RF-038 | Mapa de swing vs 2022 com setas/indicadores | S |
| RF-039 | Agulha estadual + estimated margin | M |
| RF-040 | Gráfico "Margem ao longo do tempo" | S |
| RF-041 | Gráfico "Probabilidade de vitória ao longo do tempo" | S |
| RF-042 | Gráfico "Turnout cumulativo" | S |
| RF-043 | Bloco "O que está movendo o forecast agora" | M |
| RF-044 | Análise textual gerada por templates estáticos | M |

### 5.5 Interatividade

| ID | Descrição | Prioridade |
|---|---|---|
| RF-045 | Hover/tap em qualquer mapa destaca a entidade em todas as visualizações coordenadas | M |
| RF-046 | Hover em linha de tabela destaca a entidade nos mapas | M |
| RF-047 | Click em UF/município navega para drill-down | M |
| RF-048 | Tooltip flutuante com breakdown do candidato no item hovered | M |
| RF-049 | Mobile: tap-to-select substitui hover, fixando o destaque | M |
| RF-050 | Tooltip no mobile vira bottom-sheet | M |

### 5.6 Compartilhamento e metadados

| ID | Descrição | Prioridade |
|---|---|---|
| RF-051 | Gerar OG image dinâmica com snapshot atual da home | S |
| RF-052 | Botões de compartilhamento (X/Twitter, WhatsApp, Threads) | S |
| RF-053 | URL com timestamp permite recuperar snapshot histórico | C |
| RF-054 | Página "Sobre o Modelo" com metodologia completa | M |
| RF-055 | Footer com fontes (TSE, IBGE) e disclaimer de não-oficialidade | M |

### 5.7 Operação

| ID | Descrição | Prioridade |
|---|---|---|
| RF-056 | Dashboard interno de saúde do pipeline (cache hit, lag, erros) | M |
| RF-057 | Alertas Slack/email se lag de ingestão > 60s | M |
| RF-058 | Modo "manutenção" com mensagem amigável se TSE indisponível | M |
| RF-059 | Rolling release para deploy do dia D com rollback rápido | M |
| RF-060 | Cron pode ser habilitado/desabilitado via env var | M |

---

## 6. Requisitos Não-Funcionais (RNF)

### 6.1 Performance

| ID | Descrição | Meta |
|---|---|---|
| RNF-001 | Acessos simultâneos sustentados | 20.000+ |
| RNF-002 | LCP (Largest Contentful Paint) p95 global | <2.5s |
| RNF-003 | INP (Interaction to Next Paint) p95 | <200ms |
| RNF-004 | Latência do endpoint `/api/projection` p95 | <100ms |
| RNF-005 | Cache hit ratio na CDN no pico | >99% |
| RNF-006 | Defasagem TSE → tela do usuário | <30s |
| RNF-007 | Bundle JS inicial | <150KB gzipped |
| RNF-008 | Tempo de renderização do mapa inicial | <1.5s |

### 6.2 Disponibilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-009 | Uptime na janela de eleição (17h–04h dia D) | 99,9% |
| RNF-010 | Tempo máximo de degradação aceitável | <30s |
| RNF-011 | Recuperação automática após falha do TSE | Sim |
| RNF-012 | Graceful degradation (último valor conhecido) | Sim |

### 6.3 Escalabilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-013 | Stack deve escalar horizontalmente sem intervenção | Auto-scale Vercel |
| RNF-014 | Não pode haver gargalo em banco de dados no read path | DB fora do read path |
| RNF-015 | Custos devem ser previsíveis e dimensionáveis | Modelo Pay-as-you-go |

### 6.4 Segurança

| ID | Descrição | Meta |
|---|---|---|
| RNF-016 | Endpoint `/api/ingest` não acessível publicamente | Protegido por header secret + Vercel Cron-only |
| RNF-017 | Rate limit no `/api/projection` por IP | 60 req/min |
| RNF-018 | Proteção contra bots scrapeando o feed | Vercel BotID |
| RNF-019 | Sem armazenamento de dados pessoais | LGPD-compliant by design |
| RNF-020 | TLS 1.3 obrigatório, HSTS habilitado | Padrão Vercel |
| RNF-021 | Secrets em Vercel Env Vars com escopo de produção | Sim |

### 6.5 Acessibilidade (WCAG 2.1 AA)

| ID | Descrição | Meta |
|---|---|---|
| RNF-022 | Contraste mínimo de texto | 4.5:1 |
| RNF-023 | Todos os gráficos com fallback de tabela para screen readers | Sim |
| RNF-024 | Navegação completa por teclado | Sim |
| RNF-025 | Mapas com `aria-label` descrevendo o que mostram + lista textual paralela | Sim |
| RNF-026 | Animações respeitam `prefers-reduced-motion` | Sim |

### 6.6 SEO e meta

| ID | Descrição | Meta |
|---|---|---|
| RNF-027 | Cada UF tem URL canônica `/uf/[sigla]` | Sim |
| RNF-028 | OG tags dinâmicas por página | Sim |
| RNF-029 | Sitemap.xml e robots.txt | Sim |
| RNF-030 | Lighthouse SEO score | >95 |

### 6.7 Observabilidade

| ID | Descrição | Meta |
|---|---|---|
| RNF-031 | Vercel Analytics para tráfego e Core Web Vitals | Sim |
| RNF-032 | Logs estruturados de ingest, modelo, erros | Sim |
| RNF-033 | Métricas custom: lag TSE, cache-hit, projection latency | Sim |
| RNF-034 | Alertas em canal Slack para anomalias | Sim |

---

## 7. Mapa de Telas

### 7.1 Inventário de Telas

| ID | Rota | Nome | Persona | Prioridade |
|---|---|---|---|---|
| T-01 | `/` | Home Nacional Presidencial | Todas | M |
| T-02 | `/governador` | Grid Nacional Governadores | P1, P2, P3 | M |
| T-03 | `/uf/[sigla]` | Página de UF — Presidencial | Todas | M |
| T-04 | `/uf/[sigla]/governador` | Página de UF — Governador | P1, P2, P3 | M |
| T-05 | `/uf/[sigla]/municipio/[ibge]` | Drill-down Município | P3 | S |
| T-06 | `/sobre-o-modelo` | Metodologia | P2, P3 | M |
| T-07 | `/_status` (interno) | Dashboard operacional | Time | M |
| T-08 | `/manutencao` | Página de fallback | Sistema | M |

### 7.2 T-01 — Home Nacional Presidencial

**Rota**: `/`
**Objetivo**: Em 5 segundos, comunicar quem está vencendo a presidência. Em 30 segundos, dar profundidade suficiente para o curioso engajado.

**Wireframe (desktop)**:

```
┌──────────────────────────────────────────────────────────────────┐
│ AtlasMenna     ● AO VIVO   atualizado 17:23:42      [Pres][Gov] │
├──────────────────────────────────────────────────────────────────┤
│   Apuração Presidencial 2026: Lula à frente                      │
│   Projeção em tempo real com base em apuração real do TSE e     │
│   comparação com 2022. Como funciona ›                           │
│                                                                  │
│   ┌──────────────────────────┐ ┌──────────────────────────────┐ │
│   │  53,2%                   │ │                      46,8%   │ │
│   │  Lula (PT)               │ │           Bolsonaro (PL)     │ │
│   │  ████████████████░░░░░░░░│░│░░░░░░░░░░░░░░░░░██████████   │ │
│   │  79.812.408 votos        │ │ 70.140.992 votos             │ │
│   └──────────────────────────┘ └──────────────────────────────┘ │
│                ▲ 50%+1 (gatilho de 2º turno)                     │
│                                                                  │
│   [Por vencedor] [Margem] [Swing vs 2022] [% apurado]            │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │                                                          │  │
│   │              ┌───┐                                       │  │
│   │       ┌──────┤AM ├──────┐  ┌──┐                          │  │
│   │   ┌───┤  AC  └───┘  PA  ├──┤MA│  ┌──┐                   │  │
│   │   │RR ├──────┬──────────┤  └──┘  │CE│  ┌──┐  ┌──┐       │  │
│   │   └───┘  RO  │   MT     ├─┐ ╲╲╲ ┌┴──┴┐ │RN│  │PB│       │  │
│   │       └─────┴──────┬───┘ │ TO  │PI ╲╲╲│ └──┘  └──┘       │  │
│   │              │  GO  │  MG ╲╲╲╲╲ │  BA ╲╲╲ ┌──┐           │  │
│   │              ├──────┤ ╲╲╲╲╲╲╲╲╲ └─────┘   │PE│           │  │
│   │              │  MS  │  SP ╲╲╲╲╲╲╲╲ ES                    │  │
│   │              ├──────┤ ╲╲╲╲╲╲╲╲ RJ                        │  │
│   │              │  PR  │ SC ╲╲╲╲                            │  │
│   │              └──────┴─────┘ RS                           │  │
│   │                                                          │  │
│   │  ▓ Lula vence  ░ Bolsonaro vence  ╲╲ Virou vs 2022      │  │
│   │  [tooltip on hover: UF, % líder, votos, contrib. swing] │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────┐    ┌─────────────────────────────┐   │
│   │      AGULHA          │    │ Apurado: 23,4% das urnas    │   │
│   │   ╱── prob 78% ─╲   │    │ UFs apuradas: 14/27         │   │
│   │       ▼              │    │ Última atualização: 17:23:42│   │
│   │      LULA            │    └─────────────────────────────┘   │
│   └──────────────────────┘                                       │
│                                                                  │
│   UFs decisivas (top contribuição ao swing)                      │
│   ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐                     │
│   │ MG │ │ SP │ │ RJ │ │ RS │ │ BA │ │ PR │                     │
│   │14% │ │31% │ │8%  │ │22% │ │5%  │ │18% │                     │
│   │Lula│ │Bols│ │tos │ │Lula│ │Lula│ │Bols│                     │
│   └────┘ └────┘ └────┘ └────┘ └────┘ └────┘                     │
│                                                                  │
│   Resultados por estado (agrupado por margem)                    │
│   Lula confortável    | Lula apertado | Em disputa | Bolsonaro  │
│   ┌─────────────────┐ ┌──────────────┐ ┌─────────┐ apertado |    │
│   │ BA Lula +24 ███ │ │ MG Lula +3   │ │ RJ ±1   │ Bolsonaro    │
│   │ PE Lula +18 ███ │ │ PR Lula +2   │ │ RS ±2   │ confortável  │
│   │ CE Lula +22 ███ │ │ ES Lula +4   │ │ SC ±0,5 │ ...          │
│   │ ...             │ │ ...          │ │         │              │
│   └─────────────────┘ └──────────────┘ └─────────┘              │
│                                                                  │
│   [Insight textual gerado por template]                          │
│                                                                  │
│   O que está movendo o forecast                                  │
│   Modelo:  ████ 12%                                              │
│   Apuração: ████████████████████ 88%                            │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Componentes**: `<HeadlineScore />`, `<NationalChoroplethMap />`, `<MapViewToggle />`, `<NationalNeedle />`, `<ApuracaoMeta />`, `<DecisiveUFsGrid />`, `<StateGroupedTable />`, `<InsightCard />`, `<ForecastTransparency />`

**Brushing & linking ativo**: hover em UF do mapa nacional destaca a linha correspondente na tabela agrupada e no grid de UFs decisivas; o inverso também vale.

**Mobile (375px)**: stack vertical. Agulha no topo. Estimativas em accordion. UFs decisivas vira carrossel swipeable. Tabela de UFs vira lista virtualizada com cards.

**Estados**:
- **Loading inicial**: skeleton da agulha + barras dos candidatos com shimmer
- **Pré-eleição (sábado < 17h domingo)**: mostra cronograma "Apuração começa em Xh"; agulha estática em "Aguardando dados"
- **Dados zerados (17h–17h05)**: agulha em tossup, mensagem "Primeiras urnas chegando"
- **Apuração ativa**: estado normal
- **Apuração concluída (>99%)**: banner "Resultado final" + lock no winner
- **Erro de dados (>60s sem update)**: banner amarelo "Reconectando ao TSE", continua mostrando último valor

### 7.3 T-02 — Grid Nacional Governadores

**Rota**: `/governador`
**Objetivo**: Mostrar status de todas as 27 corridas estaduais em uma única tela.

**Wireframe (desktop)**:

```
┌──────────────────────────────────────────────────────────────────┐
│ Governadores 2026                              [Pres] [Gov]      │
│ 14 chamados, 13 ainda em disputa                                 │
├──────────────────────────────────────────────────────────────────┤
│ Filtros: [Todas] [Em disputa] [Chamadas] [Apuradas]              │
│                                                                  │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                  │
│ │ SP          │ │ MG          │ │ RJ          │                  │
│ │ ╱─agulha─╲ │ │ ╱─agulha─╲ │ │ ╱─agulha─╲ │                  │
│ │ Tarcísio 52│ │ Zema     61│ │ Castro   48│                  │
│ │ Boulos   46│ │ Pacheco  37│ │ Freixo   40│                  │
│ │ ✓ CHAMADA  │ │ ✓ CHAMADA  │ │ Em disputa │                  │
│ └─────────────┘ └─────────────┘ └─────────────┘                  │
│ ... (24 cards mais)                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Componentes**: `<GovernorCard />` x 27, filtros, `<GovernorFilterBar />`

### 7.4 T-03 — Página de UF (Presidencial)

**Rota**: `/uf/[sigla]`
**Objetivo**: Espelhar a profundidade da página estadual do NYT, adaptada ao contexto brasileiro.

**Wireframe (desktop)**:

```
┌──────────────────────────────────────────────────────────────────┐
│ ‹ Voltar ao nacional                                             │
│ São Paulo — Apuração Presidencial 2026                           │
├──────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────┐ ┌───────────────────────────┐   │
│ │ [VENCEDOR ✓]                 │ │                            │   │
│ │ Lula vence em São Paulo     │ │     [MAPA DE MUNICÍPIOS]   │   │
│ │ Chamada por AP/Reuters       │ │                            │   │
│ │                              │ │     com choropleth         │   │
│ │ Candidato  Partido  Votos %  │ │     coordenado             │   │
│ │ ▌Lula      PT       8.2M 54.1│ │                            │   │
│ │ ▌Bols      PL       7.0M 45.9│ │                            │   │
│ │ Total: 15.2M reportados      │ │                            │   │
│ └──────────────────────────────┘ └───────────────────────────┘   │
│                                                                  │
│ Insight: "Lula supera 2022 em SP por 2,1pp; ganho expressivo... │
│                                                                  │
│ Mapeando os resultados e o que ainda falta                       │
│ ┌──────────────────────┐  ┌──────────────────────┐               │
│ │  Votos REPORTADOS    │  │  ESTIMATIVA do que   │               │
│ │  (bubbles)           │  │  falta (choropleth)  │               │
│ └──────────────────────┘  └──────────────────────┘               │
│                                                                  │
│ Tabela de municípios (645 itens, paginada/virtualizada)          │
│ Município   Margem   % apurado   Votos                           │
│ São Paulo   Lula+8   100%        4.2M    [highlighted on hover]  │
│ Campinas    Bols+3   100%        680k                            │
│ ...                                                              │
│                                                                  │
│ Como os votos se comparam com 2022                               │
│ [Mapa de swing — choropleth + setas]                             │
│                                                                  │
│ Forecast ao vivo de SP                                           │
│ ╱─agulha─╲   Margem estimada: Lula +8.2pp (± 1.1)                │
│                                                                  │
│ Margem ao longo do tempo    Probabilidade ao longo do tempo      │
│ [line chart]                 [line chart]                        │
│                                                                  │
│ Turnout reportado    O que está movendo o forecast               │
│ [area chart]         [horizontal bars]                           │
└──────────────────────────────────────────────────────────────────┘
```

**Componentes**: `<WinnerBanner />`, `<CandidateTable />`, `<StateChoroplethMap />`, `<InsightCard />`, `<UFMapDuo />`, `<MunicipioTable />`, `<SwingArrowMap />`, `<StateNeedle />`, `<TimeSeriesChart />` x 3, `<ForecastTransparency />`

**Brushing & linking ativo**: hover em qualquer mapa, qualquer linha de tabela, ou qualquer ponto de gráfico destaca o município em todas as outras visualizações simultaneamente.

### 7.5 T-04 — Página de UF (Governador)

**Rota**: `/uf/[sigla]/governador`
Estrutura idêntica a T-03, mas para a corrida de Governador daquela UF. Mesmos componentes, dados de candidatos diferentes.

### 7.6 T-05 — Drill-down de Município

**Rota**: `/uf/[sigla]/municipio/[ibge]`
**Objetivo**: Para capitais e cidades grandes, mostrar zoom em zonas eleitorais.

Estrutura simplificada:
- Tabela de candidatos
- Mapa de zonas eleitorais
- Tabela de zonas com % apurado
- Comparação com 2022 no município

### 7.7 T-06 — Sobre o Modelo

**Rota**: `/sobre-o-modelo`
**Objetivo**: Credibilidade. Página estática (MDX) explicando:
- O que é o modelo
- Como funciona o swing zona-a-zona
- Como é calculado o intervalo de confiança
- Como interpretar a agulha
- Limitações conhecidas
- Quem somos
- Fontes de dados (TSE, IBGE)
- Disclaimer: não somos oficiais; consulte o TSE para resultado final

### 7.8 T-07 — Dashboard Operacional (interno)

**Rota**: `/_status` (protegido por auth básica)
- Lag de ingestão (tempo desde último snapshot do TSE)
- Cache hit ratio (últimos 5 min)
- Taxa de erro nos endpoints
- Throughput de invalidações de Edge Config
- Quantidade de zonas processadas / restantes
- Botão "Pausar Cron" e "Forçar refresh"

### 7.9 T-08 — Página de Manutenção

**Rota**: `/manutencao`
Servida quando todos os endpoints estiverem indisponíveis (último recurso). Mensagem amigável + link para resultados.tse.jus.br.

---

## 8. Fluxos de Usuário

### 8.1 Fluxo Principal: "Quem está ganhando?"

```
[Usuário acessa /] →
  [Vê agulha + projeção nacional] →
  [Decide se quer profundidade] →
    SIM → [Scroll para UFs decisivas] →
            [Click em SP] →
              [Vê /uf/sp] →
                [Hover em município] →
                  [Vê todas as visualizações destacarem] →
                    [Decide se quer mais] →
                      SIM → [Click no município] → [/uf/sp/municipio/3550308]
                      NÃO → [Volta para nacional]
    NÃO → [Sai (sessão de 30s, principal P4)]
```

### 8.2 Fluxo Secundário: "Acompanhar governador do meu estado"

```
[Usuário acessa /] →
  [Click em tab "Governador"] →
    [Vê /governador, grid das 27] →
      [Click em "MG"] →
        [Vê /uf/mg/governador] →
          [Acompanha com aba aberta]
```

### 8.3 Fluxo de Atualização Live

```
Background loop (todos os clientes simultaneamente):
  [SWR poll /api/projection a cada 5s] →
    [Recebe payload (cacheado pela CDN, hit em 99%)] →
      [Diff com último estado] →
        [Atualiza apenas componentes afetados (selectors finos)] →
          [Anima transições com Framer Motion]
```

---

## 9. Arquitetura Técnica Detalhada

### 9.1 Diagrama Lógico

```
┌──────────────────────────────────────────────────────────────────┐
│                        TSE — CDN Pública                          │
│           resultados.tse.jus.br/oficial/...                       │
└────────────────────────┬─────────────────────────────────────────┘
                         │ ETag-aware GET a cada 15s
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                     INGESTÃO (Vercel)                             │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│ │ Vercel Cron  │→ │ /api/ingest  │→ │ /api/model/project.py│    │
│ │   */15 sec   │  │ Node 24      │  │ Python 3.14 + NumPy  │    │
│ └──────────────┘  │ Fluid Compute│  │ Fluid Compute        │    │
│                   └──────┬───────┘  └──────────┬───────────┘    │
└──────────────────────────┼─────────────────────┼──────────────────┘
                           │ snapshot raw         │ projeção calc.
                           ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                     PERSISTÊNCIA                                  │
│ ┌───────────────────┐                  ┌────────────────────────┐│
│ │ Neon Postgres     │                  │ Vercel Edge Config     ││
│ │ (snapshots/audit) │                  │ projection:current     ││
│ │ - Histórico 2022  │                  │ Replicado todos PoPs    ││
│ │ - Append-only     │                  │ Read <15ms global       ││
│ │ - NÃO está no     │                  │ <30KB JSON             ││
│ │   read path do    │                  └──────────┬─────────────┘│
│ │   cliente         │                             │              │
│ └───────────────────┘                             │              │
│                                                   │              │
│ ┌───────────────────┐                             │              │
│ │ Vercel Blob       │                             │              │
│ │ - JSONs EA20 raw  │                             │              │
│ │ - PMTiles (mapa)  │                             │              │
│ │ - OG images       │                             │              │
│ └───────────────────┘                             │              │
└───────────────────────────────────────────────────┼──────────────┘
                                                    │
                                                    ▼
┌──────────────────────────────────────────────────────────────────┐
│                     LEITURA (escala 20k+)                         │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ Vercel CDN (Edge)                                            │ │
│ │ - Cache-Control s-maxage=5, stale-while-revalidate=30        │ │
│ │ - Hit ratio: 99,8% em pico                                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│           ▲                                ▲                     │
│           │ first req                      │ subsequent          │
│           │                                │                     │
│ ┌─────────┴────────┐                                             │
│ │ Next.js          │                                             │
│ │ Server Component │                                             │
│ │ → Edge Config    │                                             │
│ └─────────┬────────┘                                             │
└───────────┼──────────────────────────────────────────────────────┘
            │ SSR HTML + payload inicial
            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       CLIENTE (Browser)                           │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ React 19 + Next.js 16                                       │  │
│ │ - Server Components SSR                                     │  │
│ │ - Client Components hidratam                                │  │
│ │ - SWR poll /api/projection a cada 5s                        │  │
│ │ - Zustand para hover store (brushing & linking)             │  │
│ │ - MapLibre GL + PMTiles para mapas                          │  │
│ │ - Framer Motion para animações                              │  │
│ └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Fluxo de Dados

**Write path (ingest)**:
1. Vercel Cron dispara `/api/ingest` a cada 15s
2. Endpoint lê `comum/config/ele-c.json` (cacheado em memória da função por 60s)
3. Para cada (UF × cargo × zona), faz GET com `If-None-Match` para `resultados.tse.jus.br/.../EA20.json`
4. Se 200, persiste novo snapshot em Postgres (`snapshots`) e em Blob (raw archive)
5. Aciona `/api/model/project` (Python)
6. Python recalcula projeção, persiste em Postgres (`projections`), e **escreve em Edge Config**
7. Edge Config propaga em ~5–10s globalmente

**Read path (cliente)**:
1. Usuário acessa `/`
2. Next.js Server Component lê Edge Config (`projection:current`) — <15ms
3. SSR renderiza HTML com payload inicial embutido
4. Cliente hidrata, inicia polling de `/api/projection`
5. CDN absorve 99,8% — hit serve em <50ms
6. Em miss raro, função lê Edge Config (<15ms) e responde

### 9.3 Componentes da Stack — visão geral

| Camada | Tecnologia | Função |
|---|---|---|
| Cliente | Next.js 16 + React 19 | SSR, SC/CC, App Router |
| Estado cliente | Zustand | Hover store coordenado |
| Polling | SWR | Atualização a cada 5s |
| Mapas | MapLibre GL JS + PMTiles | Renderização vetorial |
| Animações | Framer Motion + D3 | Agulha, transições |
| Tipografia | next/font (Source Serif Pro + Inter) | NYT-like |
| CDN | Vercel Edge Network | 99,8% cache hit |
| Compute (Node) | Vercel Fluid Compute (Node 24) | Ingest, API routes |
| Compute (Python) | Vercel Fluid Compute (Python 3.14) | Modelo estatístico |
| Estado quente | Vercel Edge Config | Projeção atual, <15ms global |
| Storage durável | Neon Postgres (Marketplace) | Snapshots, histórico |
| Object storage | Vercel Blob | PMTiles, JSONs raw, OG images |
| Cron | Vercel Cron | Polling agendado |
| Config | `vercel.ts` (TypeScript) | Substitui `vercel.json` |
| Proteção | Vercel BotID + rate limit custom | Mitigação de abuso |
| Observabilidade | Vercel Analytics + Speed Insights | Tráfego e Core Web Vitals |
| Rollout | Vercel Rolling Releases | Canary 10/50/100% |

### 9.4 Estrutura de Pastas

```
atlasmenna/
├── vercel.ts                              # config TS (crons, rewrites, regions)
├── next.config.ts
├── tailwind.config.ts
├── package.json
├── app/
│   ├── layout.tsx                         # shell global
│   ├── page.tsx                           # / (Home Nacional)
│   ├── globals.css
│   ├── governador/page.tsx
│   ├── uf/[sigla]/page.tsx
│   ├── uf/[sigla]/governador/page.tsx
│   ├── uf/[sigla]/municipio/[ibge]/page.tsx
│   ├── sobre-o-modelo/page.mdx
│   ├── _status/page.tsx                   # interno, auth
│   ├── manutencao/page.tsx
│   ├── opengraph-image.tsx                # OG dinâmica
│   └── api/
│       ├── projection/route.ts            # leitura pública
│       ├── ingest/route.ts                # cron-only
│       └── model/project.py               # Python — modelo
├── components/
│   ├── atoms/
│   │   ├── needle/Needle.tsx
│   │   ├── bars/ConfidenceBar.tsx
│   │   ├── charts/{DotPlotRange,TimeSeriesChart,ProbabilityOverTime,TurnoutAreaChart,ModelComposition}.tsx
│   │   ├── maps/{ChoroplethMap,BubbleMap,SwingArrowMap}.tsx
│   │   ├── tables/CandidateRow.tsx
│   │   └── banners/WinnerBanner.tsx
│   ├── blocks/
│   │   ├── NationalNeedle.tsx
│   │   ├── DecisiveUFsGrid.tsx
│   │   ├── UFForecastTable.tsx
│   │   ├── UFMapDuo.tsx
│   │   ├── MunicipioTable.tsx
│   │   ├── ForecastTransparency.tsx
│   │   └── InsightCard.tsx
│   ├── layout/{Header,Footer,LiveBadge,Tabs}.tsx
│   └── shared/{HoverTooltip,BottomSheet}.tsx
├── lib/
│   ├── tse/{client,ea20-parser,cdn-urls,ea-config}.ts
│   ├── model/{swing,bootstrap,project,types}.ts (+ project.py)
│   ├── edge-config/{reader,writer}.ts
│   ├── db/{schema.sql,queries.ts,migrations/}
│   ├── state/hover-store.ts
│   ├── geo/{municipios.pmtiles,ufs.pmtiles,index.ts}
│   ├── insights/{templates.json,generate.ts}
│   └── utils/{format,colors,a11y}.ts
├── middleware.ts                          # rate limit + BotID
├── data-pipeline/
│   ├── historical-import.ts               # importa TSE 2022
│   ├── eleitorado-import.ts
│   ├── ibge-import.ts                     # municípios shapefile → PMTiles
│   └── README.md
├── scripts/
│   ├── replay-2022.ts
│   ├── load-test.k6.js
│   └── tse-simulator.ts                   # testa pipeline offline
├── tests/
│   ├── unit/{tse,model,insights}/
│   ├── integration/{ingest,projection}/
│   └── e2e/{home,uf,brushing}.spec.ts
└── public/
    ├── og-static.png
    └── favicon.ico
```

---

## 10. Stack Tecnológica

### 10.1 Tabela Detalhada

| Componente | Tecnologia | Versão | Justificativa |
|---|---|---|---|
| Framework | Next.js | 16+ | App Router, Cache Components, SSR rápido, integração nativa Vercel |
| UI library | React | 19+ | Server Components estáveis, transições nativas |
| Runtime principal | Node.js (Fluid Compute) | 24 LTS | Padrão Vercel, single-instance multiplexing |
| Runtime modelo | Python (Fluid Compute) | 3.14 | NumPy/SciPy para bootstrap eficiente |
| Linguagem | TypeScript | 5.6+ | Type safety end-to-end |
| Styling | Tailwind CSS | 4.0+ | Design system rápido, JIT |
| Tipografia | next/font (Source Serif Pro + Inter) | latest | NYT-like via Google Fonts |
| Estado cliente | Zustand | 5+ | Mais leve que Redux, ideal para hover store |
| Fetcher cliente | SWR | 2+ | Polling, dedup, revalidação |
| Mapas | MapLibre GL JS | 5+ | Open-source, sem lock-in Mapbox |
| Mapa tiles | PMTiles | 4+ | Single-file vector tiles, range-requests |
| Tile converter | tippecanoe | latest | shapefile → PMTiles |
| Animações | Framer Motion | 12+ | Spring physics, layout animations |
| Charts | D3 (selecionado) + custom SVG | 7+ | Não usamos Recharts/Visx — controle total |
| DB | Neon Postgres (Marketplace) | 16+ | Serverless, branching, ramp gratuito |
| ORM | Drizzle | latest | Type-safe, mais leve que Prisma |
| Estado quente | Vercel Edge Config | latest | Replicado nos PoPs, <15ms |
| Storage objeto | Vercel Blob | latest | PMTiles, raw archives |
| Cron | Vercel Cron | latest | Trigger do ingest |
| Config | `vercel.ts` (`@vercel/config`) | latest | TS-typed, dynamic |
| MDX | `@next/mdx` | latest | Página `/sobre-o-modelo` |
| Validação | Zod | latest | Schema do TSE, payloads de API |
| Testes unit | Vitest | latest | Mais rápido que Jest |
| Testes e2e | Playwright | latest | Browser real |
| Load test | k6 | latest | 20k VUs simulados |
| Lint/Format | Biome | latest | Substitui ESLint + Prettier (mais rápido) |
| CI/CD | Vercel + GitHub Actions | — | Preview deployments por PR |
| Observabilidade | Vercel Analytics + Speed Insights | latest | Core Web Vitals automáticos |
| Logs | Vercel Logs + structured JSON | — | Filtrable por correlation-id |
| Proteção | Vercel BotID | latest | Bot detection no edge |
| Pacote manager | pnpm | 9+ | Workspaces, deduplicação |

### 10.2 Dependências NPM (principais)

```jsonc
{
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@vercel/edge-config": "^2.0.0",
    "@vercel/blob": "^2.0.0",
    "@vercel/analytics": "^2.0.0",
    "@vercel/speed-insights": "^2.0.0",
    "@vercel/config": "^1.0.0",
    "drizzle-orm": "^0.40.0",
    "@neondatabase/serverless": "^1.0.0",
    "zustand": "^5.0.0",
    "swr": "^2.4.0",
    "maplibre-gl": "^5.0.0",
    "pmtiles": "^4.0.0",
    "framer-motion": "^12.0.0",
    "d3-scale": "^4.0.0",
    "d3-shape": "^3.0.0",
    "d3-array": "^3.2.0",
    "zod": "^4.0.0",
    "@next/mdx": "^16.0.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@biomejs/biome": "^2.0.0",
    "vitest": "^3.0.0",
    "@playwright/test": "^1.50.0",
    "tailwindcss": "^4.0.0"
  }
}
```

---

## 11. Modelo de Dados

### 11.1 Tabelas Postgres (Neon)

```sql
-- Histórico 2018, 2022, 2024
CREATE TABLE historical_results (
  id BIGSERIAL PRIMARY KEY,
  ano SMALLINT NOT NULL,            -- 2018, 2022, 2024
  turno SMALLINT NOT NULL,          -- 1, 2
  cargo SMALLINT NOT NULL,          -- 1 = Presidente, 3 = Governador
  uf CHAR(2) NOT NULL,
  cod_municipio_tse INT,
  cod_zona INT NOT NULL,
  cod_candidato INT NOT NULL,
  nome_candidato TEXT,
  partido VARCHAR(20),
  votos INT NOT NULL,
  pct_validos NUMERIC(8,5),
  pct_total NUMERIC(8,5),
  UNIQUE (ano, turno, cargo, uf, cod_zona, cod_candidato)
);
CREATE INDEX ix_hist_lookup ON historical_results (ano, turno, cargo, uf, cod_zona);

-- Eleitorado por zona (atualizado para 2026)
CREATE TABLE eleitorado (
  ano SMALLINT NOT NULL,
  uf CHAR(2) NOT NULL,
  cod_municipio_tse INT NOT NULL,
  cod_zona INT NOT NULL,
  eleitores_aptos INT NOT NULL,
  comparecimento_pct_historico NUMERIC(5,4),
  PRIMARY KEY (ano, uf, cod_zona)
);

-- Mapeamento geográfico
CREATE TABLE municipios (
  cod_ibge CHAR(7) PRIMARY KEY,
  cod_municipio_tse INT NOT NULL UNIQUE,
  uf CHAR(2) NOT NULL,
  nome TEXT NOT NULL,
  geo_centroid GEOGRAPHY(POINT),
  populacao INT
);
CREATE INDEX ix_municipio_uf ON municipios (uf);

CREATE TABLE zonas (
  cod_zona INT PRIMARY KEY,
  cod_municipio_tse INT NOT NULL,
  uf CHAR(2) NOT NULL,
  nome TEXT,
  FOREIGN KEY (cod_municipio_tse) REFERENCES municipios(cod_municipio_tse)
);
CREATE INDEX ix_zona_uf ON zonas (uf);

-- Snapshots append-only do TSE durante apuração
CREATE TABLE snapshots (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cargo SMALLINT NOT NULL,
  turno SMALLINT NOT NULL,
  uf CHAR(2) NOT NULL,
  cod_zona INT NOT NULL,
  etag TEXT,                        -- ETag do TSE para dedup
  pct_apurado NUMERIC(5,2),
  votos_total INT,
  payload JSONB NOT NULL,           -- EA20 cru
  hash_payload CHAR(64) NOT NULL    -- SHA256 para detecção rápida de mudança
);
CREATE INDEX ix_snap_lookup ON snapshots (cargo, turno, uf, cod_zona, ts DESC);
CREATE INDEX ix_snap_ts ON snapshots (ts DESC);

-- Cálculos de projeção (histórico do modelo)
CREATE TABLE projections (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cargo SMALLINT NOT NULL,
  turno SMALLINT NOT NULL,
  uf CHAR(2),                       -- NULL = nacional
  candidato_id INT NOT NULL,
  votos_projetados BIGINT,
  pct_projetado NUMERIC(8,5),
  pct_projetado_lower NUMERIC(8,5), -- CI95 lower
  pct_projetado_upper NUMERIC(8,5),
  p_vitoria NUMERIC(5,4),
  pct_apurado NUMERIC(5,2)
);
CREATE INDEX ix_proj_lookup ON projections (cargo, turno, uf NULLS FIRST, ts DESC);

-- Operational
CREATE TABLE ingest_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INT,
  files_fetched INT,
  files_changed INT,
  errors INT,
  notes TEXT
);
```

### 11.2 Payload do Edge Config

Chave `projection:current` — JSON único de ~30KB:

```ts
type EdgePayload = {
  ts: string;                       // ISO8601
  cargo: 1 | 3;                     // Presidente ou Governador (1 cargo por payload)
  turno: 1 | 2;
  pct_apurado_total: number;        // 0–100
  ufs_apuradas: number;             // 0–27
  national: {
    candidatos: Array<{
      id: number;
      nome: string;
      partido: string;
      cor: string;
      votos_atuais: number;
      votos_projetados: number;
      pct_atual: number;
      pct_projetado: number;
      pct_projetado_lower: number;
      pct_projetado_upper: number;
      p_vitoria: number;
    }>;
    needle_position: number;        // -1 a 1
    needle_band: 'very_likely_a' | 'likely_a' | 'lean_a' | 'tossup' | 'lean_b' | 'likely_b' | 'very_likely_b';
  };
  por_uf: Array<{
    sigla: string;
    pct_apurado: number;
    lider: number;                  // candidato_id
    margem_atual: number;           // pp
    margem_projetada: number;
    margem_projetada_ci: [number, number];
    chamada: boolean;
    swing_vs_2022: number;          // pp
  }>;
  insights: string[];               // 1-3 frases por template
  composition: {                    // "What's powering the forecast"
    pre_election: number;           // 0–1, soma = 1
    model: number;
    actual_results: number;
  };
};
```

Payload `por_uf` para drill-down (chave `projection:uf:[sigla]`): inclui municípios e zonas. ~5-10KB por UF.

---

## 12. Integração com TSE — Especificação Técnica

### 12.1 Endpoints e Estrutura

**Base URL**: `https://resultados.tse.jus.br/oficial/`

**Configuração da eleição** (carregado 1x na inicialização):
```
GET /oficial/comum/config/ele-c.json
```
Retorna metadados de todos os pleitos. Campos relevantes:
- `pl[].e[].cd` — código da eleição
- `pl[].e[].t` — turno (1 ou 2)
- `pl[].e[].abr[].cd` — sigla UF
- `pl[].e[].abr[].cp[].cd` — código do cargo (1 = Presidente, 3 = Governador)

**Configuração de municípios** (por UF):
```
GET /oficial/comum/config/{uf}/{uf}-p000407-cm.json
```

**Resultado unificado por zona (EA20)** — formato principal:
```
GET /oficial/[cod_eleicao]/dados/[uf]/[uf][cod_municipio]/[uf][cod_municipio]-[zona]-[cargo].json
```

Exemplo concreto:
```
https://resultados.tse.jus.br/oficial/ele2022/544/dados/sp/sp80055/sp80055-c0001-z0001-e000544.json
```

### 12.2 Schema EA20 (parcial relevante)

```ts
type EA20 = {
  dg: string;            // data de geração ddMMyyyy
  hg: string;            // hora HH:mm:ss
  f: 'o';                // ambiente oficial
  cdabr: string;         // UF
  abr: Array<{
    cd: string;          // UF
    cdmu: string;        // município
    cdze: string;        // zona
    s: Array<{           // seções (vazio em EA20 agregado por zona)
      ns: string;
    }>;
    psa: string;         // % seções apuradas
    pst: string;         // % seções totalizadas
    tap: string;         // total apto
    tc: string;          // total comparecimento
    pc: string;          // % comparecimento
    ta: string;          // total abstenção
    pa: string;          // % abstenção
    tvn: string;         // votos nominais
    pvn: string;         // % votos nominais
    tvl: string;         // votos legenda
    tvb: string;         // brancos
    pvb: string;         // %
    tvnu: string;        // nulos
    pvnu: string;        // %
    tvv: string;         // válidos
    cand: Array<{
      seq: string;       // sequencial
      n: string;         // número
      nm: string;        // nome
      nmu: string;       // nome urna
      cc: string;        // cargo
      pn: string;        // partido número
      pnm: string;       // partido nome
      sg: string;        // partido sigla
      st: string;        // situação
      vap: string;       // votos apurados
      pvap: string;      // % de válidos
      e: string;         // eleito
    }>;
  }>;
};
```

### 12.3 Padrão de Polling

```ts
// lib/tse/client.ts
interface FetchOptions {
  url: string;
  etag?: string;
}

async function fetchEA20(opts: FetchOptions): Promise<EA20 | 'NOT_MODIFIED'> {
  const res = await fetch(opts.url, {
    headers: {
      'If-None-Match': opts.etag ?? '',
      'Accept-Encoding': 'gzip',
      'User-Agent': 'AtlasMenna/1.0 (interessado-divulgacao-cadastrado)'
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(5000)
  });

  if (res.status === 304) return 'NOT_MODIFIED';
  if (!res.ok) throw new TSEError(res.status, opts.url);

  const text = await res.text();
  return EA20Schema.parse(JSON.parse(text)); // Zod
}
```

### 12.4 Cadenciamento de Ingestão

| Janela | Cadência | Estratégia |
|---|---|---|
| Sábado (dia anterior) <12h | 1x | Validar "divulgação zero" |
| Sábado >12h, antes do domingo | 1x/hora | Heartbeat |
| Domingo <17h | 1x/min | Aguardar abertura |
| Domingo 17h–04h | A cada 15s | Apuração ativa |
| Após 99% apurado | A cada 5min | Convergência final |
| Pós-eleição | Manual | Reconciliação |

### 12.5 Tratamento de Falhas

| Falha | Mitigação |
|---|---|
| 304 Not Modified | Esperado — pula o arquivo |
| 404 | Zona ainda sem dados — log, retry no próximo ciclo |
| 5xx | Retry com backoff exponencial (3 tentativas, 1s/2s/4s) |
| Timeout >5s | Aborta, retry no próximo ciclo |
| JSON inválido | Log com payload bruto, alerta Slack |
| TSE down >60s | Banner "Reconectando" no frontend, mantém último valor |
| TSE down >5min | Alerta crítico Slack, equipe entra no Discord do TSE |

### 12.6 Conformidade Regulatória

- **Resolução TSE 23.736/2024**: cadastro como "interessado na divulgação" — obrigatório
- **Identificação visual**: footer com "Fonte: TSE — sistema não oficial" em todas as páginas
- **Atribuição correta**: tooltips e legendas indicam fonte
- **LGPD**: nenhum dado pessoal coletado; analytics apenas de tráfego agregado

### 12.7 Volume Estimado

Para Presidencial + 27 Governadores no 1º turno:
- ~3.000 zonas × 28 cargos = **~84.000 arquivos EA20** existem
- Em prática: apenas as zonas que atualizaram em cada ciclo (~5–15% por ciclo)
- Ciclo de 15s = **~10.000 GETs por minuto no pico** (com 304 cache hits, ~1.500 transferências reais)
- Banda total estimada: 50–100GB ao longo da noite

---

## 13. Modelo Estatístico — Especificação

### 13.1 Notação

- `Z` = conjunto de zonas eleitorais (~3.000)
- `Z_t ⊂ Z` = zonas apuradas em t
- `c` = candidato (índice)
- `v_c(z, t)` = votos do candidato c na zona z no tempo t
- `V(z, t)` = votos totais válidos na zona z em t
- `p_c(z, t) = v_c(z, t) / V(z, t)` = pct do candidato c em z em t
- `p_c^{2022}(z)` = pct do candidato c (ou bloco político) em z em 2022
- `n(z)` = eleitores aptos em z

### 13.2 Cálculo de Swing

Para cada zona z ∈ Z_t apurada:
```
swing_c(z) = p_c(z, t) - p_c^{2022}(z)
```

Agregação para UF U:
```
swing_c(U) = Σ(z ∈ Z_t ∩ U) swing_c(z) · n(z)  /  Σ(z ∈ Z_t ∩ U) n(z)
```

### 13.3 Projeção

Por UF:
```
p_c^{proj}(U) = p_c^{2022}(U) + swing_c(U)
votos_c^{proj}(U) = p_c^{proj}(U) · turnout_esperado(U) · n(U)
```

Nacional:
```
votos_c^{proj}(BR) = Σ(U) votos_c^{proj}(U)
pct_c^{proj}(BR) = votos_c^{proj}(BR) / Σ(c') votos_{c'}^{proj}(BR)
```

### 13.4 Intervalo de Confiança via Bootstrap

```python
def bootstrap_uf(zones_apuradas, n_resamples=1000):
    estimates = []
    for _ in range(n_resamples):
        sample = np.random.choice(zones_apuradas, size=len(zones_apuradas), replace=True)
        swing_sample = weighted_swing(sample)
        estimate = result_2022_uf + swing_sample
        estimates.append(estimate)
    return {
        'point': np.mean(estimates),
        'ci_lower': np.percentile(estimates, 2.5),
        'ci_upper': np.percentile(estimates, 97.5),
    }
```

### 13.5 Probabilidade de Vitória

```python
def p_vitoria(estimates_a, estimates_b):
    return np.mean(estimates_a > estimates_b)
```

### 13.6 Posição da Agulha

```
position = clip((p_vitoria_A - 0.5) * 2, -1, +1)

band = {
  if |position| < 0.2  → 'tossup'
  elif |position| < 0.5 → 'lean'
  elif |position| < 0.85 → 'likely'
  else                  → 'very_likely'
}
```

### 13.7 Tratamento de Casos de Borda

| Caso | Tratamento |
|---|---|
| UF com 0 zonas apuradas | Projeção = resultado 2022, CI = ±10pp (penalização forte) |
| UF com <5% apurado | CI inflado em 50% adicional |
| Zona apurada mas sem dado 2022 (raro, mudança administrativa) | Excluída do cálculo de swing |
| Candidato 2026 com bloco político não-mapeável em 2022 | Modelo desabilitado para essa corrida, fallback para parcial atual |

### 13.8 Validação por Replay

Roda script `replay-2022.ts`:
- Carrega todos os snapshots de 2022 do dataset aberto TSE
- Replica cronologicamente
- A cada timestep, computa projeção e compara com resultado final
- Métricas:
  - Erro absoluto médio (MAE) por candidato em t = {15min, 30min, 1h, 2h}
  - Calibração de probabilidade: dos casos onde modelo disse P=80%, em quantos % candidato realmente venceu?

---

## 14. Frontend — Sistema de Design e Componentes

### 14.1 Design Tokens

```css
/* app/globals.css */
:root {
  /* Tipografia */
  --font-serif: 'Source Serif Pro', Georgia, serif;
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* Escala tipográfica */
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  --text-4xl: 48px;

  /* Cores neutras */
  --color-bg: #ffffff;
  --color-bg-muted: #fafafa;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-text-faint: #999999;
  --color-border: #e5e5e5;

  /* Cores partidárias (NYT-like) */
  --color-pt: #2a52be;        /* PT / Lula — azul */
  --color-pl: #d33732;        /* PL / Bolsonaro — vermelho */
  --color-tossup: #d9d9d9;
  --color-pt-band: #c8d4ed;
  --color-pl-band: #f0c9c8;

  /* Status */
  --color-success: #2c8e4a;
  --color-warning: #d97706;
  --color-error: #b91c1c;
  --color-live: #ef4444;

  /* Espaçamento */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-8: 48px;

  /* Layout */
  --max-width: 1280px;
  --column-gap: 24px;
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}

* { font-variant-numeric: tabular-nums; }
body { font-family: var(--font-sans); color: var(--color-text); }
h1, h2, h3 { font-family: var(--font-serif); font-weight: 600; }
```

### 14.2 Sistema de Grid

| Breakpoint | Largura | Layout |
|---|---|---|
| <640px | 1 col, full width 16px padding | Mobile portrait |
| 640–767px | 1 col, 24px padding | Mobile landscape |
| 768–1023px | 2 col, 32px gap | Tablet |
| 1024–1279px | 12 col CSS Grid, gap 24px | Desktop |
| ≥1280px | 12 col, max-width 1280px centralizado | Desktop wide |

### 14.3 Catálogo de Componentes — referência cruzada com RFs

| Componente | Tipo | RFs atendidos | Arquivo |
|---|---|---|---|
| `<Needle />` | atom | RF-021, RF-039 | `components/atoms/needle/Needle.tsx` |
| `<ConfidenceBar />` | atom | RF-023, RF-039 | `components/atoms/bars/ConfidenceBar.tsx` |
| `<DotPlotRange />` | atom | RF-025 | `components/atoms/charts/DotPlotRange.tsx` |
| `<TimeSeriesChart />` | atom | RF-040 | `components/atoms/charts/TimeSeriesChart.tsx` |
| `<ProbabilityOverTime />` | atom | RF-041 | `components/atoms/charts/ProbabilityOverTime.tsx` |
| `<TurnoutAreaChart />` | atom | RF-042 | `components/atoms/charts/TurnoutAreaChart.tsx` |
| `<ChoroplethMap />` | atom | RF-034, RF-036, RF-038 | `components/atoms/maps/ChoroplethMap.tsx` |
| `<BubbleMap />` | atom | RF-035 | `components/atoms/maps/BubbleMap.tsx` |
| `<SwingArrowMap />` | atom | RF-038 | `components/atoms/maps/SwingArrowMap.tsx` |
| `<CandidateRow />` | atom | RF-033 | `components/atoms/tables/CandidateRow.tsx` |
| `<WinnerBanner />` | atom | RF-032 | `components/atoms/banners/WinnerBanner.tsx` |
| `<ModelComposition />` | atom | RF-043 | `components/atoms/charts/ModelComposition.tsx` |
| `<NationalNeedle />` | block | RF-021, RF-022, RF-023 | `components/blocks/NationalNeedle.tsx` |
| `<HeadlineScore />` | block | RF-022, RF-023, RF-030.5 | `components/blocks/HeadlineScore.tsx` |
| `<NationalChoroplethMap />` | block | RF-030.1, RF-030.3, RF-030.4, RF-045 | `components/blocks/NationalChoroplethMap.tsx` |
| `<MapViewToggle />` | atom | RF-030.2 | `components/atoms/controls/MapViewToggle.tsx` |
| `<StateGroupedTable />` | block | RF-030.6, RF-046 | `components/blocks/StateGroupedTable.tsx` |
| `<DecisiveUFsGrid />` | block | RF-024 | `components/blocks/DecisiveUFsGrid.tsx` |
| `<UFForecastTable />` | block | RF-025 | `components/blocks/UFForecastTable.tsx` |
| `<UFMapDuo />` | block | RF-035, RF-036 | `components/blocks/UFMapDuo.tsx` |
| `<MunicipioTable />` | block | RF-037 | `components/blocks/MunicipioTable.tsx` |
| `<ForecastTransparency />` | block | RF-043 | `components/blocks/ForecastTransparency.tsx` |
| `<InsightCard />` | block | RF-044 | `components/blocks/InsightCard.tsx` |
| `<HoverTooltip />` | shared | RF-045, RF-048 | `components/shared/HoverTooltip.tsx` |
| `<BottomSheet />` | shared | RF-049, RF-050 | `components/shared/BottomSheet.tsx` |
| `<LiveBadge />` | layout | RF-026, RF-028 | `components/layout/LiveBadge.tsx` |

### 14.4 Sistema de Templates de Insights

Arquivo: `lib/insights/templates.json`. Função `lib/insights/generate.ts` processa as regras e retorna 1–3 frases.

```json
{
  "rules": [
    {
      "id": "swing_significant",
      "condition": "abs(swing_pp) >= 5",
      "variants": [
        "{candidato} surpreende em {regiao}: +{swing_abs}pp em relação a 2022.",
        "Movimento expressivo em {regiao} — {candidato} {direcao} {swing_abs}pp vs 2022.",
        "Em {regiao}, {candidato} performa {swing_abs}pp {direcao_pt} do esperado pelo histórico."
      ]
    },
    {
      "id": "tight_race",
      "condition": "abs(margem_pp) < 3 && pct_apurado < 50",
      "variants": [
        "Disputa apertada em {regiao}: {lider} lidera por apenas {margem_abs}pp com {pct_apurado}% apurado.",
        "{regiao} pode ser decisiva: distância atual de {margem_abs}pp e ainda {pct_remaining}% por apurar."
      ]
    },
    {
      "id": "called_race",
      "condition": "p_vitoria >= 0.95",
      "variants": [
        "{candidato} consolida vitória em {regiao} com {pct_apurado}% das urnas apuradas.",
        "Em {regiao}, a apuração aponta vitória de {candidato} com margem de {margem_abs}pp."
      ]
    }
  ]
}
```

### 14.5 Estado Global Cliente

```ts
// lib/state/hover-store.ts
import { create } from 'zustand';

type HoveredEntity =
  | { type: 'uf'; sigla: string }
  | { type: 'municipio'; codIbge: string }
  | { type: 'zona'; codTse: string }
  | null;

interface HoverState {
  hovered: HoveredEntity;
  source: 'map' | 'table' | 'chart' | null;
  setHovered: (entity: HoveredEntity, source: HoverState['source']) => void;
  clear: () => void;
}

export const useHoverStore = create<HoverState>((set) => ({
  hovered: null,
  source: null,
  setHovered: (entity, source) => set({ hovered: entity, source }),
  clear: () => set({ hovered: null, source: null }),
}));
```

Selectors finos para evitar re-render em cascata:
```ts
const isHovered = useHoverStore(s =>
  s.hovered?.type === 'municipio' && s.hovered.codIbge === myId
);
```

---

## 15. Mapas — Implementação Detalhada

### 15.1 Pipeline de Dados Geográficos

**Etapa 1 — Aquisição**: shapefile do IBGE (malha municipal 2022) em `BR_Municipios_2022.shp`.

**Etapa 2 — Simplificação**:
```bash
mapshaper BR_Municipios_2022.shp \
  -simplify 5% keep-shapes \
  -filter-fields CD_MUN,NM_MUN,SIGLA_UF \
  -o format=geojson municipios.geojson
```

**Etapa 3 — Conversão PMTiles**:
```bash
tippecanoe -o municipios.pmtiles \
  --layer=municipios \
  --minimum-zoom=3 \
  --maximum-zoom=10 \
  --no-feature-limit \
  --no-tile-size-limit \
  --include=CD_MUN \
  --include=NM_MUN \
  --include=SIGLA_UF \
  municipios.geojson
```

Resultado: arquivo único de ~50MB hospedado no Vercel Blob com URL pública.

**Etapa 4 — UFs e zonas** (mesmo processo):
- `ufs.pmtiles` — ~500KB
- `zonas.pmtiles` — ~30MB (gerado a partir de shapefile do TSE)

### 15.2 Setup MapLibre + PMTiles

```ts
// components/atoms/maps/ChoroplethMap.tsx
'use client';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';

const PMTILES_URL = process.env.NEXT_PUBLIC_PMTILES_BASE; // Vercel Blob URL

export function ChoroplethMap({
  level,            // 'br' | 'uf' | 'municipio'
  bbox,             // viewport inicial
  colorScale,       // (id) => string
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);

    const map = new maplibregl.Map({
      container: ref.current!,
      style: {
        version: 8,
        sources: {
          municipios: {
            type: 'vector',
            url: `pmtiles://${PMTILES_URL}/municipios.pmtiles`
          }
        },
        layers: [
          {
            id: 'municipios-fill',
            type: 'fill',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'fill-color': ['feature-state', 'color'],
              'fill-opacity': 0.85
            }
          },
          {
            id: 'municipios-stroke',
            type: 'line',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'line-color': '#ffffff',
              'line-width': 0.5
            }
          },
          {
            id: 'municipios-stroke-hover',
            type: 'line',
            source: 'municipios',
            'source-layer': 'municipios',
            paint: {
              'line-color': '#000000',
              'line-width': 2
            },
            filter: ['==', 'CD_MUN', '']  // controlado por hover
          }
        ]
      },
      bounds: bbox,
      attributionControl: false
    });

    return () => map.remove();
  }, []);

  // ... coordenar hover via Zustand
}
```

### 15.3 Coloração Dinâmica

Cor aplicada via `feature-state` — não requer re-fetch dos tiles:

```ts
function updateColors(map: maplibregl.Map, projection: EdgePayload) {
  for (const muni of projection.por_municipio) {
    map.setFeatureState(
      { source: 'municipios', sourceLayer: 'municipios', id: muni.cod_ibge },
      { color: colorScale(muni.margem_projetada) }
    );
  }
}
```

Escala de cores (D3):
```ts
import { scaleLinear } from 'd3-scale';

const colorScale = scaleLinear<string>()
  .domain([-30, -10, 0, 10, 30])
  .range(['#0a3580', '#5a82c4', '#d9d9d9', '#cc6660', '#7c1a16'])
  .clamp(true);
```

### 15.4 Brushing & Linking

Hover dispara mudança no `useHoverStore`. Todos os consumidores reagem:

```ts
// Dentro do ChoroplethMap
map.on('mousemove', 'municipios-fill', throttle((e) => {
  const feature = e.features?.[0];
  if (!feature) return;
  useHoverStore.getState().setHovered(
    { type: 'municipio', codIbge: feature.properties.CD_MUN },
    'map'
  );
}, 16));

map.on('mouseleave', 'municipios-fill', () => {
  useHoverStore.getState().clear();
});

// Em outros componentes (tabela, segundo mapa)
const hoveredId = useHoverStore(s =>
  s.hovered?.type === 'municipio' ? s.hovered.codIbge : null
);
useEffect(() => {
  map.setFilter('municipios-stroke-hover', ['==', 'CD_MUN', hoveredId ?? '']);
}, [hoveredId]);
```

### 15.5 Mobile — Tap to Select

```ts
if (isMobile) {
  map.on('click', 'municipios-fill', (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    useHoverStore.getState().setHovered(
      { type: 'municipio', codIbge: feature.properties.CD_MUN },
      'map'
    );
    // Bottom sheet abre automaticamente via consumer
  });
}
```

### 15.6 Performance

- **Tile loading**: lazy via range-requests do PMTiles — só baixa tiles do viewport
- **Atualização de cores**: 5.570 `setFeatureState` calls em <50ms (testado)
- **Re-render React**: zero — o mapa é uma "ilha" controlada por refs

### 15.7 Acessibilidade

- `aria-label="Mapa do Brasil mostrando projeção por município"` no container
- Lista textual paralela com `role="region"` para screen readers
- Atalhos de teclado: setas movem foco entre UFs/municípios

---

## 16. Animações — Especificação

### 16.1 Agulha (`<Needle />`)

```tsx
import { motion, useTransform, useSpring } from 'framer-motion';

export function Needle({ position }: { position: number }) {
  const spring = useSpring(position, {
    stiffness: 60,
    damping: 18,
    mass: 1
  });
  const rotation = useTransform(spring, [-1, 1], [-90, 90]);

  useEffect(() => { spring.set(position); }, [position]);

  return (
    <svg viewBox="0 0 200 100" aria-label={`Agulha indicando ${position}`}>
      {/* fundo: bandas */}
      <BandSemicircle />
      {/* agulha animada */}
      <motion.line
        x1="100" y1="100" x2="100" y2="20"
        stroke="#222" strokeWidth="3"
        style={{ rotate: rotation, originX: '100px', originY: '100px' }}
      />
    </svg>
  );
}
```

**Justificativa do spring**: replicar o comportamento do NYT, que "balança" antes de se acomodar — comunica visualmente a incerteza do modelo.

### 16.2 Transições de Cor no Mapa

```ts
// Smooth transition de cor por município ao atualizar projeção
map.setPaintProperty('municipios-fill', 'fill-color-transition', {
  duration: 600,
  delay: 0
});
```

### 16.3 Números Animados (Contadores)

```tsx
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';

export function AnimatedNumber({ value }: { value: number }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => v.toLocaleString('pt-BR'));

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: 'easeOut' });
    return controls.stop;
  }, [value]);

  return <motion.span>{text}</motion.span>;
}
```

### 16.4 Entrada de Componentes

| Componente | Animação | Duração |
|---|---|---|
| Página | Fade in 0→1 | 200ms |
| Cards de UFs decisivas | Stagger fade-up 50ms cada | 400ms total |
| Linhas de tabela | Sem animação (perf) | — |
| WinnerBanner | Scale 0.95→1 + fade | 400ms |

### 16.5 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

Agulha: snap direto ao valor, sem spring.

---

## 17. APIs Internas

### 17.1 `GET /api/projection`

**Auth**: pública
**Rate limit**: 60 req/min por IP
**Cache**: `Cache-Control: public, s-maxage=5, stale-while-revalidate=30`

**Query params**:
- `cargo` — `presidente` (default) | `governador`
- `turno` — `1` (default) | `2`
- `uf` — opcional, se presente retorna drill-down da UF

**Response 200**:
```json
{ /* EdgePayload schema do §11.2 */ }
```

### 17.2 `POST /api/ingest`

**Auth**: header `x-cron-secret: ${CRON_SECRET}` + Vercel Cron-only
**Rate limit**: N/A

**Response 200**:
```json
{
  "ok": true,
  "files_fetched": 234,
  "files_changed": 17,
  "duration_ms": 4521,
  "lag_ms": 8200
}
```

### 17.3 `POST /api/model/project` (Python)

**Auth**: chamada interna apenas
**Body**:
```json
{ "cargo": 1, "turno": 1, "trigger_ts": "2026-10-04T18:23:15Z" }
```

**Response 200**:
```json
{ "computed": true, "uf_count": 14, "national_p_vitoria_a": 0.78 }
```

---

## 18. Segurança e Compliance

| Tópico | Implementação |
|---|---|
| TLS | Padrão Vercel (TLS 1.3 + HSTS) |
| Headers | CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff |
| Secrets | Vercel Env Vars, escopo `production` |
| Ingest auth | Header `x-cron-secret` + IP allowlist Vercel Cron |
| Rate limit `/api/projection` | 60 req/min por IP via Edge Middleware (cookie bucket) |
| Bot detection | Vercel BotID em `/api/*` |
| LGPD | Nenhum dado pessoal; analytics agregadas e anonimizadas |
| Cookies | Apenas técnico para rate limit, sem tracking de terceiros |
| Disclaimer | Footer em todas as páginas: "Não oficial. Fonte: TSE." |

---

## 19. Observabilidade e Operação

### 19.1 Métricas Custom

| Métrica | Coleta | Alerta se |
|---|---|---|
| `tse.lag_seconds` | Tempo entre `dg+hg` do EA20 e ingestão | >60s |
| `tse.fetch_errors_rate` | Taxa de 4xx/5xx no fetch | >5%/min |
| `model.compute_duration_ms` | Tempo de cálculo da projeção | p95 >2000ms |
| `edge_config.write_duration_ms` | Tempo de propagação | p95 >15s |
| `projection.cache_hit_ratio` | Hit ratio na CDN | <95% |
| `projection.requests_per_sec` | RPS no endpoint | usar para capacidade |

### 19.2 Logs Estruturados

Todos os logs em JSON com `correlation_id`, `cargo`, `turno`, `uf`, `level`, `event`.

### 19.3 Dashboard `/_status`

Painel interno mostrando todas as métricas acima em tempo real (atualiza a cada 5s).

### 19.4 Alertas Slack

Canal `#atlasmenna-ops` com webhooks para anomalias críticas.

### 19.5 Runbook

Documento `RUNBOOK.md` com procedimentos para:
- TSE indisponível
- Modelo retornando NaN
- Cache hit ratio caindo
- Rollback de release

---

## 20. Plano de Testes

### 20.1 Unit Tests (Vitest)

- `lib/tse/ea20-parser.test.ts` — parse com fixtures reais de 2022
- `lib/model/swing.test.ts` — cálculos com cenários determinísticos
- `lib/model/bootstrap.test.ts` — testa convergência com seed fixo
- `lib/insights/generate.test.ts` — verifica que todas as regras disparam
- `lib/edge-config/writer.test.ts` — mock do client Vercel

### 20.2 Integration Tests

- Pipeline ingest → model → Edge Config → API → render (mock TSE)
- Replay de uma hora de dados reais de 2022 ponta-a-ponta

### 20.3 E2E (Playwright)

- `tests/e2e/home.spec.ts` — Carrega home, agulha renderiza, polling funciona
- `tests/e2e/uf.spec.ts` — Drill-down UF, mapas renderizam
- `tests/e2e/brushing.spec.ts` — Hover em mapa destaca tabela e segundo mapa
- `tests/e2e/mobile.spec.ts` — Tap-to-select, bottom sheet

### 20.4 Replay de 2022

Script `scripts/replay-2022.ts`:
- Reproduz cronologicamente todos os snapshots de 2022
- A cada passo, computa projeção
- Gera relatório com MAE em t = {15min, 30min, 1h, 2h, final}
- Aceita se MAE em t=1h < 2pp

### 20.5 Load Test (k6)

```js
// scripts/load-test.k6.js
export const options = {
  stages: [
    { duration: '5m', target: 20000 },
    { duration: '30m', target: 20000 },
    { duration: '2m', target: 0 }
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.001']
  }
};

export default function () {
  http.get('https://atlasmenna.com.br/api/projection');
  sleep(5);
}
```

### 20.6 Acessibilidade

- `axe-core` rodando em CI em cada PR
- Lighthouse score >95 em CI

### 20.7 Simulados do TSE

Participar dos simulados oficiais do TSE (set/2026) — gera dados sintéticos para validar o pipeline ponta-a-ponta com dados realistas.

---

## 21. Cronograma

| Fase | Duração | Período | Entregáveis |
|---|---|---|---|
| F1 — Fundação | 3 sem | Mai/Jun 2026 | Setup Vercel, schema DB, import 2022, PMTiles gerados |
| F2 — Pipeline ingestão | 2 sem | Jun 2026 | TSE client, parser EA20, ingest endpoint, persistência |
| F3 — Modelo | 2 sem | Jun/Jul 2026 | Swing, bootstrap, projection, validação por replay |
| F4 — Frontend MVP | 4 sem | Jul/Ago 2026 | Home + página UF, agulha, mapas, brushing |
| F5 — Frontend completo | 2 sem | Ago 2026 | Governadores, drill-down município, sobre-modelo |
| F6 — Hardening | 2 sem | Set 2026 | Cadastro TSE, load tests, simulados oficiais, segurança |
| F7 — Estabilização | 1 sem | Set/Out 2026 | Bug bash, ajustes finais |
| **D — Dia D** | **04/10/2026** | — | Produção, monitoramento intensivo |
| F8 — Análise pós-1T | 3 sem | Out 2026 | Recalibração modelo para 2T |
| **D2 — 2º turno** | **25/10/2026** | — | Produção |

Total: ~16 semanas de desenvolvimento + janela de eleição.

---

## 22. Riscos e Mitigações

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| TSE muda formato EA20 sem aviso | Alto | Baixa | Participar simulados; validação Zod com fail fast |
| TSE fica indisponível por >5min | Alto | Média | Graceful degradation com último valor; banner amarelo |
| Modelo retorna projeção absurda em t=início | Alto | Média | Penalização forte de CI <5% apurado; guardrails de sanidade |
| Pico de tráfego excede 20k | Médio | Média | Edge Config + CDN escalam automaticamente; load test 30k |
| Bug de renderização em mobile específico | Médio | Média | E2E em Playwright com BrowserStack; bug bash em Set |
| Cadastro TSE atrasado | Crítico | Baixa | Iniciar em Jun 2026 (deadline tipicamente Set) |
| Resolução muda regras de uso | Alto | Baixa | Monitorar TSE; advogado em standby |
| Equipe pequena vs escopo grande | Alto | Alta | Priorizar M sobre S/C; cortar governadores se necessário |
| Atribuição partidária problemática | Médio | Média | Disclaimer explícito; cores neutras se candidatos novos |
| Custo de Vercel acima do orçado | Médio | Baixa | Monitorar consumo semanal; alertas de billing |

---

## 23. Anexos

### 23.1 Fontes de Dados

| Fonte | URL | Uso |
|---|---|---|
| TSE Resultados | https://resultados.tse.jus.br/ | Apuração ao vivo |
| TSE Dados Abertos | https://dadosabertos.tse.jus.br/ | Histórico 2018/2022/2024 |
| TSE Info Técnicas | https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados | Specs EA20 |
| IBGE Malhas | https://www.ibge.gov.br/geociencias/organizacao-do-territorio/malhas-territoriais | Shapefile municípios |
| IBGE Estimativas | https://www.ibge.gov.br/estatisticas/sociais/populacao | População por município |

### 23.2 Regulamentação

- **Resolução TSE 23.736/2024** — Regras para divulgação por terceiros
- **LGPD (Lei 13.709/2018)** — Tratamento de dados (não aplicável diretamente, sem PII)

### 23.3 Glossário

- **EA20** — Formato JSON unificado de resultado por zona eleitoral (TSE)
- **Zona Eleitoral** — Subdivisão administrativa do TSE (~3.000 no Brasil)
- **Bootstrap** — Método estatístico de resampling para estimar incerteza
- **PMTiles** — Formato de tiles vetoriais single-file
- **Edge Config** — Store key-value replicado nos PoPs Vercel
- **Fluid Compute** — Modelo de execução Vercel com multiplexing
- **Brushing & Linking** — Padrão de UX onde vistas múltiplas reagem coordenadamente

### 23.4 Decisões Arquiteturais Registradas

| Decisão | Por quê |
|---|---|
| Edge Config no read path, não Postgres | Broadcast read-heavy: estado quente na borda, zero conexões |
| Polling com CDN cache, não SSE/WebSocket | 20k WebSockets é caro e desnecessário com atualização a cada 15s |
| PMTiles, não GeoJSON | 100× menos banda em 20k usuários |
| MapLibre + PMTiles, não Mapbox | Open-source, sem custo por tile/MAU |
| Templates de insights, não LLM | Determinístico, sem custo, performance previsível |
| Bootstrap, não modelo bayesiano hierárquico | Suficiente, explicável, roda em <1s |
| Granularidade modelo em zona, visualização em município | TSE entrega em zona, mapa lê em município (sweet spot visual) |
| NÃO Convex como banco | WebSocket-based, anti-padrão para broadcast read |
| Vercel BotID, não Cloudflare | Stack 100% Vercel para simplicidade operacional |

### 23.5 Verificação Pré-Produção (checklist)

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

---

**Fim do PRD Pré-Build v0.1.**
