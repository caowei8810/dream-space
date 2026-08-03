-- CreateEnum
CREATE TYPE "InspirationCategory" AS ENUM ('PORTRAIT', 'PHOTOGRAPHY', 'ANIME', 'ILLUSTRATION', 'DESIGN');

-- CreateEnum
CREATE TYPE "InspirationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "InspirationSourceType" AS ENUM ('AI_PUBLIC_GALLERY', 'LICENSED', 'INTERNAL');

-- CreateTable
CREATE TABLE "Inspiration" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "category" "InspirationCategory" NOT NULL,
    "imagePath" TEXT NOT NULL,
    "thumbnailPath" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "modelName" TEXT NOT NULL,
    "ratio" TEXT NOT NULL,
    "resolutionLabel" TEXT NOT NULL,
    "authorDisplayName" TEXT NOT NULL,
    "sourceType" "InspirationSourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "licenseBasis" TEXT NOT NULL,
    "isAiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "InspirationStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspiration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Inspiration_slug_key" ON "Inspiration"("slug");

-- CreateIndex
CREATE INDEX "Inspiration_status_category_sortOrder_idx" ON "Inspiration"("status", "category", "sortOrder");

-- CreateIndex
CREATE INDEX "Inspiration_status_publishedAt_idx" ON "Inspiration"("status", "publishedAt");
