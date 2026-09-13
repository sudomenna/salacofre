/**
 * components/blocks/CandidaturasFonte.tsx
 *
 * RF-150 — a atribuição que acompanha **toda** superfície que mostra nome ou
 * foto vindos do cadastro do TSE.
 *
 * Extraído de `app/(cand)/candidatos/page.tsx` em 2026-09-13, sem uma mudança
 * de marcação, quando o RF-149 trouxe a segunda superfície (a grade dentro do
 * estado "aguardando dados"). O motivo de extrair em vez de copiar é o mesmo
 * que o ADR-0032 usa para o módulo de Blob: uma **obrigação de licença** com
 * duas implementações é uma obrigação que passa a poder divergir — e a que
 * divergisse continuaria passando nos testes da outra.
 *
 * Server Component puro: zero JavaScript de aplicação (RF-146, RNF-007a).
 *
 * ## Três coisas distintas, e a separação é o ponto
 *
 *   1. **"Fonte: TSE"** — obrigação da licença cc-by do Portal de Dados
 *      Abertos (ADR-0039), não escolha editorial. É adicional ao "Não oficial.
 *      Fonte: TSE." do footer global (constituição § 1), e fica aqui porque é
 *      aqui que o dado está.
 *   2. **o carimbo de frescor** — `fonte_ts`, o `Last-Modified` da resposta do
 *      arquivo do TSE. É primo do `dado_ts` da apuração (ADR-0038) e **não é**
 *      ele: são relógios diferentes, com cadências diferentes, e fundi-los
 *      confundiria o leitor sobre o que está datado. Numa página de apuração
 *      que exibe os dois (é o caso do estado "aguardando" do RF-149), a
 *      distinção deixa de ser teórica.
 *   3. **o aviso de volatilidade** — a lista muda até o fim da apuração
 *      (RF-141, último critério).
 *
 * O carimbo sai do dado, **nunca literal no JSX** (design 018 § D8 — a lição
 * que custou quatro frases falsas de uma vez na spec 017).
 */

import type { CSSProperties } from "react";

import { TZ } from "@/lib/utils/format";

/**
 * `fonte_ts` legível, no fuso de Brasília.
 *
 * Devolve `null` quando a string não é data — e aí a tela omite o carimbo em
 * vez de escrever "Invalid Date". "Fonte: TSE" continua, porque aquilo é
 * obrigação da licença cc-by e não depende de o carimbo ser parseável.
 */
export function formatarFonteTs(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export interface CandidaturasFonteProps {
  /** `fonte_ts` da fatia, ou `null` quando não há fatia lida. */
  fonteTs: string | null;
  style?: CSSProperties;
}

export function CandidaturasFonte({ fonteTs, style }: CandidaturasFonteProps) {
  const carimbo = fonteTs ? formatarFonteTs(fonteTs) : null;

  return (
    <p
      data-testid="candidatos-fonte"
      style={{
        font: "var(--type-data)",
        color: "var(--text-secondary)",
        margin: "0 0 var(--space-4)",
        ...style,
      }}
    >
      Fonte: TSE — Portal de Dados Abertos.
      {carimbo ? (
        <>
          {" "}
          Cadastro publicado pelo TSE em <span data-testid="candidatos-fonte-ts">{carimbo}</span>.
        </>
      ) : null}{" "}
      A lista de candidaturas muda até o fim da apuração.
    </p>
  );
}
