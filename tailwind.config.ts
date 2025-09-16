import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './public/**/*.{html,js}', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          accent: 'var(--brand-accent)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          muted: 'var(--text-muted)',
        },
        surface: {
          DEFAULT: 'var(--surface)',
          alt: 'var(--surface-alt)',
        },
        border: {
          DEFAULT: 'var(--border)',
        },
        focus: 'var(--focus-ring)',
      },
    },
  },
  plugins: [],
};

export default config;
