// One-off local-dev helper: resets the MAPHKY seed workspace's admin
// password and prints new credentials. seed.ts generates a random
// password each full run and only prints it once — this lets you recover
// login access to just that one workspace without wiping/reseeding
// everything else.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const workspace = await prisma.workspace.findUnique({ where: { workspaceCode: 'MAPHKY' } });
  if (!workspace) throw new Error('MAPHKY workspace not found — run the full seed first.');

  const admin = await prisma.adminUser.findFirst({ where: { workspaceId: workspace.id } });
  if (!admin) throw new Error('No admin found for MAPHKY workspace.');

  const password = crypto.randomBytes(6).toString('base64url');
  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: bcrypt.hashSync(password, 10) },
  });

  console.log(`Workspace: MAPHKY`);
  console.log(`Email:     ${admin.email}`);
  console.log(`Password:  ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
