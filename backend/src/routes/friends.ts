import { FastifyPluginAsync } from 'fastify';
import { friendService } from '../services/friend';
import { z } from 'zod';

const friendRoutes: FastifyPluginAsync = async (fastify) => {
  // List friends
  fastify.get('/friends', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const userId = request.user.userId;
    const friends = await friendService.getFriends(userId);
    return { data: friends };
  });

  // Send friend request
  const userIdParamSchema = z.object({
    userId: z.string().transform(Number),
  });

  fastify.post('/friends/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetId } = userIdParamSchema.parse(request.params);
    const userId = request.user.userId;

    try {
      const req = await friendService.sendFriendRequest(userId, targetId);
      return { data: req };
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'FRIEND_REQUEST_FAILED', message: error.message } });
    }
  });

  // Accept/Decline request
  const requestIdParamSchema = z.object({
    requestId: z.string().transform(Number),
  });
  const actionBodySchema = z.object({
    action: z.enum(['ACCEPT', 'DECLINE']),
  });

  fastify.patch('/friends/:requestId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { requestId } = requestIdParamSchema.parse(request.params);
    const { action } = actionBodySchema.parse(request.body);
    const userId = request.user.userId;

    try {
      if (action === 'ACCEPT') {
        await friendService.acceptFriendRequest(requestId, userId);
      } else {
        await fastify.prisma.friendRequest.update({
            where: { id: requestId },
            data: { status: 'DECLINED' }
        });
      }
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'ACTION_FAILED', message: error.message } });
    }
  });

  // Remove friend
  fastify.delete('/friends/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetId } = userIdParamSchema.parse(request.params);
    const userId = request.user.userId;

    try {
      await friendService.removeFriend(userId, targetId);
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'REMOVE_FAILED', message: error.message } });
    }
  });

  // Block user
  fastify.post('/blocks/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetId } = userIdParamSchema.parse(request.params);
    const userId = request.user.userId;

    try {
      await friendService.blockUser(userId, targetId);
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'BLOCK_FAILED', message: error.message } });
    }
  });

  // Unblock user
  fastify.delete('/blocks/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    const { userId: targetId } = userIdParamSchema.parse(request.params);
    const userId = request.user.userId;

    try {
      await friendService.unblockUser(userId, targetId);
      return { success: true };
    } catch (error: any) {
      return reply.status(400).send({ error: { code: 'UNBLOCK_FAILED', message: error.message } });
    }
  });
};

export default friendRoutes;
