/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#064749',
      },
      animation: {
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
        'fade-in-out': 'fadeInOut 2s ease-in-out',
      },
      keyframes: {
        fadeInOut: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '10%': { opacity: '1', transform: 'translateY(0)' },
          '90%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-10px)' },
        }
      }
    },
  },
  plugins: [],
};