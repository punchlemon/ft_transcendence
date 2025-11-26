import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['src/main.tsx']
    }
  }
})

/*
解説:

1) import ... react
  - Vite の React プラグインを Vitest 設定でも再利用し、JSX/TSX をそのままテストできるようにする。

2) test オプション
  - jsdom 環境でブラウザ API を再現し、`setupTests.ts` を読み込んで共通初期化を行う。
  - テスト対象ファイルのパターンとカバレッジ出力形式を定義し、メインエントリは対象外にする。

3) export default defineConfig(...)
  - Vitest が設定を評価できるようにデフォルトエクスポートで公開する。
*/
