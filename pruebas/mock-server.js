// Mock server: replica 1:1 la lógica de negocio de apps-script/Codigo.gs, pero sobre
// arreglos en memoria en vez de Google Sheets/Drive. El objetivo es probar el contrato
// real frontend<->backend (mismos nombres de acción, mismos campos, misma lógica de
// estados/permisos) sin depender de la red ni de una cuenta de Google.
const http = require('http');
const crypto = require('crypto');

// ==================== ESQUEMA (copiado de Codigo.gs) ====================
const SCHEMA = {
  COMUNA: ['id_comuna','nombre','id_gestor'],
  ESTABLECIMIENTO: ['id_establecimiento','id_comuna','rbd','nombre','tipo','direccion','lat','lng'],
  RECINTO: ['id_recinto','id_establecimiento','tipo_espacio','nombre_espacio'],
  ELEMENTO_GENERAL: ['id_general','nombre'],
  ELEMENTO_ESPECIFICO: ['id_especifico','id_general','nombre'],
  ACCION_TIPO: ['id_accion','id_especifico','descripcion'],
  MATERIAL: ['id_material','nombre','unidad','costo_referencial','stock','minimo'],
  USUARIO: ['id_usuario','usuario','hash','nombre','perfil','id_establecimiento','activo','telefono','correo'],
  OBSERVACION: ['ticket','id_local','id_establecimiento','id_recinto','id_especifico','descripcion',
    'foto_antes_url','fotos_antes_urls','prioridad','estado','fecha_registro','id_usuario_levanta',
    'id_gestor_asignado','es_emergencia','tipo_emergencia','continuidad_clases','justificacion','actualizado','cantidad'],
  SUBSANACION: ['id_subsanacion','ticket','id_accion','detalle_trabajo','foto_despues_url',
    'fotos_despues_urls','fecha_ejecucion','id_usuario_ejecuta','resuelto','validado','actualizado','horas'],
  MATERIAL_USADO: ['id','id_subsanacion','id_material','cantidad'],
  COMENTARIO: ['id_comentario','ticket','id_usuario','texto','fecha'],
  HERRAMIENTA: ['id_herramienta','nombre','codigo'],
  BODEGA_MOVIMIENTO: ['id_local','tipo','id_material','id_herramienta','cantidad',
    'id_usuario_entrega','id_usuario_recibe','ticket_asociado','fecha','actualizado'],
  BODEGA_SALDO: ['id','id_usuario','id_material','cantidad','actualizado'],
  BODEGA_CUSTODIA: ['id_herramienta','id_usuario','estado','fecha','actualizado'],
  BODEGA_RECEPCION: ['id_local','id_material','cantidad','valor_unitario','proveedor','documento','fecha','id_usuario','foto_url','actualizado'],
  CAJA_CHICA: ['id_local','id_material','cantidad','precio_unitario','id_usuario','foto_boleta_url','glosa','fecha','actualizado'],
  EMPRESA: ['id_empresa','nombre','rut'],
  OC: ['id_local','id_empresa','numero_oc','id_licitacion','estado','fecha','id_usuario','actualizado'],
  OC_PARTIDA: ['id_local','id_oc','item','unidad','cantidad','monto','avance','foto_url','actualizado'],
  VALIDACION: ['id_local','id_local_obs','id_subsanacion','ticket','conforme','id_usuario_valida','fecha'],
  ASIGNACION: ['id_local','id_usuario','id_establecimiento','id_usuario_coordinador','fecha','activa','actualizado','tareas'],
  RUTA: ['id_ruta','fecha','gestor','maestro','id_usuario_maestro','establecimiento','id_establecimiento','vehiculo','trabajo','origen','id_usuario_carga','actualizado']
};

// ==================== "HOJAS" EN MEMORIA ====================
const DB = {};
Object.keys(SCHEMA).forEach(n => DB[n] = []);

function leer(nombre) { return DB[nombre]; }
function buscar(nombre, campo, valor) { return DB[nombre].find(r => String(r[campo]) === String(valor)) || null; }
function upsert(nombre, campoPK, valorPK, obj) {
  const arr = DB[nombre];
  const i = arr.findIndex(r => String(r[campoPK]) === String(valorPK));
  if (i >= 0) arr[i] = Object.assign({}, arr[i], obj);
  else arr.push(Object.assign({}, obj));
}
function appendFila(nombre, obj) { DB[nombre].push(Object.assign({}, obj)); }
function borrarPorClave(nombre, campo, valor) {
  DB[nombre] = DB[nombre].filter(r => String(r[campo]) !== String(valor));
}
function sembrar(nombre, pk, filas) { filas.forEach(f => { if (!buscar(nombre, pk, f[pk])) appendFila(nombre, f); }); }

// ==================== UTILIDADES (equivalentes GAS) ====================
function hash(txt) {
  return crypto.createHash('sha256').update('lvp:' + txt, 'utf8').digest('hex');
}
const seq = {};
function nuevoCorrelativo(prefijo) {
  const anio = new Date().getFullYear();
  const clave = 'SEQ_' + prefijo + '_' + anio;
  seq[clave] = (seq[clave] || 0) + 1;
  return prefijo + '-' + anio + '-' + ('00000' + seq[clave]).slice(-6);
}
function subirFoto(dataUrl, nombre) {
  if (!dataUrl || String(dataUrl).indexOf('data:') !== 0) return '';
  return 'https://drive.mock/' + nombre; // stub: no hay Drive real en el test
}

// ==================== ACCIONES (traducidas 1:1 desde Codigo.gs) ====================
function login(d) {
  const u = DB.USUARIO.find(r => String(r.usuario).toLowerCase() === String(d.usuario || '').toLowerCase());
  if (!u || String(u.activo) === 'false') return {status:'error', message:'Usuario o clave incorrectos'};
  if (u.hash !== hash(d.clave || '')) return {status:'error', message:'Usuario o clave incorrectos'};
  const asignados = leer('ASIGNACION')
    .filter(a => a.id_usuario === u.id_usuario && String(a.activa) !== 'false')
    .map(a => a.id_establecimiento);
  return {status:'ok', usuario:{id_usuario:u.id_usuario, nombre:u.nombre, perfil:u.perfil,
    id_establecimiento:u.id_establecimiento || '', correo:u.correo || '', establecimientos_asignados: asignados}};
}

function catalogos(d) {
  d = d || {};
  const solicitante = d.id_usuario ? buscar('USUARIO', 'id_usuario', d.id_usuario) : null;
  const esInfra = !!(solicitante && solicitante.perfil === 'Infraestructura');
  const esCoordinador = !!(solicitante && solicitante.perfil === 'Coordinador');
  const esBodega = !!(solicitante && solicitante.perfil === 'Bodega');
  return {
    status:'ok',
    comunas: leer('COMUNA'), establecimientos: leer('ESTABLECIMIENTO'), recintos: leer('RECINTO'),
    generales: leer('ELEMENTO_GENERAL'), especificos: leer('ELEMENTO_ESPECIFICO'), acciones: leer('ACCION_TIPO'),
    materiales: leer('MATERIAL'), herramientas: leer('HERRAMIENTA'), empresas: leer('EMPRESA'),
    usuarios: (esInfra || esCoordinador || esBodega) ? leer('USUARIO').map(u => ({id_usuario:u.id_usuario, nombre:u.nombre, usuario_login:u.usuario, perfil:u.perfil, id_establecimiento:u.id_establecimiento, correo:u.correo||''})) : [],
    v: Date.now()
  };
}

function pull(d) {
  let obs = leer('OBSERVACION');
  const solicitante = d.id_usuario ? buscar('USUARIO', 'id_usuario', d.id_usuario) : null;
  const perfil = solicitante ? solicitante.perfil : d.perfil;
  if (perfil === 'Director') {
    const idDirector = solicitante ? String(solicitante.id_usuario) : '';
    obs = obs.filter(o => idDirector && String(o.id_usuario_levanta) === idDirector);
  } else if (perfil === 'Maestro' && d.id_establecimientos && d.id_establecimientos.length) {
    const set = {}; d.id_establecimientos.forEach(id => set[String(id)] = 1);
    obs = obs.filter(o => set[String(o.id_establecimiento)]);
  }
  obs = obs.slice(-500);
  const tickets = {}; obs.forEach(o => tickets[o.ticket] = 1);
  const subsanaciones = leer('SUBSANACION').filter(s=>tickets[s.ticket]);
  const subIds = {}; subsanaciones.forEach(s => subIds[s.id_subsanacion] = 1);
  return {status:'ok', observaciones:obs, subsanaciones,
    materiales_usados: leer('MATERIAL_USADO').filter(m => subIds[m.id_subsanacion]),
    comentarios:leer('COMENTARIO').filter(c=>tickets[c.ticket])};
}

function permisoCoordinador(idUsuario) {
  const u = buscar('USUARIO', 'id_usuario', idUsuario);
  return !!(u && (u.perfil === 'Infraestructura' || u.perfil === 'Coordinador'));
}
function asignacionPull(d) {
  if (!permisoCoordinador(d.id_usuario)) return {status:'error', message:'sin permiso para ver asignaciones'};
  return {
    status:'ok',
    asignaciones: leer('ASIGNACION').filter(a => String(a.activa) !== 'false'),
    usuarios: leer('USUARIO').filter(u => u.perfil==='Maestro'||u.perfil==='Director'||u.perfil==='Infraestructura')
      .map(u => ({id_usuario:u.id_usuario, nombre:u.nombre, perfil:u.perfil}))
  };
}
function asignacionGuardar(d) {
  const a = d.data || {};
  if (!permisoCoordinador(a.id_usuario_coordinador)) return {status:'error', message:'sin permiso para asignar'};
  if (!a.id_local || !a.id_usuario || !a.id_establecimiento) return {status:'error', message:'faltan datos de la asignación'};
  upsert('ASIGNACION', 'id_local', a.id_local, {
    id_local:a.id_local, id_usuario:a.id_usuario, id_establecimiento:a.id_establecimiento,
    id_usuario_coordinador:a.id_usuario_coordinador, fecha:a.fecha||new Date().toISOString(),
    activa: a.activa===false ? 'false' : 'true', actualizado:new Date().toISOString(), tareas:a.tareas||''
  });
  if (a.activa !== false) notificarRuta(a);
  return {status:'ok'};
}

const RUTA_MAIL_LOG = [];
function notificarRuta(a) {
  const destinatario = buscar('USUARIO', 'id_usuario', a.id_usuario);
  if (!destinatario || !destinatario.correo) return;
  const estab = a.id_establecimiento ? buscar('ESTABLECIMIENTO', 'id_establecimiento', a.id_establecimiento) : null;
  const comuna = estab && estab.id_comuna ? buscar('COMUNA', 'id_comuna', estab.id_comuna) : null;
  const coordinador = a.id_usuario_coordinador ? buscar('USUARIO', 'id_usuario', a.id_usuario_coordinador) : null;
  RUTA_MAIL_LOG.push({
    dest: destinatario.correo, id_usuario: a.id_usuario,
    comuna: comuna ? comuna.nombre : '', establecimiento: estab ? estab.nombre : (a.id_establecimiento||''),
    tareas: a.tareas || '', replyTo: (coordinador && coordinador.correo) || ''
  });
}

function guardarObservacion(d) {
  const o = d.data || {};
  if (!o.id_local) return {status:'error', message:'falta id_local'};
  const prev = buscar('OBSERVACION', 'id_local', o.id_local);
  const ticket = prev ? prev.ticket : nuevoCorrelativo(o.es_emergencia ? 'EMG' : 'SLEP');
  const fotos = (o.fotos_antes && o.fotos_antes.length ? o.fotos_antes : [o.foto_antes]).filter(Boolean);
  const urls = fotos.map((f,i) => subirFoto(f, ticket+'_antes_'+(i+1)+'.jpg')).filter(Boolean);
  let urlPrincipal = urls[0] || (prev&&prev.foto_antes_url) || '';
  let urlsTexto = urls.length?urls.join(';'):((prev&&prev.fotos_antes_urls)||'');
  let fotosAgregadas = null;
  if (prev && o.fotos_agregar && o.fotos_agregar.length) {
    const previas = String(prev.fotos_antes_urls || prev.foto_antes_url || '').split(';').filter(Boolean);
    const nuevasUrls = o.fotos_agregar.slice(0, Math.max(0, 3 - previas.length))
      .map((f,i) => subirFoto(f, ticket+'_antes_'+(previas.length+i+1)+'.jpg')).filter(Boolean);
    const todas = previas.concat(nuevasUrls); urlPrincipal = todas[0]||''; urlsTexto = todas.join(';'); fotosAgregadas = nuevasUrls.length;
  }
  upsert('OBSERVACION', 'id_local', o.id_local, {
    ticket, id_local:o.id_local, id_establecimiento:o.id_establecimiento||'', id_recinto:o.id_recinto||'',
    id_especifico:o.id_especifico||'', cantidad:o.cantidad||1, descripcion:o.descripcion||'',
    foto_antes_url: urlPrincipal, fotos_antes_urls: urlsTexto,
    prioridad:o.prioridad||'Por evaluar', estado:(prev&&prev.estado)||o.estado||'Pendiente',
    fecha_registro:o.fecha_registro||new Date().toISOString(), id_usuario_levanta:o.id_usuario_levanta||'',
    id_gestor_asignado:(prev&&prev.id_gestor_asignado)||'', es_emergencia:o.es_emergencia?'SI':'',
    tipo_emergencia:o.tipo_emergencia||'', continuidad_clases:o.continuidad_clases||'',
    justificacion:(prev&&prev.justificacion)||o.justificacion||'', actualizado:new Date().toISOString()
  });
  if (!prev) notificarTicket(o, ticket);
  return {status:'ok', ticket, id_local:o.id_local, fotos_agregadas:fotosAgregadas};
}

// Stub de MailApp.sendEmail: no hay Gmail real en Node, así que registra cada envío en
// MAIL_LOG (tipo, destinatarios, cc, ticket, enlaces de voto) para las aserciones del e2e.
const MAIL_LOG = [];
const MAIL_CENTRAL = 'rodrigo.bascunan@sleppuelche.gob.cl'; // MAIL_NOTIFICACIONES en el mock
const VOTO_SECRET = 'secreto-mock';
const URL_WEBAPP = 'http://localhost:' + (process.env.MOCK_PORT || 8934) + '/';
function contextoTicket(o) {
  const estab = o.id_establecimiento ? buscar('ESTABLECIMIENTO','id_establecimiento',o.id_establecimiento) : null;
  const comuna = estab && estab.id_comuna ? buscar('COMUNA','id_comuna',estab.id_comuna) : null;
  const gestor = comuna && comuna.id_gestor ? buscar('USUARIO','id_usuario',comuna.id_gestor) : null;
  const creador = o.id_usuario_levanta ? buscar('USUARIO','id_usuario',o.id_usuario_levanta) : null;
  return {estab, comuna, gestor, creador};
}
function enviarCorreo(tipo, para, extra) {
  const vistos = {};
  const lista = (para||[]).map(x=>String(x||'').trim()).filter(x => x && !vistos[x.toLowerCase()] && (vistos[x.toLowerCase()] = true));
  if (!lista.length) return false;
  const cc = extra && extra.cc && !vistos[extra.cc.toLowerCase()] ? extra.cc : '';
  MAIL_LOG.push(Object.assign({tipo, para: lista}, extra || {}, {cc}));
  return true;
}
function notificarTicket(o, ticket) {
  const obs = Object.assign({}, o, {ticket, es_emergencia: o.es_emergencia ? 'SI' : ''});
  const ctx = contextoTicket(obs);
  const extra = {ticket, es_emergencia: !!o.es_emergencia, establecimiento: ctx.estab ? ctx.estab.nombre : (o.id_establecimiento||''),
    comuna: ctx.comuna ? ctx.comuna.nombre : '', replyTo: (ctx.creador && ctx.creador.correo) || '', cc: MAIL_CENTRAL};
  if (!enviarCorreo('ticket_nuevo', [ctx.gestor && ctx.gestor.correo, ctx.creador && ctx.creador.correo], extra)) {
    enviarCorreo('ticket_nuevo', [MAIL_CENTRAL], Object.assign(extra, {cc: ''}));
  }
}
function firmaVoto(ticket, idSub, idGestor) {
  return crypto.createHmac('sha256', VOTO_SECRET).update(ticket + '|' + idSub + '|' + idGestor).digest('base64url');
}
function urlVoto(ticket, idSub, idGestor, voto) {
  return URL_WEBAPP + '?voto=' + voto + '&t=' + encodeURIComponent(ticket) + '&s=' + encodeURIComponent(idSub) +
    '&g=' + encodeURIComponent(idGestor) + '&k=' + firmaVoto(ticket, idSub, idGestor);
}
function solicitarVotoCierre(o, s) {
  const ctx = contextoTicket(o);
  const idGestor = ctx.gestor ? ctx.gestor.id_usuario : '';
  enviarCorreo('voto_cierre', [(ctx.gestor && ctx.gestor.correo) || MAIL_CENTRAL], {
    ticket: o.ticket, okUrl: urlVoto(o.ticket, s.id_subsanacion, idGestor, 'ok'),
    rechazarUrl: urlVoto(o.ticket, s.id_subsanacion, idGestor, 'rechazar')
  });
}
function notificarCierre(o) {
  const ctx = contextoTicket(o);
  if (!ctx.creador || !ctx.creador.correo) return;
  enviarCorreo('ticket_cerrado', [ctx.creador.correo], {ticket: o.ticket});
}
function votarCierre(p) {
  const pagina = (titulo, msg, extra) => '<html><body><h2>' + titulo + '</h2><p>' + msg + '</p>' + (extra||'') + '</body></html>';
  const voto = p.voto === 'ok' || p.voto === 'rechazar' ? p.voto : '';
  const idGestor = p.g || '';
  if (!voto || !p.t || !p.s || p.k !== firmaVoto(p.t, p.s, idGestor)) return pagina('Enlace no válido', 'El enlace está incompleto o fue modificado.');
  const o = buscar('OBSERVACION','ticket',p.t);
  const s = buscar('SUBSANACION','id_subsanacion',p.s);
  if (!o || !s || s.ticket !== o.ticket) return pagina('Ticket no encontrado', 'No se encontró el ticket.');
  if (o.estado !== 'Ejecutado') return pagina('Ticket ' + o.ticket, 'Este ticket ya fue revisado. Estado actual: <b>' + o.estado + '</b>.');
  if (p.confirmar !== '1') {
    return pagina('Ticket ' + o.ticket, '¿Confirmas ' + (voto === 'ok' ? 'dar el OK y cerrar' : 'rechazar y reabrir') + ' este ticket?',
      '<a id="confirmar" href="' + urlVoto(o.ticket, s.id_subsanacion, idGestor, voto) + '&confirmar=1">Confirmar</a>');
  }
  o.estado = voto === 'ok' ? 'Cerrado' : 'Reabierto';
  o.actualizado = new Date().toISOString();
  upsert('OBSERVACION','ticket',o.ticket,o);
  upsert('VALIDACION','id_local','VOTO_' + s.id_subsanacion, {id_local:'VOTO_' + s.id_subsanacion, id_local_obs:o.id_local, id_subsanacion:s.id_subsanacion,
    ticket:o.ticket, conforme: voto === 'ok' ? 'SI' : 'NO', id_usuario_valida: idGestor || 'voto-correo', fecha:new Date().toISOString()});
  if (voto === 'ok') notificarCierre(o);
  return pagina('¡Listo!', 'El ticket <b>' + o.ticket + '</b> quedó ' + (voto === 'ok' ? 'cerrado' : 'reabierto') + '.');
}
function rutasImportar(d) {
  if (!permisoCoordinador(d.id_usuario)) return {status:'error', message:'sin permiso para importar rutas'};
  const rutas = (d.rutas || []).filter(r => r && r.id_ruta && r.fecha);
  if (!rutas.length) return {status:'error', message:'no hay rutas para importar'};
  let nuevas = 0, actualizadas = 0; const vistos = {};
  rutas.forEach(r => {
    if (vistos[r.id_ruta]) return; vistos[r.id_ruta] = 1;
    const existe = !!buscar('RUTA', 'id_ruta', r.id_ruta);
    upsert('RUTA', 'id_ruta', r.id_ruta, Object.assign({}, r, {origen: r.origen || 'planilla', id_usuario_carga: d.id_usuario, actualizado: new Date().toISOString()}));
    if (existe) actualizadas++; else nuevas++;
  });
  return {status:'ok', nuevas, actualizadas};
}
function rutasPull(d) {
  if (!permisoCoordinador(d.id_usuario)) return {status:'error', message:'sin permiso para ver rutas'};
  return {status:'ok', rutas: leer('RUTA')};
}
function comunaGestor(d) {
  const c = d.data || {};
  if (!permisoCoordinador(c.id_usuario_actor)) return {status:'error', message:'sin permiso para asignar gestores'};
  const comuna = buscar('COMUNA','id_comuna',c.id_comuna);
  if (!comuna) return {status:'error', message:'comuna no existe'};
  if (c.id_gestor && !buscar('USUARIO','id_usuario',c.id_gestor)) return {status:'error', message:'usuario no existe'};
  comuna.id_gestor = c.id_gestor || '';
  upsert('COMUNA','id_comuna',c.id_comuna,comuna);
  return {status:'ok'};
}

function guardarSubsanacion(d) {
  const s = d.data || {};
  if (!s.id_subsanacion || !s.ticket) return {status:'error', message:'faltan claves'};
  const prev = buscar('SUBSANACION', 'id_subsanacion', s.id_subsanacion);
  const fotos = (s.fotos_despues && s.fotos_despues.length ? s.fotos_despues : [s.foto_despues]).filter(Boolean);
  const urls = fotos.map((f,i) => subirFoto(f, s.id_subsanacion+'_despues_'+(i+1)+'.jpg')).filter(Boolean);
  upsert('SUBSANACION', 'id_subsanacion', s.id_subsanacion, {
    id_subsanacion:s.id_subsanacion, ticket:s.ticket, id_accion:s.id_accion||'', detalle_trabajo:s.detalle_trabajo||'',
    foto_despues_url: urls[0]||(prev&&prev.foto_despues_url)||'', fotos_despues_urls: urls.length?urls.join(';'):((prev&&prev.fotos_despues_urls)||''),
    fecha_ejecucion:s.fecha_ejecucion||new Date().toISOString(), id_usuario_ejecuta:s.id_usuario_ejecuta||'',
    resuelto:s.resuelto?'SI':'NO', validado:s.validado?'SI':'NO', actualizado:new Date().toISOString(),
    horas: s.horas || ''
  });
  borrarPorClave('MATERIAL_USADO', 'id_subsanacion', s.id_subsanacion);
  (s.materiales||[]).forEach((m,i) => appendFila('MATERIAL_USADO', {id:s.id_subsanacion+'-'+i, id_subsanacion:s.id_subsanacion, id_material:m.id_material, cantidad:m.cantidad}));
  const obs = buscar('OBSERVACION', 'ticket', s.ticket);
  if (obs) {
    obs.estado = !s.resuelto ? 'En proceso' : (s.validado ? 'Cerrado' : 'Ejecutado');
    obs.actualizado = new Date().toISOString();
    upsert('OBSERVACION', 'ticket', s.ticket, obs);
    if (s.resuelto && !(prev && prev.resuelto === 'SI')) {
      const sGuardada = buscar('SUBSANACION', 'id_subsanacion', s.id_subsanacion);
      if (obs.estado === 'Cerrado') notificarCierre(obs);
      else solicitarVotoCierre(obs, sGuardada);
    }
  }
  return {status:'ok', id:s.id_subsanacion};
}

function priorizar(d) {
  const u = buscar('USUARIO', 'id_usuario', d.id_usuario);
  if (!u || u.perfil !== 'Infraestructura') return {status:'error', message:'sin permiso para priorizar'};
  const o = buscar('OBSERVACION', 'ticket', d.ticket);
  if (!o) return {status:'error', message:'ticket no existe'};
  o.prioridad = d.prioridad || o.prioridad;
  if (d.estado) o.estado = d.estado;
  if (d.justificacion) o.justificacion = d.justificacion;
  if (d.id_gestor_asignado) o.id_gestor_asignado = d.id_gestor_asignado;
  o.actualizado = new Date().toISOString();
  upsert('OBSERVACION', 'ticket', d.ticket, o);
  return {status:'ok'};
}

function permisoBodega(id) { const u = buscar('USUARIO','id_usuario',id); return !!(u && (u.perfil==='Infraestructura'||u.perfil==='Bodega')); }
function permisoInfraestructura(id) { const u = buscar('USUARIO','id_usuario',id); return !!(u && u.perfil==='Infraestructura'); }

function bodegaPull(d) {
  const saldos = leer('BODEGA_SALDO').filter(s=>+s.cantidad>0).map(s=>({id_usuario:s.id_usuario,id_material:s.id_material,cantidad:s.cantidad}));
  return {status:'ok', materiales:leer('MATERIAL'), herramientas:leer('HERRAMIENTA'), saldos, custodia:leer('BODEGA_CUSTODIA')};
}

function bodegaEntrega(d) {
  const b = d.data || {};
  if (!b.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoBodega(b.id_usuario_entrega)) return {status:'error', message:'sin permiso para entregar bodega'};
  const yaProcesado = !!buscar('BODEGA_MOVIMIENTO', 'id_local', b.id_local);
  if (b.tipo === 'material') {
    if (!yaProcesado) {
      const mat = buscar('MATERIAL', 'id_material', b.id_material);
      if (!mat) return {status:'error', message:'material no existe'};
      mat.stock = Math.max(0, (+mat.stock||0) - (+b.cantidad||0));
      upsert('MATERIAL', 'id_material', mat.id_material, mat);
      const idSaldo = b.id_usuario_recibe + '|' + b.id_material;
      const saldo = buscar('BODEGA_SALDO','id',idSaldo) || {id:idSaldo, id_usuario:b.id_usuario_recibe, id_material:b.id_material, cantidad:0};
      saldo.cantidad = (+saldo.cantidad||0) + (+b.cantidad||0);
      saldo.actualizado = new Date().toISOString();
      upsert('BODEGA_SALDO','id',idSaldo,saldo);
    }
  } else if (b.tipo === 'herramienta') {
    if (!yaProcesado) upsert('BODEGA_CUSTODIA','id_herramienta',b.id_herramienta, {id_herramienta:b.id_herramienta, id_usuario:b.id_usuario_recibe, estado:'En custodia', fecha:b.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  } else return {status:'error', message:'tipo invalido'};
  upsert('BODEGA_MOVIMIENTO','id_local',b.id_local, {id_local:b.id_local, tipo:b.tipo, id_material:b.id_material||'', id_herramienta:b.id_herramienta||'', cantidad:b.cantidad||'', id_usuario_entrega:b.id_usuario_entrega||'', id_usuario_recibe:b.id_usuario_recibe||'', ticket_asociado:b.ticket_asociado||'', fecha:b.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  return {status:'ok'};
}

function bodegaCierreMaterial(d) {
  const c = d.data || {};
  if (!c.id_local) return {status:'error', message:'falta id_local'};
  if (buscar('BODEGA_MOVIMIENTO','id_local',c.id_local)) return {status:'ok'};
  const idSaldo = c.id_usuario + '|' + c.id_material;
  const saldo = buscar('BODEGA_SALDO','id',idSaldo);
  const consumo = Math.min(+c.cantidad_consumida||0, saldo?+saldo.cantidad:0);
  if (saldo) { saldo.cantidad = Math.max(0, +saldo.cantidad - consumo); saldo.actualizado = new Date().toISOString(); upsert('BODEGA_SALDO','id',idSaldo,saldo); }
  upsert('BODEGA_MOVIMIENTO','id_local',c.id_local, {id_local:c.id_local, tipo:'consumo', id_material:c.id_material, id_herramienta:'', cantidad:consumo, id_usuario_entrega:'', id_usuario_recibe:c.id_usuario, ticket_asociado:c.ticket||'', fecha:c.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  return {status:'ok'};
}

function bodegaDevolucionHerramienta(d) {
  const v = d.data || {};
  if (!v.id_local) return {status:'error', message:'falta id_local'};
  if (!buscar('BODEGA_MOVIMIENTO','id_local',v.id_local)) {
    const estadoFinal = v.estado_devuelto==='Baja' ? 'De baja' : v.estado_devuelto==='En reparación' ? 'En reparación' : 'Disponible';
    upsert('BODEGA_CUSTODIA','id_herramienta',v.id_herramienta, {id_herramienta:v.id_herramienta, id_usuario:'', estado:estadoFinal, fecha:v.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  }
  upsert('BODEGA_MOVIMIENTO','id_local',v.id_local, {id_local:v.id_local, tipo:'devolucion', id_material:'', id_herramienta:v.id_herramienta, cantidad:'', id_usuario_entrega:v.id_usuario, id_usuario_recibe:'', ticket_asociado:v.estado_devuelto||'', fecha:v.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  return {status:'ok'};
}

// Simula la respuesta de Gemini (no llama a ninguna IA real): sirve solo para probar
// que el frontend arma el request, procesa la respuesta y auto-rellena los formularios.
function leerDocumentoIA(d) {
  if (!permisoBodega(d.id_usuario)) return {status:'error', message:'sin permiso para leer documentos'};
  if (!d.imagen) return {status:'error', message:'falta el documento'};
  if (d.tipo === 'factura') {
    return {status:'ok', datos: {
      empresa:'Ferreteria Test SpA', rut_empresa:'76.111.222-3', numero_documento:'FAC-9001',
      fecha:'2026-09-17', items:[
        {descripcion:'Tubo LED 18W', unidad:'unidad', cantidad:10, valor_unitario:4300},
        {descripcion:'Ampolleta LED 9W', unidad:'unidad', cantidad:5, valor_unitario:1700}
      ]
    }};
  }
  if (d.tipo === 'boleta') {
    return {status:'ok', datos: {
      empresa:'Ferreteria El Tornillo', rut_empresa:'78.444.555-6', numero_documento:'BOL-4521',
      fecha:'2026-09-24', items:[
        {descripcion:'Ampolleta LED 9W', unidad:'unidad', cantidad:4, valor_unitario:1800}
      ]
    }};
  }
  return {status:'ok', datos: {
    empresa:'Constructora Test SpA', rut_empresa:'77.222.333-4', numero_oc:'OC-IA-001',
    id_licitacion:'LIC-IA-01', fecha:'2026-09-17', items:[
      {descripcion:'Pintura fachada principal', unidad:'m2', cantidad:120, monto:850000}
    ]
  }};
}

function bodegaRecepcion(d) {
  const r = d.data || {};
  if (!r.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoBodega(r.id_usuario)) return {status:'error', message:'sin permiso para recepcionar'};
  const prev = buscar('BODEGA_RECEPCION','id_local',r.id_local);
  const url = (r.fotos && r.fotos[0]) ? subirFoto(r.fotos[0], r.id_local+'_factura.jpg') : '';
  if (!prev) { const mat = buscar('MATERIAL','id_material',r.id_material); if (mat) { mat.stock=(+mat.stock||0)+(+r.cantidad||0); upsert('MATERIAL','id_material',mat.id_material,mat); } }
  upsert('BODEGA_RECEPCION','id_local',r.id_local, {id_local:r.id_local, id_material:r.id_material, cantidad:r.cantidad, valor_unitario:r.valor_unitario||'', proveedor:r.proveedor||'', documento:r.documento||'', fecha:r.fecha||new Date().toISOString(), id_usuario:r.id_usuario, foto_url:url||(prev&&prev.foto_url)||'', actualizado:new Date().toISOString()});
  return {status:'ok'};
}

function bodegaCajaChica(d) {
  const c = d.data || {};
  if (!c.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoBodega(c.id_usuario)) return {status:'error', message:'sin permiso para registrar caja chica'};
  const prev = buscar('CAJA_CHICA','id_local',c.id_local);
  const url = (c.fotos && c.fotos[0]) ? subirFoto(c.fotos[0], c.id_local+'_boleta.jpg') : '';
  if (!prev) { const mat = buscar('MATERIAL','id_material',c.id_material); if (mat) { mat.stock=(+mat.stock||0)+(+c.cantidad||0); upsert('MATERIAL','id_material',mat.id_material,mat); } }
  upsert('CAJA_CHICA','id_local',c.id_local, {id_local:c.id_local, id_material:c.id_material, cantidad:c.cantidad||0, precio_unitario:c.precio_unitario||0, id_usuario:c.id_usuario, foto_boleta_url:url||(prev&&prev.foto_boleta_url)||'', glosa:c.glosa||'', fecha:c.fecha||new Date().toISOString(), actualizado:new Date().toISOString()});
  return {status:'ok'};
}
function cajaChicaPull(d) {
  if (!permisoBodega(d.id_usuario)) return {status:'error', message:'sin permiso para ver caja chica'};
  return {status:'ok', registros: leer('CAJA_CHICA')};
}

function gestionPull(d) {
  const ocs = leer('OC'); const partidas = leer('OC_PARTIDA');
  return {status:'ok', ocs: ocs.map(oc => Object.assign({}, oc, {partidas: partidas.filter(p=>p.id_oc===oc.id_local)}))};
}
function gestionOC(d) {
  const oc = d.data || {};
  if (!oc.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoInfraestructura(oc.id_usuario)) return {status:'error', message:'sin permiso'};
  upsert('OC','id_local',oc.id_local, {id_local:oc.id_local, id_empresa:oc.id_empresa, numero_oc:oc.numero_oc||'', id_licitacion:oc.id_licitacion||'', estado:oc.estado||'Vigente', fecha:oc.fecha||new Date().toISOString(), id_usuario:oc.id_usuario, actualizado:new Date().toISOString()});
  (oc.partidas||[]).forEach(p => upsert('OC_PARTIDA','id_local',p.id_local, {id_local:p.id_local, id_oc:oc.id_local, item:p.item||'', unidad:p.unidad||'', cantidad:p.cantidad||0, monto:p.monto||0, avance:p.avance||0, foto_url:'', actualizado:new Date().toISOString()}));
  return {status:'ok'};
}
function gestionAvance(d) {
  const p = d.data || {};
  if (!p.id_local) return {status:'error', message:'falta id_local'};
  const prev = buscar('OC_PARTIDA','id_local',p.id_local);
  if (!prev) return {status:'error', message:'partida no existe'};
  const url = (p.fotos && p.fotos[0]) ? subirFoto(p.fotos[0], p.id_local+'_avance.jpg') : '';
  prev.avance = p.avance!=null ? p.avance : prev.avance;
  prev.foto_url = url || prev.foto_url || '';
  prev.actualizado = new Date().toISOString();
  upsert('OC_PARTIDA','id_local',p.id_local,prev);
  return {status:'ok'};
}
function gestionRecepcionOC(d) {
  const oc = d.data || {};
  if (!oc.id_local) return {status:'error', message:'falta id_local'};
  const prev = buscar('OC','id_local',oc.id_local);
  if (!prev) return {status:'error', message:'OC no existe'};
  prev.estado = 'Recepcionada'; prev.actualizado = new Date().toISOString();
  upsert('OC','id_local',oc.id_local,prev);
  return {status:'ok'};
}
function validarSubsanacion(d) {
  const v = d.data || {};
  if (!v.id_local) return {status:'error', message:'falta id_local'};
  if (!permisoInfraestructura(v.id_usuario_valida)) return {status:'error', message:'sin permiso para validar'};
  const o = buscar('OBSERVACION','id_local',v.id_local_obs) || buscar('OBSERVACION','ticket',v.ticket);
  if (!o) return {status:'error', message:'ticket no existe'};
  const yaValidada = !!buscar('VALIDACION','id_local',v.id_local);
  o.estado = v.conforme ? 'Cerrado' : 'Reabierto';
  o.actualizado = new Date().toISOString();
  upsert('OBSERVACION','ticket',o.ticket,o);
  upsert('VALIDACION','id_local',v.id_local, {id_local:v.id_local, id_local_obs:v.id_local_obs, id_subsanacion:v.id_subsanacion||'', ticket:o.ticket, conforme:v.conforme?'SI':'NO', id_usuario_valida:v.id_usuario_valida, fecha:v.fecha||new Date().toISOString()});
  if (v.conforme && !yaValidada) notificarCierre(o);
  return {status:'ok'};
}
function adminUsuario(d) {
  const u = d.data || {};
  if (!u.usuario_login) return {status:'error', message:'falta usuario_login'};
  if (!permisoInfraestructura(u.id_usuario_actor)) return {status:'error', message:'sin permiso para administrar usuarios'};
  const prev = buscar('USUARIO','usuario',u.usuario_login) || (u.id_usuario ? buscar('USUARIO','id_usuario',u.id_usuario) : null);
  const id = (prev && prev.id_usuario) || u.id_usuario || ('U' + crypto.randomUUID().slice(0,8));
  upsert('USUARIO','id_usuario',id, {id_usuario:id, usuario:u.usuario_login, hash: u.clave?hash(u.clave):((prev&&prev.hash)||hash('cambiar123')), nombre:u.nombre, perfil:u.perfil, id_establecimiento:u.id_establecimiento||'', activo:(prev&&prev.activo)||'true', telefono:(prev&&prev.telefono)||'', correo:u.correo||(prev&&prev.correo)||''});
  return {status:'ok', id_usuario:id};
}
function adminCatalogo(d) {
  const c = d.data || {};
  if (!permisoInfraestructura(c.id_usuario_actor)) return {status:'error', message:'sin permiso para administrar catalogos'};
  if (c.tipo_catalogo === 'material') upsert('MATERIAL','id_material',c.id_material, {id_material:c.id_material, nombre:c.nombre, unidad:c.unidad||'', costo_referencial:c.costo_referencial||0, stock:c.stock||0, minimo:c.minimo||0});
  else if (c.tipo_catalogo === 'herramienta') upsert('HERRAMIENTA','id_herramienta',c.id_herramienta, {id_herramienta:c.id_herramienta, nombre:c.nombre, codigo:c.codigo||''});
  else if (c.tipo_catalogo === 'empresa') upsert('EMPRESA','id_empresa',c.id_empresa, {id_empresa:c.id_empresa, nombre:c.nombre, rut:c.rut||''});
  else if (c.tipo_catalogo === 'establecimiento') upsert('ESTABLECIMIENTO','id_establecimiento',c.id_establecimiento, {
    id_establecimiento:c.id_establecimiento, id_comuna:c.id_comuna||'', rbd:c.rbd||'', nombre:c.nombre,
    tipo:c.tipo||'', direccion:c.direccion||'', lat:c.lat||'', lng:c.lng||''
  });
  else return {status:'error', message:'tipo_catalogo invalido'};
  return {status:'ok'};
}

// ==================== SEED (subconjunto representativo del real) ====================
sembrar('COMUNA','id_comuna', [
  {id_comuna:'C01', nombre:'Antuco'}, {id_comuna:'C02', nombre:'Mulchen'}, {id_comuna:'C05', nombre:'Santa Barbara'}, {id_comuna:'C07', nombre:'Alto Biobio'}
]);
sembrar('ESTABLECIMIENTO','id_establecimiento', [
  {id_establecimiento:'E001', id_comuna:'C07', rbd:'4328-1', nombre:'Escuela 1181 Ralco Lepoy', tipo:'Colegio', direccion:'', lat:'-38.0056', lng:'-71.4467'},
  {id_establecimiento:'E026', id_comuna:'C02', rbd:'17790-3', nombre:'LICEO BICENTENARIO DE EXCELENCIA NUEVO MUNDO', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E061', id_comuna:'C05', rbd:'4358-3', nombre:'ESCUELA MARIANO PUGA VEGA', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E101', id_comuna:'C05', rbd:'4353-2', nombre:'LICEO CARDENAL SAMORE', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E102', id_comuna:'C05', rbd:'17813-6', nombre:'ESCUELA CACIQUE LEVIAN', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E103', id_comuna:'C05', rbd:'4352-4', nombre:'ESCUELA ARTISTICA ALFONSO LLOVERAS', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E104', id_comuna:'C05', rbd:'4355-9', nombre:'ESCUELA EL HUACHI', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E105', id_comuna:'C05', rbd:'4356-7', nombre:'ESCUELA LOS BOLDOS', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E106', id_comuna:'C05', rbd:'4357-5', nombre:'ESCUELA VILLACURA', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E107', id_comuna:'C05', rbd:'4359-1', nombre:'ESCUELA MANIL', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E108', id_comuna:'C05', rbd:'4361-3', nombre:'ESCUELA CORCOVADO', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E109', id_comuna:'C05', rbd:'4365-6', nombre:'ESCUELA RINCONADA', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E110', id_comuna:'C05', rbd:'4368-0', nombre:'ESCUELA LOS NOTROS', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E111', id_comuna:'C05', rbd:'4372-9', nombre:'ESCUELA QUILLAILEO', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E112', id_comuna:'C05', rbd:'34549-0', nombre:'JARDIN MI PEQUENO MUNDO', tipo:'Colegio', direccion:'', lat:'', lng:''},
  {id_establecimiento:'E113', id_comuna:'C05', rbd:'34551-2', nombre:'JARDIN RONDA DE NINOS Y NINAS', tipo:'Colegio', direccion:'', lat:'', lng:''}
]);
sembrar('RECINTO','id_recinto', [
  {id_recinto:'E001-R01', id_establecimiento:'E001', tipo_espacio:'Sala de clases', nombre_espacio:''},
  {id_recinto:'E001-R02', id_establecimiento:'E001', tipo_espacio:'Bano estudiantes', nombre_espacio:''}
]);
sembrar('ELEMENTO_GENERAL','id_general', [{id_general:'G1', nombre:'Electrico'}]);
sembrar('ELEMENTO_ESPECIFICO','id_especifico', [{id_especifico:'E101', id_general:'G1', nombre:'Luminaria interior'}]);
sembrar('ACCION_TIPO','id_accion', [{id_accion:'A1', id_especifico:'E101', descripcion:'Cambio de ampolleta'}]);
sembrar('MATERIAL','id_material', [
  {id_material:'M001', nombre:'Tubo LED 18W', unidad:'unidad', costo_referencial:4500, stock:40, minimo:10},
  {id_material:'M002', nombre:'Ampolleta LED 9W', unidad:'unidad', costo_referencial:1800, stock:5, minimo:10}
]);
sembrar('HERRAMIENTA','id_herramienta', [{id_herramienta:'H001', nombre:'Taladro percutor', codigo:''}]);
if (!buscar('USUARIO','usuario','admin')) appendFila('USUARIO', {id_usuario:'U001', usuario:'admin', hash:hash('Puelche3281!'), nombre:'Administrador', perfil:'Infraestructura', id_establecimiento:'', activo:'true', telefono:''});

// ==================== ROUTER ====================
const ACTIONS = {
  login, catalogos, observacion: d=>guardarObservacion(d), subsanacion: d=>guardarSubsanacion(d),
  priorizar, pull,
  bodega_pull: bodegaPull, bodega_entrega: bodegaEntrega, bodega_cierre_material: bodegaCierreMaterial,
  bodega_devolucion_herramienta: bodegaDevolucionHerramienta, bodega_recepcion: bodegaRecepcion,
  bodega_caja_chica: bodegaCajaChica, caja_chica_pull: cajaChicaPull,
  gestion_pull: gestionPull, gestion_oc: gestionOC, gestion_avance: gestionAvance, gestion_recepcion_oc: gestionRecepcionOC,
  validar_subsanacion: validarSubsanacion, admin_usuario: adminUsuario, admin_catalogo: adminCatalogo,
  leer_documento_ia: leerDocumentoIA,
  asignacion_pull: asignacionPull, asignacion_guardar: asignacionGuardar, comuna_gestor: comunaGestor, rutas_importar: rutasImportar, rutas_pull: rutasPull,
  __mail_log: () => ({status:'ok', log: MAIL_LOG}), // solo para aserciones del e2e, no existe en el backend real
  __ruta_mail_log: () => ({status:'ok', log: RUTA_MAIL_LOG})
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'GET') {
    const q = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (q.voto) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(votarCierre(q)); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(catalogos({})));
    return;
  }
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    let d; try { d = JSON.parse(body); } catch(e) { res.end(JSON.stringify({status:'error', message:'body invalido'})); return; }
    const fn = ACTIONS[d.action];
    const r = fn ? fn(d) : {status:'error', message:'accion desconocida: '+d.action};
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(r));
  });
});

const PORT = process.env.MOCK_PORT || 8934;
server.listen(PORT, () => console.log('mock backend en http://localhost:' + PORT));
