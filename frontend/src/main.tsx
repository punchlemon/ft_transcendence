import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

/*
解説:

1) import React ... './index.css'
  - JSX/StrictMode を利用するために React を読み込み、`ReactDOM` 経由で DOM にマウントする。
  - ルートコンポーネント `App` とグローバルスタイル `index.css` をここでまとめて読ませる。

2) ReactDOM.createRoot(...).render(...)
  - `#root` 要素に対して新しい React ルートを生成し、アプリケーション全体を StrictMode 下で描画する。
  - StrictMode は開発時に副作用検知を強化し、将来の非推奨 API を警告してくれるため常時有効化している。

3) <App />
  - ルーティングやページレイアウトを定義したアプリケーション本体。ここから全 UI が始まる。
*/
