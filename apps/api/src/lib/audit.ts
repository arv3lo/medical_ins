import type { Db, Tx } from '../db/client.js';
import { auditLogs } from '../db/schema.js';

export type AuditEntry = {
  actorUserId: string | null;
  organizationId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/** Pass the transaction of the audited change, so the change and its entry commit together. */
export async function audit(db: Db | Tx, entry: AuditEntry): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: entry.actorUserId,
    organizationId: entry.organizationId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ip: entry.ip ?? null,
  });
}
