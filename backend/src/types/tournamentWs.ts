export type TournamentInvalidPayload = {
  tournamentId: number
  reason: 'participant_left' | 'server_error' | string
  userId?: number
}

export type MatchEventPayload = {
  matchId?: number
  sessionId?: string
  type: 'CONNECTED' | 'MATCH_FOUND' | 'UNAVAILABLE' | 'PENDING' | 'RUNNING' | 'FINISHED' | string
  message?: string
  slot?: 'p1' | 'p2'
  waiting?: boolean
}

export type WSOutgoing = {
  event: 'match:event' | 'tournament:update' | 'tournament_invalid' | string
  payload: any
}

export type NextMatchRequest = {
  tournamentId: number
  matchId: number
}

export type ReportMatchResultBody = {
  winnerUserId: number
  scoreA: number
  scoreB: number
}
