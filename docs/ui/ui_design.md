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

### 0.1 Login Page の詳細
| 状態 | 説明 | UI 表現 |
| --- | --- | --- |
| Idle | 初期表示 | 入力フィールド + 無効化された送信ボタン (必須項目が空の場合) |
| Submitting | 認証 API 呼び出し中 | 送信ボタンをスピナー付き非活性化し、OAuth ボタンもロック |
| Success | JWT 取得完了 | 成功アラートカードを表示し、後続画面 (`/`) への CTA を提示 |
| Invalid Credentials | 401 応答 | エラーアラートにバックエンドの `error.message` を表示 |
| MFA Required | 423 応答 | `challengeId` を `sessionStorage` へ保存し、「2FA を完了してください」メッセージと遷移ボタンを表示 |

- **フォーム構成**: ラベル付きテキストフィールド (メール / パスワード)、ログインボタン、サブテキストでパスワード忘れリンク (未実装は `disabled` 表記)。
- **バリデーション**: クライアント側で `trim().toLowerCase()` 済みメール形式と 8 文字以上のパスワードをチェックし、失敗時は即座にエラーメッセージを表示。
- **ステート管理**: `email`, `password`, `statusMessage`, `errorMessage`, `mfaChallengeId`, `isSubmitting`。
- **トークン保存**: 成功時は `sessionStorage` の `ft_access_token` / `ft_refresh_token` に保存し、将来の `authStore` 実装に備える。

### 0.2 OAuth ボタン挙動
- プロバイダは `fortytwo`, `google` の 2 種。環境変数 `VITE_OAUTH_REDIRECT_URI` (未指定時は `window.location.origin + /oauth/callback`) をクエリ `redirectUri` に添付。
- `/auth/oauth/:provider/url` から取得した `authorizationUrl`, `state`, `codeChallenge` を sessionStorage に保存 (`ft_oauth_state`, `ft_oauth_code_challenge`) し、`window.location.assign()` でプロバイダへ遷移。
- 失敗時は詳細エラーを画面上部のアラートに表示し、利用者には「数秒後に再試行してください」と案内。
- コールバックページ (`/oauth/callback`) は別途実装し、`state`/`codeVerifier` を読み込んで `/auth/oauth/:provider/callback` を叩く。

### 0.3 テスト観点 (Auth UI)
- `LoginPage`
  - フォーム入力/送信で `login()` API を呼び、成功時にセッションストレージへトークン保存 & 成功メッセージを表示する。
  - 401 エラーでバックエンドの文言を表示し、フィールド入力は維持される。
  - 423 エラーでは `challengeId` の保存と 2FA 案内を表示する。
  - OAuth ボタン押下で `fetchOAuthAuthorizationUrl()` を呼び出し、返却 URL へ `window.location.assign` が実行される。
  - バリデーション失敗時はネットワークリクエストが発生しないことを `vi.mock` で確認する。

### 0.4 Auth Store / セッション再開
- **Zustand ベースの `authStore`** を SPA 全体で共有し、`user`, `accessToken`, `refreshToken`, `isHydrated` を保持する。
- ログイン成功時は `setSession()` で状態と `sessionStorage` を同時に更新する。保存キーは `ft_access_token`, `ft_refresh_token`, `ft_user` (JSON) とし、2FA チャレンジ ID など他の値と衝突しない命名を維持する。
- アプリ起動時 (例: `App.tsx` の `useEffect`) に `hydrateFromStorage()` を一度だけ呼び出し、セッション情報を即時に復元する。StrictMode の二重呼び出しでも多重セットが起きないよう、ハイドレーション完了フラグでガードする。
- `clearSession()` はログアウトやトークン破棄時に利用し、ストアと `sessionStorage` 双方を初期化する。API リクエストヘッダーへトークンを添付する実装を追加する際はこのストアを単一情報源として参照する。

### 0.5 2FA チャレンジページ (`/auth/2fa`)
- **役割**: `/auth/login` で `423 MFA_REQUIRED` が返却された際に、ユーザーが TOTP もしくはバックアップコードを入力してセッションを確立する画面。
- **チャレンジ ID 取得**:
  - `sessionStorage` の `ft_mfa_challenge_id` から読み取る。存在しない場合はエラーカードで「再度ログインしてください」と案内し、フォームを無効化する。
  - 「チャレンジ ID をリロード」ボタンで再度 `sessionStorage` から読み込み、開発中に ID を差し替えたケースでも復旧できるようにする。
- **フォーム構成**:
  1. 6 桁 TOTP 入力 (`code`)。数値以外は拒否し、6 桁揃わないと送信ボタンが無効化される。
  2. 「バックアップコードを使用する」チェックボックスを有効化すると、`XXXX-XXXX` 形式の入力欄 (`backupCode`) が表示され、`code` は任意になる。
  3. 送信ボタンは `challengeId` と (`code` or `backupCode`) が揃った時のみ活性。
- **API 呼び出し**: `POST /auth/mfa/challenge` に `{ challengeId, code?, backupCode? }` を送信。成功時は `authStore.setSession()` を呼び出して JWT/ユーザー情報を保存し、「ログインが完了しました」と通知 → `/` へ遷移 (現状は完了メッセージ表示のみで可)。
- **エラーハンドリング**:
  - `404/410`: チャレンジ未検出/期限切れ → ID を削除し、ログインページへ再誘導。
  - `400 INVALID_MFA_CODE`: 入力欄横にエラーを表示して再入力を促す。
  - `409 MFA_BACKUP_CODES_EXHAUSTED`: バックアップコード欄に専用メッセージを表示。
- **状態**:
  - `idle` / `submitting` / `success` / `error` / `challengeMissing`。
  - ローディング中は全入力と送信ボタンをロックし、スピナー表示の代わりにボタン文言を「送信中...」へ変更。
- **ナビゲーション**: ログインページから `Link` で `/auth/2fa` に遷移できるショートカットを設置し、MFA 必須ユーザーが迷わないようにする。

#### テスト観点 (2FA ページ)
- `ft_mfa_challenge_id` が存在しない場合にエラーが描画され、送信ボタンが無効化されること。
- 正しい 6 桁コード入力で `submitMfaChallenge()` を呼び、成功時に `authStore` と `sessionStorage` が更新されること。
- バックアップコードモードでコード入力欄が切り替わり、`backupCode` だけでも送信できること。
- API から `INVALID_MFA_CODE` が返った場合にフォーム値が保持されたままエラーメッセージが表示されること。
- チャレンジ期限切れレスポンスでストレージの ID が削除され、ユーザーへ再ログイン案内が表示されること。

### 0.6 OAuth コールバックページ (`/oauth/callback`)
- **役割**: OAuth プロバイダからリダイレクトされた際にクエリパラメータ (`code`, `state`, `error`) を検証し、バックエンドの `/auth/oauth/:provider/callback` と連携して最終的なセッションを確立する。`mfaRequired=true` が返却された場合は `ft_mfa_challenge_id` を保存し `/auth/2fa` に遷移させる。
- **事前共有情報**:
  - ログイン画面で OAuth ボタンを押した時点で `sessionStorage` に `ft_oauth_state`, `ft_oauth_provider`, `ft_oauth_code_challenge?(pkce)` を保存する。コールバックでは最低限 `state` と `provider` を照合できること。
  - `redirectUri` は `resolveOAuthRedirectUri()` で一貫して算出し (`VITE_OAUTH_REDIRECT_URI` 優先、未設定は `window.location.origin + /oauth/callback`)、バックエンドに送信する値と完全一致させる。
- **フロー**:
  1. 初期状態で「認証コードを検証中...」スピナーを表示し、`useEffect` で URLSearchParams から `code`/`state`/`error` を取得。
  2. `error` が存在する場合は内容を翻訳して表示し、セッションストレージの OAuth 情報を削除して `/login` リンクを提示。
  3. `code` または `state` が欠落、あるいは受信した `state` と `ft_oauth_state` が一致しない場合は `状態が一致しません` エラーを表示しリトライ導線を出す。
  4. `provider` は `ft_oauth_provider` から取得し、存在しない場合は致命的エラーとして扱う（ブラウズバック時にストレージが消える可能性を考慮し案内文を表示）。
  5. `completeOAuthCallback(provider, { code, state, redirectUri })` を呼び出し、成功したら `authStore.setSession()` を経由してトークン/ユーザーを保存。ストレージの OAuth 補助情報をすべて削除する。
  6. 成功時は「OAuth ログインが完了しました」のメッセージと `/` への自動遷移 (3 秒) を行う。ユーザー操作で即座にトップへ戻るボタンも表示。
  7. レスポンスで `mfaRequired=true` かつ `challengeId` があれば `ft_mfa_challenge_id` を保存し、「2FA を完了してください」メッセージと共に `/auth/2fa` へのボタンを表示。
  8. API エラー時はエラー内容を表示しつつ、`ft_oauth_state` 等を削除し再試行用の「ログインへ戻る」ボタンを提示。`INVALID_REDIRECT_URI` や `OAUTH_STATE_EXPIRED` など主要コードは日本語にマッピングする。
- **状態管理**: `status`（`initial` / `validating` / `success` / `needsMfa` / `error`）、`message`, `details`, `countdownSeconds`。フッターに `再試行` / `サポート` (未実装プレースホルダー) を配置。
- **テスト観点**:
  - 正常な `code`/`state` で API が呼ばれ、成功レスポンス後に `authStore` が更新されること。
  - `mfaRequired` ルートで `ft_mfa_challenge_id` が保存され `/auth/2fa` へ案内されること。
  - `state` 不一致・クエリ欠落・`error=access_denied` 等でエラーメッセージが表示され、OAuth ストレージ情報がクリアされること。
  - API 失敗 (`OAUTH_STATE_EXPIRED` など) でリトライ導線が表示され、`completeOAuthCallback` の再試行ボタンで再び呼び出せること。

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
- **状態永続化**: ユーザーがページをリロードしても入力内容が失われないよう、`localStorage` (`ft_tournament_state_v1`) に `players` / `matchQueue` / `currentMatchIndex` をシリアライズして保存する。初期レンダリング時にストレージから復元し、構造が不正な場合は破棄する。エントリーをリセットした際はストレージも即座に初期化される。
- **状態永続化**: ユーザーがページをリロードしても入力内容が失われないよう、`localStorage` (`ft_tournament_state_v1`) に `players` / `matchQueue` / `currentMatchIndex` をシリアライズして保存する。初期レンダリング時にストレージから復元し、構造が不正な場合は破棄する。エントリーをリセットした際はストレージも即座に初期化される。React StrictMode で副作用が二重実行されても初期スナップショットが上書きされないよう、復元完了フラグ (`isHydrated`) を用いて最初の書き込みを抑制する。
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

  #### テスト計画 (Alias / Entry / Progress Panels)
  1. **TournamentAliasPanel**
    - 入力値変更で `onAliasChange` が呼ばれること。
    - エラー/情報メッセージが DOM 上に正しく描画されること。
    - `isSubmitDisabled` で送信ボタンの活性/非活性が切り替わること。
  2. **TournamentEntryPanel**
    - プレイヤー未登録時に空状態テキストを出し、登録済み時は `aria-label="登録済みプレイヤー一覧"` が付与された `ul` に項目が並ぶこと。
    - 各「削除」ボタンで `onRemove` が正しいエイリアス付きで呼ばれること。
    - 生成/リセットボタンがそれぞれ `onGenerate` / `onReset` を発火し、`isGenerateDisabled` が `true` の場合は生成ボタンが無効化されること。
  3. **TournamentProgressPanel**
    - 現在試合が存在する場合はカードが描画され、BYE (`players[1] === null`) の説明が表示されること。
    - 「次の試合へ進む」ボタンで `onAdvance` が呼ばれること。
    - `matchQueue` が空のときは未生成メッセージ、履歴ありで `currentMatch` が無い場合は完了メッセージが表示されること。
    - 組み合わせ一覧で現在試合のみ `aria-current="true"` が付与されること。

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
