// proxy.ts — Routing Middleware (Vercel) / Next.js Proxy aplicado a /api/*.
//
// Renomeado de `middleware.ts` em S04/F0.5 (Next 16 deprecation):
// arquivo `middleware.ts` → `proxy.ts`, função `middleware` → `proxy`.
// Comportamento e matcher idênticos.
//
// Propósito: bot detection via Vercel BotID (ADR-0009 + RNF-018). Rate limit
// complementar (RNF-017) por IP fica para chore futura.
//
// Pacote canônico é `botid` (sem scope @vercel — confirmado no registry).
// Cross-refs:
//   - ADR-0009: docs/architecture/adrs/0009-botid-vercel.md
//   - NFR segurança: docs/nfr/security.md (RNF-017, RNF-018)

import { checkBotId } from "botid/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function proxy(_req: NextRequest) {
  const verdict = await checkBotId();
  if (verdict.isBot && !verdict.isVerifiedBot) {
    return new NextResponse(
      JSON.stringify({
        error: "bot_detected",
        message: "Acesso automatizado bloqueado. Veja /sobre-o-modelo para uso responsável.",
      }),
      {
        status: 403,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }

  return NextResponse.next();
}

// Matcher restrito a /api/* — páginas públicas não passam pelo BotID
// para evitar falsos positivos em crawlers legítimos (Google, social cards).
export const config = {
  matcher: ["/api/:path*"],
};
