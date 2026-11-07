/*
 * Catálogo de planchas y tiendas (Chile).
 * Medidas verificadas en sitios de Sodimac y Easy. La disponibilidad, el stock y el precio
 * cambian por tienda: el informe siempre pide confirmarlos antes de comprar.
 */
window.CATALOGO_MELAMINA = {
  formatos: [
    { id: '183x250', nombre: 'Plancha 183 × 250 cm', largo: 2500, ancho: 1830 },
    { id: '152x244', nombre: 'Plancha 152 × 244 cm', largo: 2440, ancho: 1520 }
  ],
  grosoresMm: [12, 15, 18],
  grosoresFondoMm: [3, 5, 9],
  tiendas: [
    {
      nombre: 'Sodimac (Home Center)',
      web: 'https://www.sodimac.cl',
      nota: 'Melamina en 12, 15 y 18 mm, medidas comunes 183 × 250 cm y 152 × 244 cm. Confirme stock en la tienda.'
    },
    {
      nombre: 'Easy',
      web: 'https://www.easy.cl',
      nota: 'Melamina MDP en 15 y 18 mm, en 183 × 250 cm. Confirme stock, precio y si ofrecen corte a medida.'
    },
    {
      nombre: 'Construmart',
      web: 'https://www.construmart.cl',
      nota: 'Consulte si tiene melamina en el grosor y la medida que necesita, y si realiza cortes.'
    }
  ]
};
