import { prisma } from '../utils/prisma';
import { Channel, Message, ChannelMember, Prisma } from '@prisma/client';
import { EventEmitter } from 'events';

export class ChatService extends EventEmitter {
  async getOrCreateDmChannel(userId1: number, userId2: number) {
    console.log(`getOrCreateDmChannel: ${userId1}, ${userId2}`);
    const [minId, maxId] = [userId1, userId2].sort((a, b) => a - b);
    const slug = `dm-${minId}-${maxId}`;

    let channel = await prisma.channel.findUnique({
      where: { slug },
      include: { members: { include: { user: true } } },
    });

    if (!channel) {
      console.log(`Creating new DM channel: ${slug}`);
      try {
        channel = await prisma.channel.create({
          data: {
            name: `DM`,
            slug,
            type: 'DM',
            visibility: 'PRIVATE',
            ownerId: minId, // Arbitrary owner for DM
            members: {
              create: [
                { userId: minId, role: 'MEMBER' },
                { userId: maxId, role: 'MEMBER' },
              ],
            },
          },
          include: { members: { include: { user: true } } },
        });
        this.emit('channel_created', channel);
      } catch (e) {
        console.error('Failed to create DM channel:', e);
        throw e;
      }
    } else {
      console.log(`Found existing DM channel: ${channel.id}`);
    }

    return channel;
  }

  async createGroupChannel(
    name: string,
    ownerId: number,
    type: 'PUBLIC' | 'PRIVATE' | 'PROTECTED',
    password?: string
  ) {
    // Generate a unique slug from name + random suffix if needed
    let slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const existing = await prisma.channel.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    return prisma.channel.create({
      data: {
        name,
        slug,
        type,
        visibility: type === 'PUBLIC' ? 'OPEN' : 'CLOSED',
        ownerId,
        passwordHash: password, // In real app, hash this!
        members: {
          create: { userId: ownerId, role: 'OWNER' },
        },
      },
    });
  }

  async sendMessage(channelId: number, userId: number, content: string) {
    // Check if user is member
    const member = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    if (!member) {
      throw new Error('User is not a member of this channel');
    }

    if (member.mutedUntil && member.mutedUntil > new Date()) {
      throw new Error('User is muted');
    }

    // Check for blocks in DM
    const channel = await prisma.channel.findUnique({
      where: { id: channelId },
      include: { members: true }
    });

    if (channel?.type === 'DM') {
      const otherMember = channel.members.find(m => m.userId !== userId);
      if (otherMember) {
        const blocked = await prisma.blocklist.findFirst({
          where: {
            blockerId: otherMember.userId,
            blockedId: userId
          }
        });
        if (blocked) {
          // Stealth block: Return fake message, do not save, do not emit
          const sender = await prisma.user.findUnique({ where: { id: userId } });
          return {
            id: -Math.floor(Math.random() * 1000000), // Fake ID
            channelId,
            userId,
            content,
            sentAt: new Date(),
            user: {
              id: sender?.id || userId,
              displayName: sender?.displayName || 'You',
              avatarUrl: sender?.avatarUrl || null,
            },
          } as any;
        }
        // Also check if sender blocked the recipient (optional, but usually you can't DM someone you blocked either)
        const blocking = await prisma.blocklist.findFirst({
          where: {
            blockerId: userId,
            blockedId: otherMember.userId
          }
        });
        if (blocking) {
          throw new Error('Cannot send message: You have blocked this user');
        }
      }
    }

    const message = await prisma.message.create({
      data: {
        channelId,
        userId,
        content,
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            login: true,
          },
        },
      },
    });

    this.emit('message', message);
    return message;
  }

  async getMessages(channelId: number, limit = 50, beforeId?: number) {
    return prisma.message.findMany({
      where: {
        channelId,
        ...(beforeId ? { id: { lt: beforeId } } : {}),
      },
      take: limit,
      orderBy: {
        id: 'desc',
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            login: true,
          },
        },
      },
    });
  }

  async getUserChannels(userId: number) {
    return prisma.channel.findMany({
      where: {
        members: {
          some: {
            userId,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                status: true,
                avatarUrl: true,
                login: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: {
            sentAt: 'desc',
          },
        },
      },
    });
  }

  async isMember(channelId: number, userId: number): Promise<boolean> {
    const count = await prisma.channelMember.count({
      where: {
        channelId,
        userId,
      },
    });
    return count > 0;
  }
  
  async joinChannel(channelId: number, userId: number, password?: string) {
      const channel = await prisma.channel.findUnique({ where: { id: channelId } });
      if (!channel) throw new Error("Channel not found");
      
      if (channel.type === 'PROTECTED' && channel.passwordHash !== password) {
          throw new Error("Invalid password");
      }
      
      if (channel.type === 'PRIVATE') {
          throw new Error("Cannot join private channel without invite");
      }

      return prisma.channelMember.create({
          data: {
              channelId,
              userId,
              role: 'MEMBER'
          }
      });
  }

  async markAsRead(channelId: number, userId: number) {
    const member = await prisma.channelMember.findFirst({
      where: {
        channelId,
        userId,
      },
    });

    if (!member) {
      throw new Error('Member not found');
    }

    const updated = await prisma.channelMember.update({
      where: {
        id: member.id,
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    console.log(`[Service] 📖 Emitting read event: channelId=${channelId}, userId=${userId}, lastReadAt=${updated.lastReadAt}`);
    this.emit('read', { channelId, userId, lastReadAt: updated.lastReadAt });
    console.log(`[Service] ✅ read event emitted`);
    return updated;
  }

  async getUnreadCount(channelId: number, userId: number) {
    const member = await prisma.channelMember.findUnique({
      where: {
        channelId_userId: {
          channelId,
          userId,
        },
      },
    });

    if (!member) return 0;

    return prisma.message.count({
      where: {
        channelId,
        sentAt: {
          gt: member.lastReadAt,
        },
      },
    });
  }
}

export const chatService = new ChatService();
