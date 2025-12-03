import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notificationService } from '../services/notification';

const notificationsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    const notifications = await notificationService.getNotifications(userId);
    return { data: notifications };
  });

  fastify.patch('/:id/read', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsSchema = z.object({
      id: z.coerce.number().int().positive(),
    });

    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid notification ID' } };
    }

    const { id } = parsed.data;
    const userId = request.user.userId;

    try {
      const notification = await notificationService.markAsRead(id, userId);
      return { data: notification };
    } catch (error) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'Notification not found' } };
    }
  });

  fastify.patch('/read-all', { preHandler: fastify.authenticate }, async (request, reply) => {
    const userId = request.user.userId;
    await notificationService.markAllAsRead(userId);
    return { success: true };
  });

  fastify.delete('/:id', { preHandler: fastify.authenticate }, async (request, reply) => {
    const paramsSchema = z.object({
      id: z.coerce.number().int().positive(),
    });

    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'INVALID_PARAMS', message: 'Invalid notification ID' } };
    }

    const { id } = parsed.data;
    const userId = request.user.userId;

    try {
      await notificationService.deleteNotification(id, userId);
      return { success: true };
    } catch (error) {
      reply.code(404);
      return { error: { code: 'NOT_FOUND', message: 'Notification not found' } };
    }
  });
};

export default notificationsRoutes;
