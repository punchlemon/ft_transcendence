// SharedArrayBuffer polyfill - apply before any other imports
if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    value: ArrayBuffer,
    writable: true,
    configurable: true,
    enumerable: false
  })
  
  // Ensure prototype exists for webidl-conversions descriptor access
  Object.defineProperty(ArrayBuffer, 'prototype', {
    value: ArrayBuffer.prototype,
    writable: true,
    enumerable: false,
    configurable: true
  })
}

import '@testing-library/jest-dom'

/*
解説:

1) SharedArrayBuffer ポリフィル
  - Linux CI で SharedArrayBuffer が未定義の場合に備え、webidl-conversions の descriptor アクセスより前に
    ArrayBuffer をフォールバックとして登録する。
  - import 文より前に実行することで、jsdom 環境初期化時の webidl-conversions ロード時点で確実に定義済みとする。

2) import '@testing-library/jest-dom'
  - DOM マッチャー (toBeInTheDocument など) を Vitest + Testing Library で利用できるようにする。

3) 本ファイルの役割
  - すべてのテスト実行前に読み込まれ、ブラウザ UI テストの共通初期化ポイントとして機能する。
*/
