-- AlterTable
ALTER TABLE "SubRow" ADD COLUMN "isGroupField" BOOLEAN NOT NULL DEFAULT false;

-- Partial unique index: at most one isGroupField=true row per Location.
-- Prisma's schema DSL can't express a filtered/partial unique index, so
-- this exists only here (see the isGroupField comment in schema.prisma).
CREATE UNIQUE INDEX "SubRow_locationId_group_field_key" ON "SubRow"("locationId") WHERE "isGroupField" = true;
