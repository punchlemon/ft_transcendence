export function ensureSharedArrayBuffer(): void {
  if (typeof globalThis.SharedArrayBuffer === 'undefined') {
    Object.defineProperty(globalThis, 'SharedArrayBuffer', {
      value: ArrayBuffer,
      writable: true,
      configurable: true
    })
  }
}

/*
解説:

1) ensureSharedArrayBuffer
  - Linux CI で SharedArrayBuffer が無効化されるケースに備え、ArrayBuffer をフォールバックとして登録する。
  - jsdom -> whatwg-url -> webidl-conversions の初期化で SharedArrayBuffer.prototype が参照されるため、
    その前段階でグローバルへ定義しておく必要がある。
  - Object.defineProperty を使い、writable/configurable を true にして将来のネイティブ実装で上書きできるようにする。
*/
