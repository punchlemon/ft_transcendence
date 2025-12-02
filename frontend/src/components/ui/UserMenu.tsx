import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const user = useAuthStore((state) => state.user)
  const clearSession = useAuthStore((state) => state.clearSession)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!user) return null

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100"
        data-testid="user-menu-button"
      >
        <img
          src={user.avatarUrl || 'https://via.placeholder.com/40'}
          alt={user.displayName}
          className="h-8 w-8 rounded-full border border-slate-200 object-cover"
        />
        <span className="hidden max-w-[100px] truncate text-sm font-medium text-slate-700 sm:block">
          {user.displayName}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={`h-5 w-5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
          <div className="border-b border-slate-100 px-4 py-2 sm:hidden">
            <p className="truncate text-sm font-medium text-slate-900">{user.displayName}</p>
          </div>
          <Link
            to={`/profile/${user.id}`}
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setIsOpen(false)}
          >
            マイプロフィール
          </Link>
          <Link
            to="/settings/account"
            className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            onClick={() => setIsOpen(false)}
          >
            設定
          </Link>
          <button
            onClick={() => {
              setIsOpen(false)
              clearSession()
            }}
            className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            ログアウト
          </button>
        </div>
      )}
    </div>
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
