export interface MatchQueueItem {
  id: string
  players: [string, string | null]
}

const MATCH_PREFIX = 'match-'

export const normalizeAlias = (alias: string): string => alias.trim().replace(/\s+/g, ' ')

export const aliasExists = (players: string[], candidate: string): boolean => {
  const normalizedCandidate = normalizeAlias(candidate).toLowerCase()
  return players.some((entry) => normalizeAlias(entry).toLowerCase() === normalizedCandidate)
}

export const buildMatchQueue = (players: string[]): MatchQueueItem[] => {
  const normalizedPlayers: string[] = []
  const seen = new Set<string>()

  players.forEach((player) => {
    const normalized = normalizeAlias(player)
    if (!normalized) {
      return
    }
    const key = normalized.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      normalizedPlayers.push(normalized)
    }
  })

  const queue: MatchQueueItem[] = []
  for (let index = 0; index < normalizedPlayers.length; index += 2) {
    queue.push({
      id: `${MATCH_PREFIX}${queue.length + 1}`,
      players: [normalizedPlayers[index], normalizedPlayers[index + 1] ?? null]
    })
  }

  return queue
}

export const findNextMatch = (queue: MatchQueueItem[], currentIndex: number): MatchQueueItem | null => {
  if (!queue.length || currentIndex < 0 || currentIndex >= queue.length) {
    return null
  }
  return queue[currentIndex]
}

export const advanceToNextMatch = (queue: MatchQueueItem[], currentIndex: number): number => {
  if (!queue.length) {
    return -1
  }
  const nextIndex = currentIndex + 1
  return nextIndex < queue.length ? nextIndex : -1
}

/*
解説:

1) MatchQueueItem インターフェース
  - トーナメントの各試合を ID と参加者 2 名 (または BYE 用の null) で表現し、UI から扱いやすい構造にする。

2) normalizeAlias / aliasExists
  - エイリアスの余分な空白を取り除き、大小文字を区別せずに重複チェックするヘルパー関数。登録段階とマッチ生成で一貫した正規化を保証する。

3) buildMatchQueue
  - 正規化・重複排除したプレイヤー配列から 2 人ずつペアを組み、奇数の場合は null をセットして BYE を表現する。ID には連番 prefix を使用し、テストや UI で参照しやすくする。

4) findNextMatch / advanceToNextMatch
  - 現在のマッチを取り出す、または次へ進める純粋関数。キューが空の場合は -1 / null を返して UI のボタン制御に利用しやすくしている。
*/
