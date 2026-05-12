/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      colors: {
        bg: {
          primary:   '#04101E',  // navy oscuro — fondo de página
          secondary: '#071829',  // navy medio — tarjetas, paneles
          tertiary:  '#0D2240',  // navy elevado — cabeceras de tabla, hover
          hover:     '#122A4D',  // hover de fila
        },
        rl: {
          blue:   '#00A8FF',  // azul RL eléctrico
          cyan:   '#4FC3F7',  // azul secundario claro
          orange: '#F4620F',  // naranja equipo
          gold:   '#FFB800',  // dorado / campeón
        },
        win:  '#3DDB85',
        loss: '#FF4757',
        draw: '#7B91B0',
        // Escala de grises con tinte azul — da el feel de RL
        gray: {
          50:  '#F0F6FF',
          100: '#E4EEFF',
          200: '#C2D6F5',
          300: '#94B4DC',
          400: '#6590BC',
          500: '#436D96',
          600: '#284F74',
          700: '#173554',
          800: '#0C2040',
          900: '#060F20',
        },
      },
    },
  },
  plugins: [],
}
