# Especificações oficiais do TSE — Divulgação de Resultados 2026

Cópia local das especificações técnicas publicadas pelo TSE para a Eleição Geral 2026.

## Procedência

Baixados manualmente em **2026-09-05** da aba **Documentos** de
<https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados>.

⚠️ **Por que estão versionados**: o host `www.tse.jus.br` responde **403 a clientes não-navegador**
(curl, fetch automatizado, WebFetch). Não é possível baixar esses arquivos programaticamente —
só por navegador, com caixa de download. Versionar é a única forma de garantir que agentes e
novos integrantes tenham a fonte de verdade sem depender de download manual.

## Conteúdo

| Arquivo | Documento | Versão |
|---|---|---|
| `tse-instrucoes-para-download-2026.pdf` | Instruções para download dos arquivos | v1.0 — 25/05/2026 |
| `tse-ea10-*.pdf` | Arquivo de resultado de eleitos | 26/03/2026 |
| `tse-ea11-*.pdf` | Arquivo de configuração de eleições | 23/06/2026 |
| `tse-ea12-*.pdf` | Arquivo de configuração de municípios | — |
| `tse-ea14-*.pdf` | Arquivo de acompanhamento Brasil | — |
| `tse-ea15-*.pdf` | Arquivo de acompanhamento UF | — |
| `tse-ea16-*.pdf` | Arquivo de configuração de seções eleitorais | — |
| `tse-ea18-*.pdf` | Arquivo auxiliar de seção | — |
| `tse-ea20-*.pdf` | **Arquivo de resultado unificado** — o principal | **10/07/2026** |
| `apresentacao-interessados-2026.pdf` | Apresentação da Audiência Técnica de 06/07/2026 | 06/07/2026 |

`txt/` contém o texto extraído com `pdftotext -layout` — **é o que os agentes devem ler**
(os PDFs têm camada de texto, exceto a apresentação, cujos slides são rasterizados).

Para reextrair após atualizar um PDF:

```bash
cd tse_docs && for f in *.pdf; do pdftotext -layout "$f" "txt/${f%.pdf}.txt"; done
```

> O arquivo de Instruções foi baixado pelo navegador com o nome errado (`drizzle.config.pdf`)
> e renomeado manualmente. Se rebaixar, confira o nome.

## O que estes documentos corrigiram

A implementação anterior (spec 001, `shipped` em jun/2026) foi construída sobre o formato de
**2022** e estava errada em quatro camadas para 2026. O diff campo-a-campo está em
[`docs/reference/tse-2026-leiautes.md`](../docs/reference/tse-2026-leiautes.md). Em resumo:

- O EA20 2026 **não tem `abr[]`**; candidatos vivem em `carg[] → agr[] → par[] → cand[]`.
- Participação vive nos objetos de raiz `e` (eleitores) e `v` (votos), não em `abr[0].tap/tc/ta/…`.
- `dados/<uf>/` é **pasta folha** — a subpasta de município acabou; nome do arquivo ganhou sufixo `-u`.
- `dg` é `dd/mm/aaaa`, não `ddMMyyyy`.
- `pvap` é % sobre `v.vvc` (**votos a votáveis concorrentes** = válidos + legenda + anulados +
  anulados sub judice), **não** sobre válidos puros.

## `exemplos/`

`exemplos/exemplos-de-arquivos-json.zip` foi baixado em **17/09/2026** da mesma aba Documentos
(item "exemplos de arquivos JSON"). Só o zip é versionado; a pasta extraída ao lado está no
`.gitignore` (542 arquivos, 318 deles fotos) — `unzip` regenera.

⚠️ **É o pacote de 2024**, não material de 2026: julho/2024, eleições suplementares de prefeito
e vereador em MT/SP. Inclui `.vsc` de assinatura, um `.cer` por eleição e as fotos dos
candidatos. Serve para ver na prática o EA10 (`-e.json`, resultado de eleitos), os `.vsc`/`.cer`
e a árvore `arquivo-urna` — formatos que os PDFs acima descrevem mas que não temos de 2026.

Os arquivos **reais de 2026** (ambiente de simulado, ciclo `ele2026`, pleito `17801`) estão em
`tests/fixtures/tse/2026-sim/` — quando o assunto for o formato que vai ao ar em outubro, use
esses.

## Sem freeze de leiaute

O TSE recusou fixar data de congelamento: *"novas versões poderão ser disponibilizadas
oportunamente"*. Rode `pnpm tse:watch --once` periodicamente — ele faz HEAD nas 9 URLs
(listadas em `scripts/tse-watch.targets.json`) e avisa quando algo mudar.
