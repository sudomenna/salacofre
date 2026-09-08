---
title: SalaCofre — Constituição do Produto
description: Princípios não-negociáveis que governam toda decisão de produto, design e engenharia
status: stable
version: 1.3
last_updated: 2026-09-07
---

# Constituição do SalaCofre

Estes princípios são **invariantes**. Toda spec, ADR, PR ou decisão de produto precisa respeitá-los. Mudar um princípio exige justificativa explícita registrada em ADR + atualização desta constituição com versionamento (não silenciosamente).

---

## 1. Conformidade regulatória (TSE)

A norma vigente é a **Resolução TSE nº 23.751/2026**, que trata da divulgação de resultados por terceiros no **Título III, Capítulo VI, artigos 264 a 269**. Ela está **publicada**. A Res. 23.736/2024 não rege este pleito e não é mais referência normativa.

- **Não existe cadastro prévio.** A Res. 23.751/2026 não institui inscrição, credenciamento nem homologação de "interessado na divulgação"; o termo é descritivo, não um status administrativo. O SalaCofre opera sem cadastro, e **nenhuma superfície do produto — a começar pelo `User-Agent` enviado ao TSE — pode declarar um cadastro, credenciamento ou autorização que não existe.** Identificação honesta (nome do projeto, URL pública, contato verificável) é obrigatória; afirmação de status inexistente é proibida.
- **O dado oficial é intocável.** O art. 267 §4º veda às entidades que divulgam resultados promover qualquer alteração de conteúdo dos dados distribuídos pela Justiça Eleitoral. Em consequência, o snapshot bruto recebido do TSE é persistido **cru e inalterado**, e nenhuma transformação do produto pode ser gravada sobre o registro do dado oficial.
- **A projeção é conteúdo derivado e precisa ser inconfundível com o oficial.** Projeção estatística, intervalo de confiança e probabilidades não são resultado do TSE; toda superfície onde aparecem deve rotulá-las como não oficiais, de forma que nenhum leitor razoável as confunda com apuração. Esta é uma obrigação regulatória (art. 267 §4º), não apenas editorial.
- **Os limites técnicos do CDN do TSE são invariantes de engenharia, não recomendações.** O TSE documenta máximo de 100 requisições por IP por segundo, com bloqueio de 10 minutos renovável; adverte que requisição malformada (404) também pode gerar bloqueio; e declara que **não é possível listar os arquivos**. Daí decorrem três invariantes: (a) **rate limiter de saída obrigatório**, com teto configurado bem abaixo do limite documentado; (b) **proibição absoluta de sondar URL adivinhada** contra `resultados.tse.jus.br` ou `resultados-sim.tse.jus.br` — toda URL requisitada deve derivar da padronização documentada ou de arquivo de acompanhamento; (c) **schema tolerante a campos desconhecidos** (`.passthrough()`, nunca `.strict()`), porque o TSE não anunciou freeze de leiaute.
- Toda página **deve** exibir, no footer, "Não oficial. Fonte: TSE." e link para `resultados.tse.jus.br`.
- Tooltips e legendas **devem** atribuir corretamente cada dado à sua fonte (TSE, IBGE).
- Qualquer mudança na regulamentação dispara revisão imediata desta constituição — e, por força do preâmbulo, um ADR que a justifique.

> **Mudança 1.0 → 1.1 (2026-09-05).** A versão 1.0 exigia operar "como interessado na divulgação **cadastrado**" e tratava a resolução de 2026 como "a ser publicada", usando a Res. 23.736/2024 como referência. Pesquisa em fonte primária feita em 2026-09-05 derrubou as duas premissas: a norma está publicada (Res. 23.751/2026, arts. 264–269) e **não há cadastro** — o requisito antigo era inverificável, e o `User-Agent` que o declarava era uma afirmação falsa perante o TSE. A 1.1 substitui o cadastro pelas obrigações efetivamente confirmadas (dado cru inalterado, projeção rotulada, limites de consumo do CDN). Justificativa completa em [ADR-0020](./architecture/adrs/0020-conformidade-res-23751-2026.md). Nenhum outro princípio (§§ 2–10) foi alterado.

## 2. Neutralidade política

- Cores partidárias seguem uma **paleta editorial própria do SalaCofre** — uma cor por partido/federação, documentada com hex exato em `docs/design-system/tokens.md` — **nunca** as cores oficiais de partido. Toda cor de partido deve ter **ΔE76 ≥ 10** em relação ao hex oficial documentado do partido (manual de marca ou uso reiterado em material oficial), critério auditável e verificável por qualquer agente ou revisor. A cor de cada partido é **estável durante toda a noite de apuração** e entre as duas noites do pleito (1º e 2º turnos): não muda por rank, por ordem de apuração, por margem ou por qualquer evento da corrida — apenas a **intensidade** (claro↔saturado) pode variar com a margem projetada, nunca a matiz.
- Nomes de candidatos e siglas partidárias aparecem **sempre na mesma ordem** dentro de uma mesma corrida (sem favorecimento por ordem de leitura).
- Insights gerados por templates **não emitem julgamento** ("Lula consolida vitória" é OK; "vitória esmagadora" não é).
- Quando há ambiguidade na atribuição de bloco político 2022→2026, exibir disclaimer explícito.

> **Mudança 1.2 → 1.3 (2026-09-07).** A versão 1.2 (e todas as anteriores) exigiam cor partidária "NYT-like (azul/vermelho)", e o [ADR-0013](./architecture/adrs/0013-tokens-multi-candidato-por-rank.md) foi além do texto ao atribuir cor por **rank de apuração**, não por sigla — uma escolha de implementação que evitava até a associação cor↔partido. Essa leitura deixou de servir quando o produto passou a exibir corridas em que a pergunta editorial é "qual partido", não "quem lidera esta tela": o grid de 27 governadores pinta 27 líderes de partidos diferentes com a mesma cor de rank 1; o Senado 2026 tem **duas** vagas por UF, onde "rank 1" e "rank 2" são os dois eleitos e não líder e perseguidor; e o Deputado Federal é proporcional por legenda, sem leitura visual coerente por candidato individual. A 1.3 substitui a regra por uma **paleta editorial própria por partido/federação**, com o limiar objetivo ΔE76 ≥ 10 contra o hex oficial — o que o § 2 sempre proibiu (a cor oficial do partido) continua proibido, agora com critério mensurável em vez de julgamento subjetivo. O risco assumido está nomeado no ADR: cor fixa por sigla, ano após ano, aproxima-se mais da identidade que o próprio partido cultiva do que uma cor por rank. Justificativa completa em [ADR-0024](./architecture/adrs/0024-paleta-editorial-por-partido.md), que supersede o ADR-0013. Os demais parágrafos do § 2 e todos os outros princípios (§§ 1, 3–10) ficam inalterados.

## 3. Performance percebida

- **LCP p95 global < 2,5s** em todos os dispositivos.
- **INP p95 < 200ms** em todas as interações.
- **Defasagem TSE → tela do usuário < 30s**.
- O **banco de dados não pode** estar no read path do cliente — estado quente vive em Vercel Edge Config.
- **Bundle JS above-the-fold < 150KB gzipped** (excluindo chunks lazy-loaded como o mapa). O mapa (MapLibre + PMTiles) é carregado via `next/dynamic({ ssr: false })` após o first paint — ver [ADR-0010](./architecture/adrs/0010-mapa-dynamic-import.md). Bundle total da home (above-the-fold + lazy) < 500KB gzipped.

## 4. Acessibilidade (WCAG 2.1 AA)

- Contraste mínimo de texto 4.5:1.
- Todo gráfico **deve** ter fallback de tabela para screen readers.
- Navegação completa por teclado.
- Mapas **devem** ter `aria-label` + lista textual paralela.
- Animações **devem** respeitar `prefers-reduced-motion`.

## 5. Sem PII

- Nenhum dado pessoal é coletado, armazenado ou processado.
- Analytics apenas agregadas e anonimizadas (Vercel Analytics).
- Cookies apenas técnicos (rate limit), sem tracking de terceiros.
- LGPD-compliant by design.

## 6. Determinismo do modelo

- Projeção é **explicável**: cada valor pode ser reproduzido a partir do snapshot persistido + código versionado.
- Templates de insights **não usam LLM** — saída determinística, sem custo variável, sem risco de alucinação.
- Toda execução do modelo é persistida com timestamp em `projections` (auditabilidade).

## 7. Resiliência operacional

- Toda falha do TSE precisa ter **graceful degradation** (último valor conhecido + banner amarelo).
- Endpoint `/api/ingest` é **cron-only** + protegido por `x-cron-secret`.
- Rolling Release com canary 10/50/100% — **sem big-bang deploy no dia D**.
- Runbook escrito e revisado antes do dia D.

## 8. Transparência metodológica

- Página `/sobre-o-modelo` é **obrigatória** e detalha: como a projeção é extrapolada do apurado, como o intervalo de confiança é construído, e o que a comparação com 2022 significa na tela (fato observado, não insumo da projeção), como interpretar a agulha, limitações conhecidas.
- Bloco "O que está movendo o forecast" presente em toda página com projeção.
- Disclaimer explícito quando atribuição partidária é incerta.

> **Mudança 1.1 → 1.2 (2026-09-05).** A versão 1.1 (e todas as anteriores) descreviam a projeção de candidatos como baseada em "swing" — variação em relação ao resultado de 2022, usado como âncora do modelo. Essa âncora exigia um mapeamento de coligação 2026→2022 (K-1, ADR-0015) que nunca ficou operacional, dependia de um campo (`historical_results.pct_validos`) nunca populado, e era "validada" por um gate de replay tautológico (dataset construído a partir do próprio 2022, ver `docs/reference/risks.md:27`). A 1.2 substitui o swing por **extrapolação do apurado por zona eleitoral** — regra de três sobre o que cada zona já apurou, sem depender de histórico — com 2022 relegado a comparação descritiva na tela. Justificativa completa em [ADR-0021](./architecture/adrs/0021-extrapolacao-do-apurado-sem-2022.md), que também supersede o ADR-0015. Nenhum outro parágrafo do § 8, nem qualquer outro princípio (§§ 1–7, 9–10), foi alterado.

## 9. Stack 100% Vercel

- Toda infraestrutura corre na Vercel (Compute, Edge Config, Blob, CDN, Cron, Analytics, BotID).
- Excepcionalidades exigem ADR justificando o trade-off.
- Mantém complexidade operacional baixa (single pane of glass).

## 10. Append-only para dados de apuração

- Snapshots do TSE **nunca** são sobrescritos — gravação `append-only` em `snapshots`.
- Habilita replay completo e validação por reprodução.
- Auditabilidade jurídica (caso necessário em disputa).

---

## Como aplicar

Antes de mergear qualquer PR, conferir que nenhum princípio acima foi violado. Toda spec em `docs/specs/` referencia os princípios aplicáveis. ADRs em `docs/architecture/adrs/` documentam decisões que dialogam com a constituição.
