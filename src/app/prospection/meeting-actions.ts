"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { isMsGraphConnected } from "@/lib/msgraph/auth";
import { createCalendarEvent, GraphError } from "@/lib/msgraph/graph";
import { sendMail } from "@/lib/msgraph/mail";
import { meetingNotificationEmail, MEETING_NOTIFY_TO } from "@/lib/email/templates";

// Server action de création d'un RDV Outlook/Teams (§ RDV prospect). Tout utilisateur
// authentifié : l'événement est créé dans le calendrier Microsoft partagé et les invitations
// partent depuis ce compte. Joignable en POST direct → re-vérifie l'auth côté serveur (requireUser).

export interface MeetingActionState {
  ok: boolean;
  message: string;
  webLink?: string;
  joinUrl?: string;
}

const meetingSchema = z
  .object({
    prospectId: z.string().min(1),
    subject: z.string().trim().min(1, "Objet requis").max(255),
    prospectEmail: z.string().trim().toLowerCase().email("E-mail prospect invalide"),
    additionalEmails: z
      .array(z.string().trim().toLowerCase().email())
      .max(20, "Trop de destinataires"),
    mode: z.enum(["visio", "physique"]),
    address: z.string().trim().max(255).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "Heure invalide"),
    durationMinutes: z.coerce.number().int().min(15).max(480),
  })
  .refine((v) => v.mode !== "physique" || (v.address && v.address.length > 0), {
    message: "Adresse requise pour un RDV physique",
    path: ["address"],
  });

export type MeetingInput = z.input<typeof meetingSchema>;

/** Ajoute `minutes` à un wall-clock "yyyy-mm-ddTHH:MM:00" sans dépendre du fuseau local. */
function addMinutes(startDateTime: string, minutes: number): string {
  // On traite le wall-clock comme de l'UTC pour faire l'arithmétique (le fuseau réel est
  // transmis séparément à Graph via timeZone), puis on retire le suffixe Z.
  const ms = new Date(`${startDateTime}Z`).getTime() + minutes * 60_000;
  return new Date(ms).toISOString().slice(0, 19);
}

export async function createMeeting(input: MeetingInput): Promise<MeetingActionState> {
  await requireUser();

  const parsed = meetingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Champs invalides." };
  }
  const data = parsed.data;

  if (!(await isMsGraphConnected())) {
    return {
      ok: false,
      message: "Outlook n'est pas connecté. Connectez un compte Microsoft 365 dans /admin.",
    };
  }

  // Participants : prospect + destinataires additionnels (dédupliqués).
  const emails = Array.from(new Set([data.prospectEmail, ...data.additionalEmails]));

  const startDateTime = `${data.date}T${data.time}:00`;
  const endDateTime = addMinutes(startDateTime, data.durationMinutes);

  try {
    const event = await createCalendarEvent({
      subject: data.subject,
      startDateTime,
      endDateTime,
      attendees: emails.map((email) => ({ email })),
      online: data.mode === "visio",
      locationDisplayName: data.mode === "physique" ? data.address : null,
    });

    // Notification interne → support@lynova.net (F). N'échoue PAS le RDV si le mail rate.
    let notifyWarning = "";
    try {
      const prospect = await prisma.prospect.findUnique({
        where: { id: data.prospectId },
        select: { company: true, genre: true, nom: true, prenom: true, email: true },
      });
      const notif = meetingNotificationEmail({
        company: prospect?.company ?? null,
        genre: prospect?.genre ?? null,
        nom: prospect?.nom ?? null,
        prenom: prospect?.prenom ?? null,
        email: prospect?.email ?? data.prospectEmail,
        dateISO: data.date,
        time: data.time,
        durationMinutes: data.durationMinutes,
        mode: data.mode,
        address: data.address ?? null,
        joinUrl: event.joinUrl,
      });
      await sendMail({ subject: notif.subject, html: notif.html, to: [MEETING_NOTIFY_TO] });
    } catch (e) {
      console.error("[msgraph] notif RDV:", e instanceof Error ? e.message : e);
      notifyWarning = ` (notification ${MEETING_NOTIFY_TO} non envoyée)`;
    }

    return {
      ok: true,
      message:
        (data.mode === "visio"
          ? "RDV Teams créé et invitations envoyées."
          : "RDV créé et invitations envoyées.") + notifyWarning,
      webLink: event.webLink ?? undefined,
      joinUrl: event.joinUrl ?? undefined,
    };
  } catch (e) {
    if (e instanceof GraphError) {
      console.error("[msgraph] createMeeting:", e.status, e.message);
      return {
        ok: false,
        message:
          e.status === 401 || e.status === 403
            ? "Accès Microsoft refusé. Reconnectez le compte dans /admin."
            : `Microsoft a refusé la création : ${e.message}`,
      };
    }
    console.error("[msgraph] createMeeting:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de la création du RDV. Réessayez." };
  }
}
