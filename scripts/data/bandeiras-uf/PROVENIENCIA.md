# Bandeiras das 27 unidades federativas — proveniência

Mesmo papel de `scripts/data/party-official-hexes.json`: **dado-fonte de
gerador**, versionado, lido por um script e nunca por código de runtime.

- **Consumidor**: `scripts/gen-uf-flags.ts` (`pnpm gen:uf-flags`)
- **Saída**: `lib/data/uf-flags.generated.ts` — arquivo gerado, não editar à mão
- **Render**: `<UfFlagSprite />` + `<UfFlag sigla="AC" />`
  (`components/atoms/data/UfFlag.tsx`)

## O que vai neste diretório

Exatamente 27 arquivos, nomeados pela sigla em maiúsculas:

```
AC.svg AL.svg AM.svg AP.svg BA.svg CE.svg DF.svg ES.svg GO.svg
MA.svg MG.svg MS.svg MT.svg PA.svg PB.svg PE.svg PI.svg PR.svg
RJ.svg RN.svg RO.svg RR.svg RS.svg SC.svg SE.svg SP.svg TO.svg
```

**Estado em 2026-09-18: o diretório está vazio.** Os arquivos serão fornecidos
pelo dono do produto. Enquanto não chegarem:

- `pnpm gen:uf-flags` **falha**, de propósito — um gerador que produz um sprite
  vazio em silêncio é pior que um que reclama;
- `lib/data/uf-flags.generated.ts` fica com o mapa vazio que está commitado, e
  `<UfFlag>` devolve `null` para toda sigla;
- a grade de estados renderiza **só o nome e a sigla, em texto**, sem buraco no
  layout e sem ícone quebrado. Esse é o estado que vai ao ar hoje, e é por isso
  que ele é tratado como caminho principal, não como borda.

## SVG, e não PNG

Nítido em qualquer tamanho, normalmente mais leve, e — o que decide — é o único
formato que pode ser **embutido no HTML como `<symbol>`**, que é a arquitetura
escolhida (ver abaixo).

## Por que sprite inline, e não `public/` nem Blob

A rota `/deputado-federal` tem orçamento de JavaScript de aplicação **zero**.
Servir 27 arquivos por URL acrescentaria 27 round-trips a uma tela cujo
argumento inteiro é não pagar rede; e uma falha de CDN na noite da apuração
viraria 27 imagens quebradas ao lado de um resultado eleitoral. Embutido, o
custo é ~70 bytes por item (`<use href="#uf-flag-SP"/>`) e não há o que falhar.

## Regras que o gerador aplica (e que ele recusa violar)

1. **Prefixo de `id`** — todo `id` interno vira `ufflag-<SIGLA>-<id>`, e toda
   referência local (`url(#…)`, `href="#…"`) é reescrita junto. Sem isso, 27
   arquivos exportados por editores diferentes trazem `id="a"`, `id="path1"` e
   `id="clip0"` repetidos, colidem dentro do mesmo documento e uma bandeira
   passa a pintar com o gradiente de outra. É defeito que só aparece em
   runtime, numa bandeira, e ninguém liga à causa.
2. **`viewBox` obrigatório** — sem ele o `<use>` não sabe escalar.
3. **Sem `<script>`, sem `on*=`, sem `<foreignObject>`** — conteúdo de terceiro
   embutido no documento da apuração não pode carregar comportamento.
4. **Tetos de tamanho**: 4 KB por bandeira, 60 KB o sprite inteiro. Estourar
   **falha o build**; é o gate que impede alguém colar um traçado de 200 KB
   sem perceber.

## Fonte recomendada

Bandeiras estaduais brasileiras são símbolos oficiais definidos em lei estadual
e não têm direito autoral privado a respeitar; ainda assim, registre aqui, por
arquivo, de onde cada uma veio e em que data — é o mesmo padrão de auditoria do
`party-official-hexes.json`.

| Sigla | Origem | Data | Observação |
|---|---|---|---|
| _(vazio)_ | — | — | aguardando os arquivos do dono |
