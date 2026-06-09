import { prisma } from "@/lib/prisma";

// Rate limiting des magic links (§3, §8). Stocké en base → robuste en environnement
// serverless (plusieurs instances). Limite par e-mail ET par adresse IP.

const EMAIL_MAX = 3;
const EMAIL_WINDOW_MIN = 10;
const IP_MAX = 15;
const IP_WINDOW_MIN = 60;

export interface RateLimitResult {
  allowed: boolean;
  message: string;
}

export async function checkMagicLinkRateLimit(
  email: string,
  ip: string | null
): Promise<RateLimitResult> {
  const now = Date.now();

  const emailSince = new Date(now - EMAIL_WINDOW_MIN * 60_000);
  const emailCount = await prisma.magicLinkRequest.count({
    where: { email, createdAt: { gte: emailSince } },
  });
  if (emailCount >= EMAIL_MAX) {
    return {
      allowed: false,
      message: "Trop de demandes pour cette adresse. Réessayez dans quelques minutes.",
    };
  }

  if (ip) {
    const ipSince = new Date(now - IP_WINDOW_MIN * 60_000);
    const ipCount = await prisma.magicLinkRequest.count({
      where: { ip, createdAt: { gte: ipSince } },
    });
    if (ipCount >= IP_MAX) {
      return {
        allowed: false,
        message: "Trop de demandes depuis ce réseau. Réessayez plus tard.",
      };
    }
  }

  await prisma.magicLinkRequest.create({ data: { email, ip } });
  return { allowed: true, message: "" };
}
