/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateX(-50%) translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(-50%) translateY(0)' },
        },
      },
      animation: {
        'fade-in-down': 'fade-in-down 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
};
