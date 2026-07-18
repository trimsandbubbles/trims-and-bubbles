-- AlterTable
ALTER TABLE "review" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "photoUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
