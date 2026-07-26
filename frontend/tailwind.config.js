/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Geist', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Design Token Custom Properties
        tf: {
          bg: 'var(--tf-bg)',
          surface: 'var(--tf-surface)',
          'surface-2': 'var(--tf-surface-2)',
          border: 'var(--tf-border)',
          'border-strong': 'var(--tf-border-strong)',
          text: 'var(--tf-text)',
          'text-secondary': 'var(--tf-text-secondary)',
          'text-tertiary': 'var(--tf-text-tertiary)',
          accent: 'var(--tf-accent)',
          'accent-hover': 'var(--tf-accent-hover)',
          'accent-fg': 'var(--tf-accent-fg)',
          success: 'var(--tf-success)',
          warning: 'var(--tf-warning)',
          danger: 'var(--tf-danger)',
        },
      },
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '6': '24px',
        '8': '32px',
        '12': '48px',
        '16': '64px',
      },
      borderRadius: {
        'sm': '6px',
        'DEFAULT': '8px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'DEFAULT': '0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'modal': '0 8px 24px 0 rgba(0, 0, 0, 0.12)',
        'none': 'none',
      },
      transitionDuration: {
        'micro': '150ms',
        'DEFAULT': '200ms',
        'modal': '240ms',
      },
      transitionTimingFunction: {
        'enter': 'cubic-bezier(0.2, 0, 0, 1)',
        'exit': 'cubic-bezier(0.4, 0, 1, 1)',
      }
    },
  },
  plugins: [],
}

