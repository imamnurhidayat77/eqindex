/** @type {import('tailwindcss').Config} */
module.exports = {
  // hover: styles only on devices with a real pointer, so a tap on a phone
  // doesn't leave a button stuck in its hover state.
  future: { hoverOnlyWhenSupported: true },
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
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
        // #666 failed WCAG AA on ink/card (3.6:1). #8A8A8A = 5.3:1 on card.
        faint: '#8A8A8A',
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
