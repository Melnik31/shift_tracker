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
  await prisma.payrollAdjustment.deleteMany();
  await prisma.payrollPeriodReopen.deleteMany();
  await prisma.payrollPeriod.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.roleChange.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.campus.deleteMany();
  await prisma.workspace.deleteMany();
}
