-- CreateTable
CREATE TABLE "SavedBadgeColor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedBadgeColor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedBadgeColor_workspaceId_color_key" ON "SavedBadgeColor"("workspaceId", "color");

-- CreateIndex
CREATE INDEX "SavedBadgeColor_workspaceId_idx" ON "SavedBadgeColor"("workspaceId");

-- AddForeignKey
ALTER TABLE "SavedBadgeColor" ADD CONSTRAINT "SavedBadgeColor_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
