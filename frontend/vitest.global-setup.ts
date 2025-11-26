import { ensureSharedArrayBuffer } from './src/testing/ensureSharedArrayBuffer'

export default function globalSetup(): void {
  ensureSharedArrayBuffer()
}

/*
解説:

1) vitest.global-setup.ts
  - Vitest の test.globalSetup から読み込まれ、各ワーカー起動前に 1 度だけ実行される。

2) ensureSharedArrayBuffer()
  - jsdom (whatwg-url/webidl-conversions) が SharedArrayBuffer.prototype にアクセスする前にポリフィルを登録し、
    Linux CI で未定義となるケースでもテストを継続できるようにする。
*/
