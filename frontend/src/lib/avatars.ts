/**
 * デフォルトアバター画像の管理
 *
 * ユーザーがカスタム画像をアップロードしない場合に使用する、
 * プリセットのアバター画像パスを定義する。
 */

export const DEFAULT_AVATARS = [
  '/avatars/avatar-01.png',
  '/avatars/avatar-02.png',
  '/avatars/avatar-03.png',
  '/avatars/avatar-04.png',
  '/avatars/avatar-05.png',
  '/avatars/avatar-06.png',
  '/avatars/avatar-07.png',
  '/avatars/avatar-08.png',
  '/avatars/avatar-09.png',
  '/avatars/avatar-10.png',
  '/avatars/avatar-11.png',
  '/avatars/avatar-12.png',
  '/avatars/avatar-13.png',
  '/avatars/avatar-14.png'
] as const

/**
 * ランダムなデフォルトアバターを取得
 * @returns デフォルトアバターのパス
 */
export function getRandomDefaultAvatar(): string {
  const index = Math.floor(Math.random() * DEFAULT_AVATARS.length)
  return DEFAULT_AVATARS[index]
}

/**
 * 配列からランダムにアバターを選択（サーバー側で使用）
 * 0から配列長-1までのインデックスを返す
 * @param seed オプションのシード値（再現性のため）
 * @returns インデックス
 */
export function getRandomAvatarIndex(seed?: number): number {
  if (seed !== undefined) {
    // 簡易的なシードベースの疑似乱数
    const x = Math.sin(seed) * 10000
    return Math.floor((x - Math.floor(x)) * DEFAULT_AVATARS.length)
  }
  return Math.floor(Math.random() * DEFAULT_AVATARS.length)
}

/*
解説:

1) DEFAULT_AVATARS 定数
  - frontend/public/avatars/ に配置された14個のデフォルトアバター画像のパスを定義
  - as const で型を厳格化し、実行時の変更を防ぐ

2) getRandomDefaultAvatar()
  - クライアント側でランダムなアバターを取得するためのヘルパー関数
  - Math.random() で配列からランダムに1つ選択

3) getRandomAvatarIndex()
  - サーバー側での使用を想定したインデックス取得関数
  - seed パラメータで再現可能な選択が可能（テスト用）
  - サーバー側で同じ配列を持ち、インデックスからパスを構築する
*/
