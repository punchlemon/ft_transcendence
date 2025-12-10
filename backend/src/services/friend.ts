import { prisma } from '../utils/prisma';
import { notificationService } from './notification';
import { chatService } from './chat';
import { EventEmitter } from 'events';
import { enqueuePrismaWork } from '../utils/prismaQueue';

export class FriendService extends EventEmitter {
  async sendFriendRequest(senderId: number, receiverId: number) {
    if (senderId === receiverId) throw new Error("Cannot friend yourself");

    // Check if blocked
    const block = await prisma.blocklist.findFirst({
      where: {
        OR: [
          { blockerId: receiverId, blockedId: senderId },
          { blockerId: senderId, blockedId: receiverId },
        ],
      },
    });

    if (block) {
      throw new Error("Cannot send friend request: User is blocked");
    }

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

    // Check existing request
    const existingRequest = await prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId
        }
      }
    });

    const request = await enqueuePrismaWork(async () => {
      let req;
      if (existingRequest) {
        if (existingRequest.status === 'PENDING') throw new Error("Request already pending");
        // Update existing request
        req = await prisma.friendRequest.update({
          where: { id: existingRequest.id },
          data: {
            status: 'PENDING',
            createdAt: new Date(), // Refresh timestamp
          },
        });
      } else {
        // Create new request
        req = await prisma.friendRequest.create({
          data: {
            senderId,
            receiverId,
            status: 'PENDING',
          },
        });
      }
      return req;
    });

    const sender = await prisma.user.findUnique({ where: { id: senderId } });
    await notificationService.createNotification(
      receiverId,
      'FRIEND_REQUEST',
      'New Friend Request',
      `${sender?.displayName} sent you a friend request`,
      { requestId: request.id, senderId }
    );

    this.emit('friend_request_sent', { 
      senderId, 
      receiverId, 
      requestId: request.id 
    });

    return request;
  }

  async acceptFriendRequest(requestId: number, userId: number) {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== userId) throw new Error("Not authorized");
    if (request.status !== 'PENDING') throw new Error("Request not pending");

    await enqueuePrismaWork(async () => {
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
    });

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

    this.emit('friend_accepted', { 
      requesterId: request.senderId, 
      addresseeId: request.receiverId 
    });
  }

  async declineFriendRequest(requestId: number, userId: number) {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new Error("Request not found");
    if (request.receiverId !== userId) throw new Error("Not authorized");
    if (request.status !== 'PENDING') throw new Error("Request not pending");

    await enqueuePrismaWork(async () => {
      await prisma.friendRequest.delete({ where: { id: requestId } });
    });

    // Remove notification from receiver
    await notificationService.deleteNotificationByRequestId(requestId);

    this.emit('friend_request_declined', { 
      senderId: request.senderId, 
      receiverId: request.receiverId, 
      requestId 
    });
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

    await enqueuePrismaWork(async () => {
      await prisma.friendship.delete({ where: { id: friendship.id } });
    });

    const actor = await prisma.user.findUnique({ where: { id: userId } });
    await notificationService.createNotification(
      friendId,
      'SYSTEM',
      'Friend Removed',
      `${actor?.displayName} removed you from their friends list`,
      { friendId: userId }
    );

    this.emit('friend_removed', { requesterId: userId, addresseeId: friendId });
  }

  async blockUser(blockerId: number, blockedId: number) {
    if (blockerId === blockedId) throw new Error("Cannot block yourself");

    // Create block entry
    // Note: We do NOT remove friendship here anymore, as requested.
    // Friend state and Block state are decoupled.

    const block = await enqueuePrismaWork(async () => {
      return prisma.blocklist.create({ data: { blockerId, blockedId } });
    });

    this.emit('user_blocked', { blockerId, blockedId });
    return block;
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

    await enqueuePrismaWork(async () => {
      await prisma.blocklist.delete({ where: { id: block.id } });
    });
    this.emit('user_unblocked', { blockerId, blockedId });
    return block;
  }

  async getBlockedUsers(userId: number) {
    const blocks = await prisma.blocklist.findMany({
      where: {
        blockerId: userId,
      },
      include: {
        blocked: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    return blocks.map(b => b.blocked);
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

    await enqueuePrismaWork(async () => {
      await prisma.friendRequest.delete({ where: { id: request.id } });
    });

    // Update notification for receiver to remove buttons
    await notificationService.cancelFriendRequestNotification(request.id);

    this.emit('friend_request_cancelled', { 
      senderId, 
      receiverId, 
      requestId: request.id 
    });
  }
}

export const friendService = new FriendService();
