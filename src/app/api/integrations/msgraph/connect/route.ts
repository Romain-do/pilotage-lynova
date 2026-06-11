import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { isMsGraphConfigured } from "@/lib/msgraph/config";
import { buildAuthorizeUrl } from "@/lib/msgraph/auth";

// Démarre la connexion OAuth Microsoft 365 — DIRIGEANT uniquement (garde côté serveur, §3).
// Génère un `state` anti-CSRF déposé en cookie httpOnly, puis redirige vers Azure.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);

  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(`${origin}/login`);
  if (me.role !== "DIRIGEANT") return NextResponse.redirect(`${origin}/`);

  if (!isMsGraphConfigured()) {
    return NextResponse.redirect(`${origin}/admin?msgraph=notconfigured`);
  }

  const state = randomUUID();
  const authorizeUrl = buildAuthorizeUrl(state, origin);

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set("msgraph_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/integrations/msgraph",
    maxAge: 600, // 10 min pour finir le consentement
  });
  return res;
}
