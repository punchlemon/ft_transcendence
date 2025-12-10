# トーナメント — WS / REST 仕様

このドキュメントはトーナメント関連の WebSocket イベントと REST API の最低限の仕様を定義します。実装の整合性を取るためのリファレンスです。

## WebSocket イベント（サーバ → クライアント）

- `tournament_invalid`
  - 説明: トーナメントが無効化（参加者離脱など）された。クライアントは該当トーナメント画面を閉じる/更新する。
  - payload:
    - `tournamentId`: number
    - `reason`: string (`participant_left` | `server_error` | ...)
    - `userId?`: number (離脱したユーザー ID がわかる場合)

- `tournament_update`
  - 説明: トーナメントの状態が変更された（マッチ開始、終了、参加者更新など）。ブロードキャスト向け。
  - payload:
    - `tournamentId`: number
    - `patch`: object (差分、もしくは再取得フラグ)

- `match_state`
  - 説明: 個別マッチの状態更新（PENDING → RUNNING → FINISHED 等）。通常は対象の `local-match-<id>` セッションで利用。
  - payload:
    - `matchId`: number
    - `status`: string
    - `data?`: any

## WebSocket イベント（クライアント → サーバ）

- `next_match_request`
  - 説明: 当事者が次の試合を開始するリクエストを送る。サーバ側で当事者/接続状況を検証して許可する。
  - payload:
    - `tournamentId`: number
    - `matchId`: number
  - サーバ動作:
    - 発行者が `matchId` の当事者のいずれかであることを検証。
    - 両当事者が接続済みであることを確認（ルーム内のアクティブ socket カウントなど）。
    - 検証成功 → `match_state` を `RUNNING` に更新し、関連クライアントに通知。
    - 検証失敗 → エラー応答（403 / WS error event）を返す。

- `report_match_result` (補助：単純な通知。基本は REST で行う)
  - payload:
    - `matchId`: number
    - `winnerUserId`: number
    - `scoreA`: number
    - `scoreB`: number

## REST API

- POST `/api/tournaments/matches/:matchId/result`
  - 説明: クライアント（通常は試合ホスト or マッチ終了時のサーバ処理）が試合結果をサーバに送信する。
  - Body:
    - `{ winnerUserId: number, scoreA: number, scoreB: number }`
  - 認可:
    - リクエスト送信者が `winnerUserId` と同一のログインユーザー、またはサーバ側で許可されたプロセスであること（JWT あるいは内部キー）。
    - 受信後サーバは `tournamentService.handleMatchResult` を呼び、勝者の反映・次ラウンド進出・トーナメント完了判定を行う。
  - 返却:
    - 200: 成功。更新済みのトーナメント or マッチ情報を返す。
    - 400/403/404: エラー（不正データ、権限不足、見つからないマッチ）

## 権限モデル（簡易）

- `owner`: トーナメント作成者。招待の送信、トーナメントのキャンセル等が可能。
- `participant`: 参加者。自分が割り当てられたマッチに対する `next_match_request` 等を送れる。
- `spectator`: 観戦者。読み取り専用、入力や進行操作は不可。

## エッジケース／運用ルール

- マルチタブ / 複数 socket を持つクライアント: ユーザー単位で room 内のアクティブ socket カウントを管理し、完全に全てのソケットが抜けたときに "参加者が離脱" と見なす実装が推奨される。
- 即時無効化ポリシー: 現行の厳格ポリシー（任意の socket unregister で即無効化）を維持する場合、ドキュメントで明示すること。

---

必要があれば上記を元に API スキーマ（OpenAPI）や具体的なペイロード TypeScript 型を生成します。