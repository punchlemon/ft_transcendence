import Fastify from 'fastify'
import { describe, it, expect } from 'vitest'
import blockPlugin from '../block'

describe('block plugin', () => {
  it('returns true when blocklist entry exists and false otherwise', async () => {
    const fastify = Fastify()

    fastify.decorate('prisma', {
      blocklist: { findFirst: async (q: any) => (q ? { id: 1 } : null) }
    } as any)

    await fastify.register(blockPlugin)

    const res1 = await (fastify as any).isBlocked(1, 2)
    expect(res1).toBe(true)

    // change mock to return null by mutating the existing mock
    ;(fastify as any).prisma.blocklist.findFirst = async () => null
    const res2 = await (fastify as any).isBlocked(1, 2)
    expect(res2).toBe(false)

    await fastify.close()
  })
})
