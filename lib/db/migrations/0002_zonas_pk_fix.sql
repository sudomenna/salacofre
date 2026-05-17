-- Migration 0002: corrige PK da tabela zonas
--
-- Problema: cod_zona INT PRIMARY KEY pressupõe que o número de zona é globalmente
-- único. Na realidade, zonas são numeradas por UF (zona 1 existe em AC, AL, AM...).
-- A chave natural correta é (uf, cod_zona).
--
-- Esta migração:
--   1. Remove a FK de zonas → municipios (será recriada pelo FK real: (uf, cod_zona)).
--   2. Dropa a PK atual cod_zona.
--   3. Cria a nova PK composta (uf, cod_zona).
--
-- Idempotente: testa existência antes de cada operação.
-- Aplicar via: psql $DATABASE_URL_UNPOOLED -f lib/db/migrations/0002_zonas_pk_fix.sql

-- Dropa FK antiga se existir (nome gerado pelo Drizzle pode variar — usamos DROP IF EXISTS)
DO $$
BEGIN
  ALTER TABLE zonas DROP CONSTRAINT IF EXISTS zonas_cod_municipio_tse_municipios_cod_municipio_tse_fk;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Remove PK antiga e cria PK composta
-- Só executa se a PK ainda for só cod_zona (proteção de idempotência)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
    WHERE c.relname = 'zonas'
      AND i.indisprimary = true
      AND array_length(i.indkey, 1) = 1
      AND a.attname = 'cod_zona'
  ) THEN
    ALTER TABLE zonas DROP CONSTRAINT zonas_pkey;
    ALTER TABLE zonas ADD PRIMARY KEY (uf, cod_zona);
  END IF;
END $$;

-- Recria FK (opcional — a FK em cod_municipio_tse ainda é válida)
ALTER TABLE zonas
  DROP CONSTRAINT IF EXISTS zonas_cod_municipio_tse_fkey;

ALTER TABLE zonas
  ADD CONSTRAINT zonas_cod_municipio_tse_fkey
  FOREIGN KEY (cod_municipio_tse) REFERENCES municipios(cod_municipio_tse)
  ON DELETE RESTRICT;
