import { prisma } from '../utils/prisma';
import { notificationService } from './notification';
import { chatService } from './chat';

export class FriendService {
  async sendFriendRequest(senderId: number, receiverId: number) {
    if (senderId === receiverId) throw new Error("Cannot friend yourself");

    // Check if already friends
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: senderId, addresseeId: receiverId },
          { requesterId: receiverId, addresseeId: senderId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'ACCEPTED') throw new Error("Already friends");
      // If pending, maybe resend or ignore
    }

    // Check if blocked
    const blocked = await prisma.blocklist.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) throw new Error("Cannot send request due to block");

    // Check existing request
    const existingRequest = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId
        }
      }
    });
    if (existingRequest) {
        if (existingRequest.status === 'PENDING') throw new Error("Request already pending");
        // If rejected/expired, maybe allow new one
    }

    const request = await prisma.friendRequest.create({
      data: {
        senderId,
        receiverId,
        status: 'PENDING',
      },
    });

    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    await notificationService.createNotification(
      receiverId,
      'FRIEND_REQUEST',
      'New Friend Request',
      `${sender?.displayName} sent you a friend request`,
      { requestId: request.id, senderId }
    );

    return request;
  }

  async acceptFriendRequest(requestId: number, userId: number) {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== userId) throw new Error("Not authorized");
    if (request.status !== 'PENDING') throw new Error("Request not pending");

    // Create friendship
    await prisma.$transaction([
      prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'ACCEPTED' },
      }),
      prisma.friendship.create({
        data: {
          requesterId: request.senderId,
          addresseeId: request.receiverId,
          status: 'ACCEPTED',
        },
      }),
    ]);

    // Automatically create DM channel
    await chatService.getOrCreateDmChannel(request.senderId, request.receiverId);

    const receiver = await prisma.user.findUnique({ where: { id: userId } });
    await notificationService.createNotification(
      request.senderId,
      'FRIEND_RESPONSE',
      'Friend Request Accepted',
      `${receiver?.displayName} accepted your friend request`,
      { friendId: userId }
    );

    // Remove notification from receiver
    await notificationService.deleteNotificationByRequestId(requestId);
  }

  async declineFriendRequest(requestId: number, userId: number) {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== userId) throw new Error("Not authorized");
    if (request.status !== 'PENDING') throw new Error("Request not pending");

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'DECLINED' },
    });

    // Remove notification from receiver
    await notificationService.deleteNotificationByRequestId(requestId);
  }

  async removeFriend(userId: number, friendId: number) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: userId, addresseeId: friendId },
          { requesterId: friendId, addresseeId: userId },
        ],
      },
    });

    if (!friendship) throw new Error("Friendship not found");

    await prisma.friendship.delete({ where: { id: friendship.id } });

    const actor = await prisma.user.findUnique({ where: { id: userId } });
    await notificationService.createNotification(
      friendId,
      'SYSTEM',
      'Friend Removed',
      `${actor?.displayName} removed you from their friends list`,
      { friendId: userId }
    );
  }

  async blockUser(blockerId: number, blockedId: number) {
    if (blockerId === blockedId) throw new Error("Cannot block yourself");

    // Remove friendship if exists
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: blockerId, addresseeId: blockedId },
          { requesterId: blockedId, addresseeId: blockerId },
        ],
      },
    });

    if (friendship) {
      await prisma.friendship.delete({ where: { id: friendship.id } });
    }

    return prisma.blocklist.create({
      data: {
        blockerId,
        blockedId,
      },
    });
  }

  async unblockUser(blockerId: number, blockedId: number) {
    const block = await prisma.blocklist.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId,
        },
      },
    });

    if (!block) throw new Error("Block not found");

    return prisma.blocklist.delete({ where: { id: block.id } });
  }

  async getFriends(userId: number) {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: userId, status: 'ACCEPTED' },
          { addresseeId: userId, status: 'ACCEPTED' },
        ],
      },
      include: {
        requester: { select: { id: true, displayName: true, avatarUrl: true, status: true } },
        addressee: { select: { id: true, displayName: true, avatarUrl: true, status: true } },
      },
    });

    return friendships.map(f => f.requesterId === userId ? f.addressee : f.requester);
  }

  async getSentRequests(userId: number) {
    return prisma.friendRequest.findMany({
      where: {
        senderId: userId,
        status: 'PENDING',
      },
      include: {
        receiver: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async getReceivedRequests(userId: number) {
    return prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: 'PENDING',
      },
      include: {
        sender: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
  }

  async cancelFriendRequest(senderId: number, receiverId: number) {
    const request = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId
        }
      }
    });

    if (!request) throw new Error("Request not found");
    if (request.status !== 'PENDING') throw new Error("Request not pending");

    await prisma.friendRequest.delete({
      where: { id: request.id }
    });

    // Remove notification from receiver
    await notificationService.deleteNotificationByRequestId(request.id);
  }
}

export const friendService = new FriendService();
