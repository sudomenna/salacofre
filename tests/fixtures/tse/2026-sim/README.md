# Fixtures reais do simulado TSE 2026 (1ª janela)

Baixados em 2026-09-17 de `https://resultados-sim.tse.jus.br/simulado/simulado2026`, usando **apenas**
os endereços publicados pelo TSE na aba Informações da página técnica e os construtores de
`lib/tse/targets.ts` sobre a lista oficial de zonas do EA12 — **nenhuma URL adivinhada**
(constituição § 1). Estado dos arquivos: fim da janela da tarde de 16/09 (`dt`/`ht` 16/09, `psa` 100%).

Parâmetros publicados: pleito `17801`, ciclo `ele2026`, ambiente `simulado2026`; eleições `21270`
(Federal — Presidente), `21272` (Estadual — Governador, Senador, Deputados), `21274` (Municipal —
Conselheiro Distrital).

## Arquivos

| Arquivo | Leiaute | O que é |
|---|---|---|
| `ele-c.json` | EA11 | Configuração de eleições. **Sem `c` na raiz** — o ciclo vive em `pl[].c` |
| `mun-e021270-cm.json` | EA12 | 5.755 municípios em 28 abrangências; `cdi` = código IBGE, `z[]` = zonas. 6.289 pares (6.105 sem o exterior) |
| `br-e021270-ab.json` | EA14 | Acompanhamento Brasil (29 itens) |
| `ac-e021270-ab.json` | EA15 | Acompanhamento do Acre (23 itens, `tpabr: "mun"`) |
| `zz-e021270-ab.json` | EA15 | Acompanhamento do exterior — 185 itens (184 localidades + a abrangência) |
| `br-c0001-e021270-u.json` | EA20 | Presidente, nível Brasil |
| `ac-c0003-e021272-u.json` | EA20 | Governador do Acre — o único arquivo sob a eleição **estadual** |
| `zz-c0001-e021270-u.json` | EA20 | Exterior, nível UF — 760.913 aptos |
| `zz29254-z0001-c0001-e021270-u.json` | EA20 | Exterior, par Abidjã × zona 0001 |
| `ac01392-c0001-e021270-u.json` | EA20 | Rio Branco, nível município |
| `ac01392-z0001-…` e `ac01392-z0009-…` | EA20 | Os dois pares de Rio Branco |
| `ac01007-c0001-…` e `ac01007-z0009-…` | EA20 | Bujari — o outro município da zona 0009 |

## Para que servem

- **Passo 0 do protocolo** (`pnpm verify-fatia-premise`): os pares de Rio Branco e Bujari, que
  dividem a zona 0009, são o que prova que cada arquivo de zona traz **a fatia do município**, e não
  a zona inteira repetida. Veredito medido em 17/09: **FATIA CONFIRMADA**.
- **Validação dos leiautes**: `EA20Schema`, `EA14Schema` e `EA15Schema` passam em todos os arquivos.
- **Exterior**: os três arquivos `zz*` são a base do [ADR-0045](../../../../docs/architecture/adrs/0045-exterior-zz-apuracao-presidencial.md).

## Regras

Estes arquivos são cópias byte a byte do CDN do TSE. **Não reformatar** — `biome.json` os isenta do
formatador justamente para preservar a fidelidade. Para atualizar, baixe de novo; não edite à mão.
