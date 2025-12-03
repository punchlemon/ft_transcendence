import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../app';
import { prisma } from '../utils/prisma';

describe('Friend Routes', () => {
  let server: any;
  let user1Token: string;
  let user2Token: string;
  let user1Id: number;
  let user2Id: number;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(async () => {
    // Chat related
    await prisma.message.deleteMany()
    await prisma.channelMember.deleteMany()
    await prisma.channelInvite.deleteMany()
    await prisma.channelBan.deleteMany()
    await prisma.channel.deleteMany()
    await prisma.partyMember.deleteMany()
    await prisma.partyInvite.deleteMany()
    await prisma.party.deleteMany()
    
    // Auth related
    await prisma.session.deleteMany()
    await prisma.oAuthAccount.deleteMany()
    await prisma.mfaChallenge.deleteMany()
    await prisma.twoFactorBackupCode.deleteMany()
    
    // Tournament related
    await prisma.tournamentMatch.deleteMany()
    await prisma.tournamentParticipant.deleteMany()
    await prisma.tournament.deleteMany()

    // Social related
    await prisma.friendship.deleteMany()
    await prisma.blocklist.deleteMany()
    await prisma.friendRequest.deleteMany()
    await prisma.notification.deleteMany()

    // Game related
    await prisma.matchResult.deleteMany()
    await prisma.matchRound.deleteMany()
    await prisma.penalty.deleteMany()
    await prisma.match.deleteMany()
    await prisma.userStats.deleteMany()
    // await prisma.ladderProfile.deleteMany()
    await prisma.ladderEnrollment.deleteMany()
    await prisma.userAchievement.deleteMany()
    await prisma.inventoryItem.deleteMany()
    await prisma.transaction.deleteMany()
    await prisma.wallet.deleteMany()
    await prisma.auditLog.deleteMany()

    // User related
    await prisma.user.deleteMany()

    // Create users
    const user1 = await prisma.user.create({
      data: { login: 'u1', email: 'u1@e.com', displayName: 'U1', passwordHash: 'h' },
    });
    user1Id = user1.id;
    const session1 = await prisma.session.create({
      data: { userId: user1.id, token: 't1', expiresAt: new Date(Date.now() + 10000) },
    });
    user1Token = server.jwt.sign({ userId: user1.id, sessionId: session1.id });

    const user2 = await prisma.user.create({
      data: { login: 'u2', email: 'u2@e.com', displayName: 'U2', passwordHash: 'h' },
    });
    user2Id = user2.id;
    const session2 = await prisma.session.create({
      data: { userId: user2.id, token: 't2', expiresAt: new Date(Date.now() + 10000) },
    });
    user2Token = server.jwt.sign({ userId: user2.id, sessionId: session2.id });
  });

  it('should send friend request', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/friends/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.data.status).toBe('PENDING');
  });

  it('should accept friend request', async () => {
    // Send request
    const reqRes = await server.inject({
      method: 'POST',
      url: `/api/friends/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const requestId = JSON.parse(reqRes.payload).data.id;

    // Accept
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/friends/${requestId}`,
      headers: { Authorization: `Bearer ${user2Token}` },
      payload: { action: 'ACCEPT' },
    });
    expect(res.statusCode).toBe(200);

    // Check friendship
    const friendsRes = await server.inject({
      method: 'GET',
      url: '/api/friends',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    const friends = JSON.parse(friendsRes.payload).data;
    expect(friends).toHaveLength(1);
    expect(friends[0].id).toBe(user2Id);
  });

  it('should block user', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/blocks/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(res.statusCode).toBe(200);

    // Try to send friend request (should fail)
    const reqRes = await server.inject({
      method: 'POST',
      url: `/api/friends/${user1Id}`,
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(reqRes.statusCode).toBe(400);
  });

  it('should list sent and received friend requests', async () => {
    // Send request from U1 to U2
    await server.inject({
      method: 'POST',
      url: `/api/friends/${user2Id}`,
      headers: { Authorization: `Bearer ${user1Token}` },
    });

    // Check U1 sent requests
    const sentRes = await server.inject({
      method: 'GET',
      url: '/api/friends/requests/sent',
      headers: { Authorization: `Bearer ${user1Token}` },
    });
    expect(sentRes.statusCode).toBe(200);
    const sentData = JSON.parse(sentRes.payload).data;
    expect(sentData).toHaveLength(1);
    expect(sentData[0].receiver.id).toBe(user2Id);

    // Check U2 received requests
    const receivedRes = await server.inject({
      method: 'GET',
      url: '/api/friends/requests/received',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(receivedRes.statusCode).toBe(200);
    const receivedData = JSON.parse(receivedRes.payload).data;
    expect(receivedData).toHaveLength(1);
    expect(receivedData[0].sender.id).toBe(user1Id);
  });
});
