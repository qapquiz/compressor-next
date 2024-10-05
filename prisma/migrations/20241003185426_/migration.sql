-- CreateTable
CREATE TABLE "TokenMetadata" (
    "mint" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "image" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "TokenMetadata_mint_idx" ON "TokenMetadata"("mint");
