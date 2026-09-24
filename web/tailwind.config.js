/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Palette per EQIndex Designer Briefing §3 (BossMedia dark identity).
      // Names are stable API — pages reference names, never hex.
      colors: {
        ink: '#0A0A0A',
        navbg: '#0A0A0A',
        card: '#141414',
        card2: '#1E1E1E',
        line: '#2A2A2A',
        rowline: '#242424',
        body: '#FFFFFF',
        muted: '#A0A0A0',
        faint: '#666666',
        gold: '#FFD700',
        golddim: '#E6C200',
        goldbg: '#2A2500',
        moss: '#00C853',
        mint: '#00C853',
        greenbg: '#0B2E16',
        blood: '#FF1744',
        danger: '#FF1744',
        redbg: '#30070F',
        ember: '#FF6B00',
        emberbg: '#2E1500',
        sky: '#4C9AFF',
        info: '#4C9AFF',
        bluebg: '#10233D',
        viol: '#8E7CFF',
        violet: '#8E7CFF',
        barbg: '#2A2A2A',
      },
      maxWidth: { shell: '1240px' },
      fontFamily: {
        display: ['Oswald', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
