-- CreateTable
CREATE TABLE "ReferenceUpload" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ReferenceUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceUpload_objectKey_key" ON "ReferenceUpload"("objectKey");

-- CreateIndex
CREATE INDEX "ReferenceUpload_userId_createdAt_idx" ON "ReferenceUpload"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ReferenceUpload" ADD CONSTRAINT "ReferenceUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
