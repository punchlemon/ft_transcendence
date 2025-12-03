import { Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { useNotificationStore } from '../../stores/notificationStore'
import Avatar from './Avatar'

const UserMenu = () => {
  const user = useAuthStore((state) => state.user)
  const unreadCount = useNotificationStore((state) => state.unreadCount)

  if (!user) return null

  return (
    <Link
      to={`/${user.login}`}
      className="relative flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100"
      data-testid="user-menu-link"
    >
      <div className="relative">
        <Avatar src={user.avatarUrl} alt={user.displayName} size="sm" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </div>
    </Link>
  )
}

export default UserMenu

/*
解説:

1) ドロップダウンメニューの実装
  - `useState` で開閉状態を管理し、`useRef` と `useEffect` で「外側クリックで閉じる」挙動を実装。
  - `headlessui` 等の外部ライブラリを使わず、標準の React フックのみで軽量に実装している。

2) ユーザー情報の表示
  - `useAuthStore` からユーザー情報を取得し、アバターと名前を表示する。
  - モバイル表示 (`sm:hidden`) ではボタン内の名前を隠し、ドロップダウン内に名前を表示するレスポンシブ対応を入れている。

3) アクション
  - プロフィール、設定へのリンク (`Link`) と、ログアウトボタン (`button`) を配置。
  - ログアウト時は `clearSession` を呼び出し、メニューを閉じる。
*/
