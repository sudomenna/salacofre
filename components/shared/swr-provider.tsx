"use client";

/**
 * components/shared/swr-provider.tsx
 *
 * SWR config provider + hook `useProjection()` para polling de /api/projection.
 *
 * Cobertura: RF-027 (polling sem reload).
 *
 * Polling:
 *   - refreshInterval = 5000ms (5s, conforme spec 003 § "Atualização live")
 *   - dedupe: 4500ms para evitar requests duplicados próximos ao limite
 *   - revalidateOnFocus: true (quando aba retoma foco)
 *
 * Fallback data:
 *   - O RSC `app/page.tsx` lê o Edge Config server-side e passa `fallbackData`
 *     ao SWR para que o primeiro render NÃO espere o fetch — SSR-first
 *     (RNF-002 LCP <2.5s).
 *
 * ADR-0002 — polling com CDN cache: o endpoint /api/projection retorna
 * `Cache-Control: s-maxage=30, stale-while-revalidate=60`, então mesmo
 * 20.000 clientes polling a 5s viram cache-hit na CDN >99% (RNF-005).
 */

import type { ReactNode } from "react";
import useSWR, { SWRConfig, type SWRConfiguration } from "swr";

import type { EdgePayload } from "@/lib/edge-config/types";

const DEFAULT_CONFIG: SWRConfiguration = {
  refreshInterval: 5000,
  dedupingInterval: 4500,
  revalidateOnFocus: true,
  shouldRetryOnError: true,
  errorRetryCount: 3,
  errorRetryInterval: 3000,
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export function SwrProvider({ children }: { children: ReactNode }) {
  return <SWRConfig value={{ ...DEFAULT_CONFIG, fetcher: jsonFetcher }}>{children}</SWRConfig>;
}

export interface UseProjectionResult {
  data: EdgePayload;
  isLoading: boolean;
  error: unknown;
}

/**
 * Hook que faz polling de /api/projection.
 *
 * @param fallbackData payload inicial vindo do RSC (server-side read). É
 *   crítico passar pra evitar flash de loading no above-the-fold.
 */
export function useProjection(fallbackData: EdgePayload): UseProjectionResult {
  const { data, isLoading, error } = useSWR<EdgePayload>("/api/projection", jsonFetcher, {
    ...DEFAULT_CONFIG,
    fallbackData,
  });
  return { data: data ?? fallbackData, isLoading, error };
}
