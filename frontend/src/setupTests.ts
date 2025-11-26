import '@testing-library/jest-dom'

if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  ;(globalThis as Record<string, unknown>).SharedArrayBuffer = ArrayBuffer as unknown as SharedArrayBufferConstructor
}

/*
解説:

1) import '@testing-library/jest-dom'
  - DOM マッチャー (toBeInTheDocument など) を Vitest + Testing Library で利用できるようにする。

2) SharedArrayBuffer ポリフィル
  - Linux CI などで未定義になるケースに備え、必要に応じて ArrayBuffer を割り当て、jsdom が期待する API を補う。

3) 本ファイルの役割
  - すべてのテスト実行前に読み込まれ、ブラウザ UI テストの共通初期化ポイントとして機能する。
*/
