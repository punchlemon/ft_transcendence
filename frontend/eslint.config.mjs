import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules']
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true }
      },
      globals: {
        ...globals.browser
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off'
    }
  }
)

/*
解説:

1) import 各種プラグイン
  - TypeScript/React/React Hooks のルールセットを取り込み、ESLint v9 のフラット構成で利用する。

2) ignores
  - dist や node_modules を対象外にし、アプリ本体だけを解析する。

3) files + languageOptions
  - `src` 配下の TS/TSX に限定し、JSX を扱えるよう parserOptions を調整。ブラウザグローバルも認識させる。

4) plugins / rules
  - 推奨ルール群を展開し、React 18 以降で不要な `react/react-in-jsx-scope` を無効化して現行スタイルと統一する。
*/
