---
id: ADR-0050
title: Clique em UF navega no desktop via router.push, gaveta permanece no mobile — reversão parcial da decisão de 2026-09-08
status: accepted
date: 2026-09-19
supersedes: ADR-0033 (parcial — apenas a premissa de clique da Decisão 1, § "Como se resolve concretamente")
---

# ADR-0050 — Clique em UF navega no desktop, gaveta permanece no mobile

## Status

Aceito.

Supersede **parcialmente** o [ADR-0033](0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md)
§ "Decisão 1" — especificamente a frase "sem alterar o mecanismo de clique já decidido nesta sessão"
(`0033-...md:165-166`). O restante da Decisão 1 — o mapa vivendo num `layout.tsx` de grupo de rotas,
nunca desmontando entre `/` e `/uf/[sigla]` do mesmo cargo — **não é tocado** e é, ao contrário, a
razão técnica pela qual este ADR escolhe `router.push` em vez de um `<a href>` cru (ver Decisão, item
2). Segue o precedente já registrado no [ADR-0017](0017-transparencia-total-3-camadas.md) `## Status`
para supersessão parcial: o ADR antigo mantém `status: accepted` no frontmatter porque a decisão como
um todo continua majoritariamente vigente; só a fração afetada é narrada aqui e, em nota espelhada, no
próprio ADR-0033.

**Emenda pendente, fora deste documento**: `docs/specs/003-home-nacional/spec.md:139-142` (RF-030.3)
ainda dizia "WHEN o usuário clica em uma UF, the system SHALL navegar para `/uf/[sigla]`" em 2026-09-19.
**Esta foi emendada em 2026-09-20** (`spec-syncer`) para refletir o critério `pointer: fine` +
`hover: hover`, não viewport. O texto agora qualifica: desktop com mouse → navega; mobile ou sem 
fine pointer → gaveta. A emenda sincronizou spec com código.

## Contexto

Em 2026-09-08, na mesma sessão que produziu o ADR-0033, o usuário tomou uma decisão diferente e
anterior: o clique/toque numa UF do mapa nacional deixou de navegar direto para `/uf/[sigla]` e passou
a abrir a `<StateResultSheet>` (folha de resumo), com a navegação real movida para um botão "Ver
detalhes do estado" dentro da folha. A docstring de
`components/blocks/_NationalChoroplethMapImpl.tsx:32-37` registra isso literalmente: *"2026-09-08
(decisão do usuário): clique/toque numa UF NÃO navega mais direto para `/uf/[sigla]` — abre a
`<StateResultSheet>` (...) via o callback `onSelectUf`. A navegação real para `/uf/[sigla]` agora vive
só no botão 'Ver detalhes do estado' dentro da folha (link `<a href>` de verdade, não `router.push`).
`useRouter` saiu daqui — este arquivo não navega mais sozinho."* O botão em si está em
`components/blocks/StateResultSheet.tsx:409-428` — um `<Link href={ufHref(cargo, row.sigla)}
data-testid="state-sheet-cta">` do `next/link` com o texto "Ver detalhes do estado" (`:427`).

`docs/specs/003-home-nacional/spec.md:139-142` (RF-030.3, "Hover/tap em UF abre tooltip e click
navega") **nunca foi emendado** para refletir essa mudança — o texto publicado ainda é: *"WHEN o
usuário clica em uma UF, the system SHALL navegar para `/uf/[sigla]`."* Sob a hierarquia de fontes do
projeto (constituição > ADRs > ADRs > NFRs > specs > código), o nível mais alto vence; como nenhum ADR
formalizou a mudança de 08/09 como decisão arquitetural (ela ficou registrada só em docstring de
código), a spec nunca deixou de ser a fonte de verdade — quem esteve fora de conformidade desde 08/09
foi o código, não a spec. Esta decisão não contraria RF-030.3; ela devolve o código à spec no desktop,
e evidencia que falta ao RF a ressalva de superfície que nunca existiu.

O [ADR-0033](0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md) § "Decisão 1"
("moldura persistente") foi escrito no mesmo dia, depois dessa mudança, e construiu seu argumento
sobre ela como premissa dada: *"Como se resolve concretamente, sem alterar o mecanismo de clique já
decidido nesta sessão (`StateResultSheet.tsx:248`, `next/link` — nenhuma mudança necessária aqui)"*
(`0033-...md:165-166`; o número de linha citado ali já está desatualizado pelo crescimento do arquivo
— hoje é `:409-428` — mas o mecanismo descrito é o mesmo). Mudar o clique sem um ADR novo deixaria o
ADR-0033 narrando um sistema que deixou de existir. A moldura persistente em si — o `layout.tsx` de
grupo de rotas que impede o mapa de desmontar entre Brasil e UF — permanece intocada e integralmente
vigente; é, aliás, o motivo pelo qual este ADR escolhe `router.push` (navegação soft dentro do mesmo
`layout.tsx`) e não um `<a href>` cru (que recarregaria o documento e destruiria a instância MapLibre
que o ADR-0033 existe para preservar).

A superfície é a mesma para os três mapas nacionais coropléticos — Presidente (`/`), Governador
(`/governador`) e Senador (`/senador`) — porque os três renderizam `NationalChoroplethMap`
(`components/blocks/NationalChoroplethMap.tsx`) com o mesmo mecanismo de clique/folha, diferindo só
em `cargo` (ADR-0048).

## Decisão

Clicar numa UF no mapa nacional volta a **navegar** para `/uf/[sigla]` (Presidente),
`/uf/[sigla]/governador` (Governador) ou `/uf/[sigla]/senador` (Senador) — mas só no **desktop**. No
mobile, o clique/toque continua abrindo a `<StateResultSheet>` exatamente como hoje.

**1. Divisão por superfície.** O critério é **capacidade de ponteiro fino E suporte a hover**: 
`(hover: hover) and (pointer: fine)` (Media Query, `lib/utils/use-has-fine-pointer.ts`, commit `683ddf8`).
Usada em `useHoverStore` para decidir se a `<StateResultSheet>` renderiza como cartão lateral (`side`) 
ou bottom sheet. Viewport **não** é mais o critério — um iPad a 1024px tem fine pointer e abre a 
gaveta; um mouse a 500px navega direto.

> ⚠️ O hook chamava-se `useIsDesktopSheet()` até esta mudança. Foi renomeado no mesmo
> commit porque deixou de governar só a FORMA da folha e passou a governar também SE o
> clique navega — um nome que descreve metade do que a função decide é a próxima linha
> de documentação a vencer. Este ADR
reaproveita o mesmo booleano para uma segunda decisão: com ponteiro fino (mouse), o clique navega; 
sem (toque), abre a folha. Nada no `<Sheet>` muda — `BOTTOM_BOX` (`components/atoms/overlays/Sheet.tsx:56-65`)
continua sendo a variante mobile, com o mesmo `tap-to-select` que já emite para o `useHoverStore`
(`_NationalChoroplethMapImpl.tsx:951-956`). O usuário nomeou isso de forma direta: "no mobile continua
abrindo a gaveta".

**2. `router.push`, não `<a href>`.** Dois motivos, os dois necessários:
   - **Navegação soft preserva o mapa.** `/`, `/uf/[sigla]` (e os pares de Governador/Senador) são
     irmãos sob o MESMO `layout.tsx` de grupo de rotas — a moldura persistente do ADR-0033 § 1. Um
     `<a href>` cru forçaria um reload de documento, remontando a instância MapLibre do zero — o custo
     exato que o ADR-0033 existe para evitar.
   - **Não há `<a>` a fazer.** MapLibre pinta o mapa num `<canvas>` WebGL; não existem 27 nós de DOM,
     um por UF, sobre os quais um `<a>` real pudesse ser posicionado. Sobrepor 27 âncoras invisíveis,
     reprojetadas por `map.project()` a cada pan/zoom, criaria 27 elementos focáveis **sem anel de
     foco visível** sobre a superfície do mapa — reprovação de WCAG 2.1 SC 2.4.7 (Focus Visible), pior
     do que não ter elemento algum ali.
   - ⚠️ **Custo nomeado com honestidade**: Cmd/Ctrl+clique e clique do meio deixam de abrir a UF em nova
     aba a partir do mapa. Isto **não é regressão** desta mudança especificamente — entre 08/09 e hoje
     o clique já abria uma gaveta (onde modificadores de clique também não fazem nada), e antes de
     08/09 a navegação já era via `useRouter().push()` (nunca um `<a href>` real, ver item 3) — mas é a
     objeção clássica contra JS-navigation e precisa estar registrada, não descoberta depois.

**3. Onde o `useRouter` mora — no impl, não no wrapper.** `NationalChoroplethMap.tsx` (o wrapper) é
Client Component **eager**: sua docstring (`:16-23`) já documenta por quê isso importa —
`tests/integration/home-page.test.tsx` renderiza `HomePage` via `renderToStaticMarkup`
(`:34`, `:125` em diante) **sem** `vi.mock("next/navigation")` em lugar nenhum do arquivo (conferido
por busca). `useRouter()` fora do contexto de um App Router montado lança; se o wrapper chamasse
`useRouter()` diretamente, esse teste de integração quebraria. `_NationalChoroplethMapImpl.tsx` é
carregado via `next/dynamic({ ssr: false })` (ADR-0010) — só existe no cliente, nunca em SSR nem em
`renderToStaticMarkup` — e é onde `useRouter` morava antes de 08/09 (a própria docstring do arquivo diz
"`useRouter` saiu daqui"). Esta decisão devolve `useRouter` ao mesmo lugar de onde ele saiu: o wrapper
continua resolvendo e possuindo o booleano de breakpoint (via `useIsDesktop()`) e
passa-o como prop para o impl; o impl é quem, no `onClick` do layer `ufs-fill`
(`_NationalChoroplethMapImpl.tsx:951` em diante), decide entre `router.push(ufHref(cargo, sigla))` e
`onSelectUf(sigla)` (o callback que abre a folha, inalterado). O wrapper decide o breakpoint; o impl
navega — nunca o inverso, para não reintroduzir o mesmo risco de SSR que motivou a separação em dois
arquivos no ADR-0010.

Novo módulo puro relevante aqui: `lib/utils/uf-href.ts` (`ufHref(cargo, sigla)` → `/uf/${sigla}${sufixo
do cargo}`), extraído de `UfPicker.tsx` precisamente porque o impl — o chunk de menor folga do
orçamento RNF-007b, 14,7 KiB medidos em 18/09 — passa a precisar do **valor** da função, não só do tipo
`UfPickerCargo` (que era erasado em compilação e não custava nada). `UfPicker.tsx` re-exporta os dois
símbolos, então nenhum dos ~10 call-sites existentes muda de import.

**4. Acessibilidade — medido, não suposto.** Isto **não é regressão de teclado**. O contêiner do mapa
(`containerRef`, `_NationalChoroplethMapImpl.tsx:1018-1020`) é `role="img"` **sem `tabIndex`**, e uma
busca no arquivo inteiro por `tabIndex`/`onKeyDown`/`onKeyPress` não encontra nenhuma ocorrência: o
canvas MapLibre nunca foi alcançável por teclado, logo a gaveta também nunca foi — ela só abria por
clique de mouse ou toque. O caminho de teclado é, e continua sendo, o `<UfPicker>`: 27 `<Link>` reais
do `next/link` (`components/layout/UfPicker.tsx:232-246`), montado em oito pontos ao longo de todos os
ramos de cargo/nível de `components/layout/PersistentMapFrame.tsx` (linhas 443, 523, 580, 636, 709,
734, 786 e 831), cujo comentário em `:828-830` diz: *"o seletor entra na faixa do canto direito (...).
O mapa continua clicável para descer numa UF — o seletor é o caminho de teclado e de quem sabe o nome
do estado mas não onde ele fica."* Depois desta mudança, mouse e teclado **convergem** para o mesmo
destino no desktop (ambos navegam direto); antes divergiam (teclado navegava direto via `UfPicker`,
mouse abria uma gaveta com um passo extra). No mobile, a divergência entre toque (abre gaveta) e
teclado/leitor de tela (via `UfPicker`, navega direto) permanece exatamente como estava — este ADR não
a resolve nem a piora, e preserva constituição § 4 ("Navegação completa por teclado").

**5. A regressão real, que existe.** `docs/reference/risks.md:89` ("Mapas de Governador e Senador sem
legenda", S08, ADR-0048) registra que `buildCandidateLegendEntries()` retorna `null` para os cargos 3 e
5 (rank reinicia por UF, uma legenda por posição é impossível) e nomeia a `<StateResultSheet>` como o
substituto semântico: *"Quem depende de cor tem como única saída abrir a ficha de cada estado
(`<StateResultSheet>`), uma por vez."* Tirar o clique→gaveta no desktop remove essa única saída ali —
quem depende de cor para ler `/governador` e `/senador` no desktop perde o caminho que hoje decodifica
a cor em texto. **Mitigação parcial já existente, não construída por este ADR**: desde 18/09 o
`<HoverCard>` carrega uma coluna de texto "Part." (partido) por candidato
(`components/atoms/overlays/HoverCard.tsx:414`, formatada por `fmtPartido`, `:228`) — o hover já expõe
o partido de cada linha do ranking sem exigir clique, então o código de cores permanece decodificável,
só que via hover em vez de clique persistente. Isto é registrado como **consequência negativa
aceita**, não como ausência de problema: `docs/reference/risks.md:89` precisa ser atualizado no mesmo
commit que implementa esta decisão, para refletir que a "única saída" deixou de ser única no desktop e
passou a ser hover — trabalho do `spec-syncer`, não resolvido aqui.

**6. O que não muda.** A `<StateResultSheet>` não é apagada — continua sendo o caminho mobile
integral, e toda a sua fiação de props (`open`, `onClose`, `row`, `candidatos`, `side`, `cargo`,
`NationalChoroplethMap.tsx:426-433`) permanece intacta também no desktop, disponível para um gatilho
futuro que não seja o clique no mapa. Os três arquivos de teste que exercitam a folha continuam sendo a
única cobertura das regras de identidade RF-105/RF-106 (vagas de Senador) em Governador/Senador.

## Consequências

**Positivas**:
- Devolve o código de conformidade a RF-030.3 no desktop (superfície majoritária de quem lê a home
  fixamente durante a apuração), sem esperar a emenda formal do texto do RF.
- Reduz o clique numa UF de dois passos (abrir folha → clicar "Ver detalhes do estado") para um, na
  superfície onde o usuário tem mouse e tela grande — o caso de uso original que motivou a página de UF
  existir.
- Preserva 100% do trabalho de moldura persistente do ADR-0033 § 1: a navegação continua soft, dentro
  do mesmo `layout.tsx` de grupo de rotas, sem recarregar o documento nem reinicializar o chunk MapLibre
  a cada clique.
- Convergência mouse/teclado no desktop elimina uma divergência de comportamento que existia desde
  08/09 (teclado navegava direto, mouse abria gaveta) sem que ninguém tivesse decidido isso
  explicitamente como produto.
- A mudança é local a `_NationalChoroplethMapImpl.tsx` (que recupera `useRouter`) e
  `NationalChoroplethMap.tsx` (que passa o booleano de breakpoint já computado) — não exige nova rota,
  API ou campo de payload.

**Negativas**:
- **Cmd/Ctrl+clique e clique do meio não abrem o mapa em nova aba**, no desktop, a partir de agora
  (JS-navigation via `router.push`, não `<a href>`). Não é regressão desta mudança especificamente
  (nunca funcionou, nem antes de 08/09 nem depois), mas é um custo real e permanente enquanto MapLibre
  pintar via `<canvas>` sem nós de DOM por feature.
- **Reabre, no desktop, o risco nomeado em `docs/reference/risks.md:89`**: Governador e Senador perdem
  a "única saída" de decodificação de cor por clique persistente; resta o `<HoverCard>` (hover,
  transitório, exige mouse parado sobre a UF) como mitigação parcial. `risks.md:89` precisa de
  atualização de texto que este ADR não faz.
- **RF-030.3 permanece tecnicamente desatualizado** até a emenda formal (cláusula de superfície
  desktop/mobile) — este ADR resolve a divergência código↔spec no nível de comportamento, não no nível
  de texto publicado.
- **A divergência mobile entre toque e teclado não é resolvida** — quem usa leitor de tela no celular
  já navegava direto via `UfPicker`; quem toca o mapa continua vendo a gaveta primeiro. Consistência
  total entre as quatro combinações de superfície/dispositivo de entrada fica fora do escopo desta
  decisão.
- **Acoplamento novo entre dois arquivos**: o wrapper precisa continuar computando e repassando
  corretamente o booleano de desktop para o impl a cada re-render; um bug nessa prop desalinha
  novamente o breakpoint do clique do breakpoint do `<Sheet side>`, que hoje são a mesma fonte mas
  poderiam divergir por engano futuro.

## Cross-refs

- [ADR-0033](0033-navegacao-moldura-persistente-paineis-home-calibracao-ot4.md) — supersedido
  parcialmente (Decisão 1, premissa de clique); moldura persistente em si permanece integralmente
  vigente e é a razão técnica da escolha `router.push` vs `<a href>` aqui.
- [ADR-0010](0010-mapa-dynamic-import.md) — `next/dynamic({ ssr: false })` é por que `useRouter` só
  pode viver no impl, nunca no wrapper.
- [ADR-0028](0028-corrida-explicita-por-rota.md) — `cargo` explícito por rota é o que `ufHref(cargo,
  sigla)` consome para resolver o destino certo por corrida.
- [ADR-0048](0048-coropletico-substitui-cartograma-governador-estreia-senador.md) — os três mapas
  nacionais (`pres`/`gov`/`sen`) compartilham `NationalChoroplethMap`, logo compartilham esta decisão.
- [ADR-0017](0017-transparencia-total-3-camadas.md) `## Status` — precedente de registro de supersessão
  parcial seguido por este documento.
- Constituição § 4 (Acessibilidade, WCAG 2.1 AA — "Navegação completa por teclado"): preservada; o
  caminho de teclado (`UfPicker`) não muda.
- `docs/specs/003-home-nacional/spec.md` — RF-030.3 (`:139-142`) precisa de emenda de texto (cláusula
  de superfície); frontmatter `adrs:` (já lista 0033) deve passar a listar também 0050.
- `docs/specs/008-interatividade-brushing/spec.md` — RF-047 (`:46-48`, draft, `adrs: []`) descreve o
  mesmo clique-navega sem distinguir superfície; candidata a listar este ADR quando sair de draft.
- `docs/specs/016-senador/spec.md` — RF-105 (`:142-156`, draft) referencia a `<StateResultSheet>` que
  abre "ao clicar num estado no mapa nacional"; o texto deixa de valer no desktop com esta decisão.
- `docs/reference/risks.md:89` — regressão negativa aceita (sem legenda em gov/sen, mitigação parcial
  via `<HoverCard>`); pendente de atualização de texto.
- `docs/design-system/components.md` — `NationalChoroplethMap`/`_NationalChoroplethMapImpl` ganham
  comportamento condicional por breakpoint; catálogo deve refletir quando implementado.
