import { createDatabaseClient } from "@dream-space/db";
import { QuotaReconciliationService } from "../apps/worker/src/reconciliation/quota-reconciliation";

async function main() {
  const database = createDatabaseClient();
  const probeId = `c4b-probe-${Date.now()}`;
  const phone = `199${String(Date.now()).slice(-8)}`;
  let runId: string | null = null;

  try {
    const user = await database.user.create({ data: { id: probeId, phone } });
    const session = await database.generationSession.create({
      data: { id: `${probeId}-session`, userId: user.id, title: "C4b reconciliation probe" },
    });
    const task = await database.generationTask.create({
      data: {
        id: `${probeId}-task`,
        userId: user.id,
        sessionId: session.id,
        status: "FAILED",
        prompt: "C4b reconciliation probe",
        model: "image-4.7",
        ratio: "RATIO_1_1",
        resolution: "K2",
        imageCount: 1,
        referenceImageUrls: [],
        unitCost: 5,
        totalCost: 5,
        idempotencyKey: probeId,
        completedAt: new Date(),
        errorCode: "C4B_PROBE",
        errorMessage: "intentional reconciliation probe",
      },
    });
    await database.quotaAccount.create({
      data: { userId: user.id, total: 100, available: 95, reserved: 5 },
    });
    await database.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        type: "GRANT",
        amount: 100,
        balanceAfter: 100,
        idempotencyKey: `grant:${probeId}`,
      },
    });
    await database.quotaLedgerEntry.create({
      data: {
        userId: user.id,
        taskId: task.id,
        type: "RESERVE",
        amount: 5,
        balanceAfter: 95,
        idempotencyKey: `reserve:${probeId}`,
      },
    });

    const reconciliation = new QuotaReconciliationService(database, { windowMs: 10_000 });
    const now = new Date();
    const first = await reconciliation.run({ now, windowMs: 10_000, userIds: [user.id] });
    runId = first.runId;
    const second = await reconciliation.run({ now, windowMs: 10_000, userIds: [user.id] });
    const [account, releases] = await Promise.all([
      database.quotaAccount.findUniqueOrThrow({ where: { userId: user.id } }),
      database.quotaLedgerEntry.count({ where: { taskId: task.id, type: "RELEASE" } }),
    ]);

    if (
      first.status !== "COMPLETED" ||
      first.repairedCount !== 1 ||
      second.runId !== first.runId ||
      account.available !== 100 ||
      account.reserved !== 0 ||
      releases !== 1
    ) {
      throw new Error(
        `reconciliation assertion failed: ${JSON.stringify({ first, second, account, releases })}`,
      );
    }
    console.log(
      `Reconciliation smoke passed: run=${first.runId} repaired=1 available=100 reserved=0 releases=1 replayed=true`,
    );
  } finally {
    await database.user.deleteMany({ where: { id: probeId } });
    if (runId) await database.quotaReconciliationRun.deleteMany({ where: { id: runId } });
    await database.$disconnect();
  }
}

void main();
