module.exports = {
  content: ['./**/*.html'],
  theme: {
    extend: {
      colors: {
        qalb: {
          cream: '#EDE6D6', brown: '#843A21', clay: '#813E2F',
          black: '#000000', charcoal: '#3B3B38', 'warm-white': '#FAF6EE',
          turmeric: '#C8963E', paprika: '#A63D2A', cardamom: '#6B7040',
        },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Montserrat', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      letterSpacing: { label: '0.3em', wide: '0.5em' },
      borderRadius: { DEFAULT: '2px' },
      boxShadow: { none: 'none' },
    },
  },
};
