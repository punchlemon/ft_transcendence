/**
 * なぜテストが必要か:
 * - トーナメント登録ロジックの正規化・重複排除が破綻すると組み合わせが壊れるため、純粋関数として検証する。
 * - マッチ生成と進行制御が仕様通りに動くかをユニットテストで保証し、UI 実装より前に不整合を検知する。
 */
import { describe, it, expect } from 'vitest'
import {
  normalizeAlias,
  aliasExists,
  buildMatchQueue,
  findNextMatch,
  advanceToNextMatch
} from './tournament'

describe('tournament helpers', () => {
  it('normalizes alias by trimming spaces', () => {
    expect(normalizeAlias('  Alice   Wonderland ')).toBe('Alice Wonderland')
  })

  it('detects duplicate alias regardless of case', () => {
    const players = ['Apollo', 'Hermes']
    expect(aliasExists(players, 'apollo')).toBe(true)
    expect(aliasExists(players, 'Zephyr')).toBe(false)
  })

  it('builds match queue and keeps odd player as bye', () => {
    const queue = buildMatchQueue(['Luna', 'Nova', 'Orion'])
    expect(queue).toHaveLength(2)
    expect(queue[0].players).toEqual(['Luna', 'Nova'])
    expect(queue[1].players).toEqual(['Orion', null])
  })

  it('returns null when there is no current match', () => {
    const queue = buildMatchQueue(['Kai', 'Mira'])
    expect(findNextMatch(queue, -1)).toBeNull()
  })

  it('advances through the queue and resets after the last match', () => {
    const queue = buildMatchQueue(['A', 'B', 'C', 'D'])
    const afterFirst = advanceToNextMatch(queue, 0)
    expect(afterFirst).toBe(1)
    const afterLast = advanceToNextMatch(queue, queue.length - 1)
    expect(afterLast).toBe(-1)
  })
})

/*
解説:

1) コメント / import 群
  - トーナメントユーティリティの純粋関数を対象にテストを定義し、`vitest` の `describe/it` を利用する。

2) normalizeAlias / aliasExists のテスト
  - 余分な空白や大文字小文字の差異を吸収しつつ、重複検出が正しく機能することを保証する。

3) buildMatchQueue / findNextMatch / advanceToNextMatch のテスト
  - 奇数人数での BYE 生成や、マッチ進行が末尾でリセットされる挙動を検証し、UI 層から独立した信頼性を確保する。
*/
