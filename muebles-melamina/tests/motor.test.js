// Pruebas del motor de cálculo. Ejecutar con: node muebles-melamina/tests/motor.test.js
'use strict';

const assert = require('assert');
const M = require('../js/motor.js');

const F_183x250 = { id: '183x250', nombre: '183 × 250 cm', largo: 2500, ancho: 1830 };
const F_152x244 = { id: '152x244', nombre: '152 × 244 cm', largo: 2440, ancho: 1520 };

// Mueble consistente: 2 columnas de 373 mm libres y 2 filas de 333 mm libres, grosor 18.
// Ancho total = 746 + 3*18 = 800; alto total = 666 + 3*18 = 720.
function muebleBase(extra) {
  return Object.assign({
    grosorMm: 18,
    profundidadMm: 350,
    anchoMm: 800,
    altoMm: 720,
    espaciosAncho: [373, 373],
    espaciosAlto: [333, 333],
    incluirFondo: false,
    grosorFondoMm: 3,
    kerfMm: 3,
    permitirGirar: true,
    piezasExtra: []
  }, extra || {});
}

const pruebas = [];
function test(nombre, fn) { pruebas.push({ nombre, fn }); }

test('validar acepta medidas consistentes', () => {
  assert.deepStrictEqual(M.validar(muebleBase()), []);
});

test('validar detecta ancho total que no cuadra con los espacios', () => {
  const e = M.validar(muebleBase({ anchoMm: 810 }));
  assert.strictEqual(e.length, 1);
  assert.match(e[0], /ancho total/);
  assert.match(e[0], /800/);
});

test('validar detecta alto total que no cuadra con los espacios', () => {
  const e = M.validar(muebleBase({ altoMm: 700 }));
  assert.strictEqual(e.length, 1);
  assert.match(e[0], /alto total/);
});

test('validar rechaza espacios vacíos o cero', () => {
  const e = M.validar(muebleBase({ espaciosAncho: [373, null] }));
  assert.ok(e.some(x => /espacio 2/.test(x)));
});

test('validar rechaza piezas extra con cantidad no entera', () => {
  const e = M.validar(muebleBase({ piezasExtra: [{ nombre: 'Puerta', ancho: 370, alto: 330, cantidad: 1.5 }] }));
  assert.ok(e.some(x => /cantidad entera/.test(x)));
});

test('piezas base: cantidades y dimensiones correctas con fondo', () => {
  const lista = M.piezasBase(muebleBase({ incluirFondo: true, grosorFondoMm: 3 }));
  const get = tipo => lista.find(p => p.tipo === tipo);

  const lat = get('lateral');
  assert.deepStrictEqual([lat.cantidad, lat.w, lat.h, lat.grosor], [2, 720, 350, 18]);

  const tapa = get('tapa');
  assert.deepStrictEqual([tapa.cantidad, tapa.w, tapa.h], [2, 764, 350]);   // 800 - 2*18

  const div = get('division');
  assert.deepStrictEqual([div.cantidad, div.w, div.h], [1, 684, 350]);      // 720 - 2*18

  const estantes = lista.filter(p => p.tipo === 'estante');
  assert.strictEqual(estantes.length, 2);                                   // una por columna
  estantes.forEach(e => assert.deepStrictEqual([e.cantidad, e.w, e.h], [1, 373, 350]));

  const fondo = get('fondo');
  assert.deepStrictEqual([fondo.cantidad, fondo.w, fondo.h, fondo.grosor], [1, 800, 720, 3]);
});

test('piezas base: sin divisiones ni estantes cuando hay un solo espacio', () => {
  const lista = M.piezasBase(muebleBase({
    espaciosAncho: [746], espaciosAlto: [666],
    anchoMm: 800, altoMm: 720
  }));
  assert.ok(!lista.some(p => p.tipo === 'division'));
  assert.ok(!lista.some(p => p.tipo === 'estante'));
});

test('planificar: resultado sin errores y con lista de corte', () => {
  const r = M.planificar(muebleBase(), [F_183x250]);
  assert.deepStrictEqual(r.errores, []);
  const totalPiezas = r.cortes.reduce((s, c) => s + c.cantidad, 0);
  // 2 laterales + 2 tapas + 1 división + 2 estantes = 7
  assert.strictEqual(totalPiezas, 7);
});

test('planificar: un solo mueble pequeño cabe en una plancha', () => {
  const r = M.planificar(muebleBase(), [F_183x250]);
  assert.strictEqual(r.opciones[0].viable, true);
  assert.strictEqual(r.opciones[0].planchasTotal, 1);
});

test('planificar: piezas que superan la plancha no son viables', () => {
  const r = M.planificar(muebleBase({
    espaciosAncho: [2980], espaciosAlto: [333, 333],
    anchoMm: 2980 + 2 * 18, altoMm: 720
  }), [F_183x250]);
  // Una columna: ancho total = 2980 + 2*18 = 3016. La tapa mide 3016 - 36 = 2980 mm,
  // no cabe en 2500 mm (ni girada en 1830 mm).
  assert.strictEqual(r.opciones[0].viable, false);
  assert.ok(r.opciones[0].noCaben.some(t => /Tapa/.test(t)));
  assert.strictEqual(r.recomendada, null);
});

test('empacar: piezas no se solapan y quedan dentro de la plancha (con kerf)', () => {
  const kerf = 3;
  const items = [];
  for (let i = 0; i < 40; i++) {
    items.push({ w: 200 + (i * 37) % 600, h: 150 + (i * 53) % 500, label: 'P' + i, tipo: 'extra' });
  }
  const r = M.empacar(items, 2500, 1830, { kerf, rotar: true });
  assert.strictEqual(r.noCaben.length, 0);

  let colocadas = 0;
  r.planchas.forEach(pl => {
    const piezas = pl.colocadas;
    colocadas += piezas.length;
    piezas.forEach(p => {
      assert.ok(p.x >= 0 && p.y >= 0, 'dentro del origen');
      assert.ok(p.x + p.w + kerf <= pl.L + 1e-9, 'dentro del largo');
      assert.ok(p.y + p.h + kerf <= pl.A + 1e-9, 'dentro del ancho');
    });
    for (let a = 0; a < piezas.length; a++) {
      for (let b = a + 1; b < piezas.length; b++) {
        const A = piezas[a], B = piezas[b];
        // Ocupación con kerf: cada pieza ocupa (w+kerf) x (h+kerf).
        const solapa =
          A.x < B.x + B.w + kerf && B.x < A.x + A.w + kerf &&
          A.y < B.y + B.h + kerf && B.y < A.y + A.h + kerf;
        assert.ok(!solapa, 'no solapan: ' + A.label + ' con ' + B.label);
      }
    }
  });
  assert.strictEqual(colocadas, items.length);
});

test('empacar: sin girar, la pieza conserva su orientación relativa al sentido de la plancha', () => {
  const r = M.empacar([{ w: 600, h: 300, label: 'X', tipo: 'extra' }], 2500, 1830, { kerf: 0, rotar: false });
  assert.strictEqual(r.planchas[0].colocadas[0].rotada, false);
  assert.strictEqual(r.planchas[0].colocadas[0].w, 600);
});

test('planificar: la recomendada es la de menos planchas', () => {
  const r = M.planificar(muebleBase({
    espaciosAncho: [700, 700], espaciosAlto: [600, 600, 600],
    anchoMm: 1400 + 3 * 18, altoMm: 1800 + 4 * 18, incluirFondo: true, grosorFondoMm: 3,
    piezasExtra: [{ nombre: 'Puerta', ancho: 700, alto: 600, cantidad: 6 }]
  }), [F_183x250, F_152x244]);
  const viables = r.opciones.filter(o => o.viable);
  const minimo = Math.min.apply(null, viables.map(o => o.planchasTotal));
  assert.ok(r.recomendada, 'debe haber recomendada');
  assert.strictEqual(r.recomendada.planchasTotal, minimo);
});

test('planificar: separa planchas por grosor (cuerpo y fondo de 3 mm)', () => {
  const r = M.planificar(muebleBase({ incluirFondo: true, grosorFondoMm: 3 }), [F_183x250]);
  const grosores = r.opciones[0].detalle.map(d => d.grosor).sort((a, b) => a - b);
  assert.deepStrictEqual(grosores, [3, 18]);
});

test('planificar: fondo del mismo grosor del cuerpo se agrupa en la misma compra', () => {
  const r = M.planificar(muebleBase({ incluirFondo: true, grosorFondoMm: 18 }), [F_183x250]);
  assert.strictEqual(r.opciones[0].detalle.length, 1);
});

test('planificar: sin girar, considera ambas orientaciones de la plancha', () => {
  const sinGirar = M.planificar(muebleBase({ permitirGirar: false }), [F_183x250]);
  assert.strictEqual(sinGirar.opciones[0].viable, true);
});

test('planificar: errores de validación se devuelven sin calcular', () => {
  const r = M.planificar(muebleBase({ anchoMm: 900 }), [F_183x250]);
  assert.ok(r.errores.length > 0);
  assert.strictEqual(r.opciones, undefined);
});

let fallos = 0;
pruebas.forEach(p => {
  try {
    p.fn();
    console.log('  ok   ' + p.nombre);
  } catch (err) {
    fallos++;
    console.log('  FALLA ' + p.nombre + '\n       ' + err.message);
  }
});
console.log('\n' + (pruebas.length - fallos) + '/' + pruebas.length + ' pruebas correctas');
if (fallos) process.exit(1);
