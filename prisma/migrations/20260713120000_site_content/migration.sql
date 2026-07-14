-- Owner-editable website content (inline edit mode). Additive: one new table.
CREATE TABLE "site_content" (
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "site_content_pkey" PRIMARY KEY ("key")
);
