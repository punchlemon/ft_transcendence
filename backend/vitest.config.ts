import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      reporter: ['text', 'html'],
      exclude: ['dist', 'node_modules']
    }
  }
})

/*
解説:

1) import { defineConfig } from 'vitest/config'
  - Vitest の設定ヘルパーを利用して型補完とバリデーションを効かせる。

2) test オプション
  - Node.js 環境でグローバル API を有効化し、`src` 配下の test/spec ファイルのみを対象にする。
  - カバレッジ出力を text / html で確認できるように設定し、ビルド成果物は測定対象から除外する。

3) export default defineConfig(...)
  - Vitest がこの設定を読み取れるようにデフォルトエクスポートで公開する。
*/
