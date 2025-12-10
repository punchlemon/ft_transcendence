# Prisma Query Engine native panic — reproduction report (draft)

作成日: 2025-12-10
作業ブランチ: `feat/extract-game-socket-handler`

## 概要

Vitest による統合テスト実行中に Node プロセスが SIGABRT (exit 134) で abort します。lldb によるネイティブ backtrace では `libquery_engine-darwin-arm64.dylib.node`（Prisma query engine）内の匿名シンボル群のスタックが含まれ、`napi_call_threadsafe_function` / `uv_mutex_lock` 関連フレームが見られます。アプリ側で Prisma の複数並列書き込みを逐次化する緩和策を実装しましたが、再現は依然確率的に発生します。

## 影響範囲
- リポジトリ: `ft_transcendence`（バックエンド）
- Prisma Client: `@prisma/client` v5.22.0
- OS: macOS 15.5 (arm64e)
- Node: v22.16.0 (nvm)
- テスト: Vitest v1.6.1
- libquery_engine: `libquery_engine-darwin-arm64.dylib.node`

## 再現手順（最小）
1. backend ディレクトリへ移動

```bash
cd backend
```

2. library モードでテストを実行（再現ループ）

```bash
PRISMA_CLIENT_ENGINE_TYPE=library npx vitest run src/game/__tests__/GameSocketHandler.integration.test.ts
```

3. または短い再現ループ（端末で繰り返し）

```bash
for i in $(seq 1 50); do
  PRISMA_CLIENT_ENGINE_TYPE=library npx vitest run src/game/__tests__/GameSocketHandler.integration.test.ts > tmp/repro/run_${i}.log 2>&1 || { echo "EXIT:$? at run $i"; break; }
done
```

4. binary モードの挙動切り分け（参考）

```bash
PRISMA_CLIENT_ENGINE_TYPE=binary npx vitest run src/game/__tests__/GameSocketHandler.integration.test.ts > tmp/repro_binary.log 2>&1; echo EXIT:$?
```

- binary モードでは PrismaClient の初期化エラーが観測されるケースがある（`PrismaClientValidationError`）。

## 取得済みログ / アーティファクト
- lldb backtraces:
  - `backend/tmp/lldb_bt_1765363568.log`
  - `backend/tmp/lldb_bt_after_1765364471.log`
- 再現ログ:
  - `backend/tmp/repro/run.log`
  - `backend/tmp/repro_after/run.log`
  - `backend/tmp/repro_binary.log`

## 発生時の特徴
- シグナル: SIGABRT (exit 134)
- スレッド: `tokio-runtime-worker` などのワーカー上で abort
- 主要フレーム: `abort` -> `uv_mutex_lock` -> `napi_call_threadsafe_function` -> `libquery_engine` 内部シンボル

## これまでのアプリ側対処（緩和策）
- `backend/src/utils/prismaQueue.ts` を追加／拡張し、Prisma 書き込みを逐次化する `enqueuePrismaWork<T>()` を実装。呼び出し元で await できるように Promise を返す仕様。
- `GameManager`, `matchPersistence`, `tournamentService`, `friend` などの主要箇所で重要な mutation をキュー化したが、再現は依然あり。

## 追加情報 / 再現性
- 再現は確率的だが高い（複数回の短期ループで初回の run で abort が観測されることが多い）。

## 要求
1. Prisma チーム側で libquery_engine のネイティブ panic を解析してほしい（逆引きシンボルや N-API の thread-safety に関する調査）。
2. 必要ならば core dump / full lldb session を追加で提供する。

## 添付候補
- 上記ログファイル（`backend/tmp/...`）
- 再現コマンド
- 変更差分のパッチ（`feat/extract-game-socket-handler` ブランチ）

---

(この下書きはローカルで保存しました。内容確認後、必要なら編集して GitHub issue に貼ってください。)