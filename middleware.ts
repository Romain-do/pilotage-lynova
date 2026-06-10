import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Les routes cron (Vercel Cron) sont protégées par CRON_SECRET dans le handler
  // (Authorization: Bearer) : on les exclut du contrôle de session, sinon le cron
  // sans cookie serait redirigé vers /login (307) et n'atteindrait jamais le handler.
  // Cible STRICTEMENT /api/cron/* (aucune autre route protégée n'est ouverte).
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  // Exécuté sur toutes les routes sauf les assets statiques.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
