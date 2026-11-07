/*
 * Motor de cálculo de planchas de melamina.
 * Medidas del mueble (mm) -> lista de piezas -> ubicación de piezas en planchas
 * (MaxRects "best short side fit", con ancho de sierra / kerf).
 * Sin dependencias. Funciona en el navegador (window.Motor) y en Node (module.exports).
 */
(function (root) {
  'use strict';

  var TOLERANCIA_MM = 1;

  function esNum(v) { return typeof v === 'number' && isFinite(v); }
  function suma(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }
  function redondear(n) { return Math.round(n * 10) / 10; }

  // Ancho total = suma de espacios libres + grosor de cada lateral y cada división.
  // Alto total  = suma de espacios libres + grosor de tapa, base y cada estante.
  function totalesCalculados(p) {
    var t = p.grosorMm;
    return {
      ancho: suma(p.espaciosAncho) + (p.espaciosAncho.length + 1) * t,
      alto: suma(p.espaciosAlto) + (p.espaciosAlto.length + 1) * t
    };
  }

  function validar(p) {
    var e = [];
    var anchos = p.espaciosAncho || [];
    var altos = p.espaciosAlto || [];

    if (!esNum(p.grosorMm) || p.grosorMm <= 0) e.push('El grosor de la plancha debe ser mayor que 0 mm.');
    if (!esNum(p.profundidadMm) || p.profundidadMm <= 0) e.push('La profundidad debe ser mayor que 0 mm.');
    if (!esNum(p.anchoMm) || p.anchoMm <= 0) e.push('El ancho total debe ser mayor que 0 mm.');
    if (!esNum(p.altoMm) || p.altoMm <= 0) e.push('El alto total debe ser mayor que 0 mm.');
    if (!anchos.length) e.push('Ingrese al menos un espacio a lo ancho.');
    if (!altos.length) e.push('Ingrese al menos un espacio a lo alto.');
    anchos.forEach(function (v, i) {
      if (!esNum(v) || v <= 0) e.push('El ancho del espacio ' + (i + 1) + ' debe ser mayor que 0 mm.');
    });
    altos.forEach(function (v, i) {
      if (!esNum(v) || v <= 0) e.push('El alto del espacio ' + (i + 1) + ' debe ser mayor que 0 mm.');
    });
    (p.piezasExtra || []).forEach(function (x, i) {
      if (!esNum(x.ancho) || x.ancho <= 0 || !esNum(x.alto) || x.alto <= 0) {
        e.push('La pieza extra ' + (i + 1) + ' necesita ancho y alto mayores que 0 mm.');
      }
      if (!esNum(x.cantidad) || x.cantidad < 1 || Math.floor(x.cantidad) !== x.cantidad) {
        e.push('La pieza extra ' + (i + 1) + ' necesita una cantidad entera de 1 o más.');
      }
    });
    if (e.length) return e;

    var c = totalesCalculados(p);
    if (Math.abs(c.ancho - p.anchoMm) > TOLERANCIA_MM) {
      e.push('El ancho total (' + p.anchoMm + ' mm) no cuadra con los espacios: según sus medidas debería ser ' +
        redondear(c.ancho) + ' mm (espacios + laterales y divisiones).');
    }
    if (Math.abs(c.alto - p.altoMm) > TOLERANCIA_MM) {
      e.push('El alto total (' + p.altoMm + ' mm) no cuadra con los espacios: según sus medidas debería ser ' +
        redondear(c.alto) + ' mm (espacios + tapa, base y estantes).');
    }
    return e;
  }

  // Piezas de la estructura. Cada una: tipo, nombre, dimensiones (mm), cantidad y grosor.
  function piezasBase(p) {
    var t = p.grosorMm, P = p.profundidadMm, W = p.anchoMm, H = p.altoMm;
    var anchos = p.espaciosAncho, altos = p.espaciosAlto;
    var lista = [];

    function add(tipo, label, w, h, cantidad, grosor) {
      lista.push({ tipo: tipo, label: label, w: w, h: h, cantidad: cantidad, grosor: grosor });
    }

    add('lateral', 'Lateral', H, P, 2, t);
    add('tapa', 'Tapa / base', W - 2 * t, P, 2, t);
    if (anchos.length > 1) add('division', 'División vertical', H - 2 * t, P, anchos.length - 1, t);
    if (altos.length > 1) {
      // Un estante por cada espacio de columna, entre cada par de filas.
      anchos.forEach(function (a) { add('estante', 'Estante', a, P, altos.length - 1, t); });
    }
    if (p.incluirFondo) add('fondo', 'Fondo', W, H, 1, p.grosorFondoMm || 3);
    (p.piezasExtra || []).forEach(function (x) {
      add('extra', x.nombre || 'Pieza extra', x.ancho, x.alto, x.cantidad, t);
    });
    return lista;
  }

  // Agrupa por grosor: cada grosor se compra por separado.
  function agrupar(lista) {
    var grupos = {};
    lista.forEach(function (pz) {
      if (!pz.cantidad) return;
      var clave = String(pz.grosor);
      if (!grupos[clave]) grupos[clave] = { grosor: pz.grosor, items: [] };
      for (var i = 0; i < pz.cantidad; i++) {
        grupos[clave].items.push({ w: pz.w, h: pz.h, label: pz.label, tipo: pz.tipo });
      }
    });
    return Object.keys(grupos).map(function (k) { return grupos[k]; })
      .sort(function (a, b) { return a.grosor - b.grosor; });
  }

  // ---------- Empaquetado MaxRects (best short side fit) ----------

  function podar(rs) {
    var validas = rs.filter(function (r) { return r.w > 0 && r.h > 0; });
    var out = [];
    for (var i = 0; i < validas.length; i++) {
      var r = validas[i], contenida = false;
      for (var j = 0; j < validas.length && !contenida; j++) {
        if (i === j) continue;
        var s = validas[j];
        if (r.x >= s.x && r.y >= s.y && r.x + r.w <= s.x + s.w && r.y + r.h <= s.y + s.h) {
          var identica = r.x === s.x && r.y === s.y && r.w === s.w && r.h === s.h;
          if (!identica || j < i) contenida = true;
        }
      }
      if (!contenida) out.push(r);
    }
    return out;
  }

  function Plancha(L, A) {
    this.L = L;
    this.A = A;
    this.libres = [{ x: 0, y: 0, w: L, h: A }];
    this.colocadas = [];
  }

  // ew/eh: tamaño de la pieza más el kerf (lo que realmente ocupa).
  Plancha.prototype.insertar = function (item, ew, eh, rotar) {
    var mejor = null;

    function probar(fr, w, h, rot) {
      if (w > fr.w || h > fr.h) return;
      var corto = Math.min(fr.w - w, fr.h - h);
      var largo = Math.max(fr.w - w, fr.h - h);
      if (!mejor || corto < mejor.corto || (corto === mejor.corto && largo < mejor.largo)) {
        mejor = { x: fr.x, y: fr.y, w: w, h: h, rot: rot, corto: corto, largo: largo };
      }
    }

    this.libres.forEach(function (fr) {
      probar(fr, ew, eh, false);
      if (rotar) probar(fr, eh, ew, true);
    });
    if (!mejor) return false;

    var real = mejor.rot ? { w: item.h, h: item.w } : { w: item.w, h: item.h };
    this.colocadas.push({
      x: mejor.x, y: mejor.y, w: real.w, h: real.h,
      rotada: mejor.rot, label: item.label, tipo: item.tipo
    });
    this.dividir(mejor.x, mejor.y, mejor.w, mejor.h);
    return true;
  };

  Plancha.prototype.dividir = function (px, py, pw, ph) {
    var nuevas = [];
    this.libres.forEach(function (fr) {
      var intersecta = px < fr.x + fr.w && px + pw > fr.x && py < fr.y + fr.h && py + ph > fr.y;
      if (!intersecta) { nuevas.push(fr); return; }
      if (px > fr.x) nuevas.push({ x: fr.x, y: fr.y, w: px - fr.x, h: fr.h });
      if (px + pw < fr.x + fr.w) nuevas.push({ x: px + pw, y: fr.y, w: fr.x + fr.w - (px + pw), h: fr.h });
      if (py > fr.y) nuevas.push({ x: fr.x, y: fr.y, w: fr.w, h: py - fr.y });
      if (py + ph < fr.y + fr.h) nuevas.push({ x: fr.x, y: py + ph, w: fr.w, h: fr.y + fr.h - (py + ph) });
    });
    this.libres = podar(nuevas);
  };

  Plancha.prototype.resumen = function () {
    var area = 0;
    this.colocadas.forEach(function (c) { area += c.w * c.h; });
    return { L: this.L, A: this.A, colocadas: this.colocadas, area: area };
  };

  function cabe(ew, eh, L, A, rotar) {
    return (ew <= L && eh <= A) || (rotar && eh <= L && ew <= A);
  }

  function empacar(items, L, A, opts) {
    var kerf = opts.kerf, rotar = opts.rotar;
    var orden = items.slice().sort(function (a, b) {
      return (b.w * b.h) - (a.w * a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h);
    });
    var planchas = [], noCaben = [];
    orden.forEach(function (it) {
      var ew = it.w + kerf, eh = it.h + kerf;
      if (!cabe(ew, eh, L, A, rotar)) { noCaben.push(it); return; }
      for (var k = 0; k < planchas.length; k++) {
        if (planchas[k].insertar(it, ew, eh, rotar)) return;
      }
      var nueva = new Plancha(L, A);
      nueva.insertar(it, ew, eh, rotar);
      planchas.push(nueva);
    });
    return { planchas: planchas, noCaben: noCaben };
  }

  // ---------- Evaluación de formatos ----------

  function evaluarOrientacion(grupos, L, A, opts) {
    var res = { viable: true, planchasTotal: 0, aprovechamiento: 0, detalle: [], noCaben: [] };
    var areaPiezas = 0, areaPlanchas = 0;
    grupos.forEach(function (g) {
      var r = empacar(g.items, L, A, opts);
      var planchas = r.planchas.map(function (pl) { return pl.resumen(); });
      r.noCaben.forEach(function (it) {
        res.noCaben.push(it.label + ' ' + redondear(it.w) + ' × ' + redondear(it.h) + ' mm');
      });
      if (r.noCaben.length) res.viable = false;
      res.detalle.push({ grosor: g.grosor, cantidad: planchas.length, planchas: planchas });
      res.planchasTotal += planchas.length;
      areaPlanchas += planchas.length * L * A;
      planchas.forEach(function (pl) { areaPiezas += pl.area; });
    });
    res.aprovechamiento = areaPlanchas ? areaPiezas / areaPlanchas : 0;
    return res;
  }

  function mejorQue(a, b) {
    if (a.viable !== b.viable) return a.viable;
    if (a.planchasTotal !== b.planchasTotal) return a.planchasTotal < b.planchasTotal;
    return a.aprovechamiento > b.aprovechamiento;
  }

  // Si no se pueden girar piezas, la plancha sí puede colocarse en cualquier orientación.
  function evaluarFormato(grupos, f, opts) {
    var orientaciones = opts.rotar
      ? [[f.largo, f.ancho]]
      : [[f.largo, f.ancho], [f.ancho, f.largo]];
    var mejor = null;
    orientaciones.forEach(function (o) {
      var r = evaluarOrientacion(grupos, o[0], o[1], opts);
      if (!mejor || mejorQue(r, mejor)) mejor = r;
    });
    mejor.formato = f;
    return mejor;
  }

  function resumenCortes(lista) {
    var mapa = {};
    lista.forEach(function (pz) {
      if (!pz.cantidad) return;
      var largo = redondear(Math.max(pz.w, pz.h));
      var ancho = redondear(Math.min(pz.w, pz.h));
      var clave = [pz.grosor, pz.label, largo, ancho].join('|');
      if (!mapa[clave]) mapa[clave] = { grosor: pz.grosor, pieza: pz.label, largo: largo, ancho: ancho, cantidad: 0 };
      mapa[clave].cantidad += pz.cantidad;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; }).sort(function (a, b) {
      return (a.grosor - b.grosor) ||
        (a.pieza < b.pieza ? -1 : a.pieza > b.pieza ? 1 : 0) ||
        (b.largo * b.ancho - a.largo * a.ancho);
    });
  }

  /*
   * p: medidas del mueble (ver validar).
   * formatos: [{id, nombre, largo, ancho}] en mm.
   * Devuelve { errores } si los datos no son consistentes; si no, cortes, totales,
   * opciones por formato y la recomendada (menos planchas; desempate por aprovechamiento).
   */
  function planificar(p, formatos) {
    var errores = validar(p);
    if (errores.length) return { errores: errores };

    var kerf = esNum(p.kerfMm) && p.kerfMm >= 0 ? p.kerfMm : 3;
    var opts = { kerf: kerf, rotar: p.permitirGirar !== false };
    var lista = piezasBase(p);
    var grupos = agrupar(lista);

    var evaluadas = formatos.map(function (f) { return evaluarFormato(grupos, f, opts); });
    var viables = evaluadas.filter(function (r) { return r.viable; }).sort(function (a, b) {
      if (mejorQue(a, b)) return -1;
      if (mejorQue(b, a)) return 1;
      return 0;
    });

    return {
      errores: [],
      cortes: resumenCortes(lista),
      totales: totalesCalculados(p),
      opciones: evaluadas,
      recomendada: viables[0] || null,
      kerf: kerf,
      rotar: opts.rotar
    };
  }

  var api = {
    TOLERANCIA_MM: TOLERANCIA_MM,
    validar: validar,
    totalesCalculados: totalesCalculados,
    piezasBase: piezasBase,
    empacar: empacar,
    planificar: planificar
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.Motor = api;
})(typeof window !== 'undefined' ? window : globalThis);
