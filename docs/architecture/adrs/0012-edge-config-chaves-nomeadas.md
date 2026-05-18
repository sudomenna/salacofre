---
id: ADR-0012
title: Chaves nomeadas no Edge Config por corrida e turno, não chave única
status: accepted
date: 2026-05-17
---

# ADR-0012 — Chaves nomeadas no Edge Config por corrida e turno, não chave única

## Status

Aceito.

## Contexto

O ADR-0001 definiu `projection:current` e `projection:uf:[sigla]` como chaves do Edge Config para o read path. No escopo original (presidencial, turno único em foco), uma chave por nível geográfico era suficiente.

Com o suporte a múltiplas corridas simultâneas (presidencial 1T e 2T, governador 1T e 2T), o payload de `projection:current` precisaria ser substituído ao avançar de turno — destruindo o archive do 1T no exato momento em que o 2T começa, ou exigindo concatenação de múltiplas corridas em um único JSON. Nenhuma das duas abordagens é aceitável: a primeira viola o princípio append-only para snapshots históricos (constituição § 10); a segunda infla o payload além dos 512KB do Edge Config se todas as UFs estiverem presentes para ambas as corridas.

A transição de 1T para 2T em 04/out/2026 precisa ocorrer atomicamente sem derrubada do site e sem corrupção do archive do primeiro turno. O writer já precisa publicar projeções de governadores e presidenciais em paralelo durante a janela de apuração. Uma chave única torna esse multi-write impossível sem race condition.

## Decisão

Adotar schema de chaves namespaced no Edge Config. A estrutura canônica é:

```
projection:current:pres:t1          # projeção nacional presidencial 1T
projection:current:pres:t2          # projeção nacional presidencial 2T
projection:current:gov:t1           # projeção nacional governadores 1T
projection:current:gov:t2           # projeção nacional governadores 2T
projection:uf:<sigla>:pres:t1       # projeção UF presidencial 1T
projection:uf:<sigla>:pres:t2       # projeção UF presidencial 2T
projection:uf:<sigla>:gov:t1        # projeção UF governadores 1T
projection:uf:<sigla>:gov:t2        # projeção UF governadores 2T
projection:archive:pres:t1          # snapshot final 1T, gravado uma vez na transição
```

A chave legada `projection:current` permanece como **alias dinâmico**: `lib/config/calendar.ts` resolve o par `(cargo, turno)` correto com base na data/hora do servidor, retornando `("pres", 1)` até o encerramento das urnas do 1T (04/out/2026 ~21h BRT) e `("pres", 2)` depois. Durante a coexistência de 1T e 2T no Edge Config, o writer publica nas duas chaves (nomeada e alias). A chave legada `projection:current` será deprecada ao fim de S06.

## Consequências

**Positivas**:
- Cada corrida é independente no Edge Config: escrita concorrente sem race condition entre presidencial e governadores.
- Transição de turno não destrói o archive: `projection:archive:pres:t1` persiste após o início do 2T.
- Backward-compat garantida por 1 sprint: consumidores que ainda usam `projection:current` continuam funcionando.
- Custo de payload distribuído: cada chave carrega somente sua corrida, mantendo folga sob o limite de 512KB (cf. ADR-0001).

**Negativas**:
- Durante a janela de coexistência (S05–S06), o writer publica em 2 chaves por ingestão — duplicação transitória de write.
- `lib/config/calendar.ts` torna-se load-bearing: erro de data/hora no resolver pode apontar alias para chave errada. Exige teste unitário de clock.
- Schema de chaves precisa ser documentado explicitamente no runbook operacional; equipe de monitoramento precisa conhecer as novas chaves para alertas.

## Cross-refs

- ADR-0001 (Edge Config no read path — define o mecanismo; ADR-0012 expande o schema): [0001-edge-config-no-read-path.md](0001-edge-config-no-read-path.md)
- ADR-0011 (cadência de ingestão 60s): [0011-cadencia-60s.md](0011-cadencia-60s.md)
- Spec afetada: `docs/specs/001-ingestao-tse/spec.md` (writer precisa publicar nas chaves nomeadas)
- Spec afetada: `docs/specs/002-modelo-estatistico/spec.md` (output do modelo endereça chave nomeada)
- Spec afetada: `docs/specs/003-home-nacional/spec.md` (read path via alias `projection:current`)
- Spec afetada: `docs/specs/004-pagina-uf-presidencial/spec.md` (read path via `projection:uf:<sigla>:pres:t1`)
- Data model: [../data-model.md](../data-model.md)
- Constituição § 9 (stack 100% Vercel), § 10 (append-only snapshots): [../../constitution.md](../../constitution.md)
- Operations runbook: `docs/operations/runbook.md`
