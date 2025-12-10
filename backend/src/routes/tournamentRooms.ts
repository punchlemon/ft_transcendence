import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import tournamentRoomService from '../services/tournamentRoomService'

const createRoomBody = z.object({ invitedUserIds: z.array(z.coerce.number().int().positive()).min(1).max(32), mode: z.string().optional() })
const roomParam = z.object({ roomId: z.coerce.number().int().positive() })
const inviteActionBody = z.object({ action: z.enum(['ACCEPT', 'DECLINE']) })

const tournamentRoomsRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/tournaments/:id/rooms
  fastify.post('/:id/rooms', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params)
    const body = createRoomBody.safeParse(request.body)
    if (!params.success || !body.success) {
      reply.code(400)
      return { error: { code: 'INVALID_REQUEST', message: 'Invalid params or body' } }
    }

    const tournamentId = params.data.id
    const inviterId = request.user?.userId
    if (!inviterId) {
      reply.code(401)
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    try {
      const result = await tournamentRoomService.createTournamentRoom(tournamentId, inviterId, body.data.invitedUserIds, { mode: body.data.mode })
      reply.code(201)
      return { data: { roomId: result.room.id } }
    } catch (e: any) {
      request.log.error(e)
      if (e.message === 'TOURNAMENT_NOT_FOUND') {
        reply.code(404)
        return { error: { code: 'TOURNAMENT_NOT_FOUND', message: 'Tournament not found' } }
      }
      reply.code(500)
      return { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } }
    }
  })

  // GET /api/tournaments/:id/rooms/:roomId
  fastify.get('/:id/rooms/:roomId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive(), roomId: z.coerce.number().int().positive() }).safeParse(request.params)
    if (!params.success) {
      reply.code(400)
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid params' } }
    }

    const tournamentId = params.data.id
    const roomId = params.data.roomId

    try {
      const room = await tournamentRoomService.getRoom(roomId)
      if (room.tournamentId !== tournamentId) {
        reply.code(404)
        return { error: { code: 'ROOM_NOT_FOUND', message: 'Room not found for tournament' } }
      }

      reply.code(200)
      return { data: {
        id: room.id,
        tournamentId: room.tournamentId,
        owner: room.owner ? { id: room.owner.id, displayName: room.owner.displayName, avatarUrl: (room.owner as any).avatarUrl ?? null } : null,
        mode: room.mode,
        status: room.status,
        createdAt: room.createdAt.toISOString(),
        invites: room.invites.map((inv: any) => ({ id: inv.id, userId: inv.userId, state: inv.state, user: inv.user ? { id: inv.user.id, displayName: inv.user.displayName, avatarUrl: (inv.user as any).avatarUrl ?? null } : null }))
      } }
    } catch (e: any) {
      request.log.error(e)
      if (e.message === 'ROOM_NOT_FOUND') {
        reply.code(404)
        return { error: { code: 'ROOM_NOT_FOUND', message: 'Room not found' } }
      }
      reply.code(500)
      return { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } }
    }
  })

  // PATCH /api/tournaments/rooms/:roomId/invites/:inviteId
  fastify.patch('/rooms/:roomId/invites/:inviteId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ roomId: z.coerce.number().int().positive(), inviteId: z.coerce.number().int().positive() }).safeParse(request.params)
    const body = inviteActionBody.safeParse(request.body)
    if (!params.success || !body.success) {
      reply.code(400)
      return { error: { code: 'INVALID_REQUEST', message: 'Invalid params or body' } }
    }

    const userId = request.user?.userId
    if (!userId) {
      reply.code(401)
      return { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }
    }

    try {
      if (body.data.action === 'ACCEPT') {
        const updated = await tournamentRoomService.acceptInvite(params.data.roomId, params.data.inviteId, userId)
        reply.code(200)
        return { data: updated }
      } else {
        // DECLINE: mark state to DECLINED
        const invite = await fastify.prisma.tournamentRoomInvite.findUnique({ where: { id: params.data.inviteId } })
        if (!invite) {
          reply.code(404)
          return { error: { code: 'INVITE_NOT_FOUND', message: 'Invite not found' } }
        }
        if (invite.userId !== userId) {
          reply.code(403)
          return { error: { code: 'FORBIDDEN', message: 'Only invitee can decline' } }
        }
        const updated = await fastify.prisma.tournamentRoomInvite.update({ where: { id: invite.id }, data: { state: 'DECLINED' } })
        reply.code(200)
        return { data: updated }
      }
    } catch (e: any) {
      request.log.error(e)
      reply.code(500)
      return { error: { code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' } }
    }
  })
}

export default tournamentRoomsRoutes
