-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "workspaceCode" TEXT NOT NULL,
    "operationalStart" TEXT NOT NULL DEFAULT '06:00',
    "operationalEnd" TEXT NOT NULL DEFAULT '22:00',
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Employee',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Section" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Section_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Location_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "SubRow_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "subRowId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    CONSTRAINT "Shift_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Shift_subRowId_fkey" FOREIGN KEY ("subRowId") REFERENCES "SubRow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CellValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "subRowId" TEXT NOT NULL,
    "textValue" TEXT,
    "badgeLabel" TEXT,
    "badgeColor" TEXT,
    "statusValue" TEXT,
    "linkUrl" TEXT,
    CONSTRAINT "CellValue_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellValue_subRowId_fkey" FOREIGN KEY ("subRowId") REFERENCES "SubRow" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CellStaffAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cellValueId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "CellStaffAssignment_cellValueId_fkey" FOREIGN KEY ("cellValueId") REFERENCES "CellValue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CellStaffAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FileUpload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cellValueId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileUpload_cellValueId_fkey" FOREIGN KEY ("cellValueId") REFERENCES "CellValue" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_workspaceCode_key" ON "Workspace"("workspaceCode");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_workspaceId_email_key" ON "AdminUser"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_idx" ON "Employee"("workspaceId");

-- CreateIndex
CREATE INDEX "Section_workspaceId_idx" ON "Section"("workspaceId");

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
