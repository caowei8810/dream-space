import type { DatabaseClient, Prisma } from "@dream-space/db";
import type { ObjectStorage } from "@dream-space/storage";

export interface PrivacyCleanupSummary {
  cutoff: Date;
  candidates: number;
  deleted: number;
  failed: number;
}

export async function cleanupDeletedUploads(
  database: DatabaseClient,
  storage: Pick<ObjectStorage, "delete">,
  retentionDays: number,
): Promise<PrivacyCleanupSummary> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
  const candidates = await database.referenceUpload.findMany({
    where: { deletedAt: { not: null, lt: cutoff } },
    select: { id: true, objectKey: true },
    orderBy: [{ deletedAt: "asc" }, { id: "asc" }],
    take: 1000,
  });
  let deleted = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      await storage.delete(candidate.objectKey);
      const removed = await database.referenceUpload.deleteMany({
        where: { id: candidate.id, deletedAt: { not: null, lt: cutoff } },
      });
      deleted += removed.count;
    } catch {
      failed += 1;
    }
  }
  await database.adminAuditLog.create({
    data: {
      action: "privacy.retention.cleanup.scheduled",
      resourceType: "ReferenceUpload",
      resourceId: "batch",
      reason: `定时清理软删除上传（${retentionDays} 天）`,
      requestId: `scheduled-privacy-cleanup-${cutoff.toISOString()}`,
      before: {
        cutoff: cutoff.toISOString(),
        candidates: candidates.length,
      } as Prisma.InputJsonValue,
      after: { deleted, failed } as Prisma.InputJsonValue,
    },
  });
  return { cutoff, candidates: candidates.length, deleted, failed };
}
