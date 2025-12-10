/**
 * Central protocol types and enums for socket events.
 *
 * Purpose: provide a single place to inspect event names, enums and payload shapes
 * so the design of socket messages is clear and easily shared between backend
 * and frontend (or copied/shared later).
 */

export enum SocketEvent {
  // Chat-related
  CHAT_MESSAGE = 'chat:message',
  CHAT_JOIN = 'chat:join',
  CHAT_LEAVE = 'chat:leave',
  CHAT_TYPING = 'chat:typing',

  // Game-related
  GAME_CREATE = 'game:create',
  GAME_JOIN = 'game:join',
  GAME_LEAVE = 'game:leave',
  GAME_STATE = 'game:state',
  GAME_MOVE = 'game:move',

  // Control / keepalive
  PING = 'ping',
  PONG = 'pong',
  
  // Tournament-related
  TOURNAMENT_INVITE = 'tournament:invite',
  JOIN_TOURNAMENT_ROOM = 'tournament:join_room',
  TOURNAMENT_ROOM_JOINED = 'tournament:room_joined',
  TOURNAMENT_ROOM_LEFT = 'tournament:room_left',
}

/** Generic wrapper for socket events */
export interface BaseEvent<T = unknown> {
  type: SocketEvent;
  payload: T;
}

/* ===== Chat payloads ===== */
export interface ChatMessagePayload {
  /** Compatible with existing code which sometimes uses `channelId` */
  roomId?: string;
  channelId?: string;
  senderId: number;
  senderDisplayName?: string | null;
  content: string;
  sentAt?: string; // ISO timestamp
}

export interface ChatMembershipPayload {
  roomId: string;
  userId: number;
}

export interface ChatTypingPayload {
  roomId: string;
  userId: number;
  isTyping: boolean;
}

/* ===== Tournament payloads ===== */
export interface TournamentInvitePayload {
  roomId: number;
  tournamentId: number;
  ownerId: number;
  ownerDisplayName?: string;
  message?: string;
}

export interface TournamentRoomJoinedPayload {
  roomId: number;
  userId: number;
  displayName?: string;
}

export type ChatEventPayloads = ChatMessagePayload | ChatMembershipPayload | ChatTypingPayload;

/* ===== Game payloads (minimal shapes) ===== */
export interface GameCreatePayload {
  matchId: string;
  creatorId: number;
}

export interface GameJoinPayload {
  matchId: string;
  playerId: number;
}

export interface GameMovePayload {
  matchId: string;
  playerId: number;
  // game-specific move data — keep flexible
  data: unknown;
}

export type GameEventPayloads = GameCreatePayload | GameJoinPayload | GameMovePayload | { matchId: string };

/* Convenience typed event unions */
export type ChatEvent = BaseEvent<ChatEventPayloads>;
export type GameEvent = BaseEvent<GameEventPayloads>;

export type SocketAnyEvent = ChatEvent | GameEvent | BaseEvent<unknown>;

/** Utility type to extract payload by SocketEvent */
export type PayloadFor<T extends SocketEvent> =
  T extends SocketEvent.CHAT_MESSAGE ? ChatMessagePayload :
  T extends SocketEvent.CHAT_JOIN ? ChatMembershipPayload :
  T extends SocketEvent.CHAT_LEAVE ? ChatMembershipPayload :
  T extends SocketEvent.CHAT_TYPING ? ChatTypingPayload :
  T extends SocketEvent.GAME_CREATE ? GameCreatePayload :
  T extends SocketEvent.GAME_JOIN ? GameJoinPayload :
  T extends SocketEvent.GAME_MOVE ? GameMovePayload :
  T extends SocketEvent.TOURNAMENT_INVITE ? TournamentInvitePayload :
  T extends SocketEvent.JOIN_TOURNAMENT_ROOM ? { roomId: number } :
  T extends SocketEvent.TOURNAMENT_ROOM_JOINED ? TournamentRoomJoinedPayload :
  unknown;

export default {
  SocketEvent,
};
