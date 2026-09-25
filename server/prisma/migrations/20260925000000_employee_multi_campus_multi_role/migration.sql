-- Replaces Employee's single nullable campusId with a many-to-many
-- EmployeeCampus join table (zero rows = "floats everywhere", same meaning
-- as the old campusId: null), and its single free-text role column with a
-- roles TEXT[] array. Single migration is safe here: pre-launch, no real
-- user data yet (see DEPLOYING.md), so no phased/zero-downtime split needed.

-- CreateTable
CREATE TABLE "EmployeeCampus" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,

    CONSTRAINT "EmployeeCampus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeCampus_employeeId_campusId_key" ON "EmployeeCampus"("employeeId", "campusId");

-- CreateIndex
CREATE INDEX "EmployeeCampus_campusId_idx" ON "EmployeeCampus"("campusId");

-- AddForeignKey
ALTER TABLE "EmployeeCampus" ADD CONSTRAINT "EmployeeCampus_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCampus" ADD CONSTRAINT "EmployeeCampus_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: add roles[] alongside the still-present role/campusId columns
-- so the backfill below can read from them before they're dropped.
ALTER TABLE "Employee" ADD COLUMN "roles" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill campus membership: one EmployeeCampus row per employee that had
-- a non-null campusId; employees that were already floating (campusId
-- null) correctly get zero rows.
INSERT INTO "EmployeeCampus" ("id", "employeeId", "campusId")
SELECT gen_random_uuid()::text, "id", "campusId" FROM "Employee" WHERE "campusId" IS NOT NULL;

-- Backfill roles: preserve the existing role string verbatim as a
-- one-element array (including the 'Employee' default — blanking it to []
-- would silently drop a visible label from every roster row that never got
-- a custom role, even though [] and ['Employee'] behave identically for
-- Staff-field visibility). An employee whose role was already explicitly
-- cleared to '' (the existing "Remove role" action) correctly backfills to
-- '{}'.
UPDATE "Employee" SET "roles" = CASE WHEN "role" <> '' THEN ARRAY["role"] ELSE '{}'::text[] END;

-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_campusId_fkey";

-- AlterTable: drop the now-superseded single-valued columns.
ALTER TABLE "Employee" DROP COLUMN "campusId";
ALTER TABLE "Employee" DROP COLUMN "role";
