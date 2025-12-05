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
      _count: {
        select: { sessions: true },
      },
    },
    orderBy: {
      id: 'asc',
    },
  });

  const onlineUsers = users.filter((u) => u.status === 'ONLINE' || u.status === 'IN_GAME');
  const offlineUsers = users.filter((u) => u.status !== 'ONLINE' && u.status !== 'IN_GAME');

  console.log(`Total Users: ${users.length}`);
  console.log(`Online Users: ${onlineUsers.length}`);

  if (onlineUsers.length > 0) {
    console.log('\n--- Online Users ---');
    console.table(
      onlineUsers.map((u) => ({
        ...u,
        sessions: u._count.sessions,
        _count: undefined,
      }))
    );
  } else {
    console.log('\n--- No Online Users ---');
  }

  if (offlineUsers.length > 0) {
    console.log('\n--- Offline Users ---');
    console.table(
      offlineUsers.map((u) => ({
        ...u,
        sessions: u._count.sessions,
        _count: undefined,
      }))
    );
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
