-- CreateTable
CREATE TABLE "PayrollPeriodReopen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPeriodReopen_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollPeriodReopen_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollPeriodReopen_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "AdminUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PayrollPeriodReopen_workspaceId_idx" ON "PayrollPeriodReopen"("workspaceId");

-- CreateIndex
CREATE INDEX "PayrollPeriodReopen_periodId_idx" ON "PayrollPeriodReopen"("periodId");
