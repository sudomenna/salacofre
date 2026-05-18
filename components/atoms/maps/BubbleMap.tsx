"use client";

/**
 * components/atoms/maps/BubbleMap.tsx
 *
 * RF-035 — Mapa "Votos reportados" com bubbles proporcionais aos votos
 * reportados por município.
 *
 * Implementação: MapLibre GL + PMTiles (municipios.pmtiles) como basemap.
 * Bubbles renderizados como camada "circle" sobre os municípios.
 * Raio do círculo proporcional a sqrt(votos) para evitar distorção visual.
 *
 * Quando `municipios[].votos === 0` (payload sem dados ainda), os círculos
 * ficam com raio mínimo de 3px (indicação de posição).
 *
 * ADR-0003: PMTiles range-requests.
 * ADR-0004: MapLibre GL.
 * ADR-0010: Carregado via next/dynamic({ ssr: false }) por UfMapsLazy.
 * Constituição § 2: cor via liderCor (token CSS já resolvido pelo caller).
 */

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useEffect, useRef } from "react";

import { UF_BBOX } from "@/components/atoms/maps/_shared";
import { useHoverStore } from "@/lib/state/hover-store";

const PMTILES_BASE = "https://jbtu251tioj3y57z.public.blob.vercel-storage.com";

export interface BubbleMapMunicipio {
  cod_ibge: string;
  nome: string;
  /** Centro geográfico [lon, lat]. */
  centro: [number, number];
  /** Votos reportados no município. */
  votos: number;
  /** ID do candidato líder. */
  lider: number;
  /** Cor do líder (token CSS ou hex resolvido). */
  liderCor: string;
}

export interface BubbleMapProps {
  ufSigla: string;
  municipios: BubbleMapMunicipio[];
  height?: number;
}

/** Throttle helper. */
function throttle<T extends (...args: Parameters<T>) => void>(fn: T, ms: number): T {
  let last = 0;
  return ((...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  }) as T;
}

let protocolRegisteredBubble = false;

/**
 * Constrói GeoJSON de pontos para as bubbles a partir dos dados de municípios.
 * Quando centro=[0,0] (dado ausente), omite o ponto do GeoJSON.
 */
function buildBubblesGeoJSON(
  municipios: BubbleMapMunicipio[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];

  for (const m of municipios) {
    // Skip pontos sem coordenada real
    if (m.centro[0] === 0 && m.centro[1] === 0) continue;

    features.push({
      type: "Feature",
      id: m.cod_ibge,
      geometry: { type: "Point", coordinates: m.centro },
      properties: {
        cod_ibge: m.cod_ibge,
        nome: m.nome,
        votos: m.votos,
        liderCor: m.liderCor,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

/** Escala de raio: sqrt normalizado. Max raio = 30px. */
function computeMaxVotos(municipios: BubbleMapMunicipio[]): number {
  return Math.max(...municipios.map((m) => m.votos), 1);
}

export function BubbleMap({ ufSigla, municipios, height = 360 }: BubbleMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const municipiosRef = useRef(municipios);

  useEffect(() => {
    municipiosRef.current = municipios;
  }, [municipios]);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!protocolRegisteredBubble) {
      const protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);
      protocolRegisteredBubble = true;
    }

    const bbox = UF_BBOX[ufSigla] ?? [-73.99, -33.75, -28.84, 5.27];
    const maxVotos = computeMaxVotos(municipiosRef.current);
    const bubblesGeo = buildBubblesGeoJSON(municipiosRef.current);

    // A11y RNF-026: respeita prefers-reduced-motion (constituição § 4).
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const colorTransition = prefersReducedMotion
      ? { duration: 0, delay: 0 }
      : { duration: 600, delay: 0 };

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          // Basemap mínimo: contorno de municípios (apenas stroke, sem fill)
          municipios: {
            type: "vector",
            url: `pmtiles://${PMTILES_BASE}/municipios.pmtiles`,
          },
          // Bubbles como GeoJSON client-side (dados pequenos — <100 pontos por UF)
          bubbles: {
            type: "geojson",
            data: bubblesGeo,
            generateId: false,
          },
        },
        layers: [
          // Basemap cinza
          {
            id: "muni-fill",
            type: "fill",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "fill-color": "#f5f5f5",
              "fill-opacity": 1,
            },
          },
          {
            id: "muni-stroke",
            type: "line",
            source: "municipios",
            "source-layer": "municipios",
            paint: {
              "line-color": "#d9d9d9",
              "line-width": 0.5,
            },
          },
          // Bubbles
          {
            id: "bubbles-circle",
            type: "circle",
            source: "bubbles",
            paint: {
              "circle-color": ["get", "liderCor"],
              "circle-color-transition": colorTransition,
              "circle-opacity": 0.75,
              // Raio proporcional a sqrt(votos/maxVotos) * 30 — clampado
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["sqrt", ["max", ["get", "votos"], 1]],
                0,
                3,
                Math.sqrt(maxVotos),
                28,
              ],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 1,
            },
          },
          // Hover highlight
          {
            id: "bubbles-circle-hover",
            type: "circle",
            source: "bubbles",
            paint: {
              "circle-color": "transparent",
              "circle-stroke-color": "#222222",
              "circle-stroke-width": 2.5,
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["sqrt", ["max", ["get", "votos"], 1]],
                0,
                3,
                Math.sqrt(maxVotos),
                28,
              ],
            },
            filter: ["==", "cod_ibge", ""],
          },
        ],
      },
      bounds: bbox,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
      scrollZoom: false,
    });

    mapRef.current = map;

    // Hover producer
    const onMouseMove = throttle(
      (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        const feature = e.features?.[0];
        const codIbge = feature?.properties?.cod_ibge as string | undefined;
        if (!codIbge) return;
        useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
        map.setFilter("bubbles-circle-hover", ["==", "cod_ibge", codIbge]);
        map.getCanvas().style.cursor = "pointer";
      },
      16,
    );

    map.on("mousemove", "bubbles-circle", onMouseMove);

    map.on("mouseleave", "bubbles-circle", () => {
      useHoverStore.getState().clear();
      map.setFilter("bubbles-circle-hover", ["==", "cod_ibge", ""]);
      map.getCanvas().style.cursor = "";
    });

    // Mobile tap
    map.on("click", "bubbles-circle", (e) => {
      const codIbge = e.features?.[0]?.properties?.cod_ibge as string | undefined;
      if (codIbge) {
        useHoverStore.getState().setHovered({ type: "municipio", codIbge }, "map");
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ufSigla]);

  // Update bubbles when data changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.loaded()) return;
    const src = map.getSource("bubbles") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData(buildBubblesGeoJSON(municipios));
  }, [municipios]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={`Mapa de votos reportados por município — ${ufSigla}`}
      style={{ width: "100%", height }}
    />
  );
}
