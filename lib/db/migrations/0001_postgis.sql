-- Migration 0001: PostGIS extension + tipagem correta de geo_centroid
-- Aplicada via scripts/apply-postgis.mjs (Drizzle pg-core não tem helper PostGIS nativo).
-- Rodar sempre depois de drizzle-kit push em ambiente novo.
-- Idempotente: pode rodar múltiplas vezes sem efeito colateral.

CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE municipios
  ALTER COLUMN geo_centroid TYPE geography(Point, 4326)
  USING geo_centroid::geography;
