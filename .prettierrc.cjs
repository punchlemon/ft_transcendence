module.exports = {
  semi: false,
  singleQuote: true,
  trailingComma: 'none',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'avoid'
}

/*
解説:

1) semi / singleQuote / trailingComma
  - プロジェクト全体でセミコロン無し・単一引用符・末尾カンマ禁止の統一フォーマットを適用する。

2) printWidth / tabWidth
  - 可読性を保つため 100 桁折り返し・2 スペースインデントを強制する。

3) arrowParens
  - 単一引数のアロー関数でカッコを省略し、既存コードスタイルと揃える。
*/
