/**
 * INICIAR — presiona Ejecutar con esta funcion seleccionada.
 * Crea las 13 hojas, carga los catalogos, los 89 establecimientos
 * y sus 1.482 recintos. Se puede volver a ejecutar sin duplicar nada.
 */
function INICIAR() {
  const a = setup();
  const b = cargarEstablecimientos();
  const msg = "LISTO. " + b;
  console.log(msg);
  return msg;
}

/* ==========  USUARIOS DE LOS COLEGIOS  ========== */

/** Crea una cuenta por establecimiento, perfil Director, con clave comun. */
function crearUsuariosColegios() {
  const CLAVE_COMUN = "Puelche2026";
  const h = hash(CLAVE_COMUN);
  const sh = hoja("USUARIO");
  // "4406-7" Sheets lo convierte en FECHA si la columna no es texto.
  sh.getRange(1, 2, sh.getMaxRows(), 2).setNumberFormat("@");
  const existentes = {};
  leer("USUARIO").forEach(function(u){ existentes[String(u.usuario).toLowerCase()] = 1; });
  const filas = [];
  ESTABLECIMIENTOS_CARGA.forEach(function(e, i) {
    const login = e[2] ? e[2] : loginDesdeNombre_(e[3]);
    if (existentes[login.toLowerCase()]) return;
    existentes[login.toLowerCase()] = 1;
    filas.push(["D" + ("00" + (i+1)).slice(-3), login, h,
                "Direccion " + e[3], "Director", e[0], "true", ""]);
  });
  if (filas.length) sh.getRange(sh.getLastRow()+1, 1, filas.length, 8).setValues(filas);
  const msg = "Cuentas creadas: " + filas.length + " | clave comun: " + CLAVE_COMUN;
  console.log(msg);
  return msg;
}

/** Nombre -> login sin tildes ni espacios (para los jardines sin RBD). */
function loginDesdeNombre_(nombre) {
  return String(nombre).toLowerCase()
    .replace(/[\u00e1\u00e0\u00e4]/g, "a").replace(/[\u00e9\u00e8\u00eb]/g, "e")
    .replace(/[\u00ed\u00ec\u00ef]/g, "i").replace(/[\u00f3\u00f2\u00f6]/g, "o")
    .replace(/[\u00fa\u00f9\u00fc]/g, "u").replace(/\u00f1/g, "n")
    .replace(/[^a-z0-9]+/g, "").slice(0, 18);
}

/** Cambia de una vez la clave de TODAS las cuentas de colegio. */
function cambiarClaveColegios() {
  const NUEVA = "Bureo8730";   // rotada tras exposicion en GitHub
  const sh = hoja("USUARIO");
  const h = hash(NUEVA);
  let n = 0;
  leer("USUARIO").forEach(function(u, i) {
    if (String(u.id_usuario).charAt(0) !== "D") return;
    sh.getRange(i + 2, 3).setValue(h);
    n++;
  });
  const msg = "Claves actualizadas: " + n;
  console.log(msg);
  return msg;
}


/**
 * LevantApp - SLEP Puelche - ARCHIVO UNICO
 * Contiene el nucleo, el setup y el chatbot de WhatsApp.
 *
 * PRIMER USO:
 *   1. Ejecuta la funcion  setup
 *   2. Ejecuta la funcion  cargarEstablecimientos
 *   3. Implementar > Nueva implementacion > Aplicacion web
 *        Ejecutar como: Yo   |   Acceso: Cualquier persona
 *
 * Usuario inicial:  admin  /  Puelche3281!
 */

/* ======================================================================
   NUCLEO - API, modelo de datos y router
   ====================================================================== */

/**
 * Codigo.gs v5 — Backend LevantApp (modelo relacional SLEP Puelche)
 * Google Apps Script · Web App (Ejecutar como: Yo · Acceso: Cualquier persona)
 *
 * 12 hojas: COMUNA, ESTABLECIMIENTO, RECINTO, ELEMENTO_GENERAL, ELEMENTO_ESPECIFICO,
 *           ACCION_TIPO, MATERIAL, USUARIO, OBSERVACION, SUBSANACION, MATERIAL_USADO, COMENTARIO
 *
 * Diseño:
 *  - UPSERT por PK → un reintento de la app NUNCA duplica filas.
 *  - LockService → dos usuarios sincronizando a la vez no se pisan.
 *  - Fotos a Drive; la Sheet guarda la URL (una celda tope 50.000 caracteres).
 *  - setup() crea e inicializa todo, incluidos los catálogos base.
 */

const SHEET_ID = '1lA7mOtYB7UYT4FbW-s4O_YBw20B2z9vo-varEG3V6iM';  // LevantApp SLEP Puelche
const DRIVE_ID = '16p1X10k4_dP53NFFZj3tlotnftpRqZSm';            // carpeta LevantApp Fotos

// ============ ESQUEMA ============
const SCHEMA = {
  COMUNA:              ['id_comuna','nombre'],
  ESTABLECIMIENTO:     ['id_establecimiento','id_comuna','rbd','nombre','tipo','direccion'],
  RECINTO:             ['id_recinto','id_establecimiento','tipo_espacio','nombre_espacio'],
  ELEMENTO_GENERAL:    ['id_general','nombre'],
  ELEMENTO_ESPECIFICO: ['id_especifico','id_general','nombre'],
  ACCION_TIPO:         ['id_accion','id_especifico','descripcion'],
  // stock/minimo: agregados para el Módulo 3 (Bodega). Las filas ya existentes quedan en
  // blanco hasta que reciban stock por bodega_recepcion o se editen desde Administración.
  MATERIAL:            ['id_material','nombre','unidad','costo_referencial','stock','minimo'],
  USUARIO:             ['id_usuario','usuario','hash','nombre','perfil','id_establecimiento','activo','telefono'],
  CONVERSACION:        ['telefono','estado','datos','ultimo_msg','actualizado'],
  // id_gestor_asignado / fotos_antes_urls: agregados (Módulo 5 y galería multi-foto).
  // cantidad: cuántas unidades del elemento específico están afectadas (ej: 3 enchufes, 2 llaves).
  // Se agrega SIEMPRE AL FINAL del arreglo: leer()/upsert() mapean por posición de columna,
  // así que insertar una columna nueva en medio del SCHEMA desalinearía todas las filas ya
  // existentes en la hoja (su fila física no cambia, pero el SCHEMA nuevo leería otro campo
  // en esa posición). Agregar al final es lo único seguro sobre una hoja con datos reales.
  OBSERVACION:         ['ticket','id_local','id_establecimiento','id_recinto','id_especifico','descripcion',
                        'foto_antes_url','fotos_antes_urls','prioridad','estado','fecha_registro','id_usuario_levanta',
                        'id_gestor_asignado','es_emergencia','tipo_emergencia','continuidad_clases',
                        'justificacion','actualizado','cantidad'],
  // validado / fotos_despues_urls: agregados (loop de validación del Módulo 2 y galería multi-foto).
  SUBSANACION:         ['id_subsanacion','ticket','id_accion','detalle_trabajo','foto_despues_url',
                        'fotos_despues_urls','fecha_ejecucion','id_usuario_ejecuta','resuelto','validado','actualizado'],
  MATERIAL_USADO:      ['id','id_subsanacion','id_material','cantidad'],
  COMENTARIO:          ['id_comentario','ticket','id_usuario','texto','fecha'],

  // ---- Módulo 3 · Bodega ----
  HERRAMIENTA:         ['id_herramienta','nombre','codigo'],
  BODEGA_MOVIMIENTO:   ['id_local','tipo','id_material','id_herramienta','cantidad',
                        'id_usuario_entrega','id_usuario_recibe','ticket_asociado','fecha','actualizado'],
  BODEGA_SALDO:        ['id','id_usuario','id_material','cantidad','actualizado'],
  BODEGA_CUSTODIA:     ['id_herramienta','id_usuario','estado','fecha','actualizado'],
  BODEGA_RECEPCION:    ['id_local','id_material','cantidad','valor_unitario','proveedor',
                        'documento','fecha','id_usuario','foto_url','actualizado'],

  // ---- Módulo 5 · Gestión y control ----
  EMPRESA:             ['id_empresa','nombre','rut'],
  OC:                  ['id_local','id_empresa','numero_oc','id_licitacion','estado','fecha','id_usuario','actualizado'],
  OC_PARTIDA:          ['id_local','id_oc','item','unidad','cantidad','monto','avance','foto_url','actualizado'],
  VALIDACION:          ['id_local','id_local_obs','id_subsanacion','ticket','conforme','id_usuario_valida','fecha']
};

// ============ ENTRYPOINTS ============
function doGet(e) {
  const p = (e && e.parameter) || {};
  // Verificacion del webhook de Meta: debe devolver hub.challenge tal cual
  if (p['hub.mode'] === 'subscribe') {
    const token = PropertiesService.getScriptProperties().getProperty('WA_VERIFY_TOKEN');
    if (p['hub.verify_token'] === token) {
      return ContentService.createTextOutput(p['hub.challenge'])
        .setMimeType(ContentService.MimeType.TEXT);
    }
    return ContentService.createTextOutput('forbidden').setMimeType(ContentService.MimeType.TEXT);
  }
  if (p.t === 'catalogos') return json(catalogos());
  return json({status:'ok', message:'LevantApp API v5', hojas:Object.keys(SCHEMA).length});
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); }
  catch (err) { return json({status:'error', message:'body invalido'}); }

  // Webhook de WhatsApp: se responde 200 SIEMPRE y rapido; si fallamos,
  // Meta reintenta el mismo mensaje y el usuario recibe todo duplicado.
  if (d.object === 'whatsapp_business_account') {
    try { manejarWebhook(d); } catch (err) { console.error('bot: ' + err + ' ' + (err.stack||'')); }
    return ContentService.createTextOutput('EVENT_RECEIVED').setMimeType(ContentService.MimeType.TEXT);
  }

  // Lectura de documentos con IA (Gemini): no toca la planilla, así que se responde
  // sin tomar el lock — una llamada a Gemini puede tardar varios segundos y no hay
  // razón para bloquear al resto de los usuarios mientras tanto.
  if (d.action === 'leer_documento_ia') {
    try { return json(leerDocumentoIA(d)); }
    catch (err) { console.error(err); return json({status:'error', message:String(err && err.message || err)}); }
  }

  // API de la PWA
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) return json({status:'error', message:'servidor ocupado, reintenta'});
    switch (d.action) {
      case 'login':       return json(login(d));
      case 'catalogos':   return json(catalogos(d));
      case 'observacion': return json(guardarObservacion(d));
      case 'subsanacion': return json(guardarSubsanacion(d));
      case 'comentario':  return json(guardarComentario(d));
      case 'priorizar':   return json(priorizar(d));
      case 'pull':        return json(pull(d));
      // ---- Módulo 3 · Bodega ----
      case 'bodega_pull':                    return json(bodegaPull(d));
      case 'bodega_entrega':                 return json(bodegaEntrega(d));
      case 'bodega_cierre_material':         return json(bodegaCierreMaterial(d));
      case 'bodega_devolucion_herramienta':  return json(bodegaDevolucionHerramienta(d));
      case 'bodega_recepcion':               return json(bodegaRecepcion(d));
      // ---- Módulo 5 · Gestión y control ----
      case 'gestion_pull':          return json(gestionPull(d));
      case 'gestion_oc':            return json(gestionOC(d));
      case 'gestion_avance':        return json(gestionAvance(d));
      case 'gestion_recepcion_oc':  return json(gestionRecepcionOC(d));
      case 'validar_subsanacion':   return json(validarSubsanacion(d));
      case 'admin_usuario':         return json(adminUsuario(d));
      case 'admin_catalogo':        return json(adminCatalogo(d));
      default:            return json({status:'error', message:'accion desconocida: ' + d.action});
    }
  } catch (err) {
    console.error(err);
    return json({status:'error', message:String(err && err.message || err)});
  } finally {
    lock.releaseLock();
  }
}

// ============ AUTENTICACION ============
function hash(txt) {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'lvp:' + txt, Utilities.Charset.UTF_8);
  return b.map(x => ('0' + (x & 0xFF).toString(16)).slice(-2)).join('');
}

function login(d) {
  const filas = leer('USUARIO');
  const u = filas.find(r => String(r.usuario).toLowerCase() === String(d.usuario || '').toLowerCase());
  if (!u || String(u.activo) === 'false') return {status:'error', message:'Usuario o clave incorrectos'};
  if (u.hash !== hash(d.clave || ''))     return {status:'error', message:'Usuario o clave incorrectos'};
  return {status:'ok', usuario:{
    id_usuario: u.id_usuario, nombre: u.nombre, perfil: u.perfil,
    id_establecimiento: u.id_establecimiento || ''
  }};
}

// ============ LECTURA ============
/** usuarios[] solo viaja si quien pide es perfil Infraestructura (y nunca incluye el hash). */
function catalogos(d) {
  d = d || {};
  const solicitante = d.id_usuario ? buscar('USUARIO', 'id_usuario', d.id_usuario) : null;
  const esInfra = !!(solicitante && solicitante.perfil === 'Infraestructura');
  return {
    status: 'ok',
    comunas:     leer('COMUNA'),
    establecimientos: leer('ESTABLECIMIENTO'),
    recintos:    leer('RECINTO'),
    generales:   leer('ELEMENTO_GENERAL'),
    especificos: leer('ELEMENTO_ESPECIFICO'),
    acciones:    leer('ACCION_TIPO'),
    materiales:  leer('MATERIAL'),
    herramientas: leer('HERRAMIENTA'),
    empresas:    leer('EMPRESA'),
    usuarios: esInfra ? leer('USUARIO').map(u => ({
      id_usuario: u.id_usuario, nombre: u.nombre, usuario_login: u.usuario,
      perfil: u.perfil, id_establecimiento: u.id_establecimiento
    })) : [],
    v: new Date().getTime()
  };
}

/** Descarga observaciones. El Director solo ve su establecimiento. */
function pull(d) {
  let obs = leer('OBSERVACION');
  if (d.perfil === 'Director' && d.id_establecimiento) {
    obs = obs.filter(o => String(o.id_establecimiento) === String(d.id_establecimiento));
  }
  obs = obs.slice(-500);   // no traer histórico completo al móvil
  const tickets = {};
  obs.forEach(o => tickets[o.ticket] = 1);
  return {
    status:'ok',
    observaciones: obs,
    subsanaciones: leer('SUBSANACION').filter(s => tickets[s.ticket]),
    comentarios:   leer('COMENTARIO').filter(c => tickets[c.ticket])
  };
}

// ============ ESCRITURA ============
function guardarObservacion(d) {
  const o = d.data || {};
  if (!o.id_local) return {status:'error', message:'falta id_local'};

  // Idempotencia por id_local (UUID del dispositivo). El correlativo oficial lo asigna
  // el servidor, asi dos inspectores offline nunca generan el mismo numero de ticket.
  const prev = buscar('OBSERVACION', 'id_local', o.id_local);
  const ticket = prev ? prev.ticket : nuevoCorrelativo(o.es_emergencia ? 'EMG' : 'SLEP');

  // Hasta 3 fotos (galeria multi-foto): se suben todas, la primera queda como
  // foto_antes_url (compatibilidad) y el resto se guarda en fotos_antes_urls separado por ';'.
  const fotos = (o.fotos_antes && o.fotos_antes.length ? o.fotos_antes : [o.foto_antes]).filter(Boolean);
  const urls = fotos.map((f, i) => subirFoto(f, ticket + '_antes_' + (i + 1) + '.jpg')).filter(Boolean);
  const urlPrincipal = urls[0] || (prev && prev.foto_antes_url) || '';
  const urlsTexto = urls.length ? urls.join(';') : ((prev && prev.fotos_antes_urls) || '');

  upsert('OBSERVACION', 'id_local', o.id_local, {
    ticket: ticket,
    id_local: o.id_local,
    id_establecimiento: o.id_establecimiento || '',
    id_recinto: o.id_recinto || '',
    id_especifico: o.id_especifico || '',
    cantidad: o.cantidad || 1,
    descripcion: o.descripcion || '',
    foto_antes_url: urlPrincipal,
    fotos_antes_urls: urlsTexto,
    prioridad: o.prioridad || 'Por evaluar',
    estado: (prev && prev.estado) || o.estado || 'Pendiente',
    fecha_registro: o.fecha_registro || new Date(),
    id_usuario_levanta: o.id_usuario_levanta || '',
    id_gestor_asignado: (prev && prev.id_gestor_asignado) || '',
    es_emergencia: o.es_emergencia ? 'SI' : '',
    tipo_emergencia: o.tipo_emergencia || '',
    continuidad_clases: o.continuidad_clases || '',
    justificacion: (prev && prev.justificacion) || o.justificacion || '',
    actualizado: new Date()
  });
  if (o.es_emergencia && !prev) alertaEmergencia(o, ticket);
  return {status:'ok', ticket:ticket, id_local:o.id_local};
}

/** Correlativo por prefijo y anio: SLEP-2026-000148 / EMG-2026-000027 */
function nuevoCorrelativo(prefijo) {
  const anio = new Date().getFullYear();
  const p = PropertiesService.getScriptProperties();
  const clave = 'SEQ_' + prefijo + '_' + anio;
  const n = parseInt(p.getProperty(clave) || '0', 10) + 1;
  p.setProperty(clave, String(n));
  return prefijo + '-' + anio + '-' + ('00000' + n).slice(-6);
}

function guardarSubsanacion(d) {
  const s = d.data || {};
  if (!s.id_subsanacion || !s.ticket) return {status:'error', message:'faltan claves'};
  const prev = buscar('SUBSANACION', 'id_subsanacion', s.id_subsanacion);

  const fotos = (s.fotos_despues && s.fotos_despues.length ? s.fotos_despues : [s.foto_despues]).filter(Boolean);
  const urls = fotos.map((f, i) => subirFoto(f, s.id_subsanacion + '_despues_' + (i + 1) + '.jpg')).filter(Boolean);
  const urlPrincipal = urls[0] || (prev && prev.foto_despues_url) || '';
  const urlsTexto = urls.length ? urls.join(';') : ((prev && prev.fotos_despues_urls) || '');

  upsert('SUBSANACION', 'id_subsanacion', s.id_subsanacion, {
    id_subsanacion: s.id_subsanacion,
    ticket: s.ticket,
    id_accion: s.id_accion || '',
    detalle_trabajo: s.detalle_trabajo || '',
    foto_despues_url: urlPrincipal,
    fotos_despues_urls: urlsTexto,
    fecha_ejecucion: s.fecha_ejecucion || new Date(),
    id_usuario_ejecuta: s.id_usuario_ejecuta || '',
    resuelto: s.resuelto ? 'SI' : 'NO',
    validado: s.validado ? 'SI' : 'NO',
    actualizado: new Date()
  });
  // Materiales: se reemplazan completos (idempotente ante reintentos)
  borrarPorClave('MATERIAL_USADO', 'id_subsanacion', s.id_subsanacion);
  (s.materiales || []).forEach((m, i) => {
    appendFila('MATERIAL_USADO', {
      id: s.id_subsanacion + '-' + i,
      id_subsanacion: s.id_subsanacion,
      id_material: m.id_material,
      cantidad: m.cantidad
    });
  });
  // El estado de la observación lo manda la subsanación: no resuelto -> En proceso;
  // resuelto pero sin autovalidar -> Ejecutado (a la espera de que Infraestructura confirme,
  // ver validarSubsanacion); resuelto y ya validado (Infraestructura cerro su propio trabajo) -> Cerrado.
  const obs = buscar('OBSERVACION', 'ticket', s.ticket);
  if (obs) {
    obs.estado = !s.resuelto ? 'En proceso' : (s.validado ? 'Cerrado' : 'Ejecutado');
    obs.actualizado = new Date();
    upsert('OBSERVACION', 'ticket', s.ticket, obs);
  }
  return {status:'ok', id:s.id_subsanacion};
}

function guardarComentario(d) {
  const c = d.data || {};
  if (!c.id_comentario) return {status:'error', message:'falta id'};
  upsert('COMENTARIO', 'id_comentario', c.id_comentario, {
    id_comentario: c.id_comentario, ticket: c.ticket || '',
    id_usuario: c.id_usuario || '', texto: c.texto || '', fecha: c.fecha || new Date()
  });
  return {status:'ok'};
}

/** Priorización y rechazo: EXCLUSIVO de Infraestructura (validado también aquí, no solo en la UI). */
function priorizar(d) {
  const u = buscar('USUARIO', 'id_usuario', d.id_usuario);
  if (!u || u.perfil !== 'Infraestructura') return {status:'error', message:'sin permiso para priorizar'};
  const o = buscar('OBSERVACION', 'ticket', d.ticket);
  if (!o) return {status:'error', message:'ticket no existe'};
  o.prioridad = d.prioridad || o.prioridad;
  if (d.estado) o.estado = d.estado;
  if (d.justificacion) o.justificacion = d.justificacion;
  if (d.id_gestor_asignado) o.id_gestor_asignado = d.id_gestor_asignado;
  o.actualizado = new Date();
  upsert('OBSERVACION', 'ticket', d.ticket, o);
  return {status:'ok'};
}

function alertaEmergencia(o, ticket) {
  try {
    const dest = PropertiesService.getScriptProperties().getProperty('MAIL_EMERGENCIA');
    if (!dest) return;
    MailApp.sendEmail(dest, 'EMERGENCIA ' + ticket,
      'Ticket: ' + ticket + '\nTipo: ' + o.tipo_emergencia +
      '\nContinuidad de clases: ' + (o.continuidad_clases || 'no informado') +
      '\nDescripcion: ' + o.descripcion);
  } catch (e) { console.warn('alerta email fallo: ' + e); }
}

/* ======================================================================
   MÓDULO 3 · BODEGA
   La distinción central: el MATERIAL se consume (descuenta stock de
   inmediato con vale de entrega) y la HERRAMIENTA solo cambia de estado
   a "En custodia" (acta de custodia, sin tocar stock).
   ====================================================================== */

function permisoBodega(idUsuario) {
  const u = buscar('USUARIO', 'id_usuario', idUsuario);
  return !!(u && (u.perfil === 'Infraestructura' || u.perfil === 'Bodega'));
}
function permisoInfraestructura(idUsuario) {
  const u = buscar('USUARIO', 'id_usuario', idUsuario);
  return !!(u && u.perfil === 'Infraestructura');
}

function bodegaPull(d) {
  const saldos = leer('BODEGA_SALDO')
    .filter(s => +s.cantidad > 0)
    .map(s => ({id_usuario: s.id_usuario, id_material: s.id_material, cantidad: s.cantidad}));
  return {
    status: 'ok',
    materiales: leer('MATERIAL'),
    herramientas: leer('HERRAMIENTA'),
    saldos: saldos,
    custodia: leer('BODEGA_CUSTODIA')
  };
}

/** Vale de entrega (material, descuenta stock) o acta de custodia (herramienta, no descuenta). */
function bodegaEntrega(d) {
  const b = d.data || {};
  if (!b.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoBodega(b.id_usuario_entrega)) return {status:'error', message:'sin permiso para entregar bodega'};

  // Idempotencia: si este id_local ya se proceso (reintento de red), no se vuelve a
  // descontar stock ni a duplicar el saldo — solo se re-escribe el registro del movimiento.
  const yaProcesado = !!buscar('BODEGA_MOVIMIENTO', 'id_local', b.id_local);

  if (b.tipo === 'material') {
    if (!yaProcesado) {
      const mat = buscar('MATERIAL', 'id_material', b.id_material);
      if (!mat) return {status:'error', message:'material no existe'};
      mat.stock = Math.max(0, (+mat.stock || 0) - (+b.cantidad || 0));
      upsert('MATERIAL', 'id_material', mat.id_material, mat);

      const idSaldo = b.id_usuario_recibe + '|' + b.id_material;
      const saldo = buscar('BODEGA_SALDO', 'id', idSaldo) ||
        {id: idSaldo, id_usuario: b.id_usuario_recibe, id_material: b.id_material, cantidad: 0};
      saldo.cantidad = (+saldo.cantidad || 0) + (+b.cantidad || 0);
      saldo.actualizado = new Date();
      upsert('BODEGA_SALDO', 'id', idSaldo, saldo);
    }
  } else if (b.tipo === 'herramienta') {
    if (!yaProcesado) {
      upsert('BODEGA_CUSTODIA', 'id_herramienta', b.id_herramienta, {
        id_herramienta: b.id_herramienta, id_usuario: b.id_usuario_recibe,
        estado: 'En custodia', fecha: b.fecha || new Date(), actualizado: new Date()
      });
    }
  } else return {status:'error', message:'tipo invalido'};

  upsert('BODEGA_MOVIMIENTO', 'id_local', b.id_local, {
    id_local: b.id_local, tipo: b.tipo, id_material: b.id_material || '', id_herramienta: b.id_herramienta || '',
    cantidad: b.cantidad || '', id_usuario_entrega: b.id_usuario_entrega || '', id_usuario_recibe: b.id_usuario_recibe || '',
    ticket_asociado: b.ticket_asociado || '', fecha: b.fecha || new Date(), actualizado: new Date()
  });
  return {status:'ok'};
}

/** Se dispara al declarar consumo de material en una subsanación (Módulo 2): descuenta el
 *  saldo del gestor. El sobrante (lo no declarado) queda pendiente de devolución a bodega. */
function bodegaCierreMaterial(d) {
  const c = d.data || {};
  if (!c.id_local) return {status:'error', message:'falta id_local'};
  if (buscar('BODEGA_MOVIMIENTO', 'id_local', c.id_local)) return {status:'ok'};  // ya procesado

  const idSaldo = c.id_usuario + '|' + c.id_material;
  const saldo = buscar('BODEGA_SALDO', 'id', idSaldo);
  // Nunca se descuenta mas de lo que el gestor realmente tiene, aunque el cliente mienta.
  const consumo = Math.min(+c.cantidad_consumida || 0, saldo ? +saldo.cantidad : 0);
  if (saldo) {
    saldo.cantidad = Math.max(0, +saldo.cantidad - consumo);
    saldo.actualizado = new Date();
    upsert('BODEGA_SALDO', 'id', idSaldo, saldo);
  }
  upsert('BODEGA_MOVIMIENTO', 'id_local', c.id_local, {
    id_local: c.id_local, tipo: 'consumo', id_material: c.id_material, id_herramienta: '',
    cantidad: consumo, id_usuario_entrega: '', id_usuario_recibe: c.id_usuario,
    ticket_asociado: c.ticket || '', fecha: c.fecha || new Date(), actualizado: new Date()
  });
  return {status:'ok'};
}

function bodegaDevolucionHerramienta(d) {
  const v = d.data || {};
  if (!v.id_local) return {status:'error', message:'falta id_local'};
  if (!buscar('BODEGA_MOVIMIENTO', 'id_local', v.id_local)) {
    const estadoFinal = v.estado_devuelto === 'Baja' ? 'De baja'
                       : v.estado_devuelto === 'En reparación' ? 'En reparación' : 'Disponible';
    upsert('BODEGA_CUSTODIA', 'id_herramienta', v.id_herramienta, {
      id_herramienta: v.id_herramienta, id_usuario: '', estado: estadoFinal,
      fecha: v.fecha || new Date(), actualizado: new Date()
    });
  }
  upsert('BODEGA_MOVIMIENTO', 'id_local', v.id_local, {
    id_local: v.id_local, tipo: 'devolucion', id_material: '', id_herramienta: v.id_herramienta,
    cantidad: '', id_usuario_entrega: v.id_usuario, id_usuario_recibe: '',
    ticket_asociado: v.estado_devuelto || '', fecha: v.fecha || new Date(), actualizado: new Date()
  });
  return {status:'ok'};
}

/** Ingreso de stock por compra. */
function bodegaRecepcion(d) {
  const r = d.data || {};
  if (!r.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoBodega(r.id_usuario)) return {status:'error', message:'sin permiso para recepcionar'};
  const prev = buscar('BODEGA_RECEPCION', 'id_local', r.id_local);
  const url = (r.fotos && r.fotos[0]) ? subirFoto(r.fotos[0], r.id_local + '_factura.jpg') : '';
  if (!prev) {
    const mat = buscar('MATERIAL', 'id_material', r.id_material);
    if (mat) { mat.stock = (+mat.stock || 0) + (+r.cantidad || 0); upsert('MATERIAL', 'id_material', mat.id_material, mat); }
  }
  upsert('BODEGA_RECEPCION', 'id_local', r.id_local, {
    id_local: r.id_local, id_material: r.id_material, cantidad: r.cantidad, valor_unitario: r.valor_unitario || '',
    proveedor: r.proveedor || '', documento: r.documento || '', fecha: r.fecha || new Date(), id_usuario: r.id_usuario,
    foto_url: url || (prev && prev.foto_url) || '', actualizado: new Date()
  });
  return {status:'ok'};
}

/* ======================================================================
   LECTURA DE DOCUMENTOS CON IA (Gemini) — OC y facturas/guías de bodega
   Requiere una API key gratuita de Google AI Studio (aistudio.google.com/apikey)
   guardada en Extensiones > Propiedades del proyecto > Propiedades del script
   con el nombre GEMINI_API_KEY.
   ====================================================================== */

const PROMPT_LEER_OC =
  'Eres un asistente que extrae datos estructurados de ordenes de compra (OC) chilenas ' +
  'de construccion/mantencion. Devuelve SOLO un JSON valido (sin texto adicional, sin ' +
  'markdown, sin comillas triples) con esta forma exacta: {"empresa":"","rut_empresa":"",' +
  '"numero_oc":"","id_licitacion":"","fecha":"YYYY-MM-DD","items":[{"descripcion":"",' +
  '"unidad":"","cantidad":0,"monto":0}]}. Si un campo no aparece en el documento, dejalo ' +
  'como cadena vacia o 0. cantidad y monto deben ser numeros, nunca texto.';

const PROMPT_LEER_FACTURA =
  'Eres un asistente que extrae datos estructurados de facturas o guias de despacho ' +
  'chilenas de materiales de ferreteria/construccion. Devuelve SOLO un JSON valido (sin ' +
  'texto adicional, sin markdown, sin comillas triples) con esta forma exacta: ' +
  '{"empresa":"","rut_empresa":"","numero_documento":"","fecha":"YYYY-MM-DD",' +
  '"items":[{"descripcion":"","unidad":"","cantidad":0,"valor_unitario":0}]}. Si un ' +
  'campo no aparece en el documento, dejalo como cadena vacia o 0. cantidad y ' +
  'valor_unitario deben ser numeros, nunca texto.';

function leerDocumentoIA(d) {
  if (!permisoBodega(d.id_usuario)) return {status:'error', message:'sin permiso para leer documentos'};
  const imagen = d.imagen;
  if (!imagen) return {status:'error', message:'falta el documento (imagen o PDF)'};
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) return {status:'error', message:'Falta configurar GEMINI_API_KEY en Propiedades del script'};

  const m = String(imagen).match(/^data:(.*?);base64,(.*)$/);
  if (!m) return {status:'error', message:'formato de documento invalido'};
  const mime = m[1], b64 = m[2];
  const prompt = d.tipo === 'factura' ? PROMPT_LEER_FACTURA : PROMPT_LEER_OC;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;
  const payload = {
    contents: [{ parts: [ {text: prompt}, {inline_data: {mime_type: mime, data: b64}} ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  const resp = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  const body = JSON.parse(resp.getContentText());
  if (code !== 200) return {status:'error', message:'Gemini: ' + (body.error ? body.error.message : resp.getContentText())};
  const texto = body.candidates && body.candidates[0] && body.candidates[0].content.parts[0].text;
  if (!texto) return {status:'error', message:'Gemini no devolvio contenido legible'};
  let datos;
  try { datos = JSON.parse(texto); }
  catch (e) { return {status:'error', message:'Gemini devolvio un formato inesperado'}; }
  return {status:'ok', datos: datos};
}

/* ======================================================================
   MÓDULO 5 · GESTIÓN Y CONTROL (acceso exclusivo perfil Infraestructura)
   ====================================================================== */

function gestionPull(d) {
  const ocs = leer('OC');
  const partidas = leer('OC_PARTIDA');
  return {
    status: 'ok',
    ocs: ocs.map(oc => Object.assign({}, oc, {
      partidas: partidas.filter(p => p.id_oc === oc.id_local)
    }))
  };
}

function gestionOC(d) {
  const oc = d.data || {};
  if (!oc.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoInfraestructura(oc.id_usuario)) return {status:'error', message:'sin permiso'};
  upsert('OC', 'id_local', oc.id_local, {
    id_local: oc.id_local, id_empresa: oc.id_empresa, numero_oc: oc.numero_oc || '',
    id_licitacion: oc.id_licitacion || '', estado: oc.estado || 'Vigente',
    fecha: oc.fecha || new Date(), id_usuario: oc.id_usuario, actualizado: new Date()
  });
  (oc.partidas || []).forEach(p => {
    upsert('OC_PARTIDA', 'id_local', p.id_local, {
      id_local: p.id_local, id_oc: oc.id_local, item: p.item || '', unidad: p.unidad || '',
      cantidad: p.cantidad || 0, monto: p.monto || 0, avance: p.avance || 0, foto_url: '', actualizado: new Date()
    });
  });
  return {status:'ok'};
}

function gestionAvance(d) {
  const p = d.data || {};
  if (!p.id_local) return {status:'error', message:'falta id_local'};
  const prev = buscar('OC_PARTIDA', 'id_local', p.id_local);
  if (!prev) return {status:'error', message:'partida no existe'};
  const url = (p.fotos && p.fotos[0]) ? subirFoto(p.fotos[0], p.id_local + '_avance.jpg') : '';
  prev.avance = p.avance != null ? p.avance : prev.avance;
  prev.foto_url = url || prev.foto_url || '';
  prev.actualizado = new Date();
  upsert('OC_PARTIDA', 'id_local', p.id_local, prev);
  return {status:'ok'};
}

function gestionRecepcionOC(d) {
  const oc = d.data || {};
  if (!oc.id_local) return {status:'error', message:'falta id_local'};
  const prev = buscar('OC', 'id_local', oc.id_local);
  if (!prev) return {status:'error', message:'OC no existe'};
  prev.estado = 'Recepcionada';
  prev.actualizado = new Date();
  upsert('OC', 'id_local', oc.id_local, prev);
  return {status:'ok'};
}

/** Cierra el loop del Módulo 2: Infraestructura valida el trabajo del maestro. */
function validarSubsanacion(d) {
  const v = d.data || {};
  if (!v.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoInfraestructura(v.id_usuario_valida)) return {status:'error', message:'sin permiso para validar'};
  const o = buscar('OBSERVACION', 'id_local', v.id_local_obs) || buscar('OBSERVACION', 'ticket', v.ticket);
  if (!o) return {status:'error', message:'ticket no existe'};
  o.estado = v.conforme ? 'Cerrado' : 'Reabierto';
  o.actualizado = new Date();
  upsert('OBSERVACION', 'ticket', o.ticket, o);
  upsert('VALIDACION', 'id_local', v.id_local, {
    id_local: v.id_local, id_local_obs: v.id_local_obs, id_subsanacion: v.id_subsanacion || '',
    ticket: o.ticket, conforme: v.conforme ? 'SI' : 'NO', id_usuario_valida: v.id_usuario_valida,
    fecha: v.fecha || new Date()
  });
  return {status:'ok'};
}

/** Alta o edición de un usuario. clave vacia en una edicion = no cambiar la contraseña. */
function adminUsuario(d) {
  const u = d.data || {};
  if (!u.usuario_login) return {status:'error', message:'falta usuario_login'};
  if (!permisoInfraestructura(u.id_usuario_actor)) return {status:'error', message:'sin permiso para administrar usuarios'};
  const prev = buscar('USUARIO', 'usuario', u.usuario_login) ||
    (u.id_usuario ? buscar('USUARIO', 'id_usuario', u.id_usuario) : null);
  const id = (prev && prev.id_usuario) || u.id_usuario || ('U' + Utilities.getUuid().slice(0, 8));
  upsert('USUARIO', 'id_usuario', id, {
    id_usuario: id, usuario: u.usuario_login,
    hash: u.clave ? hash(u.clave) : ((prev && prev.hash) || hash('cambiar123')),
    nombre: u.nombre, perfil: u.perfil, id_establecimiento: u.id_establecimiento || '',
    activo: (prev && prev.activo) || 'true', telefono: (prev && prev.telefono) || ''
  });
  return {status:'ok', id_usuario:id};
}

/** Alta de un material, herramienta o empresa desde Administración. */
function adminCatalogo(d) {
  const c = d.data || {};
  if (!permisoInfraestructura(c.id_usuario_actor)) return {status:'error', message:'sin permiso para administrar catalogos'};
  if (c.tipo_catalogo === 'material') {
    upsert('MATERIAL', 'id_material', c.id_material, {
      id_material: c.id_material, nombre: c.nombre, unidad: c.unidad || '',
      costo_referencial: c.costo_referencial || 0, stock: c.stock || 0, minimo: c.minimo || 0
    });
  } else if (c.tipo_catalogo === 'herramienta') {
    upsert('HERRAMIENTA', 'id_herramienta', c.id_herramienta, {
      id_herramienta: c.id_herramienta, nombre: c.nombre, codigo: c.codigo || ''
    });
  } else if (c.tipo_catalogo === 'empresa') {
    upsert('EMPRESA', 'id_empresa', c.id_empresa, {id_empresa: c.id_empresa, nombre: c.nombre, rut: c.rut || ''});
  } else return {status:'error', message:'tipo_catalogo invalido'};
  return {status:'ok'};
}

// ============ CAPA DE DATOS ============
function ss() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

function hoja(nombre) {
  const libro = ss();
  let sh = libro.getSheetByName(nombre);
  if (!sh) {
    sh = libro.insertSheet(nombre);
    sh.appendRow(SCHEMA[nombre]);
    sh.getRange(1,1,1,SCHEMA[nombre].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function leer(nombre) {
  const sh = hoja(nombre);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const cols = SCHEMA[nombre];
  const vals = sh.getRange(2,1,n-1,cols.length).getValues();
  return vals.filter(r => r[0] !== '').map(r => {
    const o = {};
    cols.forEach((c,i) => o[c] = r[i]);
    return o;
  });
}

function filaDe(nombre, campo, valor) {
  const sh = hoja(nombre);
  const col = SCHEMA[nombre].indexOf(campo) + 1;
  const n = sh.getLastRow();
  if (n < 2 || col < 1) return -1;
  const vals = sh.getRange(2, col, n-1, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(valor)) return i + 2;
  return -1;
}

function buscar(nombre, campo, valor) {
  const f = filaDe(nombre, campo, valor);
  if (f < 0) return null;
  const cols = SCHEMA[nombre];
  const v = hoja(nombre).getRange(f,1,1,cols.length).getValues()[0];
  const o = {}; cols.forEach((c,i) => o[c] = v[i]); return o;
}

function upsert(nombre, campoPK, valorPK, obj) {
  const sh = hoja(nombre);
  const cols = SCHEMA[nombre];
  const fila = cols.map(c => obj[c] !== undefined ? obj[c] : '');
  const f = filaDe(nombre, campoPK, valorPK);
  if (f > 0) sh.getRange(f,1,1,cols.length).setValues([fila]);
  else sh.appendRow(fila);
}

function appendFila(nombre, obj) {
  hoja(nombre).appendRow(SCHEMA[nombre].map(c => obj[c] !== undefined ? obj[c] : ''));
}

function borrarPorClave(nombre, campo, valor) {
  const sh = hoja(nombre);
  const col = SCHEMA[nombre].indexOf(campo) + 1;
  const n = sh.getLastRow();
  if (n < 2) return;
  const vals = sh.getRange(2, col, n-1, 1).getValues();
  for (let i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]) === String(valor)) sh.deleteRow(i + 2);
  }
}

function subirFoto(dataUrl, nombre) {
  if (!dataUrl || String(dataUrl).indexOf('data:') !== 0) return '';
  const id = DRIVE_ID;
  if (!id) return '';
  try {
    const carpeta = DriveApp.getFolderById(id);
    const p = String(dataUrl).split(',');
    const mime = (p[0].match(/:(.*?);/) || [null,'image/jpeg'])[1];
    const blob = Utilities.newBlob(Utilities.base64Decode(p[1]), mime, nombre);
    const previos = carpeta.getFilesByName(nombre);
    while (previos.hasNext()) previos.next().setTrashed(true);   // idempotente en Drive
    const f = carpeta.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return f.getUrl();
  } catch (e) { console.error('subirFoto: ' + e); return ''; }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}


/* ======================================================================
   SETUP - creacion de tablas y catalogos
   ====================================================================== */

/**
 * Setup.gs — Ejecutar UNA SOLA VEZ desde el editor de Apps Script.
 * Menu: seleccionar funcion "setup" -> Ejecutar. Crea las 12 hojas y siembra los catalogos.
 * Es idempotente: si lo corres de nuevo, no duplica nada.
 */

function setup() {
  Object.keys(SCHEMA).forEach(n => hoja(n));   // crea las 12 hojas con encabezados

  sembrar('COMUNA', 'id_comuna', COMUNAS);
  sembrar('ELEMENTO_GENERAL', 'id_general', GENERALES);
  sembrar('ELEMENTO_ESPECIFICO', 'id_especifico', ESPECIFICOS);
  sembrar('ACCION_TIPO', 'id_accion', ACCIONES);
  sembrar('MATERIAL', 'id_material', MATERIALES);
  sembrar('HERRAMIENTA', 'id_herramienta', HERRAMIENTAS);   // Módulo 3 · Bodega

  // Usuario administrador inicial. CAMBIA LA CLAVE apenas entres.
  if (!buscar('USUARIO', 'usuario', 'admin')) {
    appendFila('USUARIO', {
      id_usuario:'U001', usuario:'admin', hash:'9bd7a776ce57dc0b86d6b637581ee0e76826bd435cb5afd2cc5bfce0bc99cea3',   // clave: Puelche3281!
      nombre:'Administrador', perfil:'Infraestructura', id_establecimiento:'', activo:'true'
    });
  }
  SpreadsheetApp.getUi && console.log('Setup completo. Usuario: admin / clave: Puelche3281!');
  return 'ok';
}

/** Crea un usuario nuevo. Editar los valores y ejecutar esta funcion. */
function crearUsuario() {
  const id      = 'U002';                  // <-- unico
  const usuario = 'rbascunan';             // <-- nombre de acceso
  const clave   = 'cambiar123';            // <-- clave inicial
  const nombre  = 'Rodrigo Bascunan';
  const perfil  = 'Infraestructura';       // Infraestructura | Director | Maestro
  const idEstab = '';                      // vacio si es SLEP; el id del colegio si es Director

  if (buscar('USUARIO','usuario',usuario)) { console.log('ya existe'); return; }
  appendFila('USUARIO', {id_usuario:id, usuario:usuario, hash:hash(clave), nombre:nombre,
                         perfil:perfil, id_establecimiento:idEstab, activo:'true'});
  console.log('creado: ' + usuario);
}

/** Cambia la clave de un usuario existente. */
function cambiarClave() {
  const usuario = 'admin';
  const nueva   = 'CambiaEstaClave2026';
  const u = buscar('USUARIO','usuario',usuario);
  if (!u) { console.log('no existe'); return; }
  u.hash = hash(nueva);
  upsert('USUARIO','usuario',usuario,u);
  console.log('clave actualizada');
}

/**
 * Carga masiva de establecimientos y recintos.
 * Pega la lista en ESTABLECIMIENTOS_CARGA con el formato:
 *   [id, id_comuna, rbd, nombre, tipo, direccion]
 * y ejecuta cargarEstablecimientos(). Los recintos base se generan solos.
 */
const ESTABLECIMIENTOS_CARGA = [

  // ---- Antuco (C01) ----
  ['E001','C01','4328-1','ESCUELA BASICA CERRO PILQUE','Colegio',''],
  ['E002','C01','4330-3','ESCUELA OLGA RIOS DE PINOCHET','Colegio',''],
  ['E003','C01','4327-3','ESCUELA VOLCÁN ANTUCO','Colegio',''],
  ['E004','C01','4324-9','LICEO DOCTOR VÍCTOR RÍOS RUIZ','Colegio',''],

  // ---- Mulchén (C02) ----
  ['E005','C02','','Alhuelemu (Jardín)','Jardín infantil',''],
  ['E006','C02','4403-2','ESCUELA ADULTOS RIO SUR','Colegio',''],
  ['E007','C02','4412-1','ESCUELA ALHUELEMU','Colegio',''],
  ['E008','C02','4437-7','ESCUELA BASICA AURORA DE ENERO','Colegio',''],
  ['E009','C02','4419-9','ESCUELA BASICA BUREO','Colegio',''],
  ['E010','C02','4441-5','ESCUELA BASICA CASAS DE PILE','Colegio',''],
  ['E011','C02','4432-6','ESCUELA BASICA EL EDEN','Colegio',''],
  ['E012','C02','4426-1','ESCUELA BASICA EL PARRON','Colegio',''],
  ['E013','C02','4435-0','ESCUELA BASICA LOS HINOJOS','Colegio',''],
  ['E014','C02','4406-7','ESCUELA BASICA MULCHEN','Colegio',''],
  ['E015','C02','4414-8','ESCUELA BASICA MUNILQUE IZAURIETA','Colegio',''],
  ['E016','C02','4421-0','ESCUELA BASICA PILGUEN','Colegio',''],
  ['E017','C02','4433-4','ESCUELA BASICA RAPELCO','Colegio',''],
  ['E018','C02','4417-2','ESCUELA BASICA SAN LUIS DE MALVEN','Colegio',''],
  ['E019','C02','4436-9','ESCUELA BASICA SANTA ADRIANA','Colegio',''],
  ['E020','C02','4410-5','ESCUELA BASICA VILLA LAS PEÑAS','Colegio',''],
  ['E021','C02','4405-9','ESCUELA BLANCO ENCALADA','Colegio',''],
  ['E022','C02','12051-0','ESCUELA ESPECIAL DE LA SOLIDARIDAD','Colegio',''],
  ['E023','C02','4407-5','ESCUELA IGNACIO VERDUGO CAVADA','Colegio',''],
  ['E024','C02','4409-1','ESCUELA SACERDOTE ALEJANDRO MANERA','Colegio',''],
  ['E025','C02','17751-2','ESCUELA VILLA LA GRANJA','Colegio',''],
  ['E026','C02','17790-3','LICEO BICENTENARIO DE EXCELENCIA NUEVO MUNDO','Colegio',''],
  ['E027','C02','4408-3','LICEO CRISOL','Colegio',''],
  ['E028','C02','4404-0','LICEO MIGUEL ÁNGEL CERDA LEIVA','Colegio',''],
  ['E029','C02','','Mi Despertar','Jardín infantil',''],
  ['E030','C02','','Mi Pequeño Mundo (Mulchén)','Jardín infantil',''],
  ['E031','C02','','Villa La Granja (Jardín)','Jardín infantil',''],
  ['E032','C02','','Villa Rehuen','Jardín infantil',''],

  // ---- Quilaco (C03) ----
  ['E033','C03','4396-6','ESCUELA BASICA CAMPAMENTO','Colegio',''],
  ['E034','C03','4395-8','ESCUELA BASICA CERRO EL PADRE','Colegio',''],
  ['E035','C03','4398-2','ESCUELA BASICA DE BELLAVISTA','Colegio',''],
  ['E036','C03','4402-4','ESCUELA BASICA LONCOPANGUE','Colegio',''],
  ['E037','C03','4393-1','ESCUELA BASICA RUCALHUE','Colegio',''],
  ['E038','C03','4392-3','LICEO BICENTENARIO VALLE DE SOL QUILACO','Colegio',''],
  ['E039','C03','','Semillitas Del Futuro','Jardín infantil',''],

  // ---- Quilleco (C04) ----
  ['E040','C04','4339-6','ESCUELA BASICA CENTINELA','Colegio',''],
  ['E041','C04','4348-6','ESCUELA BASICA EL ESFUERZO','Colegio',''],
  ['E042','C04','4337-0','ESCUELA BASICA LA HOYADA','Colegio',''],
  ['E043','C04','4345-1','ESCUELA BASICA RIO PARDO','Colegio',''],
  ['E044','C04','4334-6','ESCUELA BASICA VILLA MERCEDES','Colegio',''],
  ['E045','C04','4342-7','ESCUELA ERMINDA GOMEZ DE POLIC.','Colegio',''],
  ['E046','C04','4341-9','ESCUELA LAS ARENAS','Colegio',''],
  ['E047','C04','4340-0','ESCUELA PROFESORA ALBERTINA SÁNCHEZ VALENZUELA','Colegio',''],
  ['E048','C04','','Espumita','Jardín infantil',''],
  ['E049','C04','4331-1','LICEO FRANCISCO BASCUÑAN GUERRERO','Colegio',''],
  ['E050','C04','4333-8','LICEO ISABEL RIQUELME','Colegio',''],
  ['E051','C04','','Manitos Mágicas','Jardín infantil',''],
  ['E052','C04','','Sonrisa De Ángeles','Jardín infantil',''],

  // ---- Santa Bárbara (C05) ----
  ['E053','C05','4352-4','ESCUELA ARTÍSTICA PROFESOR ALFONSO LLOVERAS CUEVAS','Colegio',''],
  ['E054','C05','4361-3','ESCUELA BASICA CORCOVADO','Colegio',''],
  ['E055','C05','4359-1','ESCUELA BASICA MAÑIL','Colegio',''],
  ['E056','C05','4357-5','ESCUELA BASICA VILLACURA','Colegio',''],
  ['E057','C05','17813-6','ESCUELA BÁSICA CACIQUE LEVIÁN','Colegio',''],
  ['E058','C05','4355-9','ESCUELA DE EDUCACIÓN GENERAL BÁSICA EL HUACHI','Colegio',''],
  ['E059','C05','4356-7','ESCUELA LOS BOLDOS','Colegio',''],
  ['E060','C05','4368-0','ESCUELA LOS NOTROS','Colegio',''],
  ['E061','C05','4358-3','ESCUELA MARIANO PUGA VEGA','Colegio',''],
  ['E062','C05','4372-9','ESCUELA QUILLAILEO','Colegio',''],
  ['E063','C05','4365-6','ESCUELA RINCONADA','Colegio',''],
  ['E064','C05','4353-2','LICEO CARDENAL ANTONIO SAMORE','Colegio',''],
  ['E065','C05','','Mi Pequeño Mundo (Santa Bárbara)','Jardín infantil',''],
  ['E066','C05','','Mis Primeros Pasos (Santa Bárbara)','Jardín infantil',''],
  ['E067','C05','','Ronda De Niños Y Niñas','Jardín infantil',''],

  // ---- Tucapel (C06) ----
  ['E068','C06','17880-2','CENTRO DE EDUCACIÓN DE ADULTOS ADELAIDA MORENO','Colegio',''],
  ['E069','C06','4312-5','ESCUELA ALEJANDRO PEREZ URBANO','Colegio',''],
  ['E070','C06','4314-1','ESCUELA LAS HIJUELAS','Colegio',''],
  ['E071','C06','4321-4','ESCUELA LOMAS DE TUCAPEL','Colegio',''],
  ['E072','C06','4317-6','ESCUELA LOS AROMOS','Colegio',''],
  ['E073','C06','4311-7','ESCUELA LOS AVELLANOS','Colegio',''],
  ['E074','C06','11711-0','ESCUELA LUIS MARTÍNEZ GONZÁLEZ','Colegio',''],
  ['E075','C06','4310-9','LICEO ANDRÉS ALCÁZAR TUCAPEL','Colegio',''],
  ['E076','C06','4309-5','LICEO DE HUEPIL','Colegio',''],
  ['E077','C06','','La Esperanza','Jardín infantil',''],
  ['E078','C06','','Los Cipreces','Jardín infantil',''],
  ['E079','C06','','Mis Primeros Pasos (Tucapel)','Jardín infantil',''],
  ['E080','C06','','Pequeños Genios','Jardín infantil',''],
  ['E081','C06','','Rayitos De Sol','Jardín infantil',''],
  ['E082','C06','','Rinconcito De Amor','Jardín infantil',''],

  // ---- Alto Biobío (C07) ----
  ['E083','C07','','Copito De Nieve','Jardín infantil',''],
  ['E084','C07','4374-5','ESCUELA BASICA PITRIL','Colegio',''],
  ['E085','C07','4379-6','ESCUELA CALLAQUI','Colegio',''],
  ['E086','C07','4354-0','ESCUELA DE CONCENTRACIÓN FRONTERIZA RALCO ALTO BIOBÍO','Colegio',''],
  ['E087','C07','4375-3','ESCUELA RALCO LEPOY','Colegio',''],
  ['E088','C07','18037-8','LICEO RALCO','Colegio',''],
  ['E089','C07','','Étnico Callaqui','Jardín infantil',''],
];

function cargarEstablecimientos() {
  const shE = hoja('ESTABLECIMIENTO'), shR = hoja('RECINTO');

  // Se lee UNA vez lo ya cargado. Consultar la hoja dentro del bucle haria
  // que 89 colegios tardaran minutos y el script se cortara por timeout.
  const yaE = {}, yaR = {};
  if (shE.getLastRow() > 1) shE.getRange(2,1,shE.getLastRow()-1,1).getValues().forEach(r => yaE[r[0]] = 1);
  if (shR.getLastRow() > 1) shR.getRange(2,1,shR.getLastRow()-1,1).getValues().forEach(r => yaR[r[0]] = 1);

  const filasE = [], filasR = [];
  ESTABLECIMIENTOS_CARGA.forEach(e => {
    if (!yaE[e[0]]) filasE.push([e[0], e[1], e[2], e[3], e[4], e[5] || '']);
    // Un jardin infantil no tiene gimnasio ni laboratorio: cada tipo lleva su propia lista
    const recintos = (e[4] === 'Jardín infantil') ? RECINTOS_JARDIN : RECINTOS_COLEGIO;
    recintos.forEach((tipo, i) => {
      const rid = e[0] + '-R' + ('0' + (i+1)).slice(-2);
      if (!yaR[rid]) filasR.push([rid, e[0], tipo, '']);
    });
  });

  // Escritura por lotes: 2 llamadas en vez de 1.600
  if (filasE.length) {
    const r = shE.getRange(shE.getLastRow()+1, 1, filasE.length, 6);
    shE.getRange(1, 3, shE.getMaxRows(), 1).setNumberFormat('@');  // RBD como texto: '4328-1' no es una fecha
    r.setValues(filasE);
  }
  if (filasR.length) shR.getRange(shR.getLastRow()+1, 1, filasR.length, 4).setValues(filasR);

  const msg = 'Cargados ' + filasE.length + ' establecimientos y ' + filasR.length + ' recintos.';
  console.log(msg);
  return msg;
}

/** Borra recintos de un establecimiento (para recargarlos con otra lista). */
function limpiarRecintosDe(idEstablecimiento) {
  const sh = hoja('RECINTO');
  const n = sh.getLastRow();
  if (n < 2) return;
  const v = sh.getRange(2,2,n-1,1).getValues();
  for (let i = v.length - 1; i >= 0; i--) {
    if (String(v[i][0]) === String(idEstablecimiento)) sh.deleteRow(i + 2);
  }
  console.log('recintos borrados de ' + idEstablecimiento);
}

function sembrar(nombreHoja, pk, filas) {
  filas.forEach(f => { if (!buscar(nombreHoja, pk, f[pk])) appendFila(nombreHoja, f); });
}

// ==================== CATALOGOS BASE ====================
// Territorio SLEP Puelche
const COMUNAS = [
  {id_comuna:'C01', nombre:'Antuco'},
  {id_comuna:'C02', nombre:'Mulchen'},
  {id_comuna:'C03', nombre:'Quilaco'},
  {id_comuna:'C04', nombre:'Quilleco'},
  {id_comuna:'C05', nombre:'Santa Barbara'},
  {id_comuna:'C06', nombre:'Tucapel'},
  {id_comuna:'C07', nombre:'Alto Biobio'}
];

// Lista fija de tipos de espacio (el nombre especifico es texto libre en la app)
const RECINTOS_COLEGIO = [
  'Sala de clases','Comedor','Cocina','Bano estudiantes','Bano personal','Patio',
  'Gimnasio','Biblioteca CRA','Sala de profesores','Direccion','Oficina administrativa',
  'Laboratorio','Taller','Bodega','Pasillo','Sala de caldera','Sala electrica','Exterior'
];

const RECINTOS_JARDIN = [
  'Sala de actividades','Sala de mudas','Comedor','Cocina','Bano parvulos',
  'Bano personal','Patio','Sala de descanso','Oficina','Bodega','Sala electrica','Exterior'
];

const GENERALES = [
  {id_general:'G1', nombre:'Electrico'},
  {id_general:'G2', nombre:'Sanitario'},
  {id_general:'G3', nombre:'Techumbre'},
  {id_general:'G4', nombre:'Vidrios'},
  {id_general:'G5', nombre:'Puertas'},
  {id_general:'G6', nombre:'Cerrajeria'},
  {id_general:'G7', nombre:'Cocina y Casino'},
  {id_general:'G8', nombre:'Mobiliario'},
  {id_general:'G9', nombre:'Pisos y Pavimentos'},
  {id_general:'G10', nombre:'Muros y Cielos'},
  {id_general:'G11', nombre:'Calefaccion'},
  {id_general:'G12', nombre:'Areas Verdes y Exteriores'},
  {id_general:'G13', nombre:'Seguridad y Emergencia'}
];

const ESPECIFICOS = [
  // Electrico
  {id_especifico:'E101', id_general:'G1', nombre:'Luminaria interior'},
  {id_especifico:'E102', id_general:'G1', nombre:'Luminaria exterior'},
  {id_especifico:'E103', id_general:'G1', nombre:'Tubo LED / fluorescente'},
  {id_especifico:'E104', id_general:'G1', nombre:'Interruptor'},
  {id_especifico:'E105', id_general:'G1', nombre:'Enchufe / tomacorriente'},
  {id_especifico:'E106', id_general:'G1', nombre:'Tablero electrico'},
  {id_especifico:'E107', id_general:'G1', nombre:'Automatico / disyuntor'},
  {id_especifico:'E108', id_general:'G1', nombre:'Protector diferencial'},
  {id_especifico:'E109', id_general:'G1', nombre:'Canalizacion / conduit'},
  {id_especifico:'E110', id_general:'G1', nombre:'Empalme / medidor'},
  {id_especifico:'E111', id_general:'G1', nombre:'Puesta a tierra'},
  {id_especifico:'E112', id_general:'G1', nombre:'Cableado'},
  // Sanitario
  {id_especifico:'E201', id_general:'G2', nombre:'Llave / griferia'},
  {id_especifico:'E202', id_general:'G2', nombre:'Lavamanos'},
  {id_especifico:'E203', id_general:'G2', nombre:'WC / estanque'},
  {id_especifico:'E204', id_general:'G2', nombre:'Urinario'},
  {id_especifico:'E205', id_general:'G2', nombre:'Ducha'},
  {id_especifico:'E206', id_general:'G2', nombre:'Desague / sifon'},
  {id_especifico:'E207', id_general:'G2', nombre:'Canaleta / bajada de aguas'},
  {id_especifico:'E208', id_general:'G2', nombre:'Fosa septica'},
  {id_especifico:'E209', id_general:'G2', nombre:'Bomba de agua'},
  {id_especifico:'E210', id_general:'G2', nombre:'Estanque de agua'},
  {id_especifico:'E211', id_general:'G2', nombre:'Red de agua potable'},
  // Techumbre
  {id_especifico:'E301', id_general:'G3', nombre:'Teja / plancha'},
  {id_especifico:'E302', id_general:'G3', nombre:'Cumbrera'},
  {id_especifico:'E303', id_general:'G3', nombre:'Estructura de techo'},
  {id_especifico:'E304', id_general:'G3', nombre:'Filtracion / gotera'},
  {id_especifico:'E305', id_general:'G3', nombre:'Canal de aguas lluvia'},
  // Vidrios
  {id_especifico:'E401', id_general:'G4', nombre:'Vidrio quebrado'},
  {id_especifico:'E402', id_general:'G4', nombre:'Marco de ventana'},
  {id_especifico:'E403', id_general:'G4', nombre:'Sello / silicona'},
  // Puertas
  {id_especifico:'E501', id_general:'G5', nombre:'Hoja de puerta'},
  {id_especifico:'E502', id_general:'G5', nombre:'Marco de puerta'},
  {id_especifico:'E503', id_general:'G5', nombre:'Bisagra'},
  {id_especifico:'E504', id_general:'G5', nombre:'Cierrapuertas'},
  // Cerrajeria
  {id_especifico:'E601', id_general:'G6', nombre:'Chapa / cerradura'},
  {id_especifico:'E602', id_general:'G6', nombre:'Candado'},
  {id_especifico:'E603', id_general:'G6', nombre:'Manilla'},
  {id_especifico:'E604', id_general:'G6', nombre:'Porton / reja'},
  // Cocina y Casino
  {id_especifico:'E701', id_general:'G7', nombre:'Cocina industrial'},
  {id_especifico:'E702', id_general:'G7', nombre:'Campana extractora'},
  {id_especifico:'E703', id_general:'G7', nombre:'Refrigerador / congelador'},
  {id_especifico:'E704', id_general:'G7', nombre:'Lavaplatos'},
  {id_especifico:'E705', id_general:'G7', nombre:'Meson de trabajo'},
  {id_especifico:'E706', id_general:'G7', nombre:'Instalacion de gas'},
  // Mobiliario
  {id_especifico:'E801', id_general:'G8', nombre:'Mesa / banco escolar'},
  {id_especifico:'E802', id_general:'G8', nombre:'Silla'},
  {id_especifico:'E803', id_general:'G8', nombre:'Estante / repisa'},
  {id_especifico:'E804', id_general:'G8', nombre:'Pizarra'},
  {id_especifico:'E805', id_general:'G8', nombre:'Casillero'},
  // Pisos
  {id_especifico:'E901', id_general:'G9', nombre:'Ceramica / palmeta'},
  {id_especifico:'E902', id_general:'G9', nombre:'Piso flotante / vinilico'},
  {id_especifico:'E903', id_general:'G9', nombre:'Radier / pavimento'},
  {id_especifico:'E904', id_general:'G9', nombre:'Desnivel / socavon'},
  // Muros y cielos
  {id_especifico:'E1001', id_general:'G10', nombre:'Pintura'},
  {id_especifico:'E1002', id_general:'G10', nombre:'Tabique / volcanita'},
  {id_especifico:'E1003', id_general:'G10', nombre:'Cielo falso'},
  {id_especifico:'E1004', id_general:'G10', nombre:'Humedad / hongos'},
  {id_especifico:'E1005', id_general:'G10', nombre:'Fisura estructural'},
  // Calefaccion
  {id_especifico:'E1101', id_general:'G11', nombre:'Caldera'},
  {id_especifico:'E1102', id_general:'G11', nombre:'Radiador'},
  {id_especifico:'E1103', id_general:'G11', nombre:'Estufa'},
  {id_especifico:'E1104', id_general:'G11', nombre:'Ducto / chimenea'},
  // Exteriores
  {id_especifico:'E1201', id_general:'G12', nombre:'Cierre perimetral'},
  {id_especifico:'E1202', id_general:'G12', nombre:'Juego infantil'},
  {id_especifico:'E1203', id_general:'G12', nombre:'Multicancha'},
  {id_especifico:'E1204', id_general:'G12', nombre:'Arbol / poda'},
  {id_especifico:'E1205', id_general:'G12', nombre:'Vereda / acceso'},
  // Seguridad
  {id_especifico:'E1301', id_general:'G13', nombre:'Extintor'},
  {id_especifico:'E1302', id_general:'G13', nombre:'Luz de emergencia'},
  {id_especifico:'E1303', id_general:'G13', nombre:'Senaletica'},
  {id_especifico:'E1304', id_general:'G13', nombre:'Via de evacuacion'},
  {id_especifico:'E1305', id_general:'G13', nombre:'Red humeda / seca'}
];

// Acciones sugeridas por elemento especifico (id_accion, id_especifico, descripcion)
const ACCIONES = [
  {id_accion:'A001', id_especifico:'E101', descripcion:'Se cambia luminaria completa'},
  {id_accion:'A002', id_especifico:'E101', descripcion:'Se cambia ampolleta / tubo'},
  {id_accion:'A003', id_especifico:'E101', descripcion:'Se repara conexion de luminaria'},
  {id_accion:'A004', id_especifico:'E102', descripcion:'Se cambia proyector exterior'},
  {id_accion:'A005', id_especifico:'E102', descripcion:'Se repone fotocelula'},
  {id_accion:'A006', id_especifico:'E103', descripcion:'Se cambia tubo LED'},
  {id_accion:'A007', id_especifico:'E103', descripcion:'Se cambia balastro / driver'},
  {id_accion:'A008', id_especifico:'E104', descripcion:'Se cambia interruptor'},
  {id_accion:'A009', id_especifico:'E105', descripcion:'Se cambia enchufe'},
  {id_accion:'A010', id_especifico:'E105', descripcion:'Se reaprieta conexion'},
  {id_accion:'A011', id_especifico:'E106', descripcion:'Se ordena y rotula tablero'},
  {id_accion:'A012', id_especifico:'E106', descripcion:'Se cambia tapa de tablero'},
  {id_accion:'A013', id_especifico:'E107', descripcion:'Se cambia automatico'},
  {id_accion:'A014', id_especifico:'E108', descripcion:'Se cambia diferencial'},
  {id_accion:'A015', id_especifico:'E108', descripcion:'Se instala diferencial faltante'},
  {id_accion:'A016', id_especifico:'E109', descripcion:'Se repara canalizacion'},
  {id_accion:'A017', id_especifico:'E111', descripcion:'Se mide y corrige puesta a tierra'},
  {id_accion:'A018', id_especifico:'E112', descripcion:'Se recambia tramo de cableado'},
  {id_accion:'A019', id_especifico:'E201', descripcion:'Se cambia llave'},
  {id_accion:'A020', id_especifico:'E201', descripcion:'Se cambia sello / goma'},
  {id_accion:'A021', id_especifico:'E202', descripcion:'Se cambia lavamanos'},
  {id_accion:'A022', id_especifico:'E203', descripcion:'Se cambia mecanismo de estanque'},
  {id_accion:'A023', id_especifico:'E203', descripcion:'Se cambia WC completo'},
  {id_accion:'A024', id_especifico:'E206', descripcion:'Se destapa desague'},
  {id_accion:'A025', id_especifico:'E206', descripcion:'Se cambia sifon'},
  {id_accion:'A026', id_especifico:'E207', descripcion:'Se limpia canaleta'},
  {id_accion:'A027', id_especifico:'E208', descripcion:'Se solicita limpieza de fosa'},
  {id_accion:'A028', id_especifico:'E209', descripcion:'Se repara bomba'},
  {id_accion:'A029', id_especifico:'E209', descripcion:'Se cambia bomba'},
  {id_accion:'A030', id_especifico:'E211', descripcion:'Se repara filtracion en red'},
  {id_accion:'A031', id_especifico:'E301', descripcion:'Se reponen tejas / planchas'},
  {id_accion:'A032', id_especifico:'E304', descripcion:'Se sella filtracion'},
  {id_accion:'A033', id_especifico:'E305', descripcion:'Se limpia y repara canal'},
  {id_accion:'A034', id_especifico:'E401', descripcion:'Se repone vidrio'},
  {id_accion:'A035', id_especifico:'E403', descripcion:'Se resella ventana'},
  {id_accion:'A036', id_especifico:'E501', descripcion:'Se repara hoja de puerta'},
  {id_accion:'A037', id_especifico:'E501', descripcion:'Se cambia puerta completa'},
  {id_accion:'A038', id_especifico:'E503', descripcion:'Se cambian bisagras'},
  {id_accion:'A039', id_especifico:'E601', descripcion:'Se cambia chapa'},
  {id_accion:'A040', id_especifico:'E603', descripcion:'Se cambia manilla'},
  {id_accion:'A041', id_especifico:'E706', descripcion:'Se revisa y sella instalacion de gas'},
  {id_accion:'A042', id_especifico:'E801', descripcion:'Se repara mobiliario'},
  {id_accion:'A043', id_especifico:'E901', descripcion:'Se reponen palmetas'},
  {id_accion:'A044', id_especifico:'E1001', descripcion:'Se pinta superficie'},
  {id_accion:'A045', id_especifico:'E1002', descripcion:'Se repara tabique'},
  {id_accion:'A046', id_especifico:'E1003', descripcion:'Se repone cielo falso'},
  {id_accion:'A047', id_especifico:'E1004', descripcion:'Se trata humedad y se ventila'},
  {id_accion:'A048', id_especifico:'E1101', descripcion:'Se realiza mantencion de caldera'},
  {id_accion:'A049', id_especifico:'E1201', descripcion:'Se repara cierre perimetral'},
  {id_accion:'A050', id_especifico:'E1301', descripcion:'Se recarga / repone extintor'},
  {id_accion:'A051', id_especifico:'E1302', descripcion:'Se cambia luz de emergencia'},
  {id_accion:'A052', id_especifico:'', descripcion:'Otra accion (detallar en el texto)'}
];

const MATERIALES = [
  {id_material:'M001', nombre:'Tubo LED 18W', unidad:'unidad', costo_referencial:4500},
  {id_material:'M002', nombre:'Ampolleta LED 9W', unidad:'unidad', costo_referencial:1800},
  {id_material:'M003', nombre:'Equipo LED sobrepuesto 40W', unidad:'unidad', costo_referencial:12000},
  {id_material:'M004', nombre:'Proyector LED exterior 50W', unidad:'unidad', costo_referencial:18000},
  {id_material:'M005', nombre:'Interruptor simple', unidad:'unidad', costo_referencial:2200},
  {id_material:'M006', nombre:'Enchufe doble', unidad:'unidad', costo_referencial:2800},
  {id_material:'M007', nombre:'Automatico 10A', unidad:'unidad', costo_referencial:4200},
  {id_material:'M008', nombre:'Automatico 16A', unidad:'unidad', costo_referencial:4500},
  {id_material:'M009', nombre:'Diferencial 2x25A 30mA', unidad:'unidad', costo_referencial:22000},
  {id_material:'M010', nombre:'Cable EVA 1.5mm2', unidad:'metro', costo_referencial:450},
  {id_material:'M011', nombre:'Cable EVA 2.5mm2', unidad:'metro', costo_referencial:700},
  {id_material:'M012', nombre:'Conduit PVC 20mm', unidad:'tubo', costo_referencial:2500},
  {id_material:'M013', nombre:'Caja de derivacion', unidad:'unidad', costo_referencial:1200},
  {id_material:'M014', nombre:'Cinta aisladora', unidad:'unidad', costo_referencial:900},
  {id_material:'M015', nombre:'Llave lavamanos', unidad:'unidad', costo_referencial:8500},
  {id_material:'M016', nombre:'Mecanismo de estanque WC', unidad:'unidad', costo_referencial:9500},
  {id_material:'M017', nombre:'Sifon lavamanos', unidad:'unidad', costo_referencial:3200},
  {id_material:'M018', nombre:'Tubo PVC sanitario 110mm', unidad:'tubo', costo_referencial:6800},
  {id_material:'M019', nombre:'Tubo PVC 40mm', unidad:'tubo', costo_referencial:3400},
  {id_material:'M020', nombre:'Silicona sanitaria', unidad:'unidad', costo_referencial:3800},
  {id_material:'M021', nombre:'Teflon', unidad:'unidad', costo_referencial:600},
  {id_material:'M022', nombre:'Plancha zinc acanalada', unidad:'unidad', costo_referencial:9800},
  {id_material:'M023', nombre:'Teja asfaltica', unidad:'metro', costo_referencial:7500},
  {id_material:'M024', nombre:'Vidrio 4mm', unidad:'metro', costo_referencial:12000},
  {id_material:'M025', nombre:'Chapa de puerta', unidad:'unidad', costo_referencial:11000},
  {id_material:'M026', nombre:'Bisagra', unidad:'unidad', costo_referencial:1500},
  {id_material:'M027', nombre:'Candado', unidad:'unidad', costo_referencial:5500},
  {id_material:'M028', nombre:'Pintura latex', unidad:'litro', costo_referencial:4200},
  {id_material:'M029', nombre:'Esmalte al agua', unidad:'litro', costo_referencial:6500},
  {id_material:'M030', nombre:'Plancha volcanita 8mm', unidad:'unidad', costo_referencial:8900},
  {id_material:'M031', nombre:'Palmeta ceramica', unidad:'metro', costo_referencial:9500},
  {id_material:'M032', nombre:'Cemento', unidad:'unidad', costo_referencial:6500},
  {id_material:'M033', nombre:'Tornillo autoperforante', unidad:'unidad', costo_referencial:60},
  {id_material:'M034', nombre:'Extintor PQS 6kg', unidad:'unidad', costo_referencial:32000},
  {id_material:'M035', nombre:'Luz de emergencia LED', unidad:'unidad', costo_referencial:14000}
];

// Catálogo base de herramientas (Módulo 3 · Bodega). El stock de MATERIAL parte en blanco
// a propósito: se carga con bodega_recepcion o editando la hoja, no con datos inventados.
const HERRAMIENTAS = [
  {id_herramienta:'H001', nombre:'Taladro percutor', codigo:''},
  {id_herramienta:'H002', nombre:'Esmeril angular', codigo:''},
  {id_herramienta:'H003', nombre:'Soldadora eléctrica', codigo:''},
  {id_herramienta:'H004', nombre:'Escalera tijera 6 peldaños', codigo:''},
  {id_herramienta:'H005', nombre:'Compresor de aire', codigo:''},
  {id_herramienta:'H006', nombre:'Cortadora de cerámica', codigo:''},
  {id_herramienta:'H007', nombre:'Multímetro', codigo:''},
  {id_herramienta:'H008', nombre:'Desatascador eléctrico', codigo:''}
];


/* ======================================================================
   BOT - chatbot de WhatsApp
   ====================================================================== */

/**
 * Bot.gs — Chatbot de WhatsApp para LevantApp
 * Comparte Sheet, catálogos y correlativos con la PWA.
 *
 * Identidad = número de teléfono (columna 'telefono' en la hoja USUARIO).
 * No hay clave: si el número no está registrado, el bot no responde nada útil.
 *
 * Propiedades del script requeridas (Configuración del proyecto → Propiedades):
 *   WA_TOKEN          token permanente de la app de Meta
 *   WA_PHONE_ID       Phone Number ID (NO el número)
 *   WA_VERIFY_TOKEN   cualquier texto que inventes; el mismo va en Meta
 */

const WA_API = 'https://graph.facebook.com/v21.0';
const P_ = () => PropertiesService.getScriptProperties();

// ============ ENTRADA ============
function manejarWebhook(d) {
  const val = d.entry?.[0]?.changes?.[0]?.value;
  const msg = val?.messages?.[0];
  if (!msg) return;                                  // acuses de entrega, no interesan

  const tel = msg.from;
  const conv = cargarConv(tel);

  // Meta reintenta si tardamos: sin esto el usuario recibiría cada paso duplicado
  if (conv.ultimo_msg === msg.id) return;
  conv.ultimo_msg = msg.id;

  const u = usuarioPorTelefono(tel);
  if (!u) {
    enviarTexto(tel, 'Este número no está autorizado para usar LevantApp.\n\n' +
      'Solicita el alta a la Subdirección de Infraestructura y Mantenimiento del SLEP Puelche.');
    guardarConv(conv);
    return;
  }

  const entrada = leerEntrada(msg);
  try {
    procesar(u, conv, entrada, msg);
  } catch (err) {
    console.error('procesar: ' + err + ' ' + (err.stack || ''));
    enviarTexto(tel, 'Ocurrió un error. Escribe *menu* para volver a empezar.');
    conv.estado = 'MENU';
  }
  guardarConv(conv);
}

/** Normaliza texto, botón, opción de lista o imagen a una sola forma. */
function leerEntrada(msg) {
  if (msg.type === 'text')  return {tipo:'texto', valor:(msg.text.body||'').trim()};
  if (msg.type === 'image') return {tipo:'imagen', valor:msg.image.id};
  if (msg.type === 'interactive') {
    const i = msg.interactive;
    const r = i.button_reply || i.list_reply;
    return {tipo:'opcion', valor:r.id, titulo:r.title};
  }
  return {tipo:'otro', valor:''};
}

// ============ MÁQUINA DE ESTADOS ============
function procesar(u, conv, ent, msg) {
  const tel = conv.telefono;
  const txt = (ent.valor || '').toLowerCase();

  // Salidas de emergencia disponibles en cualquier punto
  if (ent.tipo === 'texto' && ['menu','menú','hola','inicio','salir','cancelar'].indexOf(txt) >= 0) {
    conv.estado = 'MENU'; conv.datos = {};
    return menuPrincipal(u, tel);
  }
  if (ent.valor === 'M_MENU') { conv.estado='MENU'; conv.datos={}; return menuPrincipal(u, tel); }

  const d = conv.datos || (conv.datos = {});

  switch (conv.estado) {

    // ---------- MENÚ ----------
    case '':
    case 'MENU':
      if (ent.valor === 'M_REPORTAR')  return iniciarReporte(u, conv, false);
      if (ent.valor === 'M_EMERGENCIA')return iniciarReporte(u, conv, true);
      if (ent.valor === 'M_TICKETS')   { conv.estado='MENU'; return misTickets(u, tel); }
      return menuPrincipal(u, tel);

    // ---------- TIPO DE EMERGENCIA ----------
    case 'EMG_TIPO':
      if (ent.tipo !== 'opcion') return pedirTipoEmergencia(tel);
      d.tipo_emergencia = ent.titulo;
      return trasEstablecimiento(u, conv);

    // ---------- COMUNA ----------
    case 'COMUNA':
      if (ent.tipo !== 'opcion') return pedirComuna(tel);
      d.id_comuna = ent.valor.replace('C_','');
      conv.estado = 'ESTAB'; d.pag = 0;
      return pedirEstablecimiento(conv);

    // ---------- ESTABLECIMIENTO ----------
    case 'ESTAB': {
      if (ent.valor === 'MAS') { d.pag = (d.pag||0)+1; return pedirEstablecimiento(conv); }
      if (ent.tipo === 'texto') { d.busca = ent.valor; d.pag = 0; return pedirEstablecimiento(conv); }
      if (ent.tipo !== 'opcion') return pedirEstablecimiento(conv);
      d.id_establecimiento = ent.valor.replace('E_','');
      return trasEstablecimiento(u, conv, true);
    }

    // ---------- RECINTO ----------
    case 'RECINTO':
      if (ent.valor === 'MAS') { d.pag=(d.pag||0)+1; return pedirRecinto(conv); }
      if (ent.tipo !== 'opcion') return pedirRecinto(conv);
      d.id_recinto = ent.valor.replace('R_','');
      conv.estado = 'GENERAL'; d.pag = 0;
      return pedirGeneral(conv);

    // ---------- ELEMENTO GENERAL ----------
    case 'GENERAL':
      if (ent.valor === 'MAS') { d.pag=(d.pag||0)+1; return pedirGeneral(conv); }
      if (ent.tipo !== 'opcion') return pedirGeneral(conv);
      d.id_general = ent.valor.replace('G_','');
      conv.estado = 'ESPECIFICO'; d.pag = 0;
      return pedirEspecifico(conv);

    // ---------- ELEMENTO ESPECÍFICO ----------
    case 'ESPECIFICO':
      if (ent.valor === 'MAS') { d.pag=(d.pag||0)+1; return pedirEspecifico(conv); }
      if (ent.valor === 'VOLVER') { conv.estado='GENERAL'; d.pag=0; return pedirGeneral(conv); }
      if (ent.tipo !== 'opcion') return pedirEspecifico(conv);
      d.id_especifico = ent.valor.replace('X_','');
      conv.estado = 'DESC';
      return enviarTexto(conv.telefono, '✏️ Describe la falla con el mayor detalle posible.');

    // ---------- DESCRIPCIÓN ----------
    case 'DESC':
      if (ent.tipo !== 'texto' || ent.valor.length < 5)
        return enviarTexto(tel, 'Escribe una descripción de al menos 5 caracteres.');
      d.descripcion = ent.valor;
      conv.estado = 'FOTO';
      return enviarTexto(tel, '📷 Ahora envía *una fotografía* del estado actual.\n\n' +
        '_Adjunta la imagen desde la cámara o la galería._');

    // ---------- FOTO ----------
    case 'FOTO': {
      if (ent.tipo !== 'imagen')
        return enviarTexto(tel, 'Necesito una fotografía. Adjunta la imagen para continuar.');
      d.media_id = ent.valor;
      if (d.es_emergencia) {
        conv.estado = 'EMG_CLASES';
        return enviarBotones(tel, '¿Esta emergencia obliga a *suspender las clases*?',
          [{id:'CL_SI', title:'Sí, se suspenden'}, {id:'CL_NO', title:'No'}]);
      }
      return cerrarReporte(u, conv);
    }

    // ---------- CONTINUIDAD DE CLASES ----------
    case 'EMG_CLASES':
      if (ent.tipo !== 'opcion') return enviarBotones(tel, '¿Se suspenden las clases?',
        [{id:'CL_SI', title:'Sí, se suspenden'}, {id:'CL_NO', title:'No'}]);
      d.continuidad_clases = ent.valor === 'CL_SI' ? 'Si' : 'No';
      return cerrarReporte(u, conv);

    default:
      conv.estado = 'MENU';
      return menuPrincipal(u, tel);
  }
}

// ============ PASOS ============
function menuPrincipal(u, tel) {
  enviarBotones(tel,
    '👷 *LevantApp — SLEP Puelche*\nHola ' + primerNombre(u.nombre) + '.\n\n¿Qué necesitas hacer?',
    [{id:'M_REPORTAR',   title:'Reportar falla'},
     {id:'M_EMERGENCIA', title:'🚨 Emergencia'},
     {id:'M_TICKETS',    title:'Mis tickets'}]);
}

function iniciarReporte(u, conv, esEmergencia) {
  conv.datos = {es_emergencia: esEmergencia, pag: 0};
  if (esEmergencia) { conv.estado = 'EMG_TIPO'; return pedirTipoEmergencia(conv.telefono); }
  return trasEstablecimiento(u, conv);
}

const TIPOS_EMG = ['SIN LUZ','SIN AGUA','FOSA SÉPTICA REBALSADA','DAÑOS POR CLIMA','OTRO'];
function pedirTipoEmergencia(tel) {
  enviarLista(tel, '🚨 *Trabajo de emergencia*\nSe genera un ticket con prioridad ALTA.\n\n¿Qué ocurrió?',
    'Elegir tipo', [{title:'Tipo de emergencia',
      rows: TIPOS_EMG.map((t,i)=>({id:'T_'+i, title:corta(t,24)}))}]);
}

/** Decide si hay que preguntar el establecimiento o si ya viene fijado por el perfil. */
function trasEstablecimiento(u, conv, yaElegido) {
  const d = conv.datos;
  if (!yaElegido && !d.id_establecimiento) {
    if (u.id_establecimiento) {            // el Director solo reporta en su colegio
      d.id_establecimiento = u.id_establecimiento;
    } else {
      conv.estado = 'COMUNA';
      return pedirComuna(conv.telefono);
    }
  }
  // Las emergencias no piden recinto ni elemento: se prioriza la rapidez
  if (d.es_emergencia) {
    conv.estado = 'DESC';
    return enviarTexto(conv.telefono,
      '📍 ' + nombreEstab(d.id_establecimiento) + '\n\n✏️ Describe brevemente la emergencia.');
  }
  conv.estado = 'RECINTO'; d.pag = 0;
  return pedirRecinto(conv);
}

function pedirComuna(tel) {
  const filas = leer('COMUNA').map(c=>({id:'C_'+c.id_comuna, title:corta(c.nombre,24)}));
  enviarLista(tel, '📍 *Paso 1 de 5* — ¿En qué comuna?', 'Elegir comuna',
    [{title:'Comunas', rows:filas}]);
}

function pedirEstablecimiento(conv) {
  const d = conv.datos;
  let lista = leer('ESTABLECIMIENTO').filter(e=>String(e.id_comuna)===String(d.id_comuna));
  if (d.busca) {
    const q = quitarTildes(d.busca);
    lista = lista.filter(e=>quitarTildes(e.nombre).indexOf(q) >= 0);
  }
  if (!lista.length) {
    d.busca = '';
    return enviarTexto(conv.telefono, 'No encontré ningún establecimiento con ese nombre. Escribe otra parte del nombre.');
  }
  paginar(conv, lista, 'E_', 'id_establecimiento', e=>e.nombre,
    e=>(e.tipo||'') + (e.rbd ? ' · RBD ' + e.rbd : ''),
    '🏫 *Paso 2 de 5* — Establecimiento' +
    (lista.length > 9 ? '\n\n_Puedes escribir parte del nombre para filtrar._' : ''),
    'Elegir colegio');
}

function pedirRecinto(conv) {
  const d = conv.datos;
  const lista = leer('RECINTO').filter(r=>String(r.id_establecimiento)===String(d.id_establecimiento));
  if (!lista.length) {
    d.id_recinto = '';
    conv.estado = 'GENERAL';
    return pedirGeneral(conv);
  }
  paginar(conv, lista, 'R_', 'id_recinto',
    r=>r.nombre_espacio ? r.tipo_espacio+' — '+r.nombre_espacio : r.tipo_espacio,
    ()=>'', '🚪 *Paso 3 de 5* — ¿En qué recinto?', 'Elegir recinto');
}

function pedirGeneral(conv) {
  paginar(conv, leer('ELEMENTO_GENERAL'), 'G_', 'id_general',
    g=>g.nombre, ()=>'', '🔧 *Paso 4 de 5* — ¿Qué tipo de elemento?', 'Elegir tipo');
}

function pedirEspecifico(conv) {
  const d = conv.datos;
  const lista = leer('ELEMENTO_ESPECIFICO').filter(e=>String(e.id_general)===String(d.id_general));
  paginar(conv, lista, 'X_', 'id_especifico', e=>e.nombre, ()=>'',
    '🔩 *Paso 5 de 5* — ' + nombreGeneral(d.id_general) + ': ¿qué elemento?', 'Elegir elemento');
}

/**
 * WhatsApp permite máximo 10 filas por lista. Con 28 colegios o 18 recintos
 * hay que paginar: se muestran 9 y la décima fila es "Ver más".
 */
function paginar(conv, lista, prefijo, campoId, fnTitulo, fnDesc, cuerpo, boton) {
  const d = conv.datos;
  const POR_PAG = 9;
  const pag = d.pag || 0;
  const totalPags = Math.ceil(lista.length / POR_PAG);
  const trozo = lista.slice(pag*POR_PAG, pag*POR_PAG + POR_PAG);

  const rows = trozo.map(x=>({
    id: prefijo + x[campoId],
    title: corta(fnTitulo(x), 24),
    description: corta(String(fnDesc(x)||''), 72)
  }));
  if (pag < totalPags - 1) rows.push({id:'MAS', title:'▶️ Ver más opciones'});

  const pie = totalPags > 1 ? ' (' + (pag+1) + '/' + totalPags + ')' : '';
  enviarLista(conv.telefono, cuerpo + pie, boton, [{title:'Opciones', rows:rows}]);
}

// ============ CIERRE ============
function cerrarReporte(u, conv) {
  const d = conv.datos;
  const tel = conv.telefono;
  enviarTexto(tel, '⏳ Guardando el reporte...');

  const dataUrl = descargarMedia(d.media_id);
  const r = guardarObservacion({data:{
    id_local: 'WA_' + conv.telefono + '_' + Date.now(),
    id_establecimiento: d.id_establecimiento,
    id_recinto: d.id_recinto || '',
    id_especifico: d.id_especifico || '',
    descripcion: d.descripcion,
    foto_antes: dataUrl,
    // Igual que en la app: solo Infraestructura fija prioridad al registrar
    prioridad: d.es_emergencia ? 'Alta' : (u.perfil === 'Infraestructura' ? 'Media' : 'Por evaluar'),
    estado: 'Pendiente',
    fecha_registro: new Date(),
    id_usuario_levanta: u.id_usuario,
    es_emergencia: !!d.es_emergencia,
    tipo_emergencia: d.tipo_emergencia || '',
    continuidad_clases: d.continuidad_clases || ''
  }});

  conv.estado = 'MENU'; conv.datos = {};

  if (r.status !== 'ok') {
    return enviarTexto(tel, '❌ No se pudo guardar el reporte. Inténtalo otra vez con *menu*.');
  }

  let m = (d.es_emergencia ? '🚨 *EMERGENCIA REGISTRADA*' : '✅ *Reporte registrado*') +
    '\n\n*Ticket:* `' + r.ticket + '`' +
    '\n*Establecimiento:* ' + nombreEstab(d.id_establecimiento);
  if (d.id_recinto)    m += '\n*Recinto:* ' + nombreRecinto(d.id_recinto);
  if (d.id_especifico) m += '\n*Elemento:* ' + nombreEspecifico(d.id_especifico);
  if (d.tipo_emergencia) m += '\n*Tipo:* ' + d.tipo_emergencia;
  m += '\n*Prioridad:* ' + (d.es_emergencia ? 'ALTA' : (u.perfil==='Infraestructura'?'Media':'Por evaluar'));
  if (d.continuidad_clases === 'Si') m += '\n\n⚠️ Se notificó la suspensión de clases a la Dirección de Educación.';
  m += '\n\nGuarda este número de ticket para hacer seguimiento.\nEscribe *menu* para otra acción.';
  enviarTexto(tel, m);
}

function misTickets(u, tel) {
  let lista = leer('OBSERVACION');
  lista = u.id_establecimiento
    ? lista.filter(o=>String(o.id_establecimiento)===String(u.id_establecimiento))
    : lista.filter(o=>String(o.id_usuario_levanta)===String(u.id_usuario));
  lista = lista.slice(-10).reverse();

  if (!lista.length) return enviarTexto(tel, 'No tienes tickets registrados todavía.\n\nEscribe *menu* para reportar una falla.');

  const ico = {Pendiente:'⏳','En proceso':'🔧',Cerrado:'✅',Rechazado:'❌'};
  const m = '📋 *Tus últimos tickets*\n\n' + lista.map(o=>
    (ico[o.estado]||'•') + ' `' + o.ticket + '`\n' +
    '   ' + nombreEstab(o.id_establecimiento) + '\n' +
    '   ' + (o.es_emergencia==='SI' ? '🚨 '+o.tipo_emergencia : nombreEspecifico(o.id_especifico)) + '\n' +
    '   *' + o.estado + '* · ' + o.prioridad +
    (o.justificacion ? '\n   _' + o.justificacion + '_' : '')
  ).join('\n\n') + '\n\nEscribe *menu* para volver.';
  enviarTexto(tel, m);
}

// ============ WHATSAPP: ENVÍO ============
function waPost(payload) {
  const tok = P_().getProperty('WA_TOKEN'), id = P_().getProperty('WA_PHONE_ID');
  if (!tok || !id) { console.error('Faltan WA_TOKEN o WA_PHONE_ID'); return; }
  const res = UrlFetchApp.fetch(WA_API + '/' + id + '/messages', {
    method:'post', contentType:'application/json',
    headers:{Authorization:'Bearer ' + tok},
    payload: JSON.stringify(payload), muteHttpExceptions:true
  });
  if (res.getResponseCode() >= 300) console.error('WA ' + res.getResponseCode() + ': ' + res.getContentText());
}

function enviarTexto(to, body) {
  waPost({messaging_product:'whatsapp', to:to, type:'text',
          text:{preview_url:false, body:corta(body, 4096)}});
}

function enviarBotones(to, body, botones) {
  waPost({messaging_product:'whatsapp', to:to, type:'interactive',
    interactive:{type:'button', body:{text:corta(body,1024)},
      action:{buttons: botones.slice(0,3).map(b=>({type:'reply',
        reply:{id:b.id, title:corta(b.title,20)}}))}}});
}

function enviarLista(to, body, boton, secciones) {
  waPost({messaging_product:'whatsapp', to:to, type:'interactive',
    interactive:{type:'list', body:{text:corta(body,1024)},
      action:{button:corta(boton,20), sections:secciones}}});
}

/** Descarga la imagen desde los servidores de Meta y la devuelve como dataURL. */
function descargarMedia(mediaId) {
  if (!mediaId) return '';
  const tok = P_().getProperty('WA_TOKEN');
  try {
    const meta = UrlFetchApp.fetch(WA_API + '/' + mediaId, {
      headers:{Authorization:'Bearer ' + tok}, muteHttpExceptions:true});
    if (meta.getResponseCode() >= 300) { console.error('media meta: ' + meta.getContentText()); return ''; }
    const url = JSON.parse(meta.getContentText()).url;
    const bin = UrlFetchApp.fetch(url, {headers:{Authorization:'Bearer ' + tok}, muteHttpExceptions:true});
    if (bin.getResponseCode() >= 300) { console.error('media bin: ' + bin.getResponseCode()); return ''; }
    const blob = bin.getBlob();
    return 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' +
           Utilities.base64Encode(blob.getBytes());
  } catch (e) { console.error('descargarMedia: ' + e); return ''; }
}

// ============ ESTADO DE CONVERSACIÓN ============
function cargarConv(tel) {
  const f = buscar('CONVERSACION', 'telefono', tel);
  if (!f) return {telefono:tel, estado:'MENU', datos:{}, ultimo_msg:''};
  let datos = {};
  try { datos = JSON.parse(f.datos || '{}'); } catch(e) {}
  return {telefono:tel, estado:f.estado || 'MENU', datos:datos, ultimo_msg:f.ultimo_msg || ''};
}

function guardarConv(c) {
  upsert('CONVERSACION', 'telefono', c.telefono, {
    telefono:c.telefono, estado:c.estado,
    datos: JSON.stringify(c.datos || {}).slice(0, 40000),
    ultimo_msg: c.ultimo_msg, actualizado: new Date()
  });
}

/** Compara ignorando el prefijo país: Meta entrega 56912345678, la hoja puede traer +569... */
function usuarioPorTelefono(tel) {
  const n = soloDigitos(tel);
  return leer('USUARIO').find(u => {
    if (String(u.activo) === 'false' || !u.telefono) return false;
    const t = soloDigitos(u.telefono);
    return t === n || t.slice(-8) === n.slice(-8);
  }) || null;
}

// ============ HELPERS ============
const soloDigitos = s => String(s||'').replace(/\D/g,'');
const corta = (s, n) => { s = String(s==null?'':s); return s.length <= n ? s : s.slice(0, n-1) + '…'; };
const primerNombre = n => String(n||'').split(' ')[0];
function quitarTildes(s) {
  return String(s||'').toLowerCase()
    .replace(/[áàä]/g,'a').replace(/[éèë]/g,'e').replace(/[íìï]/g,'i')
    .replace(/[óòö]/g,'o').replace(/[úùü]/g,'u').replace(/ñ/g,'n');
}
const nombreEstab      = id => (buscar('ESTABLECIMIENTO','id_establecimiento',id)||{}).nombre || String(id||'');
const nombreGeneral    = id => (buscar('ELEMENTO_GENERAL','id_general',id)||{}).nombre || '';
const nombreEspecifico = id => (buscar('ELEMENTO_ESPECIFICO','id_especifico',id)||{}).nombre || '';
function nombreRecinto(id) {
  const r = buscar('RECINTO','id_recinto',id);
  if (!r) return '';
  return r.nombre_espacio ? r.tipo_espacio + ' — ' + r.nombre_espacio : r.tipo_espacio;
}

// ============ UTILIDADES DE ADMINISTRACIÓN ============
/** Asocia un teléfono a un usuario ya creado. Editar y ejecutar. */
function asignarTelefono() {
  const usuario  = 'rbascunan';
  const telefono = '56912345678';        // sin +, con código país
  const u = buscar('USUARIO','usuario',usuario);
  if (!u) { console.log('no existe el usuario ' + usuario); return; }
  u.telefono = telefono;
  upsert('USUARIO','usuario',usuario,u);
  console.log('telefono asignado a ' + usuario);
}

/** Prueba de humo: envía un mensaje al número indicado. */
function probarEnvio() {
  enviarTexto('56912345678', '✅ LevantApp conectado correctamente.');
}

/** Limpia conversaciones abandonadas hace más de 24 h (ejecutar con un activador diario). */
function limpiarConversaciones() {
  const sh = hoja('CONVERSACION');
  const n = sh.getLastRow();
  if (n < 2) return;
  const v = sh.getRange(2,1,n-1,5).getValues();
  const limite = Date.now() - 24*3600*1000;
  for (let i = v.length-1; i >= 0; i--) {
    const t = v[i][4] ? new Date(v[i][4]).getTime() : 0;
    if (t && t < limite) sh.deleteRow(i+2);
  }
}


/** Reescribe los RBD como texto. Sheets los habia convertido a fechas. */
function repararRBD() {
  const sh = hoja("ESTABLECIMIENTO");
  const n = sh.getLastRow();
  if (n < 2) return "sin datos";
  sh.getRange(1, 3, sh.getMaxRows(), 1).setNumberFormat("@");
  const mapa = {};
  ESTABLECIMIENTOS_CARGA.forEach(function(e){ mapa[e[0]] = e[2]; });
  const ids = sh.getRange(2, 1, n-1, 1).getValues();
  const vals = ids.map(function(r){ return [mapa[r[0]] !== undefined ? mapa[r[0]] : ""]; });
  sh.getRange(2, 3, n-1, 1).setValues(vals);
  const msg = "RBD reparados: " + vals.filter(function(x){return x[0];}).length;
  console.log(msg);
  return msg;
}

/** Restablece la clave de admin y verifica que quede correcta. */
function diagnosticoLogin() {
  const CLAVE = "Puelche3281!";
  const u = buscar("USUARIO", "usuario", "admin");
  if (!u) return "no existe admin";
  u.hash = hash(CLAVE);
  upsert("USUARIO", "usuario", "admin", u);
  const r = login({usuario:"admin", clave:CLAVE});
  const msg = "Clave restablecida. Login de prueba: " + r.status;
  console.log(msg);
  return msg;
}
