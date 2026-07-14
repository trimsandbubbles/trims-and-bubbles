-- Additive migration: owner-manageable catalogue + gallery, editable business
-- details, guest order access token, and Better Auth's DB-backed rate-limit table.
-- Purely additive (new tables + new nullable columns) so it is safe to apply to a
-- live database with `prisma migrate deploy`.

-- Better Auth persistent rate-limit store
CREATE TABLE "rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,
    CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limit_key_key" ON "rate_limit"("key");

-- Editable-by-owner business details (fall back to src/config/business.ts when null)
ALTER TABLE "business_settings" ADD COLUMN "fullAddress" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "serviceAreaNote" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "credentialTitle" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "credentialInstitution" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "instagramUrl" TEXT;
ALTER TABLE "business_settings" ADD COLUMN "facebookUrl" TEXT;

-- Owner-managed retail catalogue
CREATE TABLE "product" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "compareAtCents" INTEGER,
    "imageUrl" TEXT,
    "category" TEXT,
    "badge" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_slug_key" ON "product"("slug");

-- Standalone gallery photos
CREATE TABLE "gallery_image" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "groupLabel" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "gallery_image_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gallery_image_active_displayOrder_idx" ON "gallery_image"("active", "displayOrder");

-- Guest order access token
ALTER TABLE "store_order" ADD COLUMN "accessToken" TEXT;
CREATE UNIQUE INDEX "store_order_accessToken_key" ON "store_order"("accessToken");
