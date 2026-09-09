"use client";

/**
 * components/atoms/maps/_pmtiles-protocol.ts
 *
 * Registro do protocolo `pmtiles://` no MapLibre GL — ponto único para os
 * dois componentes de mapa client (`_NationalChoroplethMapImpl.tsx`,
 * `ChoroplethMapUF.tsx`). Antes cada arquivo tinha sua própria flag
 * module-level (`protocolRegistered` / `protocolRegisteredMuni`) e seu
 * próprio `new Protocol()` — mesmo padrão, código duplicado.
 *
 * ADR-0003: PMTiles. ADR-0004: MapLibre GL.
 *
 * --- Causa raiz do "mapa branco" investigada em 2026-09-09 (map-builder) ---
 *
 * `pmtiles@4.4.1` (`src/index.ts`, classe `SharedPromiseCache`, métodos
 * `getHeader`/`getDirectory`) armazena a Promise do fetch do header/diretório
 * no cache **antes dela resolver** (`this.cache.set(cacheKey, { ..., data: p
 * })`, linha ~789) e **nunca a remove se ela rejeitar ou nunca assentar**. A
 * classe `Protocol` (`src/adapters.ts`) mantém um `Map<url, PMTiles>`
 * (`this.tiles`) — uma única instância de `PMTiles` (e portanto do
 * `SharedPromiseCache` dela) por URL de arquivo `.pmtiles`, para a vida
 * inteira do processo JS.
 *
 * Com `addProtocol("pmtiles", protocol.tile)` chamado uma única vez por
 * sessão de aba (o padrão documentado do pmtiles, replicado aqui via
 * `registerPmtilesProtocolOnce`), essa mesma instância de `Protocol` — e o
 * cache de cada `PMTiles` dentro dela — sobrevive a QUALQUER número de
 * montagens/desmontagens de `<Map>` subsequentes (navegação entre páginas,
 * remount do React, HMR). Se a *primeira* vez que algum mapa pediu o header
 * de `ufs.pmtiles`/`municipios.pmtiles` nessa aba falhar ou nunca assentar
 * (rede instável, tab sobrevivendo a um restart do `next dev`, etc.), a
 * Promise ruim fica cacheada para sempre: todo mapa futuro nessa mesma aba
 * — mesmo depois de reiniciar o servidor, apagar `.next/dev`, tudo — vai
 * reusar a MESMA Promise pendurada/rejeitada. Do lado do MapLibre, isso é
 * silencioso: `VectorTileSource.load()` (bundle `maplibre-gl`, minificado)
 * só marca `_loaded = true` e dispara `error` dentro do `try/catch` do
 * `await`; se a Promise nunca assenta, esse `await` nunca retorna, o
 * `try/catch` nunca roda, `_loaded` fica `false` para sempre e nenhum
 * evento — nem `error`, nem `load` — é emitido. É exatamente o sintoma
 * relatado: `isStyleLoaded()` e `loaded()` travados em `false`, zero evento
 * de erro, zero requisição nova visível (a aba não tenta de novo porque já
 * "tem" a Promise em cache).
 *
 * Não reproduzido com o código atual + uma aba nova (Playwright headless
 * contra o `next dev` já rodando: Brasil pinta na home, SP isolado depois do
 * filtro do Bloco 2) — a raiz é uma falha de rede pontual que fica presa no
 * heap JS da aba, não um defeito determinístico do código ou do servidor.
 * `resetPmtilesProtocol` é a mitigação: descarta o `Protocol`/`PMTiles`
 * poluído e registra um novo, com cache limpo, sem precisar recarregar a
 * aba inteira. Os dois componentes de mapa chamam isso automaticamente se o
 * estilo não carregar dentro de um prazo (ver `_NationalChoroplethMapImpl.tsx`
 * e `ChoroplethMapUF.tsx`).
 */

import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";

let registered = false;

/** Registra `pmtiles://` uma única vez por sessão de aba (custa 1 fetch de header por URL). */
export function registerPmtilesProtocolOnce(): void {
  if (registered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}

/**
 * Descarta o `Protocol`/`PMTiles` atual (e o `SharedPromiseCache` de cada
 * arquivo `.pmtiles` dentro dele) e registra um novo, do zero. É a única
 * forma de sair de uma Promise pendurada/rejeitada cacheada para sempre
 * (bug pmtiles 4.4.1 — ver docstring do módulo) sem recarregar a aba.
 */
export function resetPmtilesProtocol(): void {
  maplibregl.removeProtocol("pmtiles");
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  registered = true;
}
