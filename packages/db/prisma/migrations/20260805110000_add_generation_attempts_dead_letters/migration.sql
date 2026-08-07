CREATE TABLE "GenerationDeadLetter" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "GenerationDeadLetter_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GenerationTask"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "lastAttemptKey" TEXT;

ALTER TABLE "GenerationTask"
ADD CONSTRAINT "GenerationTask_attempts_check" CHECK ("attempts" >= 0);

ALTER TABLE "GenerationDeadLetter"
ADD CONSTRAINT "GenerationDeadLetter_attempts_check" CHECK ("attempts" > 0);

CREATE UNIQUE INDEX "GenerationDeadLetter_taskId_key" ON "GenerationDeadLetter"("taskId");
CREATE INDEX "GenerationDeadLetter_resolvedAt_createdAt_idx" ON "GenerationDeadLetter"("resolvedAt", "createdAt");

ALTER TABLE "GenerationDeadLetter"
ADD CONSTRAINT "GenerationDeadLetter_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "GenerationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
