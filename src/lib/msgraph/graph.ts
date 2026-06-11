// Appels Microsoft Graph (création d'événement calendrier). SERVER-ONLY.

import { GRAPH_API_BASE, MEETING_TIME_ZONE } from "./config";
import { getAccessToken } from "./auth";

export interface GraphAttendee {
  email: string;
  name?: string;
}

export interface CreateEventInput {
  subject: string;
  /** Wall-clock local sans fuseau, ex. "2026-06-12T14:00:00" (interprété en Europe/Paris). */
  startDateTime: string;
  endDateTime: string;
  attendees: GraphAttendee[];
  /** Réunion Teams en ligne (Visio). */
  online: boolean;
  /** Adresse du lieu (RDV physique) — ignoré si `online`. */
  locationDisplayName?: string | null;
  /** Corps optionnel du message d'invitation. */
  bodyHtml?: string | null;
}

export interface CreatedEvent {
  id: string;
  webLink: string | null;
  joinUrl: string | null;
}

/** Erreur Graph normalisée (message lisible extrait du corps JSON). */
export class GraphError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "GraphError";
  }
}

/**
 * POST /me/events — crée l'événement dans le calendrier connecté.
 * Microsoft envoie les invitations natives aux participants et, si `online`, génère
 * automatiquement le lien Teams (onlineMeetingProvider = teamsForBusiness).
 */
export async function createCalendarEvent(input: CreateEventInput): Promise<CreatedEvent> {
  const accessToken = await getAccessToken();

  const body: Record<string, unknown> = {
    subject: input.subject,
    start: { dateTime: input.startDateTime, timeZone: MEETING_TIME_ZONE },
    end: { dateTime: input.endDateTime, timeZone: MEETING_TIME_ZONE },
    attendees: input.attendees.map((a) => ({
      emailAddress: { address: a.email, name: a.name ?? a.email },
      type: "required",
    })),
  };

  if (input.bodyHtml) {
    body.body = { contentType: "HTML", content: input.bodyHtml };
  }

  if (input.online) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  } else if (input.locationDisplayName) {
    body.location = { displayName: input.locationDisplayName };
  }

  const res = await fetch(`${GRAPH_API_BASE}/me/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as {
      error?: { message?: string; code?: string };
    } | null;
    const detail = payload?.error?.message ?? `HTTP ${res.status}`;
    throw new GraphError(detail, res.status);
  }

  const event = (await res.json()) as {
    id: string;
    webLink?: string;
    onlineMeeting?: { joinUrl?: string };
  };

  return {
    id: event.id,
    webLink: event.webLink ?? null,
    joinUrl: event.onlineMeeting?.joinUrl ?? null,
  };
}
