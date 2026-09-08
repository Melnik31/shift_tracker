-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workspaceCode" TEXT NOT NULL,
    "operationalStart" TEXT NOT NULL DEFAULT '06:00',
    "operationalEnd" TEXT NOT NULL DEFAULT '22:00',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "campusId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "oldRole" TEXT,
    "newRole" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoleChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Employee',
    "campusId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubRow" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "SubRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subRowId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "sessionType" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CellValue" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "subRowId" TEXT NOT NULL,
    "textValue" TEXT,
    "badgeLabel" TEXT,
    "badgeColor" TEXT,
    "statusValue" TEXT,
    "linkUrl" TEXT,

    CONSTRAINT "CellValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CellStaffAssignment" (
    "id" TEXT NOT NULL,
    "cellValueId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "CellStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" TEXT NOT NULL,
    "cellValueId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriodReopen" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollPeriodReopen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "deltaMinutes" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_workspaceCode_key" ON "Workspace"("workspaceCode");

-- CreateIndex
CREATE INDEX "Campus_workspaceId_idx" ON "Campus"("workspaceId");

-- CreateIndex
CREATE INDEX "AdminUser_campusId_idx" ON "AdminUser"("campusId");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_workspaceId_email_key" ON "AdminUser"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "RoleChange_workspaceId_idx" ON "RoleChange"("workspaceId");

-- CreateIndex
CREATE INDEX "RoleChange_targetUserId_idx" ON "RoleChange"("targetUserId");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_idx" ON "Employee"("workspaceId");

-- CreateIndex
CREATE INDEX "Employee_campusId_idx" ON "Employee"("campusId");

-- CreateIndex
CREATE INDEX "Section_workspaceId_idx" ON "Section"("workspaceId");

-- CreateIndex
CREATE INDEX "Section_campusId_idx" ON "Section"("campusId");

-- CreateIndex
CREATE INDEX "Location_sectionId_idx" ON "Location"("sectionId");

-- CreateIndex
CREATE INDEX "SubRow_locationId_idx" ON "SubRow"("locationId");

-- CreateIndex
CREATE INDEX "Shift_workspaceId_idx" ON "Shift"("workspaceId");

-- CreateIndex
CREATE INDEX "Shift_subRowId_date_idx" ON "Shift"("subRowId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CellValue_shiftId_subRowId_key" ON "CellValue"("shiftId", "subRowId");

-- CreateIndex
CREATE UNIQUE INDEX "CellStaffAssignment_cellValueId_employeeId_key" ON "CellStaffAssignment"("cellValueId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollPeriod_workspaceId_idx" ON "PayrollPeriod"("workspaceId");

-- CreateIndex
CREATE INDEX "PayrollPeriodReopen_workspaceId_idx" ON "PayrollPeriodReopen"("workspaceId");

-- CreateIndex
CREATE INDEX "PayrollPeriodReopen_periodId_idx" ON "PayrollPeriodReopen"("periodId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_workspaceId_idx" ON "PayrollAdjustment"("workspaceId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodId_idx" ON "PayrollAdjustment"("periodId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_employeeId_idx" ON "PayrollAdjustment"("employeeId");

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChange" ADD CONSTRAINT "RoleChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChange" ADD CONSTRAINT "RoleChange_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleChange" ADD CONSTRAINT "RoleChange_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubRow" ADD CONSTRAINT "SubRow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_subRowId_fkey" FOREIGN KEY ("subRowId") REFERENCES "SubRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellValue" ADD CONSTRAINT "CellValue_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellValue" ADD CONSTRAINT "CellValue_subRowId_fkey" FOREIGN KEY ("subRowId") REFERENCES "SubRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellStaffAssignment" ADD CONSTRAINT "CellStaffAssignment_cellValueId_fkey" FOREIGN KEY ("cellValueId") REFERENCES "CellValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CellStaffAssignment" ADD CONSTRAINT "CellStaffAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileUpload" ADD CONSTRAINT "FileUpload_cellValueId_fkey" FOREIGN KEY ("cellValueId") REFERENCES "CellValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriodReopen" ADD CONSTRAINT "PayrollPeriodReopen_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriodReopen" ADD CONSTRAINT "PayrollPeriodReopen_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriodReopen" ADD CONSTRAINT "PayrollPeriodReopen_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
