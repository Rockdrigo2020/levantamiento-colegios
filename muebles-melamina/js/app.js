(function () {
  'use strict';

  var C = window.CONFIG_MELAMINA;
  var CAT = window.CATALOGO_MELAMINA;
  var M = window.Motor;
  var CLAVE = 'melamina-borrador-v1';
  var PASOS = ['Mueble', 'Espacios', 'Planchas', 'Resultado', 'Pago', 'Informe'];
  var COLORES = {
    lateral: '#f59e0b', tapa: '#60a5fa', division: '#34d399',
    estante: '#a78bfa', fondo: '#94a3b8', extra: '#f472b6'
  };
  var NOMBRES_TIPO = {
    lateral: 'Laterales', tapa: 'Tapa y base', division: 'Divisiones verticales',
    estante: 'Estantes', fondo: 'Fondo', extra: 'Piezas extra'
  };
  var EJEMPLO = {
    nombre: 'Librero 2 columnas',
    grosorMm: 18, profundidadMm: 350, anchoMm: 854, altoMm: 1372,
    espaciosAncho: [400, 400], espaciosAlto: [500, 300, 500],
    incluirFondo: true, grosorFondoMm: 3, kerfMm: 3, permitirGirar: true,
    piezasExtra: [{ nombre: 'Puerta', ancho: 400, alto: 500, cantidad: 2 }]
  };

  var estado = nuevoEstado();

  // ---------- Estado ----------

  function nuevoEstado() {
    return {
      paso: 0,
      proyecto: {
        nombre: '', grosorMm: 18, profundidadMm: null, anchoMm: null, altoMm: null,
        espaciosAncho: [null, null], espaciosAlto: [null, null],
        incluirFondo: false, grosorFondoMm: 3, kerfMm: 3, permitirGirar: true, piezasExtra: []
      },
      formatos: {},
      otroFormato: { largo: null, ancho: null },
      planoDataUrl: null,
      confirmado: false,
      orden: null,
      email: '',
      emailConfirmacion: '',
      pagado: false
    };
  }

  function cargarBorrador() {
    try {
      var raw = window.localStorage.getItem(CLAVE);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (!d || !d.proyecto) return;
      estado.proyecto = Object.assign(estado.proyecto, d.proyecto);
      estado.formatos = Object.assign({}, d.formatos || {});
      estado.otroFormato = Object.assign(estado.otroFormato, d.otroFormato || {});
      estado.paso = Math.min(Number(d.paso) || 0, 3);
      estado.confirmado = !!d.confirmado;
      estado.orden = d.orden || null;
      estado.email = d.email || '';
      estado.emailConfirmacion = d.emailConfirmacion || '';
    } catch (e) { /* sin almacenamiento: se empieza en blanco */ }
  }

  function guardarBorrador() {
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify({
        proyecto: estado.proyecto, formatos: estado.formatos, otroFormato: estado.otroFormato,
        paso: estado.paso, confirmado: estado.confirmado, orden: estado.orden,
        email: estado.email, emailConfirmacion: estado.emailConfirmacion
      }));
    } catch (e) { /* ignorar */ }
  }

  function borrarBorrador() {
    try { window.localStorage.removeItem(CLAVE); } catch (e) { /* ignorar */ }
  }

  // ---------- Utilidades ----------

  function $(sel) { return document.querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function aNum(v) {
    if (v == null || String(v).trim() === '') return null;
    var n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function redondear(n) { return Math.round(n * 10) / 10; }
  function fmt(n) {
    return n == null || !isFinite(n) ? '—' : redondear(n).toLocaleString('es-CL');
  }
  function fmtCLP(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }
  function valorInput(v) { return v == null ? '' : esc(v); }

  function setPath(obj, ruta, valor) {
    var partes = ruta.split('.');
    var o = obj;
    for (var i = 0; i < partes.length - 1; i++) o = o[partes[i]];
    o[partes[partes.length - 1]] = valor;
  }

  function emailValido(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

  function generarOrden() {
    return 'MM-' + Date.now().toString(36).toUpperCase().slice(-6) + '-' +
      Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function formatoActivo(id) {
    if (id === 'otro') return !!estado.formatos.otro;
    return estado.formatos[id] !== false;
  }

  function listaErrores(errores) {
    return '<ul class="errores">' + errores.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>';
  }

  function mostrarAviso(texto) {
    var a = $('#aviso');
    if (!a) return;
    a.textContent = texto || '';
    a.hidden = !texto;
  }

  // ---------- Datos para el motor ----------

  function proyectoParaMotor() {
    var p = estado.proyecto;
    return {
      grosorMm: p.grosorMm,
      profundidadMm: p.profundidadMm,
      anchoMm: p.anchoMm,
      altoMm: p.altoMm,
      espaciosAncho: p.espaciosAncho,
      espaciosAlto: p.espaciosAlto,
      incluirFondo: p.incluirFondo,
      grosorFondoMm: p.grosorFondoMm,
      kerfMm: p.kerfMm,
      permitirGirar: p.permitirGirar,
      piezasExtra: p.piezasExtra.map(function (x) {
        return { nombre: x.nombre, ancho: x.ancho, alto: x.alto, cantidad: x.cantidad };
      })
    };
  }

  function formatosActivos() {
    var lista = CAT.formatos.filter(function (f) { return formatoActivo(f.id); }).map(function (f) {
      return { id: f.id, nombre: f.nombre, largo: f.largo, ancho: f.ancho };
    });
    var o = estado.otroFormato;
    if (formatoActivo('otro') && o.largo > 0 && o.ancho > 0) {
      lista.push({
        id: 'otro',
        nombre: 'Medida personalizada ' + fmt(o.largo) + ' × ' + fmt(o.ancho) + ' mm',
        largo: o.largo, ancho: o.ancho
      });
    }
    return lista;
  }

  function calcular() {
    var formatos = formatosActivos();
    if (!formatos.length) return { errores: ['Seleccione al menos un formato de plancha.'] };
    return M.planificar(proyectoParaMotor(), formatos);
  }

  // ---------- Validación por paso ----------

  function validarPaso(paso) {
    var p = estado.proyecto;
    var e = [];

    if (paso === 0) {
      if (!(p.grosorMm > 0)) e.push('Indique el grosor de la plancha.');
      if (!(p.profundidadMm > 0)) e.push('Indique la profundidad del mueble.');
      if (!(p.anchoMm > 0)) e.push('Indique el ancho total del mueble.');
      if (!(p.altoMm > 0)) e.push('Indique el alto total del mueble.');
      return e;
    }
    if (paso === 1) return M.validar(proyectoParaMotor());
    if (paso === 2) {
      if (!formatosActivos().length) e.push('Seleccione al menos un formato de plancha.');
      if (formatoActivo('otro') && !(estado.otroFormato.largo > 0 && estado.otroFormato.ancho > 0)) {
        e.push('Indique el largo y el ancho de la medida personalizada.');
      }
      if (p.incluirFondo && !(p.grosorFondoMm > 0)) e.push('Indique el grosor del fondo.');
      if (!(p.kerfMm >= 0)) e.push('Indique el ancho de la sierra (use 0 si no aplica).');
      return e.concat(M.validar(proyectoParaMotor()));
    }
    if (paso === 3) {
      var res = calcular();
      if (res.errores.length) return res.errores;
      if (!res.recomendada) return ['Ningún formato seleccionado sirve para estas piezas. Revise medidas o formatos.'];
      if (!estado.confirmado) return ['Confirme que las medidas están correctas para continuar.'];
      return [];
    }
    return [];
  }

  // ---------- Dibujos SVG ----------

  function svgPlancha(pl, titulo) {
    var fs = Math.max(8, Math.round(pl.A / 26));
    var piezas = pl.colocadas.map(function (c) {
      var texto = (c.w >= fs * 6 && c.h >= fs * 1.6)
        ? '<text x="' + (c.x + c.w / 2) + '" y="' + (c.y + c.h / 2) + '" font-size="' + fs +
          '" text-anchor="middle" dominant-baseline="middle" fill="#0f172a">' +
          esc(fmt(c.w) + ' × ' + fmt(c.h)) + '</text>'
        : '';
      return '<g><title>' + esc(c.label + ' ' + fmt(c.w) + ' × ' + fmt(c.h) + ' mm') + '</title>' +
        '<rect x="' + c.x + '" y="' + c.y + '" width="' + c.w + '" height="' + c.h + '" fill="' +
        (COLORES[c.tipo] || '#cbd5e1') + '" stroke="#0f172a" stroke-width="' + (fs * 0.08) + '"/>' +
        texto + '</g>';
    }).join('');
    return '<figure class="plancha"><figcaption>' + esc(titulo) + '</figcaption>' +
      '<svg viewBox="0 0 ' + pl.L + ' ' + pl.A + '" role="img" aria-label="' + esc(titulo) + '">' +
      '<rect x="0" y="0" width="' + pl.L + '" height="' + pl.A + '" fill="#f8fafc" stroke="#334155" stroke-width="' + (fs * 0.15) + '"/>' +
      piezas + '</svg></figure>';
  }

  function svgMueble(p) {
    var t = Number(p.grosorMm) || 0;
    var A = p.espaciosAncho.map(function (v) { return Number(v) || 0; });
    var B = p.espaciosAlto.map(function (v) { return Number(v) || 0; });
    var completo = t > 0 && A.every(function (v) { return v > 0; }) && B.every(function (v) { return v > 0; });
    if (!completo) return '<p class="ayuda">Complete las medidas para ver el dibujo del mueble.</p>';

    var tot = M.totalesCalculados({ grosorMm: t, espaciosAncho: A, espaciosAlto: B });
    var fs = Math.round(Math.max(tot.ancho, tot.alto) / 24);
    var celdas = '';
    var y = t;
    B.forEach(function (h, r) {
      var x = t;
      A.forEach(function (w, c) {
        var texto = (w >= fs * 6 && h >= fs * 2)
          ? '<text x="' + (x + w / 2) + '" y="' + (y + h / 2) + '" font-size="' + fs +
            '" text-anchor="middle" dominant-baseline="middle" fill="#0f172a">' + esc(fmt(w) + ' × ' + fmt(h)) + '</text>'
          : '';
        celdas += '<rect class="celda" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>' + texto;
        x += w + t;
      });
      y += h + t;
    });
    return '<svg class="mueble" viewBox="0 0 ' + tot.ancho + ' ' + tot.alto + '" role="img" aria-label="Dibujo de espacios del mueble">' +
      '<rect class="marco" x="0" y="0" width="' + tot.ancho + '" height="' + tot.alto + '"/>' + celdas + '</svg>';
  }

  function leyenda() {
    return '<div class="leyenda">' + Object.keys(COLORES).map(function (k) {
      return '<span><i style="background:' + COLORES[k] + '"></i>' + esc(NOMBRES_TIPO[k]) + '</span>';
    }).join('') + '</div>';
  }

  // ---------- Vistas ----------

  function navegacion(textoSiguiente) {
    return '<div class="nav"><button type="button" class="sec" data-accion="atras">Atrás</button>' +
      '<button type="button" class="pri" id="btn-sig" data-accion="siguiente">' + (textoSiguiente || 'Siguiente') + '</button></div>';
  }

  function chips(ruta, opciones, actual) {
    return '<div class="chips">' + opciones.map(function (o) {
      return '<button type="button" class="chip' + (Number(actual) === o ? ' on' : '') +
        '" data-accion="chip" data-campo="' + ruta + '" data-valor="' + o + '">' + o + ' mm</button>';
    }).join('') + '</div>';
  }

  function campoNum(etiqueta, ruta, valor, ayuda) {
    return '<label class="campo"><span>' + etiqueta + '</span>' +
      '<input type="text" inputmode="decimal" autocomplete="off" data-campo="' + ruta + '" data-tipo="num" value="' + valorInput(valor) + '">' +
      (ayuda ? '<small>' + ayuda + '</small>' : '') + '</label>';
  }

  function campoLista(lista, i, etiqueta, valor) {
    return '<label class="campo corto"><span>' + etiqueta + '</span>' +
      '<input type="text" inputmode="decimal" autocomplete="off" data-lista="' + lista + '" data-idx="' + i + '" value="' + valorInput(valor) + '"></label>';
  }

  function checkbox(ruta, marcado, etiqueta) {
    return '<label class="check"><input type="checkbox" data-campo="' + ruta + '" ' + (marcado ? 'checked' : '') + '> ' + etiqueta + '</label>';
  }

  function htmlMueble() {
    var p = estado.proyecto;
    return '<section class="tarjeta"><h2>1. Datos del mueble</h2>' +
      '<p class="ayuda">Ingrese las medidas exteriores del mueble en milímetros (mm). Puede usar coma o punto para decimales.</p>' +
      '<div class="grilla">' +
        '<label class="campo"><span>Nombre del proyecto (opcional)</span>' +
          '<input type="text" data-campo="proyecto.nombre" value="' + valorInput(p.nombre) + '" placeholder="Ej: Librero living"></label>' +
        '<div class="campo"><span>Grosor de la plancha</span>' + chips('proyecto.grosorMm', CAT.grosoresMm, p.grosorMm) +
          '<input type="text" inputmode="decimal" autocomplete="off" data-campo="proyecto.grosorMm" data-tipo="num" value="' + valorInput(p.grosorMm) + '"></div>' +
      '</div>' +
      '<div class="grilla">' +
        campoNum('Profundidad (mm)', 'proyecto.profundidadMm', p.profundidadMm, 'Fondo del mueble, de adelante hacia atrás.') +
        campoNum('Ancho total exterior (mm)', 'proyecto.anchoMm', p.anchoMm, 'Costado a costado.') +
        campoNum('Alto total exterior (mm)', 'proyecto.altoMm', p.altoMm, 'Desde la base hasta la tapa.') +
      '</div>' +
      '<label class="campo"><span>Dibujo o foto del mueble (opcional)</span>' +
        '<input type="file" accept="image/*"><small>Sirve de referencia en pantalla. No se incluye en el informe.</small></label>' +
      (estado.planoDataUrl ? '<img class="plano" alt="Dibujo cargado" src="' + estado.planoDataUrl + '">' : '') +
      '<div id="mensajes"></div>' + navegacion() +
      '</section>';
  }

  function htmlEspacios() {
    var p = estado.proyecto;
    return '<section class="tarjeta"><h2>2. Espacios del mueble</h2>' +
      '<p class="ayuda">Indique cuántos espacios tiene a lo ancho (columnas) y a lo alto (filas), y la medida <strong>libre</strong> de cada uno: el hueco interior entre laterales, divisiones, tapa, base y estantes. Los grosores se suman solos.</p>' +
      '<div class="grilla">' +
        '<label class="campo"><span>Columnas (espacios a lo ancho)</span>' +
          '<input type="number" min="1" max="12" data-cuenta="espaciosAncho" value="' + p.espaciosAncho.length + '"></label>' +
        '<label class="campo"><span>Filas (espacios a lo alto)</span>' +
          '<input type="number" min="1" max="12" data-cuenta="espaciosAlto" value="' + p.espaciosAlto.length + '"></label>' +
      '</div>' +
      '<div class="dos">' +
        '<fieldset><legend>Ancho de cada espacio (mm)</legend>' +
          p.espaciosAncho.map(function (v, i) { return campoLista('espaciosAncho', i, 'Columna ' + (i + 1), v); }).join('') +
        '</fieldset>' +
        '<fieldset><legend>Alto de cada espacio (mm)</legend>' +
          p.espaciosAlto.map(function (v, i) { return campoLista('espaciosAlto', i, 'Fila ' + (i + 1), v); }).join('') +
        '</fieldset>' +
      '</div>' +
      '<p id="totales" class="totales"></p>' +
      '<div id="vista" class="vista"></div>' +
      '<div id="mensajes"></div>' + navegacion() +
      '</section>';
  }

  function htmlPlanchas() {
    var p = estado.proyecto;
    var formatos = CAT.formatos.map(function (f) {
      return checkbox('formatos.' + f.id, formatoActivo(f.id), esc(f.nombre));
    }).join('');
    var filasExtra = p.piezasExtra.map(function (x, i) {
      return '<tr>' +
        '<td><input type="text" data-extra="' + i + '" data-clave="nombre" value="' + valorInput(x.nombre) + '" placeholder="Puerta"></td>' +
        '<td><input type="text" inputmode="decimal" data-extra="' + i + '" data-clave="ancho" value="' + valorInput(x.ancho) + '"></td>' +
        '<td><input type="text" inputmode="decimal" data-extra="' + i + '" data-clave="alto" value="' + valorInput(x.alto) + '"></td>' +
        '<td><input type="text" inputmode="numeric" data-extra="' + i + '" data-clave="cantidad" value="' + valorInput(x.cantidad) + '"></td>' +
        '<td><button type="button" class="sec" data-accion="quitarExtra" data-idx="' + i + '">Quitar</button></td>' +
        '</tr>';
    }).join('');

    return '<section class="tarjeta"><h2>3. Planchas y piezas</h2>' +
      '<h3>Formatos de plancha disponibles</h3>' +
      '<p class="ayuda">Se calculará cuántas planchas necesita con cada formato marcado.</p>' +
      formatos +
      checkbox('formatos.otro', formatoActivo('otro'), 'Otra medida (mm)') +
      (formatoActivo('otro')
        ? '<div class="grilla">' +
            campoNum('Largo (mm)', 'otroFormato.largo', estado.otroFormato.largo) +
            campoNum('Ancho (mm)', 'otroFormato.ancho', estado.otroFormato.ancho) +
          '</div>'
        : '') +
      '<h3>Fondo y corte</h3>' +
      checkbox('proyecto.incluirFondo', p.incluirFondo, 'El mueble lleva fondo (trasera)') +
      (p.incluirFondo
        ? '<div class="campo"><span>Grosor del fondo</span>' + chips('proyecto.grosorFondoMm', CAT.grosoresFondoMm, p.grosorFondoMm) +
          '<input type="text" inputmode="decimal" autocomplete="off" data-campo="proyecto.grosorFondoMm" data-tipo="num" value="' + valorInput(p.grosorFondoMm) + '"></div>'
        : '') +
      '<div class="grilla">' +
        campoNum('Ancho de la sierra (mm)', 'proyecto.kerfMm', p.kerfMm, 'Normalmente 3 mm. Use 0 si no aplica.') +
      '</div>' +
      checkbox('proyecto.permitirGirar', p.permitirGirar, 'Permitir girar las piezas (desactive si la veta debe ir en una sola dirección)') +
      '<h3>Piezas adicionales</h3>' +
      '<p class="ayuda">Puertas, cajones, repisas sueltas u otras piezas de melamina del mismo grosor.</p>' +
      '<div class="tabla-scroll"><table class="extras"><thead><tr><th>Nombre</th><th>Ancho (mm)</th><th>Alto (mm)</th><th>Cantidad</th><th></th></tr></thead>' +
      '<tbody>' + filasExtra + '</tbody></table></div>' +
      '<button type="button" class="sec" data-accion="agregarExtra">+ Agregar pieza</button>' +
      '<div id="mensajes"></div>' + navegacion('Ver resultado') +
      '</section>';
  }

  function tablaCortes(cortes) {
    return '<div class="tabla-scroll"><table><thead><tr><th>Pieza</th><th>Grosor</th><th>Medida (mm)</th><th class="num">Cantidad</th></tr></thead><tbody>' +
      cortes.map(function (c) {
        return '<tr><td>' + esc(c.pieza) + '</td><td>' + c.grosor + ' mm</td><td>' +
          fmt(c.largo) + ' × ' + fmt(c.ancho) + '</td><td class="num">' + c.cantidad + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function detalleOpcion(o) {
    return o.viable
      ? o.detalle.map(function (d) { return d.cantidad + ' plancha(s) de ' + d.grosor + ' mm'; }).join(' · ')
      : 'No caben: ' + o.noCaben.join(', ');
  }

  function tablaOpciones(opciones, rec) {
    return '<div class="tabla-scroll"><table><thead><tr><th>Formato</th><th class="num">Planchas</th><th class="num">Aprovechamiento</th><th>Detalle</th></tr></thead><tbody>' +
      opciones.map(function (o) {
        var es = o === rec;
        return '<tr class="' + (es ? 'rec' : '') + '"><td>' + esc(o.formato.nombre) + (es ? ' <strong>(recomendada)</strong>' : '') + '</td>' +
          '<td class="num">' + (o.viable ? o.planchasTotal : '—') + '</td>' +
          '<td class="num">' + (o.viable ? Math.round(o.aprovechamiento * 100) + ' %' : '—') + '</td>' +
          '<td>' + esc(detalleOpcion(o)) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
  }

  function htmlDiagramas(rec) {
    if (!rec) return '';
    var figuras = [];
    rec.detalle.forEach(function (d) {
      d.planchas.forEach(function (pl, i) {
        figuras.push(svgPlancha(pl, 'Grosor ' + d.grosor + ' mm · plancha ' + (i + 1) + ' de ' + d.cantidad +
          ' · ' + fmt(pl.L) + ' × ' + fmt(pl.A) + ' mm'));
      });
    });
    return '<div class="planchas">' + figuras.join('') + '</div>';
  }

  function listaTiendas() {
    return '<ul class="tiendas">' + CAT.tiendas.map(function (t) {
      return '<li><strong>' + esc(t.nombre) + '</strong> — <a href="' + esc(t.web) + '" target="_blank" rel="noopener">' + esc(t.web.replace('https://', '')) + '</a><br><span class="ayuda">' + esc(t.nota) + '</span></li>';
    }).join('') + '</ul>';
  }

  function htmlResultado() {
    var res = calcular();
    var cuerpo = '';
    if (!res.errores.length) {
      cuerpo = '<h3>Lista de corte</h3>' + tablaCortes(res.cortes) +
        '<h3>Planchas necesarias</h3>' + tablaOpciones(res.opciones, res.recomendada) +
        (res.recomendada
          ? '<h3>Distribución de cortes (formato recomendado)</h3>' + leyenda() + htmlDiagramas(res.recomendada)
          : '') +
        '<h3>Dónde comprar</h3>' + listaTiendas() +
        '<p class="ayuda">Las medidas y cantidades son una referencia de cálculo. Confirme disponibilidad, grosor y precio en la tienda antes de comprar.</p>' +
        checkbox('confirmado', estado.confirmado, '<strong>Confirmo que las medidas están correctas.</strong>');
    }
    return '<section class="tarjeta"><h2>4. Resultado</h2>' + cuerpo +
      '<div id="mensajes"></div>' + navegacion('Continuar al pago') + '</section>';
  }

  function htmlPago() {
    if (!estado.orden) estado.orden = generarOrden();
    var esBackend = C.modo === 'backend';
    var boton = esBackend
      ? '<button type="button" class="pri" data-accion="pagarBackend">Pagar ' + fmtCLP(C.precioCLP) + '</button>'
      : '<button type="button" class="pri" data-accion="pagarDemo">Simular pago aprobado (modo prueba)</button>';
    return '<section class="tarjeta"><h2>5. Pago</h2>' +
      '<div class="resumen"><p><strong>Informe de corte de melamina</strong> · Orden ' + esc(estado.orden) + '</p>' +
      '<p class="precio">' + fmtCLP(C.precioCLP) + '</p>' +
      '<p class="ayuda">Incluye la lista de corte, las planchas necesarias por formato, la distribución de cortes y las tiendas sugeridas. Se envía al correo que usted indique.</p></div>' +
      (esBackend ? '' : '<p class="aviso">Modo prueba: no se realiza ningún cobro.</p>') +
      '<div class="nav"><button type="button" class="sec" data-accion="atras">Atrás</button>' + boton + '</div>' +
      '</section>';
  }

  function htmlInforme() {
    var puedeEnviar = !!C.endpoint;
    return '<section class="tarjeta"><h2>6. Enviar informe</h2>' +
      '<p class="estado ok">Pago registrado · Orden ' + esc(estado.orden) + '</p>' +
      '<div class="grilla">' +
        '<label class="campo"><span>Correo donde recibir el informe</span>' +
          '<input type="email" autocomplete="email" data-campo="email" value="' + valorInput(estado.email) + '"></label>' +
        '<label class="campo"><span>Repita el correo</span>' +
          '<input type="email" autocomplete="off" data-campo="emailConfirmacion" value="' + valorInput(estado.emailConfirmacion) + '"></label>' +
      '</div>' +
      '<div class="nav">' +
        '<button type="button" class="sec" data-accion="descargar">Descargar informe (HTML)</button>' +
        '<button type="button" class="sec" data-accion="abrirInforme">Abrir para imprimir / PDF</button>' +
        '<button type="button" class="pri" data-accion="enviar"' + (puedeEnviar ? '' : ' disabled') + '>Enviar por correo</button>' +
      '</div>' +
      (puedeEnviar ? '' : '<p class="aviso">El envío por correo todavía no está configurado. Puede descargar o imprimir el informe.</p>') +
      '<p id="estadoEnvio" class="estado" role="status"></p>' +
      '<p><button type="button" class="sec" data-accion="nuevo">Calcular otro mueble</button></p>' +
      '</section>';
  }

  // ---------- Informe (HTML autocontenido: descarga, impresión y correo) ----------

  var ESTILO_INFORME = 'body{font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:880px;margin:24px auto;padding:0 16px;line-height:1.45}' +
    'h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:24px 0 8px;border-bottom:2px solid #0f766e;padding-bottom:4px}' +
    'table{width:100%;border-collapse:collapse;font-size:.92rem;margin-bottom:8px}th,td{padding:7px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}' +
    'td.num,th.num{text-align:right}tr.rec td{background:#ecfdf5}.ayuda{color:#64748b;font-size:.88rem}' +
    '.planchas{display:grid;gap:14px}figure.plancha{margin:0}figure.plancha figcaption{font-size:.88rem;color:#475569;margin-bottom:4px}' +
    'figure.plancha svg{width:100%;height:auto;display:block;border:1px solid #cbd5e1}.leyenda span{display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:.85rem}' +
    '.leyenda i{width:12px;height:12px;border-radius:3px;display:inline-block}.tiendas li{margin-bottom:8px}' +
    '@media print{body{margin:0}h2{break-after:avoid}figure.plancha{break-inside:avoid}}';

  function generarInformeHTML(res) {
    var p = estado.proyecto;
    var rec = res.recomendada;
    var fecha = new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
    var espacios = p.espaciosAncho.length + ' columna(s) × ' + p.espaciosAlto.length + ' fila(s)';
    var cuerpo =
      '<h1>Informe de corte de melamina</h1>' +
      '<p>' + esc(p.nombre || 'Mueble sin nombre') + ' · Orden ' + esc(estado.orden) + ' · ' + esc(fecha) + '</p>' +
      '<h2>Medidas del mueble</h2>' +
      '<table><tbody>' +
        '<tr><td>Ancho total exterior</td><td class="num">' + fmt(p.anchoMm) + ' mm</td></tr>' +
        '<tr><td>Alto total exterior</td><td class="num">' + fmt(p.altoMm) + ' mm</td></tr>' +
        '<tr><td>Profundidad</td><td class="num">' + fmt(p.profundidadMm) + ' mm</td></tr>' +
        '<tr><td>Grosor de plancha</td><td class="num">' + fmt(p.grosorMm) + ' mm</td></tr>' +
        '<tr><td>Espacios</td><td class="num">' + esc(espacios) + '</td></tr>' +
        '<tr><td>Ancho de sierra considerado</td><td class="num">' + fmt(res.kerf) + ' mm</td></tr>' +
      '</tbody></table>' +
      '<p class="ayuda">Columnas (ancho libre): ' + esc(p.espaciosAncho.map(fmt).join(' · ')) +
        '. Filas (alto libre): ' + esc(p.espaciosAlto.map(fmt).join(' · ')) + '.</p>' +
      '<h2>Lista de corte</h2>' + tablaCortes(res.cortes) +
      '<h2>Planchas necesarias</h2>' + tablaOpciones(res.opciones, rec) +
      (rec
        ? '<h2>Distribución de cortes (formato recomendado)</h2>' + leyenda() + htmlDiagramas(rec)
        : '') +
      '<h2>Dónde comprar</h2>' + listaTiendas() +
      '<h2>Notas</h2><ul class="ayuda">' +
        '<li>Verifique las medidas en terreno antes de comprar.</li>' +
        '<li>Las piezas no incluyen cantos (tapacantos), rebajes ni perforaciones; agregue esos metros por separado.</li>' +
        '<li>Confirme en cada tienda el grosor, el formato, el color y el stock.</li>' +
        '<li>El fondo se calculó con medida exterior: ajústelo al rebaje o sistema de encastre que use.</li>' +
      '</ul>';
    return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>Informe de corte ' + esc(estado.orden) + '</title><style>' + ESTILO_INFORME + '</style></head>' +
      '<body>' + cuerpo + '</body></html>';
  }

  // ---------- Render ----------

  function pintarPasos() {
    $('#pasos').innerHTML = PASOS.map(function (nombre, i) {
      var clase = i === estado.paso ? 'actual' : (i < estado.paso ? 'hecho' : '');
      var inner = '<span class="num">' + (i + 1) + '</span><span>' + nombre + '</span>';
      return '<li class="' + clase + '">' +
        (i < estado.paso ? '<button type="button" data-accion="ir" data-paso="' + i + '">' + inner + '</button>' : '<span>' + inner + '</span>') +
        '</li>';
    }).join('');
  }

  function textoTotales() {
    var p = estado.proyecto;
    if (p.espaciosAncho.some(function (v) { return !(v > 0); }) || p.espaciosAlto.some(function (v) { return !(v > 0); })) {
      return 'Complete todas las medidas de espacios para ver el total calculado.';
    }
    var c = M.totalesCalculados(proyectoParaMotor());
    function linea(etiqueta, calculado, ingresado) {
      var ok = ingresado > 0 && Math.abs(calculado - ingresado) <= M.TOLERANCIA_MM;
      return '<span class="' + (ok ? 'ok' : 'err') + '">' + etiqueta + ': calculado ' + fmt(calculado) +
        ' mm · ingresado ' + fmt(ingresado) + ' mm</span>';
    }
    return linea('Ancho', c.ancho, p.anchoMm) + '<br>' + linea('Alto', c.alto, p.altoMm);
  }

  function actualizarVivo() {
    var errores = validarPaso(estado.paso);
    var m = $('#mensajes');
    if (m) m.innerHTML = errores.length ? listaErrores(errores) : '';
    var b = $('#btn-sig');
    if (b) b.disabled = errores.length > 0;
    if (estado.paso === 1) {
      var v = $('#vista');
      if (v) v.innerHTML = svgMueble(estado.proyecto);
      var t = $('#totales');
      if (t) t.innerHTML = textoTotales();
    }
    guardarBorrador();
  }

  function render() {
    if (estado.paso === 5 && !estado.pagado) estado.paso = 4;
    pintarPasos();
    var vistas = [htmlMueble, htmlEspacios, htmlPlanchas, htmlResultado, htmlPago, htmlInforme];
    $('#contenido').innerHTML = vistas[estado.paso]();
    actualizarVivo();
  }

  // ---------- Acciones ----------

  function avanzar() {
    estado.paso = Math.min(estado.paso + 1, PASOS.length - 1);
    render();
  }

  function cargarEjemplo() {
    estado.proyecto = Object.assign(nuevoEstado().proyecto, JSON.parse(JSON.stringify(EJEMPLO)));
    estado.confirmado = false;
    estado.paso = 3;
    render();
  }

  function nuevo() {
    estado = nuevoEstado();
    borrarBorrador();
    render();
  }

  function descargarInforme() {
    var url = urlInforme();
    var a = document.createElement('a');
    a.href = url;
    a.download = 'informe-melamina-' + estado.orden + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function abrirInforme() {
    var url = urlInforme();
    window.open(url, '_blank', 'noopener');
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  function urlInforme() {
    var html = generarInformeHTML(calcular());
    return URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  }

  function leerPlano(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      mostrarAviso('La imagen supera 5 MB. Use una más liviana.');
      return;
    }
    var r = new FileReader();
    r.onload = function () { estado.planoDataUrl = r.result; render(); };
    r.readAsDataURL(file);
  }

  // Pago en modo 'demo': simulado, sin cobro.
  function pagarDemo() {
    estado.pagado = true;
    estado.paso = 5;
    mostrarAviso('');
    render();
  }

  // Pago en modo 'backend': el servicio crea el cobro y devuelve la URL de la pasarela.
  async function iniciarPagoBackend() {
    if (!C.endpoint) return mostrarAviso('El pago todavía no está configurado (ver README).');
    mostrarAviso('Redirigiendo a la pasarela de pago…');
    guardarBorrador();
    try {
      var r = await fetch(C.endpoint + '?accion=crearPago', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ orden: estado.orden, monto: C.precioCLP })
      });
      var j = await r.json();
      if (!j.initPoint) throw new Error('El servicio no entregó el enlace de pago.');
      window.location.href = j.initPoint;
    } catch (e) {
      mostrarAviso('No se pudo iniciar el pago: ' + e.message);
    }
  }

  // Al volver de la pasarela: el backend confirma el pago (nunca el navegador por sí solo).
  async function verificarPagoBackend() {
    mostrarAviso('Verificando su pago…');
    try {
      var r = await fetch(C.endpoint + '?accion=estadoPago&orden=' + encodeURIComponent(estado.orden));
      var j = await r.json();
      if (j.pagado) {
        estado.pagado = true;
        estado.paso = 5;
        mostrarAviso('Pago confirmado. Ya puede enviar el informe.');
      } else {
        mostrarAviso('Aún no vemos el pago confirmado. Si ya pagó, intente nuevamente en unos minutos.');
      }
    } catch (e) {
      mostrarAviso('No se pudo verificar el pago: ' + e.message);
    }
    render();
  }

  async function enviarInforme() {
    var out = $('#estadoEnvio');
    var mail = (estado.email || '').trim();
    function mostrar(texto, error) {
      if (!out) return;
      out.textContent = texto;
      out.className = 'estado ' + (error ? 'err' : 'ok');
    }
    if (!emailValido(mail)) return mostrar('Ingrese un correo válido.', true);
    if (mail !== (estado.emailConfirmacion || '').trim()) return mostrar('Los correos no coinciden.', true);
    if (!C.endpoint) return mostrar('El envío por correo no está configurado.', true);

    mostrar('Enviando…', false);
    try {
      var html = generarInformeHTML(calcular());
      var r = await fetch(C.endpoint + '?accion=enviarInforme', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ orden: estado.orden, email: mail, asunto: 'Informe de corte de melamina ' + estado.orden, html: html })
      });
      var j = await r.json();
      if (!j.ok) throw new Error(j.error || 'el servicio no confirmó el envío.');
      mostrar('Informe enviado a ' + mail + '.', false);
    } catch (e) {
      mostrar('No se pudo enviar: ' + e.message, true);
    }
  }

  // ---------- Eventos ----------

  function onClick(ev) {
    var el = ev.target.closest('[data-accion]');
    if (!el || el.disabled) return;
    switch (el.dataset.accion) {
      case 'atras': estado.paso = Math.max(0, estado.paso - 1); render(); break;
      case 'siguiente': if (validarPaso(estado.paso).length) return; avanzar(); break;
      case 'ir': if (Number(el.dataset.paso) < estado.paso) { estado.paso = Number(el.dataset.paso); render(); } break;
      case 'chip': setPath(estado, el.dataset.campo, Number(el.dataset.valor)); render(); break;
      case 'ejemplo': cargarEjemplo(); break;
      case 'nuevo': if (window.confirm('¿Borrar todos los datos y empezar de nuevo?')) nuevo(); break;
      case 'agregarExtra': estado.proyecto.piezasExtra.push({ nombre: '', ancho: null, alto: null, cantidad: 1 }); render(); break;
      case 'quitarExtra': estado.proyecto.piezasExtra.splice(Number(el.dataset.idx), 1); render(); break;
      case 'pagarDemo': pagarDemo(); break;
      case 'pagarBackend': iniciarPagoBackend(); break;
      case 'enviar': enviarInforme(); break;
      case 'descargar': descargarInforme(); break;
      case 'abrirInforme': abrirInforme(); break;
    }
  }

  // Campos de texto y número: actualizan el estado sin volver a dibujar (no pierden el foco).
  function onInput(ev) {
    var el = ev.target;
    if (el.type === 'checkbox' || el.type === 'file') return;
    if (el.hasAttribute('data-lista')) {
      estado.proyecto[el.dataset.lista][Number(el.dataset.idx)] = aNum(el.value);
    } else if (el.hasAttribute('data-extra')) {
      var x = estado.proyecto.piezasExtra[Number(el.dataset.extra)];
      if (!x) return;
      x[el.dataset.clave] = el.dataset.clave === 'nombre' ? el.value : aNum(el.value);
    } else if (el.hasAttribute('data-campo')) {
      setPath(estado, el.dataset.campo, el.dataset.tipo === 'num' ? aNum(el.value) : el.value);
    } else {
      return;
    }
    actualizarVivo();
  }

  // Cambios que alteran la estructura de la pantalla: cantidad de espacios, casillas, archivos.
  function onChange(ev) {
    var el = ev.target;
    if (el.hasAttribute('data-cuenta')) {
      var n = Math.min(12, Math.max(1, parseInt(el.value, 10) || 1));
      var arr = estado.proyecto[el.dataset.cuenta];
      while (arr.length < n) arr.push(null);
      arr.length = n;
      render();
      return;
    }
    if (el.type === 'file') { leerPlano(el.files && el.files[0]); return; }
    if (el.type === 'checkbox' && el.hasAttribute('data-campo')) {
      setPath(estado, el.dataset.campo, el.checked);
      render();
    }
  }

  function pintarBanner() {
    var b = $('#banner');
    if (C.modo === 'backend') { b.hidden = true; return; }
    b.hidden = false;
    b.textContent = 'Modo prueba: el pago se simula y el correo no se envía. Configure el backend antes de publicar (ver README).';
  }

  function iniciar() {
    cargarBorrador();
    var q = new URLSearchParams(window.location.search);
    var retorno = !!(q.get('orden') && q.get('pago'));
    if (retorno) {
      estado.orden = q.get('orden');
      estado.paso = 4;
      window.history.replaceState(null, '', window.location.pathname);
    }
    pintarBanner();
    document.addEventListener('click', onClick);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    render();
    if (retorno && C.modo === 'backend') verificarPagoBackend();
  }

  iniciar();
})();
