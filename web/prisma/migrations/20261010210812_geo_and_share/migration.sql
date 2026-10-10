
-- AlterTable
ALTER TABLE "Home" ADD COLUMN     "address" TEXT,
ADD COLUMN     "footprint" JSONB,
ADD COLUMN     "shareImage" TEXT,
ADD COLUMN     "shareSlug" TEXT,
ADD COLUMN     "sharedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Postcode" (
    "postcode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lon" DOUBLE PRECISION NOT NULL,
    "outcode" TEXT NOT NULL,
    "district" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL,
    "terminated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Postcode_pkey" PRIMARY KEY ("postcode")
);

-- CreateTable
CREATE TABLE "BuildingCache" (
    "postcode" TEXT NOT NULL,
    "buildings" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuildingCache_pkey" PRIMARY KEY ("postcode")
);

-- CreateIndex
CREATE INDEX "Postcode_outcode_idx" ON "Postcode"("outcode");

-- CreateIndex
CREATE UNIQUE INDEX "Home_shareSlug_key" ON "Home"("shareSlug");

