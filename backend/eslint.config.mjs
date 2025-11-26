import tseslint from 'typescript-eslint'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules']
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: globals.node
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      ...tseslint.configs.recommended.rules
    }
  }
)

/*
解説:

1) import tseslint / globals
  - TypeScript ESLint が提供するフラット設定ヘルパーと、Node.js 向けのグローバル変数定義を読み込む。

2) ignores
  - dist や node_modules を解析対象から除外し、アプリ本体のみをルール適用する。

3) files + languageOptions
  - src 配下の TypeScript ファイルにのみ適用し、最新構文 + ES モジュールを解析できるようにする。

4) plugins / rules
  - TypeScript 推奨ルールセットを展開し、逐次的にプロジェクト共通の静的解析ポリシーを提供する。
*/
