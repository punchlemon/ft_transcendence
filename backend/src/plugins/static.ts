import fp from 'fastify-plugin'
import fastifyStatic from '@fastify/static'
import path from 'path'
import fs from 'fs'

export default fp(async (fastify) => {
  const uploadsDir = path.join(__dirname, '../../uploads')
  
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }

  fastify.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
  })
})
