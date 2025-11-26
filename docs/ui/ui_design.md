# UI 設計ドキュメント

本ドキュメントはフロントエンド SPA の画面要素・状態遷移を定義し、実装やテストの共通基準とする。初期フェーズで Home / HealthCheck / Tournament を整備済みだが、選択モジュール (認証 / プロフィール / ゲーム / チャット) を視野に入れ、サイト全体の骨格を以下に定義する。

## サイトマップ概要
```
Unauthenticated Routes
├─ /login
├─ /register
└─ /auth/2fa

Authenticated Routes (Layout 配下)
├─ /                    (Home)
├─ /health             (HealthCheck)
├─ /tournament         (Tournament)
├─ /game/new           (Game Lobby / Mode Select)
├─ /game/:id           (Game Room / Live Match)
├─ /profile/:id        (Profile Detail)
└─ /settings/account   (Account & 2FA Setup)

常駐オーバーレイ
├─ Chat Drawer (画面右下 / モバイルは全画面)
└─ Global Toast Stack (右上)
```

### ルーティング定義
| Path | 目的 | 認証要否 |
| --- | --- | --- |
| `/login` | ログインフォーム + OAuth ボタン | 不要 |
| `/register` | 登録フォーム + OAuth | 不要 |
| `/auth/2fa` | 2FA コード入力 | `mfaRequired` フラグにより遷移 |
| `/` | Dashboard 的エントリ (ニュース / CTA) | 必須 |
| `/health` | API ヘルスステータス確認 | 必須 |
| `/tournament` | トーナメント管理 | 必須 |
| `/game/new` | ロビー (モード選択 / 招待) | 必須 |
| `/game/:id` | 実際のチャネル (Canvas) | 必須 |
| `/profile/:id` | プロフィールビュー | 必須 (自身 or 他人) |
| `/settings/account` | アカウント設定 / 2FA セットアップ (QR, Secret, 有効化) | 必須 |
| `/chat` | optional: フルスクリーンチャット (モバイル) | 必須 |


### 共通レイアウト / ナビゲーション
- **ヘッダー (Navbar)**
  - 左: ロゴ + プロジェクト名。
  - 中央: ナビタブ (Home / Game / Tournament / Profile)。`Game` は `/game/new` へ遷移。
  - 右 (未ログイン時): 「ログイン」「新規登録」ボタン。
  - 右 (ログイン時): 通知ベル、チャットアイコン、アバター (クリックでドロップダウン: Profile, Settings, Logout)。
    - **通知ベルドロップダウン**: 最新 5 件をカード表示し、各カードにアクションボタンを付与。
      1. フレンド申請: 「承認」「拒否」。
      2. ゲーム招待 / トーナメント招待: 「参加」「辞退」。
      3. システム通知: 参照リンクボタン (例: "詳細を見る")。
    - アクション実行で即座に API 呼び出し → 成功時は通知をアーカイブし、トーストを表示。
- **フッター**: コピーライト表記、リリースバージョン、サポートリンクを中央揃えで表示。
- **トースト通知**: 画面右上に縦積み。情報/成功/警告/エラーの色分け。`toastStore` でどの画面からでも発火可能。
- **チャットウィジェット**: 画面右下固定のオーバーレイ (幅 320px)。モバイルではフッターボタン→フルスクリーンモーダル切替。
- **レスポンシブ**: ブレークポイント `sm` まではハンバーガー + ボトムタブ、`md` 以上でチャット/ナビを横配置。

## 0. Auth Stack
- **目的**: 標準ユーザ管理 + 2FA の導線をまとめる。
- **画面**:
  1. `Login` (`/login`): メール/パスワード + OAuth (42, Google) ボタンを縦配置。ログイン成功時に `mfaRequired` なら `/auth/2fa` へ。
  2. `Register` (`/register`): メール/パスワード + OAuth。初期プロフィール (表示名、アバター) 入力セクションを持つ。
  3. `2FA` (`/auth/2fa`): 6桁コード入力 + 「再送」「バックアップコードを使用」オプション。
- **設定ページ** (`/settings/account`):
  - 2FA セットアップカードを最上部に配置。QR コード (TOTP) とプレーンテキストのシークレットキーを同時に表示。
  - 「コードを再生成」「コピー」ボタンを備え、ユーザが Authenticator アプリに登録し終えたら「ワンタイムコード入力」を行うステップで有効化。
  - 有効化トグル (Enable 2FA) は、成功時に `authStore.user.mfaEnabled` を更新し、無効化時は再度本人確認モーダルを表示。
  - 下部にアカウント情報 (メール、ユーザタグ) の編集フォームを配置し、2FA 設定変更とは別のセクションで送信。
- **ステート**: `authStore` に `user`, `token`, `mfaRequired` を保持。フォーム送信時はローディングボタン + エラー枠。
- **テスト観点**: 入力バリデーション、エラー復帰、成功時の `useNavigate` 呼び出し。

## 1. Home Page
- **目的**: プロジェクト名・概要の提示と主要導線 (Health / Tournament) の提供。
- **要素**:
  1. ヒーロー見出し `ft_transcendence`
  2. 説明テキスト: 課題概要 (固定文)
  3. ボタン群:
     - 「ヘルスチェックへ」→ `/health`
     - 「トーナメント管理を開く」→ `/tournament`
- **レイアウト**: 画面中央寄せ、モバイル時縦積み・SM以上で横並び。

## 2. HealthCheck Page
- **目的**: `/api/health` 結果を可視化し、稼働確認と障害検出を容易にする。
- **状態 / 表示**:
  1. **Loading**: API 呼び出し中は「ロード中...」を表示。
  2. **Success**: `status` を緑色テキスト、`timestamp` をローカライズした日時で表示。
  3. **Error**: 失敗時は赤文字で「API へのアクセスに失敗しました」。
- **導線**: 下部に「トップに戻る」ボタン ( `/` へ navigate )。
- **API**: `fetchHealth(): Promise<{ status: string; timestamp: string }>` を単一で利用。

## 3. Tournament Page
- **目的**: 参加者登録とマッチ進行管理。
- **主要ユースケース**:
  1. エイリアス登録フォーム＋重複バリデーション。
  2. 登録済みユーザー招待パネル: フレンド/最近対戦したプレイヤーの検索 + チェックボックス選択。「招待を送る」ボタンでリモートプレイヤーに通知 (通知ベル + チャットカード) を飛ばし、承諾状態 (`pending/accepted/declined`) を一覧に反映。
  3. エントリー一覧 (削除ボタン付き)。リモート参加は「承諾待ち」バッジ付き。
  4. トーナメント生成ボタン → `buildMatchQueue` でマッチ列を生成。リモートプレイヤーの接続確認を必須項目にするチェック。
  5. 進行状況カード: 現在試合 / BYE 表示 / 次試合へ進むボタン。
  6. 組み合わせ一覧: 現在試合を強調表示。
- **ステート管理**: `players`, `matchQueue`, `currentMatchIndex`, `errorMessage`, `infoMessage`。
- **コンポーネント分割**:
  1. `TournamentAliasPanel`
    - Input + CTA: エイリアス入力、`onSubmit` 発火、info/error メッセージ表示。
    - props: `{ aliasInput, onAliasChange(value), onSubmit(event), infoMessage, errorMessage, isSubmitDisabled }`。
    - 状態数が増えた際もフォーム部分を独立テストできるようにする。
  2. `TournamentEntryPanel`
    - 参加者一覧 + アクションボタン (`トーナメント生成`, `エントリーをリセット`)。
    - props: `{ players, onRemove(alias), onGenerate(), onReset(), isGenerateDisabled }`。
    - 空状態テキスト、削除ボタンの `aria-label` を統一。
  3. `TournamentProgressPanel`
    - 現在試合カード + マッチキュー (強調表示) + 「次の試合へ進む」。
    - props: `{ currentMatch, matchQueue, currentMatchIndex, onAdvance() }`。
    - BYE の場合は補足テキストを表示し、完了後はサマリーメッセージに切り替える。

## 4. Game Section
- **目的**: ゲーム関連の導線 (モード選択 / 実際の対戦) を 1 つの章で整理し、仕様の抜け漏れを防ぐ。
- **ルート**: `/game/new`, `/game/:id`

### 4.1 Game Lobby (`/game/new`)
- **目的**: ゲームモード選択とマッチ開始フローを集約。
- **構成要素**:
  1. モードカード: Local (1v1), Remote (オンライン対戦), AI (vs bot)。
  2. Remote 選択時: 「公開マッチング」ボタン + カスタムルーム作成 (Room Code)。
  3. 招待リンク生成ボタン (Clipboard コピー)。
  4. 待機状態: 「マッチング中...」（スピナー）＋キャンセルボタン。WebSocket で `matchFound` イベントを待つ。
- **状態遷移**: Idle → SelectingMode → Matching → Matched → `/game/:id` へ遷移。
- **テスト観点**: モード選択時のUI切り替え、待機中キャンセルの動作、マッチ決定イベントでの自動遷移。

### 4.2 Game Room (`/game/:id`)
- **目的**: Pong ゲーム本体をキャンバス描画で提供し、リモート対戦/AI対戦の実行と観戦を支える。
- **構成**:
  1. レフトパネル: マッチ情報 (対戦相手、スコア、接続ステータス)。
  2. メインキャンバス: WebGL or Canvas 2D。レスポンシブ比率 16:9。ステータスオーバーレイで `connecting`/`paused`/`finished` を表示。
  3. ライトパネル: チャット/設定メニュー (スタート/ポーズ、再接続、サレンダー、サウンドミュート) を標準機能の範囲で提供。ショートカット一覧を表示。
- **状態**:
  - 画面状態: `connecting` → `playing` → (`paused`?) → `finished`。
  - ストア: `gameStore` に `matchId`, `players`, `score`, `connectionState`, `latency`, `inputBuffer` を保持 (カスタムスキン等は未対応)。
- **イベント**:
  - サーバーからの `stateUpdate`, `scoreUpdate`, `chatMessage` を購読しキャンバスへ反映。
  - ローカル入力は `inputBuffer` でキューし、WebSocket 経由で送信。接続喪失時は再接続モーダル + リトライ。
- **テスト観点**: キャンバス要素のレンダリング、ステータス表示更新、接続喪失時のアラートと復帰ボタン、チャットサイドパネル連動。

## 5. Profile Page (`/profile/:id`)
- **目的**: Subject のユーザ管理要件 (プロフィール、戦績、フレンド) を満たす。
- **レイアウト**:
  - Hero セクション: アバター、表示名、ステータスバッジ、ユーザタグ。
  - Stats Card: 勝率、総試合数、MVP数、連勝記録。
  - Match History: ページネーション付きテーブル (相手、モード、結果、日付)。
  - Friends Panel: 検索ボックス + 一覧 (オンライン優先) + 招待/チャットボタン。
  - 自分のプロフィールの場合: 「編集」ボタンでモーダルを開き、アバターアップロード、自己紹介編集、SNSリンク編集ができる。公開/非公開のトグルも追加。
- **テスト観点**: 他人のプロフィールでは編集ボタン非表示、戦績カードの空状態、フレンド検索の結果フィード。

## 6. Chat Overlay
- **配置**: 常時右下に折りたたみ可能なドロワー。モバイルではヘッダーのチャットアイコンで全画面化。
- **構成**:
  1. スレッドリスト: DM / グループ / システム通知タブ。未読バッジ数を表示。
  2. メッセージエリア: 左寄せ (相手)、右寄せ (自分)、システムイベントは中央灰色。ゲーム招待カードは「参加」「拒否」ボタン付き。
  3. 入力フォーム: メンション補完 / `/invite <user>` ショートカット / ファイル添付 (今後)。
  4. 既読表示: 最新メッセージに既読チェックを表示。
- **統合**: Game Room からのメッセージはチャットオーバーレイにストリーム表示。Profile から「チャット開始」を押すと該当スレッドを前面表示。
- **テスト観点**: 未読バッジの増減、招待カードのアクション、ブロック状態での入力無効化。

## テスト観点
- 全画面 (Home / Health / Tournament / Auth / Game Lobby / Game Room / Profile / Chat) で **Loading / Success / Error / Empty** の各状態を UI テストで確認。
- 主要アクション (ログイン、モード選択、マッチングキャンセル、プロフィール編集、チャット送信) は `vitest` + React Testing Library + MSW/WebSocket モックで副作用を検証。
- Tournament の純粋関数 (`lib/tournament.ts`)、Game のネットワーク同期、Chat ストアはユニットテストで担保し、統合テストで相互作用を確認する。
