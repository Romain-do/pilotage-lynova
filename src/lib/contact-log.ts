import { prisma } from "@/lib/prisma";
import type { ContactType } from "@prisma/client";

// Trace anti-double-envoi : une ligne par envoi RÉUSSI (présentation, synthèse RDV, RDV Outlook).
// BEST-EFFORT — un échec d'insertion ne doit JAMAIS faire échouer l'envoi (le mail est déjà parti) :
// on logue et on continue.
export async function logContact(args: {
  prospectId: string;
  type: ContactType;
  recipient: string;
  live: boolean;
  sentById?: string | null;
  sentByName?: string | null;
}): Promise<void> {
  try {
    await prisma.contactLog.create({
      data: {
        prospectId: args.prospectId,
        type: args.type,
        recipient: args.recipient,
        live: args.live,
        sentById: args.sentById ?? null,
        sentByName: args.sentByName ?? null,
      },
    });
  } catch (e) {
    console.error("[contact-log] insert:", e instanceof Error ? e.message : e);
  }
}
