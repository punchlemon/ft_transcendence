import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'

const prisma = new PrismaClient()

async function main() {
  const password = 'password'
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })

  const users = [
    {
      email: 'admin@example.com',
      login: 'admin',
      displayName: 'Administrator',
      passwordHash,
      status: 'OFFLINE',
      profileVisibility: 'PUBLIC',
      twoFAEnabled: false,
    },
    {
      email: 'user1@example.com',
      login: 'user1',
      displayName: 'User One',
      passwordHash,
      status: 'OFFLINE',
      profileVisibility: 'PUBLIC',
      twoFAEnabled: false,
    },
    {
      email: 'user2@example.com',
      login: 'user2',
      displayName: 'User Two',
      passwordHash,
      status: 'OFFLINE',
      profileVisibility: 'PUBLIC',
      twoFAEnabled: false,
    },
  ]

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    })
    console.log(`Created user with id: ${user.id} (${user.email})`)
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
