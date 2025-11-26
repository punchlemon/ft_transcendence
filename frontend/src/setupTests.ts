import '@testing-library/jest-dom'

/*
解説:

1) import '@testing-library/jest-dom'
  - DOM マッチャー (toBeInTheDocument など) を Vitest + Testing Library で利用できるようにする。

2) 本ファイルの役割
  - すべてのテスト実行前に読み込まれ、ブラウザ UI テストの共通初期化ポイントとして機能する。
*/
