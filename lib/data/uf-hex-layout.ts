/**
 * lib/data/uf-hex-layout.ts
 *
 * Layout fixo NYT-like das 27 UFs em hex grid offset.
 *
 * Por que offset hex grid (não geocoords reais)?
 *   - Cartograma comparativo: cada UF ocupa área visual igual,
 *     independente do tamanho geográfico (constituição § 2 — neutralidade
 *     visual: AC não fica gigante e SE invisível).
 *   - SVG inline minúsculo (<5 KB gz) — atende RNF-007a.
 *   - Inspiração: 538 / NYT election cartograms.
 *
 * Sistema de coordenadas:
 *   - `row` cresce pra BAIXO (Norte top, Sul bottom).
 *   - `col` cresce pra DIREITA (Oeste left, Leste right).
 *   - Linhas ímpares têm offset horizontal de +0.5 col (hex pointy-top).
 *
 * Constituição § 6 — determinismo: layout é constante; nenhuma randomização
 * ou animação que altere posicionamento entre renders.
 */

export interface HexPos {
  row: number;
  col: number;
}

/**
 * Mapeamento canônico UF → {row, col}. 27 entradas (26 estados + DF).
 *
 * Aproximação geográfica:
 *   - Linha 0–1: Norte (RR, AP, AM, PA, AC, RO, TO, MA)
 *   - Linha 2–3: Nordeste / Centro-Oeste (MT, PI, CE, RN, PB, PE, AL, SE, BA, DF, GO)
 *   - Linha 4–5: Sudeste (MS, MG, ES, SP, RJ)
 *   - Linha 6–7: Sul (PR, SC, RS)
 *
 * Coordenadas escolhidas pra aproximar o "mapa NYT-like" sem sobreposição.
 */
export const UF_HEX_POSITIONS: Record<string, HexPos> = {
  // Norte
  RR: { row: 0, col: 2 },
  AP: { row: 0, col: 4 },
  AM: { row: 1, col: 2 },
  PA: { row: 1, col: 4 },
  MA: { row: 1, col: 5 },
  AC: { row: 2, col: 1 },
  RO: { row: 2, col: 2 },
  TO: { row: 2, col: 4 },
  PI: { row: 2, col: 5 },
  CE: { row: 2, col: 6 },
  RN: { row: 2, col: 7 },
  // Nordeste / Centro-Oeste
  MT: { row: 3, col: 3 },
  BA: { row: 3, col: 5 },
  PB: { row: 3, col: 7 },
  PE: { row: 3, col: 6 },
  AL: { row: 4, col: 6 },
  SE: { row: 4, col: 5 },
  DF: { row: 4, col: 4 },
  GO: { row: 4, col: 3 },
  // Sudeste
  MS: { row: 5, col: 3 },
  MG: { row: 5, col: 4 },
  ES: { row: 5, col: 5 },
  SP: { row: 6, col: 3 },
  RJ: { row: 6, col: 4 },
  // Sul
  PR: { row: 7, col: 3 },
  SC: { row: 8, col: 3 },
  RS: { row: 9, col: 3 },
};

/** Lista das 27 siglas em ordem canônica (Norte → Sul, Oeste → Leste). */
export const UF_LIST: ReadonlyArray<keyof typeof UF_HEX_POSITIONS> = Object.freeze(
  Object.keys(UF_HEX_POSITIONS) as Array<keyof typeof UF_HEX_POSITIONS>,
);

/**
 * Converte {row, col} → {x, y} em coordenadas SVG.
 *
 * @param pos posição lógica da UF
 * @param r raio do hexágono (px)
 * @returns centro do hex em (x, y)
 */
export function hexCenter(pos: HexPos, r: number): { x: number; y: number } {
  const w = Math.sqrt(3) * r; // largura de um hex pointy-top
  const h = 1.5 * r; // altura entre centros (vertical step)
  const xOffset = pos.row % 2 === 1 ? w / 2 : 0;
  return {
    x: pos.col * w + xOffset + r,
    y: pos.row * h + r,
  };
}

/**
 * Pontos do hexágono pointy-top centrado em (cx, cy) com raio r.
 * Retorna string pronta pra `<polygon points="…" />`.
 */
export function hexPoints(cx: number, cy: number, r: number): string {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2; // pointy-top: começa no topo
    pts.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

/**
 * Bounding box do grid completo dado raio r. Útil pra `viewBox` SVG.
 */
export function gridBounds(r: number): { width: number; height: number } {
  let maxX = 0;
  let maxY = 0;
  for (const pos of Object.values(UF_HEX_POSITIONS)) {
    const { x, y } = hexCenter(pos, r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  }
  return { width: maxX, height: maxY };
}
