-- CreateTable
CREATE TABLE "TokenMetadata" (
    "mint" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "image" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "TokenMetadata_mint_idx" ON "TokenMetadata"("mint");
