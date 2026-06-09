// Mappers Prisma → DTO (sérialisables pour les composants client). Usage serveur
// (page + server actions). Séparé de actions.ts car un module "use server" ne peut
// exporter que des fonctions async.
import type { Prisma } from "@prisma/client";
import type { ProspectDTO, CommentDTO } from "@/lib/prospection";

type ProspectWithComments = Prisma.ProspectGetPayload<{ include: { comments: true } }>;

export function mapComment(c: {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: Date;
}): CommentDTO {
  return { id: c.id, authorName: c.authorName, body: c.body, createdAt: c.createdAt.toISOString() };
}

export function mapProspect(p: ProspectWithComments): ProspectDTO {
  return {
    id: p.id,
    stageId: p.stageId,
    name: p.name,
    company: p.company,
    groupId: p.groupId,
    contact: p.contact,
    phone: p.phone,
    email: p.email,
    reminderAt: p.reminderAt ? p.reminderAt.toISOString() : null,
    reminderDone: p.reminderDone,
    dealValue: p.dealValue ? Number(p.dealValue) : null,
    notes: p.notes,
    comments: p.comments
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(mapComment),
  };
}
