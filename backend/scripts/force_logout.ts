import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Please provide an email address.');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
  }

  console.log(`Force logging out user: ${user.login} (${user.email})`);

  // Delete all sessions
  const { count } = await prisma.session.deleteMany({
    where: { userId: user.id },
  });
  console.log(`Deleted ${count} sessions.`);

  // Update status to OFFLINE
  await prisma.user.update({
    where: { id: user.id },
    data: { status: 'OFFLINE' },
  });
  console.log('User status set to OFFLINE.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
