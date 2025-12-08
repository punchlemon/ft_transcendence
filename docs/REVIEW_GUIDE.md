# レビュー対応ガイド (Review Guide)

このドキュメントは、ft_transcendence のレビュー時に説明・実演が必要な項目と、それに対応するコードやコマンドをまとめたものです。

---

## 0. 準備・起動 (Deployment)

評価開始時にスムーズに環境を立ち上げるための手順です。

### 実演・確認項目
1.  **起動コマンド**:
    *   ルートディレクトリで以下を実行し、一発で起動することを見せる。
    ```bash
    docker compose up --build
    ```
2.  **環境変数**:
    *   `.env` ファイルが存在することを確認。
    *   `.gitignore` を開き、`.env` と `nginx/ssl/` が記述されている（リポジトリに含まれていない）ことを確認。
3.  **HTTPS接続**:
    *   ブラウザで `https://localhost` にアクセス。
    *   自己署名証明書による警告が出るが、「詳細設定」→「localhostに進む」で続行し、HTTPSで通信していることを示す（アドレスバーの鍵マークなど）。

---

## 1. 基本動作とSPAの挙動 (Mandatory)

### 実演・確認項目
1.  **SPAの挙動**:
    *   ブラウザの「戻る」「進む」ボタンを使用し、ページ全体のリロード（画面が白くなる等）が発生せず、スムーズに遷移することを見せる。
2.  **エラーなし**:
    *   F12 で開発者ツールを開き、コンソールに赤文字のエラーが出ていない状態を見せる。
3.  **ブラウザ互換性**:
    *   Firefox（必須）と Chrome（または別のブラウザ）の両方で動作することを見せる。

---

## 2. Web技術スタック (Module: Web)

使用している技術が要件を満たしていることを証明します。

### Backend (Fastify)
*   **説明**: Node.js 上で Fastify フレームワークを使用しています。
*   **コード確認**: `backend/package.json`
    ```json
    "dependencies": {
      "fastify": "^5.0.0",
      ...
    }
    ```

### Frontend (React)
*   **説明**: フロントエンドライブラリとして React を使用しています。
*   **コード確認**: `frontend/package.json`
    ```json
    "dependencies": {
      "react": "^18.2.0",
      ...
    }
    ```
*   **ファイル確認**: `frontend/src/App.tsx` などの拡張子が `.tsx` であることや、`useState`, `useEffect` などの React Hooks が使用されていること。

### Frontend (Tailwind CSS)
*   **説明**: CSSフレームワークとして Tailwind CSS を使用しています。
*   **コード確認**: `frontend/src/App.tsx` や任意のコンポーネント
    *   `className="flex p-4 text-center ..."` のようなクラス名が使われていることを示す。

### Database (SQLite)
*   **説明**: データベースとして SQLite を使用しています。
*   **コード確認**: `backend/prisma/schema.prisma`
    ```prisma
    datasource db {
      provider = "sqlite"
      url      = env("DATABASE_URL")
    }
    ```
*   **ファイル確認**: `backend/prisma/dev.db` (または `.env` で指定されたパス) が存在すること。

---

## 3. ユーザー管理と認証 (Module: User Management & Cybersecurity)

### 実演・確認項目
1.  **Remote Auth (OAuth 2.0)**:
    *   ログイン画面で Google / 42 などのボタンを押し、リダイレクトを経てログイン完了するフローを見せる。
    *   **コード**: `backend/src/routes/auth.ts` (OAuthの実装箇所)。
        ```typescript
        // OAuth Callback Handler (Simplified)
        fastify.post('/oauth/:provider/callback', async (request, reply) => {
            // 1. Authorization Code を Access Token に交換
            const tokenPayload = await exchangeAuthorizationCode(providerConfig, {
                code, redirectUri, codeVerifier
            });

            // 2. Access Token を使ってプロバイダからユーザー情報を取得
            const profile = await fetchProviderProfile(providerConfig, tokenPayload.access_token);

            // 3. ユーザーの検索または新規作成
            const existingAccount = await fastify.prisma.oAuthAccount.findUnique({ ... });
            
            if (existingAccount) {
                userId = existingAccount.userId;
                // トークン更新処理...
            } else {
                // 新規ユーザー作成または既存メールアドレスとのリンク
                const createdUser = await fastify.prisma.user.create({
                    data: {
                        email: profile.email,
                        login: uniqueLogin,
                        // ...
                    }
                });
                userId = createdUser.id;
            }

            // 4. セッション発行 (JWT)
            const result = await issueSessionTokens(userId, ...);
            return result;
        });
        ```
2.  **2FA & JWT**:
    *   **設定**: プロフィール設定から 2FA を有効化（QRコード読み取り）。
    *   **確認**: 一度ログアウトし、再ログイン時に OTP (6桁コード) を求められることを見せる。
    *   **JWT**: 開発者ツールの「Application」タブ（Storage -> Cookies または Local Storage）で JWT トークンが保存されていることを見せる。
3.  **プロフィール管理**:
    *   アバター画像の変更、表示名の変更（重複エラーの確認も推奨）。
    *   フレンド追加・削除、オンラインステータスの変化（緑/赤）。
    *   統計情報（勝敗数、対戦履歴）の表示。

---

## 4. ゲームプレイとチャット (Module: Gameplay)

**重要**: 2つのブラウザウィンドウ（またはシークレットモード）を使って実演します。

### Pong (Remote Players)
*   **実演**:
    1.  ユーザーAで「ゲーム作成」、ユーザーBで「参加」。
    2.  両方の画面でパドルとボールが同期して動いていることを見せる。
    3.  ゲーム中に片方のタブを閉じ、切断処理（勝利判定など）が行われることを見せる。
*   **コード**: `backend/src/game/engine.ts` (ゲームロジック), `backend/src/game/GameManager.ts` (ルーム管理)。

### トーナメントシステム
*   **実演**:
    1.  3人以上のプレイヤー（エイリアス名で登録可）でトーナメントを作成。
    2.  対戦表（ブラケット）が表示されることを見せる。
    3.  勝者が次のラウンドに進む様子を見せる。

### Live Chat
*   **実演**:
    1.  **DM**: ユーザー間でメッセージ送受信。
    2.  **ブロック**: ユーザーBがAをブロックし、Aからのメッセージが届かなくなることを実演。
    3.  **ゲーム招待**: チャットから「Pongに招待」を送り、相手が承認してゲーム開始。
    4.  **プロフィール**: チャットの名前をクリックしてプロフィールへ遷移。

---

## 5. AI対戦相手 (Module: AI-Algo)

### 実演・確認項目
1.  **AI Opponent**:
    *   人間 vs AI で対戦を行う。
    *   AIが完璧ではなく、たまにミスすることを見せる。
2.  **アルゴリズム説明 (重要)**:
    *   「A*アルゴリズムは使用していません」と説明。
    *   **1秒更新の制約**:
        *   AIは毎フレーム計算するのではなく、**1秒に1回 (120 ticksごと) だけ** `processSnapshot` メソッドでゲームの状態（ボールの位置・速度）を取得します。
        *   その時点で、今後1秒間のボールの軌道をシミュレーション（予測）し、パドルの目標位置 (`targetY`) を決定します。
        *   決定した目標位置に向かうための1秒分（120個）の操作入力 (`inputQueue`) を一度に生成し、それを毎フレーム順番に消費して動きます。
    *   **人間らしさの演出**:
        *   **Reaction Delay**: 予測してから実際に動き出すまでに、難易度に応じた遅延（例: Normalなら約150ms）を入れています。
        *   **Error Margin**: 予測位置に意図的なズレ（誤差）を含めることで、完璧な防御を防いでいます。
    *   **コード確認**: `backend/src/game/ai.ts`
        ```typescript
        // Called by engine every 1s (120 ticks)
        processSnapshot(state: GameState) {
            // 1. ボールの軌道を予測して目標位置(targetY)を計算
            const targetY = this.predictTargetY(state);
            
            // 2. 今後1秒間(120 ticks)の入力を事前に生成してキューに入れる
            for (let i = 0; i < 120; i++) {
                // ... 反応遅延(reactionDelayTicks)の考慮
                // ... 目標位置に向かうための移動方向(axis)の決定
                this.inputQueue.push({ ... });
            }
        }
        ```

---

## 6. セキュリティとコード品質 (General & Cybersecurity)

### 実演・確認項目
1.  **SQL Injection対策**:
    *   **説明**: Prisma (ORM) を使用しているため、自動的にエスケープ処理が行われています。
        *   **プリペアドステートメント（Parameterized Queries）の自動利用**:
            Prisma の標準的なメソッド（findUnique, create, update, findMany など）は、裏側で自動的に「プリペアドステートメント」という仕組みを使っています。
            これは、ユーザーからの入力を「SQL命令の一部」としてではなく、単なる「データ（値）」として扱う仕組みです。そのため、どんなに怪しい文字列を入力されても、SQLコマンドとして実行されることはありません。
    *   **コード**: `backend/src/plugins/db.ts` や任意のルートでの `prisma.user.findUnique(...)` などの呼び出し。
2.  **XSS対策**:
    *   **実演**: チャット欄に `<script>alert('xss')</script>` を入力し、スクリプトが実行されず文字列として表示されることを見せる（Reactの自動エスケープ）。
3.  **パスワードハッシュ**:
    *   **説明**: パスワードは平文ではなくハッシュ化して保存しています。
    *   **コード確認**: `backend/package.json` に `argon2` があること。
    *   **DB確認**: 下記コマンドを実行してハッシュ化された文字列を見せる。
    ```
    docker compose exec backend bash
    apt-get install -y sqlite3
    sqlite3 data/db.dev
    select * from User
    ```
