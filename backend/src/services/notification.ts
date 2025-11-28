import { prisma } from '../utils/prisma';
import { EventEmitter } from 'events';

export type NotificationType = 
  | 'FRIEND_REQUEST'
  | 'FRIEND_RESPONSE'
  | 'MATCH_INVITE'
  | 'TOURNAMENT_INVITE'
  | 'CHAT_MENTION'
  | 'SYSTEM';

export class NotificationService extends EventEmitter {
  async createNotification(
    userId: number,
    type: NotificationType,
    title: string,
    body?: string,
    data?: any
  ) {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body,
        data: data ? JSON.stringify(data) : null,
      },
    });

    this.emit('notification', notification);
    return notification;
  }

  async getNotifications(userId: number, limit = 20, unreadOnly = false) {
    return prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAsRead(notificationId: number, userId: number) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(userId: number) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}

export const notificationService = new NotificationService();
