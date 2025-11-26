// SharedArrayBuffer polyfill - apply before any other imports
if (typeof globalThis.SharedArrayBuffer === 'undefined') {
  // Create a minimal SharedArrayBuffer polyfill with required prototype properties
  const SharedArrayBufferPolyfill = function(this: any, length: number) {
    return new ArrayBuffer(length)
  } as any
  
  SharedArrayBufferPolyfill.prototype = Object.create(ArrayBuffer.prototype)
  SharedArrayBufferPolyfill.prototype.constructor = SharedArrayBufferPolyfill
  
  // Add the required 'byteLength' getter that webidl-conversions expects
  Object.defineProperty(SharedArrayBufferPolyfill.prototype, 'byteLength', 
    Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength') || {
      get: function(this: ArrayBuffer) {
        return this.byteLength
      },
      enumerable: false,
      configurable: true
    }
  )
  
  // Add the 'growable' getter for newer Node versions
  Object.defineProperty(SharedArrayBufferPolyfill.prototype, 'growable', {
    get: function() {
      return false
    },
    enumerable: false,
    configurable: true
  })
  
  Object.defineProperty(globalThis, 'SharedArrayBuffer', {
    value: SharedArrayBufferPolyfill,
    writable: true,
    configurable: true,
    enumerable: false
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
