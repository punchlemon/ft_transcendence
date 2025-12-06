/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class', // クラスベースのダークモード切り替え - デバイス設定に自動同期
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4ade80',
          dark: '#15803d'
        }
      },
      backgroundColor: {
        // ライトモード
        'light-surface': '#ffffff',
        'light-surface-alt': '#f1f5f9',
        // ダークモード
        'dark-surface': '#1e293b',
        'dark-surface-alt': '#0f172a'
      },
      textColor: {
        // ライトモード
        'light-primary': '#0f172a',
        'light-secondary': '#475569',
        // ダークモード
        'dark-primary': '#e2e8f0',
        'dark-secondary': '#cbd5e1'
      },
      borderColor: {
        // ライトモード
        'light-border': '#e2e8f0',
        // ダークモード
        'dark-border': '#334155'
      }
    }
  },
  plugins: []
}
