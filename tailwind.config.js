/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        court: {
          surface: '#1e293b',
          line: '#94a3b8',
          accent: '#0284c7'
        }
      }
    },
  },
  plugins: [],
}
