-- CreateEnum
CREATE TYPE "OrderFulfillment" AS ENUM ('PICKUP', 'SHIPPING');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'FULFILLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "store_order" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "fulfillment" "OrderFulfillment" NOT NULL,
    "shippingAddress" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalCents" INTEGER NOT NULL,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "store_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_order_item" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_order_clientId_idx" ON "store_order"("clientId");

-- CreateIndex
CREATE INDEX "store_order_createdAt_idx" ON "store_order"("createdAt");

-- CreateIndex
CREATE INDEX "store_order_item_orderId_idx" ON "store_order_item"("orderId");

-- AddForeignKey
ALTER TABLE "store_order" ADD CONSTRAINT "store_order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_order_item" ADD CONSTRAINT "store_order_item_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "store_order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
