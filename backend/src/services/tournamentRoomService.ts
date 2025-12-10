import { prisma } from '../utils/prisma'
import { notificationService } from './notification'
import { enqueuePrismaWork } from '../utils/prismaQueue'
import { SocketEvent } from '../types/protocol'
import socketFacade from '../lib/socketFacade'

const tournamentRoomService = {
  async createTournamentRoom(tournamentId: number, ownerId: number, invitedUserIds: number[], opts: { mode?: string } = {}) {
    // validate tournament exists
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } })
    if (!tournament) throw new Error('TOURNAMENT_NOT_FOUND')

    const room = await enqueuePrismaWork(() => prisma.tournamentRoom.create({
      data: {
        tournamentId,
        ownerId,
        mode: opts.mode || 'REMOTE'
      }
    }))

    // create invites
    const invites: any[] = []
    for (const uid of invitedUserIds) {
      const u = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, displayName: true } })
      if (!u) continue
      const invite = await enqueuePrismaWork(() => prisma.tournamentRoomInvite.create({ data: { roomId: room.id, userId: uid } }))
      invites.push(invite)

      // notification record (include inviteId so clients can accept via the room invite endpoint)
      await notificationService.createNotification(
        uid,
        'TOURNAMENT_INVITE',
        'Tournament Invite',
        `${u.displayName || 'Someone'} invited you to a tournament room`,
        { tournamentId, roomId: room.id, inviterId: ownerId, inviteId: invite.id }
      )

      // emit socket event to all sockets of the user (include inviteId)
      try {
        const sockets = socketFacade.findSocketsByUser(uid)
        for (const s of sockets) {
          try { s.emit(SocketEvent.TOURNAMENT_INVITE, { roomId: room.id, tournamentId, ownerId, inviteId: invite.id }) } catch (e) {}
        }
      } catch (e) {
        // best-effort
      }
    }

    return { room, invites }
  },

  async acceptInvite(roomId: number, inviteId: number, userId: number) {
    const invite = await prisma.tournamentRoomInvite.findUnique({ where: { id: inviteId } })
    if (!invite) throw new Error('INVITE_NOT_FOUND')
    if (invite.userId !== userId) throw new Error('FORBIDDEN')
    if (invite.roomId !== roomId) throw new Error('INVITE_MISMATCH')

    const updated = await enqueuePrismaWork(() => prisma.tournamentRoomInvite.update({ where: { id: inviteId }, data: { state: 'ACCEPTED', updatedAt: new Date() } }))

    // Join socket room if user has sockets
    try {
      const sockets = socketFacade.findSocketsByUser(userId)
      for (const s of sockets) {
        try { socketFacade.registerSocket(s, { userId, roomId: `tournament-room:${roomId}` }) } catch (e) {}
      }
    } catch (e) {}

    // broadcast joined event to the room
    try {
      socketFacade.broadcastToRoom(`tournament-room:${roomId}`, { type: SocketEvent.TOURNAMENT_ROOM_JOINED, payload: { roomId, userId } })
    } catch (e) {}

    return updated
  },

  async getRoom(roomId: number) {
    const room = await prisma.tournamentRoom.findUnique({
      where: { id: roomId },
      include: {
        owner: { select: { id: true, displayName: true, avatarUrl: true } },
        tournament: { select: { id: true, name: true } },
        invites: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } }
      }
    })
    if (!room) throw new Error('ROOM_NOT_FOUND')
    return room
  }
}

export default tournamentRoomService
