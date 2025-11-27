import { FastifyInstance } from 'fastify'
import { z } from 'zod'

export default async function chatRoutes(fastify: FastifyInstance) {
  // List threads (channels)
  fastify.get('/chat/threads', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const userId = req.user.userId

    const memberships = await fastify.prisma.channelMember.findMany({
      where: { userId },
      include: {
        channel: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    displayName: true,
                    avatarUrl: true,
                    status: true
                  }
                }
              }
            },
            messages: {
              orderBy: { sentAt: 'desc' },
              take: 1
            }
          }
        }
      },
      orderBy: {
        channel: {
          updatedAt: 'desc'
        }
      }
    })

    const threads = memberships.map(m => {
      const channel = m.channel
      // For DMs, we might want to compute a display name based on the other participant
      let name = channel.name
      if (channel.type === 'DM') {
        const otherMember = channel.members.find(mem => mem.userId !== userId)
        if (otherMember) {
          name = otherMember.user.displayName
        }
      }

      return {
        id: channel.id,
        name,
        type: channel.type,
        updatedAt: channel.updatedAt,
        lastMessage: channel.messages[0] || null,
        members: channel.members.map(mem => ({
          id: mem.user.id,
          displayName: mem.user.displayName,
          avatarUrl: mem.user.avatarUrl,
          status: mem.user.status,
          role: mem.role
        }))
      }
    })

    return { data: threads }
  })

  // Create thread (DM or Group)
  const createThreadSchema = z.object({
    type: z.enum(['DM', 'PUBLIC', 'PRIVATE']),
    name: z.string().optional(),
    memberIds: z.array(z.number())
  })

  fastify.post('/chat/threads', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { type, name, memberIds } = createThreadSchema.parse(req.body)
    const userId = req.user.userId

    // For DM, check if exists
    if (type === 'DM') {
      if (memberIds.length !== 1) {
        return reply.status(400).send({ error: { code: 'INVALID_DM_MEMBERS', message: 'DM must have exactly one other member' } })
      }
      const targetId = memberIds[0]
      
      // Check existing DM
      // This is a bit complex query, finding a channel of type DM where both users are members
      const existingDm = await fastify.prisma.channel.findFirst({
        where: {
          type: 'DM',
          members: {
            every: {
              userId: { in: [userId, targetId] }
            }
          }
        },
        // We need to ensure it has exactly these 2 members, but 'every' with 'in' is loose.
        // A better way is to find channels where I am a member, then check if the other is also a member.
        include: { members: true }
      })
      
      // Filter strictly for 2 members
      if (existingDm && existingDm.members.length === 2 && existingDm.members.some(m => m.userId === targetId)) {
        return { data: { id: existingDm.id } }
      }

      // Create new DM
      const channel = await fastify.prisma.channel.create({
        data: {
          name: `dm-${userId}-${targetId}`, // Internal name
          slug: `dm-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          type: 'DM',
          ownerId: userId,
          members: {
            create: [
              { userId, role: 'OWNER' },
              { userId: targetId, role: 'MEMBER' }
            ]
          }
        }
      })
      return { data: { id: channel.id } }
    }

    // Group Chat
    const channelName = name || `Group ${Date.now()}`
    const channel = await fastify.prisma.channel.create({
      data: {
        name: channelName,
        slug: `group-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        type: type,
        ownerId: userId,
        members: {
          create: [
            { userId, role: 'OWNER' },
            ...memberIds.map(id => ({ userId: id, role: 'MEMBER' }))
          ]
        }
      }
    })

    return { data: { id: channel.id } }
  })

  // Get messages
  fastify.get('/chat/threads/:id/messages', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const channelId = parseInt(id)
    const userId = req.user.userId

    // Check membership
    const membership = await fastify.prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId
        }
      }
    })

    if (!membership) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this thread' } })
    }

    const messages = await fastify.prisma.message.findMany({
      where: { channelId },
      orderBy: { sentAt: 'desc' },
      take: 50, // Pagination later
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    })

    return { data: messages.reverse() }
  })

  // Send message
  const sendMessageSchema = z.object({
    content: z.string().min(1)
  })

  fastify.post('/chat/threads/:id/messages', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const channelId = parseInt(id)
    const userId = req.user.userId
    const { content } = sendMessageSchema.parse(req.body)

    // Check membership
    const membership = await fastify.prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId
        }
      }
    })

    if (!membership) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this thread' } })
    }

    const message = await fastify.prisma.message.create({
      data: {
        channelId,
        userId,
        content
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true
          }
        }
      }
    })

    // Update channel updatedAt
    await fastify.prisma.channel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() }
    })

    return { data: message }
  })
}
