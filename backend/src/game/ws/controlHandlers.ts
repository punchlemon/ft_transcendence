import { FastifyInstance } from 'fastify'

export async function handleControlEvent(opts: {
  fastify: FastifyInstance
  game: any
  data: any
  socket: any
  sessionId?: string
}) {
  const { fastify, game, data, socket, sessionId } = opts
  try {
    const type = data.payload?.type
    if (type === 'PAUSE') {
      game.pauseGame && game.pauseGame('Paused by player')
    } else if (type === 'RESUME') {
      game.startGame && game.startGame()
    } else if (type === 'ABORT') {
      try {
        if (typeof (game as any).abortGame === 'function') {
          ;(game as any).abortGame()
        } else if (typeof (game as any).finishGame === 'function') {
          const s = (game as any).state?.score
          const winner = s && s.p2 > s.p1 ? 'p2' : 'p1'
          ;(game as any).finishGame(winner)
        }
      } catch (e) {
        fastify.log.error({ err: e }, 'Failed to abort game')
      }
    } else if (type === 'LEAVE') {
      try {
        game.removePlayer && game.removePlayer(socket)
        const resp = JSON.stringify({ event: 'match:event', payload: { type: 'LEFT', message: 'You have left the match', sessionId } })
        if (typeof (socket as any).send === 'function') {
          (socket as any).send(resp)
        }
      } catch (e) {
        fastify.log.warn({ err: e, sessionId }, 'Error while handling LEAVE control event')
      } finally {
        try { if (typeof (socket as any).close === 'function') { ;(socket as any).close() } } catch (e) {}
      }
    } else if (type === 'RESTART_MATCH') {
      try {
        const params = data.payload?.params
        if (typeof (game as any).restartMatch === 'function') {
          ;(game as any).restartMatch(params)
        } else {
          try { game.startGame && game.startGame() } catch (e) {}
        }
      } catch (e) {
        fastify.log.warn({ err: e, sessionId }, 'Error while handling RESTART_MATCH control event')
      }
    }
  } catch (err) {
    fastify.log.error(err, 'Failed to handle control event')
  }
}
