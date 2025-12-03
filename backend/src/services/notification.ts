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

  async deleteNotification(id: number, userId: number) {
    const notification = await prisma.notification.findUnique({
      where: { id },
    });

    if (!notification || notification.userId !== userId) {
      throw new Error('Notification not found or unauthorized');
    }

    return prisma.notification.delete({
      where: { id },
    });
  }

  async deleteNotificationByRequestId(requestId: number) {
    // Find notifications with type FRIEND_REQUEST and data containing the requestId
    const notifications = await prisma.notification.findMany({
      where: {
        type: 'FRIEND_REQUEST',
      },
    });

    // Filter in memory because data is JSON string
    const target = notifications.find(n => {
      try {
        const data = n.data ? JSON.parse(n.data) : {};
        return data.requestId === requestId;
      } catch {
        return false;
      }
    });

    if (target) {
      await prisma.notification.delete({ where: { id: target.id } });
      this.emit('notification_deleted', { id: target.id, userId: target.userId });
    }
  }

  async cancelFriendRequestNotification(requestId: number) {
    const notifications = await prisma.notification.findMany({
      where: {
        type: 'FRIEND_REQUEST',
      },
    });

    const target = notifications.find(n => {
      try {
        const data = n.data ? JSON.parse(n.data) : {};
        return data.requestId === requestId;
      } catch {
        return false;
      }
    });

    if (target) {
      const updatedNotification = await prisma.notification.update({
        where: { id: target.id },
        data: {
          type: 'SYSTEM',
          body: (target.body || target.title) + ' (Cancelled)',
        },
      });
      this.emit('notification', updatedNotification);
    }
  }
}

export const notificationService = new NotificationService();
