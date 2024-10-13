-- CreateTable
CREATE TABLE "TokenMetadata" (
    "mint" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "image" TEXT NOT NULL,

    CONSTRAINT "TokenMetadata_pkey" PRIMARY KEY ("mint")
);

-- CreateIndex
CREATE INDEX "TokenMetadata_mint_idx" ON "TokenMetadata"("mint");
