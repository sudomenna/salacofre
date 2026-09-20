---
id: handoff-2026-09-19-ajustes-ui
title: Handoff 19/09 (2ª sessão) — nove ajustes de interface pedidos pelo dono
date: 2026-09-19
supersede: handoff-2026-09-19.md
status: current
baselines:
  vitest: 3020
  pytest: 624
  lint_arquivos: 499
commits: 6
empurrados: false
---

# Handoff 19/09 — 2ª sessão

> 🔴 **Supersede [`handoff-2026-09-19.md`](./handoff-2026-09-19.md)** nos pontos de
> baseline e de estado do mapa. O que aquele handoff diz sobre a trava do cargo 6, o
> hemiciclo e as 27 bandeiras continua valendo — esta sessão não tocou nisso.

**Seis commits na `main`, NÃO EMPURRADOS.** Árvore limpa.

| | Antes | Agora |
|---|---|---|
| vitest | 2.854 | **3.020** |
| pytest | 604 | **624** |
| lint | 484 arquivos | **499** |

⚠️ O vitest continua saindo com **10 arquivos falhando na COLETA** sem `DATABASE_URL`.
Isso é o baseline, não regressão — `Tests 3020 passed (3020)` é a linha que importa.

---

## O que o dono pediu, e onde está

| # | Pedido | Commit |
|---|---|---|
| 1 | Balão não ser cortado em RS/SC | `1b0ac1d` |
| 2 | 4º colocado + linha "Outros" | `0d73a30` (dado) + `1b0ac1d` (tela) |
| 3 | Clique no estado leva à página dele (desktop) | `1b0ac1d` |
| 4/5 | Mapa de municípios em Governador e Senador | `bdf6804` |
| 6 | Gráfico aproveitar o espaço | `166b162` |
| 7 | Alarme do Senado pela proporção real | `0d73a30` |
| 8 | Centralização e barra dobrada | `e256d74` |
| 9 | Abreviar cinco siglas de partido | `471efc3` |

Cada commit traz a razão inteira na mensagem — **leia-as antes de mexer nessas áreas**,
elas registram o que foi medido e o que foi decidido.

---

## 🔴 Defeitos achados de passagem, não pedidos

Todos consertados, todos com teste.

1. **`alocarMatriz` produzia `NaN` na matriz inteira** (`data-pipeline/simulacao-gerar.ts`).
   Município com margem `0` — o estado NORMAL no começo da noite — contaminava todas as
   linhas do estado. Saída: `votos_reportados: {}` em todos os municípios, **com forma
   válida** (`JSON.stringify` serializa `NaN` como `null`). Só apareceu porque uma
   invariante nova foi acrescentada junto.
2. **O mapa de Governador era alimentado com a lista de candidatos do Presidente.**
   `GET /api/projection?uf=` cravava `cargo: "pres"`. O balão caía no fallback
   `"Candidato {id}"` e a coluna de partido sumia. Invisível porque a rota respondia 200
   com forma válida.
3. **`PersistentMapFrame` caía inteira** (tela branca) se a rota devolvesse forma
   inesperada — `pct_apurado.toFixed` sem guarda, dentro do render.
4. **`scripts/gerar-serie-fixtures.py` teria apagado 6 MB em silêncio**, reconstruindo
   `municipios-{gov,sen}-t1.json` com `municipios: []`.
5. **Cinco `<table className="sr-only">` criavam rolagem horizontal gigante no celular.**
   Medido: 2.424px na home a 360px. Ver a seção própria abaixo.

---

## Armadilhas confirmadas nesta sessão — leia antes de testar qualquer coisa

### `sr-only` NUNCA vai direto numa `<table>`

O recorte depende de `width: 1px`, e o layout de tabela trata largura como **mínimo**:
a tabela cresce até caber o conteúdo e `overflow: hidden` não segura o box dela. A da
série saiu com **2.768px**. As outras quatro tinham o mesmo defeito latente — só não
estouraram porque têm menos colunas.

⚠️ `display: block` na tabela conserta a largura e **destrói a semântica de linha/coluna**
para o leitor de tela, que é a única razão de ela existir (RNF-023). O certo é envolver:
`<div className="sr-only"><table>…</table></div>`.

Travado por `tests/unit/design-system/sr-only-tabela.test.ts`.

### `getBoundingClientRect()` devolve ZERO no happy-dom

Logo `rect.height / 2 === 0`, e **todo hover de todo teste já flipa para cima**. Um teste
de posicionamento que não estube o rect passa com o valor cravado e não prova nada. O
estube tem de ser **não-quadrado** (800×400) — é o que mata a mutação que troca
`rect.height` por `rect.width`.

### Contraste de não-texto não tem portão automático

O axe joga contraste de SVG no balde `results.incomplete`, que não reprova nada —
reconfirmado em 19/09 com Lighthouse nas 6 rotas, com o gráfico renderizado com dado
real: **zero** itens de série. A régua do gráfico ganhou token próprio `--rule-chart`
(3,26:1) e é protegida **só** por `tests/unit/design-system/contraste-nao-texto.test.ts`.
Quem mexer ali não receberá aviso de nenhuma outra esteira.

### O mapa não desenha quando o arquivo de tiles é bloqueado

`ufs.pmtiles` vem de um domínio externo (Vercel Blob). Em ambiente com o domínio
bloqueado, as requisições voltam com **0 bytes em 1ms** e o console avisa
*"estilo não carregou em 10000ms — reinicializando protocolo pmtiles"*. **Não é defeito
do código.** Aconteceu no navegador embutido E no Playwright nesta sessão.

⚠️ Isso deixou **uma verificação pendente** — ver a seção "Aberto" abaixo.

### Medição: medir a caixa não é medir o texto

Errei isto nesta sessão. Ao conferir centralização vertical, medi o `getBoundingClientRect`
da CÉLULA (que incluía o padding) e conclui "4px acima, 4px abaixo — centrado". O texto
dentro não estava centrado: as colunas usam fontes diferentes, a linha toma a altura da
mais alta e o `stretch` padrão gruda o texto no topo. O que discrimina é medir o
**retângulo dos glifos** (via `Range.selectNodeContents`), não o do elemento.

### Bytes: conte BYTES, não caracteres

Estimei +224 B por UF; o medido foi **286 B**. A estimativa supunha nome de urna em
ASCII — o teto do TSE são 30 *caracteres*, que acentuados viram 60 *bytes* em UTF-8.
Terceira ocorrência desta família no projeto (ver a emenda de 17/09 ao ADR-0046).

---

## 🔴 Aberto — o que o próximo precisa decidir ou fechar

### 1. Verificação pendente: a gaveta no celular, na home

O comportamento foi **verificado ao vivo em `/governador` a 375px** (clique em Tocantins
→ gaveta abriu, URL não mudou, botão apontando para `/uf/TO/governador`) e está coberto
por teste, incluindo o caso da media query mudar **depois** da montagem.

**Não foi verificado visualmente na home**, porque o arquivo de tiles do mapa está
bloqueado neste ambiente e sem mapa não há estado para clicar. Nada indica diferença — a
home usa o mesmo componente, pela mesma fiação —, mas a verificação não foi feita.

### 2. Payload do Senado: o alarme foi recalibrado, o tamanho não encolheu

`senador.json` mede **98,8 KiB**, e já media **94,3 KiB antes** desta sessão. A causa é
`national.candidatos` com **285 entradas** (27 corridas de 2 vagas num payload só), não
o 4º candidato de hoje. O limiar de aviso foi corrigido para acompanhar o elenco — ele
tocava por o cargo existir —, mas o **crescimento** continua a vigiar:

⚠️ Em **02–03/10** o cadastro de candidaturas é reimportado pelo TSE. Se o número de
candidaturas saltar, este payload cresce junto. **Remedir depois da reimportação.**
O store inteiro está em ~410 KB de 1 MB.

### 3. Decisões de produto pendentes

- **Federação não abrevia**: "PSDB/CIDADANIA" não casa com "CIDADANIA" na tabela fechada.
  Virar "PSDB/CID" nas telas apertadas é uma linha no módulo — decisão do dono.
- **Cabeçalho de bancada em `/uf/SP/deputado-federal`** não abrevia enquanto a lista logo
  abaixo abrevia. A isenção da "home de Deputados" foi lida como sendo do **contexto**
  (sigla que rotula bancada), não da URL. Confirmar.
- **Na home, o balão nomeia 4 por UF e a tabela ao lado só nomeia o líder.** Quem não
  consegue passar o mouse — leitor de tela, teclado, celular — não alcança os outros três
  nomes ali. O dono decidiu que o caminho é **clicar no estado** (desktop → página do
  estado, que lista os 12; mobile → gaveta). Fechar um bloco por UF na home é tela nova,
  não remendo.
- **O traço da projeção** sobra 2px além da barra, e essa sobra é **a única parte legível**
  quando a projeção cai abaixo da parcial (contraste sobre a cor do partido: 1,07 a 1,72;
  sobre o fundo: 4,21). Com a barra dobrada, a fração visível caiu de metade para um
  terço. Aumentar a sobra é a alavanca se o traço ficar difícil de achar.

### 4. Lacunas de rastreabilidade (o `spec-syncer` reportou em vez de inventar RF)

Funcionam e têm teste, mas **sem RF formal**: o balão com 4+"Outros", o flip vertical do
balão, e o mapa municipal de Senador. Decidir entre criar RFs próprios ou registrar
reuso dos RF-005.2/005.4 de Governador.

### 5. Achados fora de escopo, de auditoria

- `components/blocks/MunicipioTable.tsx`: texto com cor de partido base (não a variante
  `-text`) reprovando contraste, e `heading-order` quebrado. Derruba Lighthouse a11y de
  `/uf/SP` para 95.
- `canonical` ausente/inválido nas 6 rotas e `robots.txt` inválido na home — SEO 83–91.
  Spec 009, fora do escopo desta sessão.

---

## Comandos para retomar

```bash
pnpm lint && npx tsc --noEmit && npx vitest run
```

```bash
.venv-model/bin/python3.14 -m pytest
```

⚠️ **Nunca** rodar a suíte com `pnpm dev`/`dev:sim` de pé — incidente de 14/09, resultado
eleitoral inventado publicado no site. **Nunca** declarar `ALLOW_DB_WRITE_TESTS` nem
carregar `.env.local`: o `DATABASE_URL` de lá é **produção**.

Para ver na tela: `pnpm dev:sim`. 🔴 A fixture do simulado é **mais rica** que produção
(preenche `nome` em todo cargo, enquanto produção mostra "Candidato 13" em cargo 3/5) —
ver a tela certa ali **não prova** o código.

Se o mapa aparecer em branco: **abra aba nova antes de suspeitar do seu código**, e
confira no console se é o bloqueio do `ufs.pmtiles`. Se muitas edições precederam,
`rm -rf .next` resolve o erro de "Failed to load chunk".
