import { useEffect } from 'react'

/**
 * デバイスのダークモード設定に基づいてHTMLのクラスを切り替えるカスタムフック
 * @returns void
 */
export const useDarkMode = () => {
  useEffect(() => {
    // デバイスのカラースキーム設定を取得
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    // 初期設定を適用
    const applyTheme = (matches: boolean) => {
      if (matches) {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }

    // 初期適用
    applyTheme(mediaQuery.matches)

    // デバイス設定の変更を監視
    const listener = (e: MediaQueryListEvent) => {
      applyTheme(e.matches)
    }

    mediaQuery.addEventListener('change', listener)

    // クリーンアップ
    return () => {
      mediaQuery.removeEventListener('change', listener)
    }
  }, [])
}

/*
解説:

1) import { useEffect } from 'react'
  - Reactのライフサイクルフックをインポート
  - コンポーネントマウント時とアンマウント時の処理を実装するために使用

2) useDarkMode フック
  - デバイスのカラースキーム設定(prefers-color-scheme)を監視
  - ダークモードの場合は<html>要素に'dark'クラスを追加
  - ライトモードの場合は'dark'クラスを削除
  - Tailwindの'dark:'プレフィックスと連動して動作

3) window.matchMedia('(prefers-color-scheme: dark)')
  - ブラウザのメディアクエリAPIを使用してデバイス設定を取得
  - macOS/iOS/Androidなどのシステム設定を自動検出

4) mediaQuery.addEventListener('change', listener)
  - ユーザーがシステム設定を変更した際にリアルタイムで反映
  - 例: macOSの「システム設定 > 外観」を変更した場合

5) クリーンアップ処理
  - コンポーネントアンマウント時にイベントリスナーを削除
  - メモリリークを防止
*/
