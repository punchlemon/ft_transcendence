import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { chatService } from '../services/chat'

export default async function chatRoutes(fastify: FastifyInstance) {
  fastify.log.info('Registering chat routes...');

  fastify.get('/ping', async () => {
    return { status: 'pong' };
  });

  // List threads (channels)
  fastify.get('/threads', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const userId = req.user.userId
    const channels = await chatService.getUserChannels(userId)

    const threads = await Promise.all(channels.map(async channel => {
      // For DMs, we might want to compute a display name based on the other participant
      let name = channel.name
      if (channel.type === 'DM') {
        const otherMember = channel.members.find(mem => mem.userId !== userId)
        if (otherMember) {
          name = otherMember.user.displayName
        }
      }

      const unreadCount = await chatService.getUnreadCount(channel.id, userId);

      return {
        id: channel.id,
        name,
        type: channel.type,
        updatedAt: channel.updatedAt,
        lastMessage: channel.messages[0] || null,
        unreadCount,
        members: channel.members.map(mem => ({
          id: mem.user.id,
          displayName: mem.user.displayName,
          avatarUrl: mem.user.avatarUrl,
          login: (mem.user as any).login,
          status: mem.user.status,
          role: mem.role,
          lastReadAt: mem.lastReadAt
        }))
      }
    }))

    return { data: threads }
  })

  // Mark thread as read
  fastify.post('/threads/:id/read', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const channelId = parseInt(id)
    const userId = req.user.userId

    try {
      await chatService.markAsRead(channelId, userId)
      return { success: true }
    } catch (error: any) {
      req.log.error(error)
      return reply.status(400).send({ error: { code: 'UPDATE_FAILED', message: error.message } })
    }
  })

  // Create thread (DM or Group)
  const createThreadSchema = z.object({
    type: z.enum(['DM', 'PUBLIC', 'PRIVATE', 'PROTECTED']),
    name: z.string().optional(),
    targetUserId: z.number().optional(), // For DM
    password: z.string().optional() // For Protected
  })

  fastify.post('/threads', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { type, name, targetUserId, password } = createThreadSchema.parse(req.body)
    const userId = req.user.userId

    if (type === 'DM') {
      if (!targetUserId) {
        return reply.status(400).send({ error: { code: 'INVALID_BODY', message: 'targetUserId is required for DM' } })
      }
      const channel = await chatService.getOrCreateDmChannel(userId, targetUserId)
      return { data: { id: channel.id } }
    } else {
      if (!name) {
        return reply.status(400).send({ error: { code: 'INVALID_BODY', message: 'name is required for Group' } })
      }
      const channel = await chatService.createGroupChannel(name, userId, type, password)
      return { data: { id: channel.id } }
    }
  })

  // Get messages
  fastify.get('/threads/:id/messages', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const channelId = parseInt(id)
    const { limit, beforeId } = req.query as { limit?: string, beforeId?: string }
    
    const userId = req.user.userId
    const isMember = await chatService.isMember(channelId, userId)
    if (!isMember) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Not a member of this thread' } })
    }

    const messages = await chatService.getMessages(
        channelId, 
        limit ? parseInt(limit) : 50, 
        beforeId ? parseInt(beforeId) : undefined
    )
    return { data: messages.reverse() }
  })

  // Send message
  const sendMessageSchema = z.object({
    content: z.string().min(1)
  })

  fastify.post('/threads/:id/messages', {
    onRequest: [fastify.authenticate]
  }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const channelId = parseInt(id)
    const userId = req.user.userId
    const { content } = sendMessageSchema.parse(req.body)

    try {
      const message = await chatService.sendMessage(channelId, userId, content)
      return { data: message }
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'SEND_FAILED', message: error.message } })
    }
  })
}
