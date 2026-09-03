import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// One-time data migration, run once after the `add_campus` migration and
// before the `section_campus_required` migration: creates a "Main Campus"
// for every Workspace that doesn't already have a default Campus, then
// assigns every Section with campusId=null to its workspace's default
// Campus. Safe to re-run — every step is a no-op once already applied.
async function main() {
  const workspaces = await prisma.workspace.findMany();
  let campusesCreated = 0;
  let sectionsBackfilled = 0;

  for (const workspace of workspaces) {
    let defaultCampus = await prisma.campus.findFirst({ where: { workspaceId: workspace.id, isDefault: true } });
    if (!defaultCampus) {
      defaultCampus = await prisma.campus.create({
        data: { workspaceId: workspace.id, name: 'Main Campus', sortOrder: 0, isDefault: true },
      });
      campusesCreated += 1;
    }

    const result = await prisma.section.updateMany({
      where: { workspaceId: workspace.id, campusId: null },
      data: { campusId: defaultCampus.id },
    });
    sectionsBackfilled += result.count;
  }

  console.log(`Backfill done: ${campusesCreated} default Campus row(s) created, ${sectionsBackfilled} Section row(s) assigned.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
