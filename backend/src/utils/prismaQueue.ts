import { prisma } from './prisma'
import logger from './logger'

type WorkItem<T = void> = { work: () => Promise<T>; resolve?: (v: T) => void; reject?: (err: any) => void }

const workQueue: WorkItem<any>[] = []
let workRunning = false

async function processWorkQueue() {
  if (workRunning) return
  workRunning = true
  while (workQueue.length > 0) {
    const it = workQueue.shift()!
    try {
      // lightweight instrumentation: log when a queued prisma work starts
      try {
        logger.debug('[prismaQueue] executing work', { queueLength: workQueue.length, time: Date.now(), stack: new Error().stack })
      } catch (err) {}
      const res = await it.work()
      try { it.resolve && it.resolve(res) } catch (e) {}
    } catch (e) {
      try { it.reject && it.reject(e) } catch (err) {}
      try { logger.error('[prismaQueue] work item failed', e) } catch (err) {}
    }
  }
  workRunning = false
}

export function enqueueUserStatusUpdate(userId: number, data: any): Promise<void> | void {
  if (!userId) return
  return enqueuePrismaWork<void>(async () => {
    try {
      await prisma.user.update({ where: { id: userId }, data })
    } catch (e) {
      try { logger.error('[prismaQueue] failed to update user status', e) } catch (err) {}
      throw e
    }
  })
}

export function enqueuePrismaWork<T>(work: () => Promise<T>): Promise<T> {
  const p = new Promise<T>((resolve, reject) => {
    // capture enqueue stack so we can trace callers quickly
    const enqueueStack = new Error().stack
    workQueue.push({ work: async () => {
      try { logger.debug('[prismaQueue] running item (from enqueue)', { time: Date.now(), enqueueStack }) } catch (err) {}
      return work()
    }, resolve, reject })
    void processWorkQueue()
  })

  // Attach a local catch handler so that a rejected queued work without an
  // external await/catch won't produce an unhandled rejection that can
  // terminate the process. The handler logs the error then re-throws so
  // callers that do await the returned promise still observe the rejection.
  void p.catch((err) => {
    try { logger.error('[prismaQueue] queued work rejected (handled)', err) } catch (e) {}
    throw err
  })

  return p
}

export default { enqueueUserStatusUpdate, enqueuePrismaWork }
