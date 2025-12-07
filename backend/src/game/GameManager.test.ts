import { describe, it, expect } from 'vitest'
import { GameManager } from './GameManager'

describe('GameManager', () => {
  it('createPrivateGame returns unique sessionIds and separate game instances', () => {
    const manager = GameManager.getInstance()

    const a = manager.createPrivateGame()
    const b = manager.createPrivateGame()

    expect(a.sessionId).toBeDefined()
    expect(b.sessionId).toBeDefined()
    expect(a.sessionId).not.toBe(b.sessionId)
    expect(a.sessionId.startsWith('game_private_')).toBe(true)
    expect(b.sessionId.startsWith('game_private_')).toBe(true)

    const gameA = manager.getGame(a.sessionId)
    const gameB = manager.getGame(b.sessionId)
    expect(gameA).toBeDefined()
    expect(gameB).toBeDefined()
    expect(gameA).not.toBe(gameB)

    // Cleanup: stop and remove games
    manager.removeGame(a.sessionId)
    manager.removeGame(b.sessionId)
  })
})
