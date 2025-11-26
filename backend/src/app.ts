import Fastify from 'fastify'
import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import cors from '@fastify/cors'
import dbPlugin from './plugins/db'

const buildServer = async () => {
  const server = Fastify({ logger: true })

  await server.register(cors, { origin: true })
  await server.register(swagger, {
    swagger: {
      info: { title: 'ft_transcendence API', version: '0.1.0' }
    }
  })
  await server.register(swaggerUi, { routePrefix: '/docs' })
  await server.register(dbPlugin)

  server.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return server
}

const start = async () => {
  try {
    const server = await buildServer()
    const port = Number(process.env.BACKEND_PORT || 3000)
    const host = '0.0.0.0'
    await server.listen({ port, host })
    server.log.info(`Server listening on ${host}:${port}`)
  } catch (err) {
    console.error('Failed to start server', err)
    process.exit(1)
  }
}

void start()
