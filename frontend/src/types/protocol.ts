/**
 * Frontend copy of backend socket protocol types.
 *
 * This file is currently a manual copy for type clarity in the frontend.
 * In the future consider extracting into a shared package.
 */

export enum SocketEvent {
  CHAT_MESSAGE = 'chat:message',
  CHAT_JOIN = 'chat:join',
  CHAT_LEAVE = 'chat:leave',
  CHAT_TYPING = 'chat:typing',

  GAME_CREATE = 'game:create',
  GAME_JOIN = 'game:join',
  GAME_LEAVE = 'game:leave',
  GAME_STATE = 'game:state',
  GAME_MOVE = 'game:move',

  PING = 'ping',
  PONG = 'pong',
}

export interface BaseEvent<T = unknown> {
  type: SocketEvent;
  payload: T;
}

export interface ChatMessagePayload {
  roomId?: string;
  channelId?: string;
  senderId: number;
  senderDisplayName?: string | null;
  content: string;
  sentAt?: string;
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

export type ChatEventPayloads = ChatMessagePayload | ChatMembershipPayload | ChatTypingPayload;

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
  data: unknown;
}

export type GameEventPayloads = GameCreatePayload | GameJoinPayload | GameMovePayload | { matchId: string };

export type ChatEvent = BaseEvent<ChatEventPayloads>;
export type GameEvent = BaseEvent<GameEventPayloads>;
export type SocketAnyEvent = ChatEvent | GameEvent | BaseEvent<unknown>;

export type PayloadFor<T extends SocketEvent> =
  T extends SocketEvent.CHAT_MESSAGE ? ChatMessagePayload :
  T extends SocketEvent.CHAT_JOIN ? ChatMembershipPayload :
  T extends SocketEvent.CHAT_LEAVE ? ChatMembershipPayload :
  T extends SocketEvent.CHAT_TYPING ? ChatTypingPayload :
  T extends SocketEvent.GAME_CREATE ? GameCreatePayload :
  T extends SocketEvent.GAME_JOIN ? GameJoinPayload :
  T extends SocketEvent.GAME_MOVE ? GameMovePayload :
  unknown;

export default { SocketEvent };
