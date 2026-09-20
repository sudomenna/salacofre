---
id: ADR-0048
title: Coroplético MapLibre+PMTiles substitui o cartograma hexagonal em Governador e estreia em Senador, não um segundo sistema de mapa por cargo
status: accepted
date: 2026-09-18
---

# ADR-0048 — Coroplético MapLibre+PMTiles substitui o cartograma hexagonal em Governador e estreia em Senador

## Status

Aceito. Decisão do dono na sessão de 2026-09-18, já implementada no working tree desta sessão
(`components/layout/PersistentMapFrame.tsx`, `app/(sen)/layout.tsx`, `lib/utils/margem-senado.ts`
— não commitada até o fechamento deste ADR). Este ADR **contraria RF-006.3** (spec 006, `shipped`),
que normatiza o cartograma hexagonal no texto — a divergência é registrada aqui como decisão do
dono, não como deriva de implementação; a emenda ao texto da spec 006 cabe ao `spec-syncer`.

## Contexto

**1. O cartograma hexagonal de `/governador` estava atrasado em relação ao ADR que o
diagnosticou.** `HexCartogramBrasil.tsx:37-42` (`fillFor`) pinta cada hex por
`lider?.cor ?? colorForRank(lider?.rank ?? 1)` — o campo `EdgeCandidate.cor` é o token de rank
(`var(--color-cand-N)`, mecanismo do ADR-0013/0024) e o fallback explícito já é `colorForRank`.
O [ADR-0024](0024-paleta-editorial-por-partido.md) (item 1 do Contexto) nomeia **exatamente este
componente** como a razão nº 1 para adotar cor por partido/federação: "em cada UF o 'rank 1' é
sempre `--color-cand-1` (vermelho), não importa o partido do líder local... a cor comunica 'quem é
o líder desta UF na paleta', não 'qual partido governa esta UF', que é a pergunta editorial real de
um grid nacional de governadores". O ADR-0024 foi aceito em 2026-09-07; `HexCartogramBrasil.tsx`
nunca foi migrado para `party-color.ts` — a rota que motivou o ADR continuava, 11 dias depois,
exibindo o defeito que o ADR existe para corrigir.

**2. `/senador` não tinha moldura de mapa nenhuma.** `/` e `/uf/[sigla]` (Presidente) e
`/governador` e `/uf/[sigla]/governador` (Governador) já usam a moldura persistente do
[ADR-0033](0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md) § 1 — um `layout.tsx`
de grupo de rotas que hospeda `<PersistentMapFrame>` e sobrevive à navegação Brasil↔UF dentro do
mesmo cargo. Não existia `app/(sen)/layout.tsx`; as duas páginas de Senador (`/senador`,
`/uf/[sigla]/senador`) documentavam explicitamente ficar fora de qualquer `<AppShellSplit>` porque
a spec 016 § Escopo/Fora tira "mapa municipal e maiores colégios" de escopo — mas essa exclusão
nunca deveria ter alcançado o nível Brasil, que não depende de dado municipal algum.

**3. `RF-006.3` normatiza o componente que este ADR substitui.** `docs/specs/006-grid-governadores/
spec.md:89-91` (spec `shipped`): *"WHEN há ao menos 1 UF no payload, the system SHALL renderizar
`<HexCartogramBrasil />` SVG inline com 27 hex pintados por líder via `colorForRank()`."* A decisão
deste ADR contraria esse texto ao pé da letra — é decisão do dono, tomada com o ADR-0024 já citado
como motivo, não uma leitura alternativa do RF.

**Identidade por UF já resolvida, pré-condição desta mudança.** O
[ADR-0042](0042-cargo-uf-numero-chave-identidade-candidatura.md) já havia decidido que
`EdgeUfRow.top_candidatos` carrega `nome`/`partido`/`sqcand` resolvidos por `(cargo, uf, número)` —
sem isso, um coroplético nacional de Governador/Senador com hover por candidato reproduziria o
defeito que o próprio ADR-0042 nomeou (`GovernorCard.tsx:130`, `app/(sen)/senador/page.tsx:139`,
ambos resolvendo nome por `id` isolado antes da correção). Este ADR consome esse contrato já
publicado; não o reabre.

## Decisão

**1. Em `/governador`, o coroplético nacional MapLibre+PMTiles substitui `<HexCartogramBrasil>`.**
`PersistentMapFrame.tsx` (ramo `cargo === "gov"`, sem `sigla`) passa a devolver
`<NationalMapBlock variant="frame" cargo="gov" rows={payload.por_uf} candidatoAId={...}
candidatos={payload.national.candidatos} />` — o **mesmo** componente que já pinta o nível Brasil de
Presidente, agora recebendo o payload de Governador. `<HexCartogramBrasil.tsx>` **permanece no
repositório, intacto, sem uso nesta rota** — decisão explícita do dono, não remoção de componente
(`PersistentMapFrame.tsx:63-72`). Nenhuma mudança de produtor: `EdgePayload`/`EdgeUfRow` são os
mesmos tipos entre cargo 1 e cargo 3, e o `EdgeUfRow.top_candidatos` já enriquecido pelo ADR-0042 é
o que permite o hover mostrar o nome real do candidato da UF certa.

**2. `/senador` ganha moldura própria — `app/(sen)/layout.tsx`, novo — só no nível Brasil.**
`AppShellSplit` + `<PersistentMapFrame cargo="sen">`, irmão de `(pres)` e `(gov)`
(`app/(sen)/layout.tsx:1-41`). No nível Brasil, `PersistentMapFrame` (ramo `cargo === "sen"`, sem
`sigla`) devolve o mesmo `<NationalMapBlock variant="frame">`, pintado pelo partido do **líder
local** de cada UF na corrida de Senador. No nível UF, **não há coroplético municipal** — a fonte não
tem esse dado (spec 016 § Escopo/Fora; `municipios-sen-t1.json` grava `municipios: []` de propósito;
`/api/projection/municipios` não tem ramo `cargo=sen`, cai no default presidencial se chamado) — em
vez de um mapa mudo ou um mapa herdando dado de Presidente em silêncio, `PersistentMapFrame.tsx:519-
571` mostra um painel textual nomeando a ausência ("O Senado ainda não tem mapa por município...").

**3. Pintar pelo 1º colocado é aceito sob condição: o rótulo de duas vagas fica explícito na
superfície do mapa.** Apresentada a objeção — Senado é uma corrida de **2 vagas por UF**
(`docs/specs/016-senador/spec.md:20`, `:34-37`: "são duas vagas por estado, não uma... a margem que
interessa é a do 2º para o 3º, não a do 1º para o 2º") e pintar por líder único sugere vencedor
único — o dono aceitou a decisão sob a condição de que o cabeçalho visual da moldura carregue
"· 2 vagas" quando `cargo === "sen"` (`PersistentMapFrame.tsx:325-329`, variável `escopo`) **e** que
o mesmo aviso entre no **nome acessível**, não só no texto visual — ver item 5.

**4. A margem que decide a cor passa a ser a do 2º para o 3º colocado, não a do 1º para o 2º.**
`lib/utils/margem-senado.ts` (novo) — `margemSegundaVaga(row)` calcula `top_candidatos[1].pct -
top_candidatos[2].pct` e devolve `Number.NaN` (não `0`, não `null`) quando a UF não tem 3 candidatos
no top-3, coerente com a decisão do dono de 14/09 registrada em `tres_estados_e_nao_regressao`
("não sabemos" e "medimos zero" são estados diferentes). Antes desta correção, `resolveColor`
alimentava `intensityLevelForMargin` com a margem de 1º→2º (`margem_atual`/`margem_projetada`, os
únicos campos que `api/model/project.py` agrega para o duelo top-2) — pintando "decidido" onde a
disputa pela 2ª vaga seguia viva. `formatPp`/`formatPercent` tratam `NaN` como "—"
(`lib/utils/format.ts`); `intensityLevelForMargin` trata `NaN` como nível 1, a leitura mais
conservadora.

**5. O aviso de acessibilidade entra no nome acessível, não só no texto visual.**
`ariaRessalvaVagas(cargo)` (`lib/utils/margem-senado.ts:78-87`) devolve `" — Senado: 2 vagas por
estado"` para `cargo === "sen"` e string vazia para `"pres"`/`"gov"` (byte a byte iguais a antes),
consumida nas duas camadas do mapa que carregam `aria-label` em texto (`role="region"` em
`NationalChoroplethMap.tsx`, `role="img"` em `_NationalChoroplethMapImpl.tsx`) — sem isso, quem pula
direto para o mapa via leitor de tela (atalho comum) ouviria a mesma linguagem de "vencedor" que
Presidente/Governador usam, sob a condição sob a qual o dono aceitou pintar por líder único.
Fundamento normativo: RNF-025 (`docs/nfr/accessibility.md:16`) e WCAG 2.1 SC 4.1.2 (Name, Role,
Value — o nome acessível precisa corresponder ao que a superfície apresenta).

**6. `lib/utils/margem-senado.ts` existe separado de `UfPicker.tsx` por orçamento de bundle, não por
organização de código.** `_NationalChoroplethMapImpl.tsx` — o chunk lazy do MapLibre
(`next/dynamic({ ssr: false })`, [ADR-0010](0010-mapa-dynamic-import.md)) — precisa das duas funções
em runtime, e estava a 14,7 KiB do teto de 300 KiB (RNF-007b), medido pelo `a11y-perf-auditor` nesta
sessão em 285,3 KiB. `UfPicker.tsx` é `"use client"` e no mesmo módulo define componentes que
importam `<Button>`, `<Sheet>`, `next/link` e `ufsPorNome` — importar as duas funções puras de lá
arriscaria puxar o módulo inteiro para dentro do chunk com menos margem no orçamento do produto.
`UfPicker.tsx` reexporta as duas funções (`export { ... } from "@/lib/utils/margem-senado"`) para
quem já as importava de lá (`StateResultSheet.tsx`, `NationalChoroplethMap.tsx`,
`NationalMapBlock.tsx`) — uma fonte, dois pontos de import.

**7. Conversores de cargo em `PersistentMapFrame.tsx` passam a ser `Record` totais sobre
`UfPickerCargo` (`"pres" | "gov" | "sen"`).** `CARGO_LABEL` (`:138-142`) e `HOME_HREF` (`:145-149`)
não têm ramo `default` — um cargo novo (Deputado Federal, spec 017) quebra a compilação em vez de
cair silenciosamente em Presidente. Fecha a mesma classe de defeito já registrada 3 vezes nesta base
(`feedback_default_silencioso_enum`) e nomeada pelo [ADR-0028](0028-corrida-explicita-por-rota.md)
como risco residual de falha silenciosa em call site novo sem cargo explícito.

## Consequências

**Positivas**:
- Fecha a dívida que o próprio [ADR-0024](0024-paleta-editorial-por-partido.md) abriu em
  2026-09-07: o grid nacional de Governador passa a responder "qual partido governa cada UF", a
  pergunta editorial que motivou a adoção de cor por partido, em vez de "qual é o rank 1 desta UF na
  paleta local".
- Extensão barata: `NationalMapBlock`/`PersistentMapFrame` já existiam e já resolviam Presidente;
  Governador e Senador reaproveitam o mesmo componente e o mesmo tipo de payload
  (`EdgePayload`/`EdgeUfRow`), sem novo produtor de dado.
- `/senador` ganha, pela primeira vez, uma moldura de mapa persistente entre `/senador` e
  `/uf/[sigla]/senador` — mesmo padrão de navegação (ADR-0033 § 1) que Presidente e Governador já
  garantem, sem inventar um quarto mecanismo de navegação por cargo.
- RF-104 (spec 016) passa a valer também na **cor** do mapa, não só no texto do painel — antes desta
  correção a superfície nova (o mapa) contrariaria uma regra que a página de Senador já respeitava
  em texto.
- Medido pelo `a11y-perf-auditor` nesta sessão: o chunk do MapLibre cresce +88 B (285,3 KiB → ainda
  dentro do teto de 300 KiB, RNF-007b) e o RNF-007a/b/c de `/senador` fica dentro das metas — servir
  três famílias de rota a partir do mesmo chunk não estourou o orçamento.

**Negativas**:
- **Cargo 3 e 5 não podem resolver identidade pelo bloco nacional.** `national.candidatos[].nome`
  fora do cargo 1 é o placeholder `"Candidato {id}"` (ADR-0042 item 4, `api/model/project.py:4885`)
  porque o bloco nacional desses cargos é a união de 27 corridas sob o mesmo espaço de `id` — o nome
  real só existe em `por_uf[].top_candidatos[]` (ADR-0042 item 3). Dois consumidores desta rodada
  precisaram migrar para ler do lugar certo (`buildHoverRows` em `_NationalChoroplethMapImpl.tsx`,
  `StateResultSheet.tsx`) — quem escrever um terceiro consumidor de nome em cargo 3/5 herda o mesmo
  risco se copiar o padrão do bloco nacional.
- **Legenda por rank não existe fora do cargo 1.** `rank` reinicia por UF em cargo 3/5 —
  `buildCandidateLegendEntries` devolve `null` em Governador e Senador. O mapa nacional dessas duas
  rotas **não tem legenda** — consequência aceita da mesma limitação estrutural, não um esquecimento
  desta rodada.
- **`rankByLider` não é construível em Governador/Senador.** O padrão que resolve cor de fallback em
  Presidente (`Object.fromEntries(national.candidatos.map(c => [c.id, c.rank]))`,
  `PersistentMapFrame.tsx:695-697`) colapsaria, por `id`, o rank de até 27 UFs num só valor em
  silêncio — a última UF do array vencendo. `PersistentMapFrame.tsx:473-504,610-615` documenta a
  omissão deliberada; o alcance é estreito (só afeta o fallback de `colorForRank` quando o partido
  não está mapeado, ADR-0024), mas é uma capacidade que Presidente tem e Governador/Senador não.
- **O orçamento do chunk MapLibre agora é compartilhado por três famílias de rota, não uma.** A
  folga de ~14,7 KiB (RNF-007b) que antes só precisava acomodar crescimento de Presidente agora é
  disputada por Presidente, Governador e Senador — quem crescer o MapLibre, o `party-color.ts` ou
  `margem-senado.ts` a partir daqui quebra três telas, não uma.
- **Senador ganhou mapa municipal no nível UF em 2026-09-20** (commits `d5765c4`, `bdf6804`, 
  `6b40f8b`). Rota `/uf/[sigla]/senador` exibe: coroplético municipal (mapa), lista paginada 
  (20 + 40), gaveta ao toque. Especificado em spec 016 como fora de escopo até essa data.
- **Este ADR contraria RF-006.3 no texto da spec 006, sem emendá-la.** A spec `shipped` continua
  normatizando `<HexCartogramBrasil />` como o componente do grid nacional de Governador até o
  `spec-syncer` propagar a correção — risco de leitura futura, se alguém consultar a spec sem saber
  deste ADR.
- **Pintar por líder único em corrida de 2 vagas é uma simplificação editorial aceita, não
  eliminada.** A ressalva de acessibilidade (item 5) mitiga a leitura errada para quem usa leitor de
  tela; para quem só olha o mapa sem ler o cabeçalho ("· 2 vagas"), a cor única por UF ainda sugere,
  visualmente, um vencedor — o dono aceitou esse risco residual explicitamente em troca de reusar o
  mesmo mapa em vez de inventar uma segunda visualização (repartir o estado em duas cores) para uma
  única corrida.

## Alternativas consideradas

- **Manter o cartograma hexagonal com um botão de alternância entre os dois mapas** — apresentada,
  rejeitada pelo dono: mais um componente, mais um controle de UI, e o favo precisaria migrar para
  cor por partido de qualquer forma para não contradizer o coroplético ao lado (o mesmo defeito que
  motivou este ADR reapareceria dentro do próprio favo).
- **Senador com o estado repartido em duas cores, uma por vaga** — apresentada, rejeitada pelo dono
  em favor de cor do líder + rótulo textual das duas vagas.
- **Senador pintado por quem leva a 2ª vaga (não o líder)** — apresentada, rejeitada; o líder da
  corrida é a leitura mais natural de "quem está na frente em cada UF", consistente com
  Presidente/Governador.

## Cross-refs

- [ADR-0024](0024-paleta-editorial-por-partido.md) — nomeia `HexCartogramBrasil` como razão nº 1
  para cor por partido (item 1 do Contexto); este ADR **paga** essa dívida, 11 dias depois.
- [ADR-0031](0031-piso-separacao-entre-partidos.md) — emenda o ADR-0024 com o piso de separação
  mútua entre partidos; os tokens que `NationalMapBlock`/`_NationalChoroplethMapImpl` já consomem em
  Presidente (via `party-color.ts`) passam a valer também em Governador/Senador por esta decisão,
  sem nenhuma mudança de gate.
- [ADR-0010](0010-mapa-dynamic-import.md) — ponto único de `next/dynamic({ ssr: false })` para o
  mapa; preservado — `margem-senado.ts` existe separado de `UfPicker.tsx` justamente para não violar
  o orçamento do chunk que este ADR protege (item 6 da Decisão).
- [ADR-0028](0028-corrida-explicita-por-rota.md) — o padrão de call site explícito por cargo é
  estendido aqui aos conversores `Record` totais de `PersistentMapFrame.tsx` (item 7); fecha a 4ª
  ocorrência da classe de defeito "conversor de enum de cargo com default silencioso" que o ADR-0028
  já nomeava como risco residual.
- [ADR-0033](0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md) § 1 — a moldura
  persistente, escrita para Presidente e Governador ("dentro do mesmo cargo"), estende-se por este
  ADR a um terceiro grupo de rotas (Senador), sem alterar o texto do 0033: a "corrida" nova
  (`(sen)`) segue exatamente o mesmo padrão de layout aninhado que Governador já validou.
- [ADR-0042](0042-cargo-uf-numero-chave-identidade-candidatura.md) — pré-condição desta decisão:
  sem `EdgeUfRow.top_candidatos.nome/partido/sqcand` resolvidos por `(cargo, uf, número)`, o hover
  do coroplético nacional de Governador/Senador reproduziria o defeito de identidade que o próprio
  ADR-0042 corrigiu em `GovernorCard.tsx`/`senador/page.tsx`.
- [ADR-0029](0029-home-mobile-first-mapa-primeiro-fiel-ao-kit.md) § 2 — o seletor de views/controles
  do shell (`<UfPicker>` por cargo) é reaproveitado sem mudança de contrato.
- Constituição § 2 (neutralidade política, v1.5 pós-ADR-0031) — a cor por partido no mapa de
  Governador/Senador segue os mesmos pisos ΔE76 já auditados; nenhum hex novo é introduzido por este
  ADR.
- Constituição § 4 (acessibilidade) — fundamento do item 5 da Decisão (nome acessível ↔ RNF-025 ↔
  WCAG SC 4.1.2).
- `docs/nfr/performance.md` (RNF-007b, teto 300 KiB do chunk do mapa) — orçamento agora compartilhado
  por três famílias de rota (ver Consequências, negativa).
- `docs/nfr/accessibility.md:16` (RNF-025) — fundamento normativo do item 5.
- Specs a emendar (frontmatter `adrs:` e texto — propagação via `spec-syncer`):
  `docs/specs/006-grid-governadores/spec.md` (RF-006.3 contrariado, precisa de nota/emenda; `adrs:`
  ganha 0048), `docs/specs/016-senador/spec.md` (ganha superfície nova de mapa nacional; `adrs:` já
  lista 0033/0042, ganha 0048), `docs/specs/003-home-nacional/spec.md` (dona de RF-030.x, o
  coroplético nacional original; referenciar a extensão a outros cargos).
- `components/blocks/HexCartogramBrasil.tsx` — permanece no repositório, sem uso em `/governador`;
  nenhuma outra rota o referencia hoje.
- `lib/utils/margem-senado.ts`, `app/(sen)/layout.tsx`, `components/layout/PersistentMapFrame.tsx`
  — arquivos que implementam esta decisão.
