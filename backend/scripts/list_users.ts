import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      login: true,
      email: true,
      displayName: true,
      createdAt: true,
      deletedAt: true,
      status: true,
    },
  });

  console.log('--- Users ---');
  if (users.length === 0) {
    console.log('No users found.');
  } else {
    console.table(users);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
