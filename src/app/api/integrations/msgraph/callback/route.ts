import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { exchangeCodeAndStore } from "@/lib/msgraph/auth";

// Callback OAuth Microsoft 365. Vérifie le `state` anti-CSRF (cookie), échange le `code`
// contre les tokens et persiste la connexion. DIRIGEANT uniquement (garde côté serveur).
export const dynamic = "force-dynamic";
export const preferredRegion = "dub1"; // proximité DB Supabase (getCurrentUser + upsert)

export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const admin = `${origin}/admin`;

  const me = await getCurrentUser();
  if (!me) return NextResponse.redirect(`${origin}/login`);
  if (me.role !== "DIRIGEANT") return NextResponse.redirect(`${origin}/`);

  // Erreur renvoyée par Azure (consentement refusé, etc.).
  const oauthError = searchParams.get("error");
  if (oauthError) {
    console.error("[msgraph] callback error:", oauthError, searchParams.get("error_description"));
    return NextResponse.redirect(`${admin}?msgraph=error`);
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = request.cookies.get("msgraph_oauth_state")?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(`${admin}?msgraph=state`);
  }

  try {
    await exchangeCodeAndStore(code, origin, me.id);
  } catch (e) {
    console.error("[msgraph] exchange:", e instanceof Error ? e.message : e);
    return NextResponse.redirect(`${admin}?msgraph=error`);
  }

  const res = NextResponse.redirect(`${admin}?msgraph=connected`);
  res.cookies.delete("msgraph_oauth_state");
  return res;
}
