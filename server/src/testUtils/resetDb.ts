import { prisma } from '../db';

// Deletes leaf-to-root so SQLite FK constraints never reject the delete.
// Mirrors the clearing order in prisma/seed.ts's main().
export async function resetDb() {
  await prisma.fileUpload.deleteMany();
  await prisma.cellStaffAssignment.deleteMany();
  await prisma.cellValue.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.subRow.deleteMany();
  await prisma.location.deleteMany();
  await prisma.section.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.workspace.deleteMany();
}
