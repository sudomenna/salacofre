/**
 * lib/data/uf-flags.generated.ts — ARQUIVO GERADO. NÃO EDITE À MÃO.
 *
 *   Gerador : scripts/gen-uf-flags.ts
 *   Comando : pnpm gen:uf-flags
 *   Fonte   : scripts/data/bandeiras-uf/<SIGLA>.svg (ver PROVENIENCIA.md)
 *
 * Qualquer edição manual aqui é perdida na próxima geração.
 *
 * 0 de 27 bandeiras presentes na fonte no momento da geração.
 *
 * Todo `id` interno foi prefixado com `ufflag-<SIGLA>-` pelo gerador: 27
 * arquivos de editores diferentes trazem os mesmos `id="a"` e colidiriam
 * dentro do mesmo documento, fazendo uma bandeira pintar com o gradiente de
 * outra — defeito que só aparece em runtime, numa bandeira.
 */

/** Caixa normalizada do `<symbol>`. O `meet` garante folga, nunca distorção. */
export const UF_FLAG_VIEWBOX = "0 0 70 100" as const;

export interface UfFlagSvg {
  /** `viewBox` do arquivo de origem — é ele que o `<symbol>` declara. */
  viewBox: string;
  /** Miolo do SVG, já minificado e com os `id` prefixados. */
  corpo: string;
}

/**
 * Sigla → bandeira. **Pode estar vazio**, e isso não é erro: enquanto os
 * arquivos não chegam, `<UfFlag>` devolve `null` e a grade de estados
 * renderiza só o nome e a sigla, em texto.
 */
export const UF_FLAGS: Readonly<Record<string, UfFlagSvg>> = Object.freeze({});
