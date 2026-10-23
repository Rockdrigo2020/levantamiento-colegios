// Test end-to-end de LevantApp contra el mock-server (misma lógica que apps-script/Codigo.gs).
// Recorre: login, levantamiento, bodega (entrega/recepción/devolución), subsanación con
// saldo de bodega, validación (conforme y no-conforme), OC + avance + recepción,
// emergencia, administración de usuarios/catálogos, reportería y analítica IA.
const { chromium } = require('playwright');
const path = require('path');

const APP_URL = 'file://' + path.resolve(__dirname, '../index.html');
const MOCK_URL = 'http://localhost:8934';
const PHOTO = path.join(__dirname, 'test.jpg');
const PLANILLA_REQ = '/root/.claude/uploads/3fe63322-229d-5b29-9db8-13605d40790a/a0d0f12e-Requerimientos_Mantencion_Correos.xlsx';
const PLANILLA_RUTAS = '/root/.claude/uploads/3fe63322-229d-5b29-9db8-13605d40790a/909de1c5-planificacion_rutas_sept_2026.xlsx';

const errors = [];
const KNOWN_NETWORK_NOISE = /ERR_TUNNEL_CONNECTION_FAILED|ERR_CERT_AUTHORITY_INVALID|ERR_NAME_NOT_RESOLVED|net::ERR_|EGRESS_BLOCKED|fonts\.googleapis|fonts\.gstatic|cdnjs\.cloudflare/i;

let step = '(inicio)';
const log = (msg) => console.log('  ' + msg);
const section = (msg) => console.log('\n== ' + msg + ' ==');

async function main() {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage();
  // El CDN está bloqueado en este sandbox: se sirve la misma versión de SheetJS desde node_modules.
  await page.route('**/ajax/libs/xlsx/**', route => route.fulfill({
    path: path.join(__dirname, 'node_modules/xlsx/dist/xlsx.full.min.js'), contentType: 'application/javascript' }));

  page.on('console', msg => { if (msg.type() === 'error') errors.push({step, text: msg.text()}); });
  page.on('pageerror', err => errors.push({step, text: 'PAGEERROR: ' + err.message}));

  await page.addInitScript((url) => {
    localStorage.setItem('lev_config', JSON.stringify({url}));
  }, MOCK_URL);

  step = 'cargar app';
  await page.goto(APP_URL);
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------
  section('LOGIN como Infraestructura (admin)');
  step = 'login admin';
  await page.fill('#log-user', 'admin');
  await page.fill('#log-pass', 'Puelche3281!');
  await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  const hdr = await page.textContent('#hdr-user');
  assert(hdr.includes('Infraestructura'), 'header debe mostrar perfil Infraestructura, salió: ' + hdr);
  log('OK login admin -> ' + hdr);

  // ---------------------------------------------------------------
  section('ADMINISTRACIÓN: crear usuario Maestro');
  step = 'crear usuario maestro';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-admin');
  await clickSub(page, 'admin', 'adm-usuarios');
  await page.click('button:has-text("+ Nuevo usuario")');
  await page.waitForSelector('#modal-usuario.open');
  await page.fill('#modal-usuario-content #us-nombre', 'Pedro Maestro');
  await page.fill('#modal-usuario-content #us-login', 'pmaestro');
  await page.fill('#modal-usuario-content #us-correo', 'pedro.maestro@sleppuelche.gob.cl');
  await page.fill('#modal-usuario-content #us-clave', 'test1234');
  await page.selectOption('#modal-usuario-content #us-perfil', 'Maestro');
  await page.click('#modal-usuario-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-usuario:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);
  log('OK usuario pmaestro creado');
  const usuariosTxt = await page.textContent('#adm-usuarios-list');
  assert(usuariosTxt.includes('pedro.maestro@sleppuelche.gob.cl'), 'el correo del usuario debía verse en el listado de administración');
  log('OK correo del usuario visible en el listado');

  step = 'agregar correo al usuario admin (recibe los avisos de los tickets que levanta)';
  await page.click('#adm-usuarios-list .record-item:has-text("Administrador") .btn-icon');
  await page.waitForSelector('#modal-usuario.open');
  await page.fill('#modal-usuario-content #us-correo', 'admin@sleppuelche.gob.cl');
  await page.click('#modal-usuario-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-usuario:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);
  log('OK correo cargado al admin');

  step = 'crear usuario Bodega';
  await page.click('button:has-text("+ Nuevo usuario")');
  await page.waitForSelector('#modal-usuario.open');
  await page.fill('#modal-usuario-content #us-nombre', 'Beatriz Bodega');
  await page.fill('#modal-usuario-content #us-login', 'bbodega');
  await page.fill('#modal-usuario-content #us-clave', 'test1234');
  await page.selectOption('#modal-usuario-content #us-perfil', 'Bodega');
  await page.click('#modal-usuario-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-usuario:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);
  log('OK usuario bbodega (Bodega) creado');

  // ---------------------------------------------------------------
  section('BODEGA (perfil Bodega): el selector "Entregar a" debe ver a Maestro/Infraestructura');
  step = 'login bbodega y revisar selector de gestor en Entregar';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'bbodega');
  await page.fill('#log-pass', 'test1234');
  await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  assert((await page.textContent('#hdr-user')).includes('Bodega'), 'debía entrar como Bodega');
  await page.click('#tab-bodega');
  await clickSub(page, 'bodega', 'bod-entregar');
  await page.waitForTimeout(300);
  const opcionesGestor = await page.locator('#bod-gestor option').allTextContents();
  assert(!opcionesGestor.some(t => t.includes('Sin usuarios')),
    'Bodega debía ver el catálogo de gestores (Maestro/Infraestructura), salió: ' + opcionesGestor.join(' | '));
  assert(opcionesGestor.some(t => t.includes('Pedro Maestro')),
    'Bodega debía poder elegir a Pedro Maestro como gestor al entregar, salió: ' + opcionesGestor.join(' | '));
  log('OK Bodega ve el catálogo de gestores en "Entregar a" (antes salía vacío)');

  step = 'volver a loguear como admin para continuar el resto del recorrido';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'admin');
  await page.fill('#log-pass', 'Puelche3281!');
  await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.waitForTimeout(600); // deja terminar sincronizarTodo() (trae usuarios asignables)

  // ---------------------------------------------------------------
  section('ASIGNACIONES: gestor por comuna');
  step = 'asignar a Pedro Maestro como gestor de Alto Biobio';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-asignaciones');
  await page.waitForTimeout(200);
  await page.selectOption('#gestor-comuna-lista select[data-gestor-comuna="C07"]', { label: 'Pedro Maestro · Maestro' });
  await page.waitForTimeout(600);
  const gestorC07 = await page.evaluate(async (url) => {
    const r = await fetch(url, {method:'POST', body: JSON.stringify({action:'catalogos', id_usuario:'U001'})});
    return ((await r.json()).comunas || []).find(c => c.id_comuna === 'C07');
  }, MOCK_URL);
  assert(gestorC07 && gestorC07.id_gestor, 'la comuna Alto Biobio debía quedar con gestor en el servidor: ' + JSON.stringify(gestorC07));
  log('OK gestor de Alto Biobio guardado en el servidor -> ' + gestorC07.id_gestor);
  await clickSub(page, 'gestion', 'ges-admin');
  await clickSub(page, 'admin', 'adm-usuarios');

  // ---------------------------------------------------------------
  section('ADMINISTRACIÓN: crear empresa (para la OC más adelante)');
  step = 'crear empresa';
  await clickSub(page, 'admin', 'adm-empresas');
  await page.click('button:has-text("+ Nueva empresa")');
  await page.waitForSelector('#modal-catalogo.open');
  await page.fill('#modal-catalogo-content #ct-nombre', 'Constructora Test SpA');
  await page.fill('#modal-catalogo-content #ct-rut', '76.111.111-1');
  await page.click('#modal-catalogo-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-catalogo:not(.open)', { timeout: 5000 });
  log('OK empresa creada');

  // ---------------------------------------------------------------
  section('LEVANTAMIENTO: crear un ticket (7 pasos)');
  step = 'levantamiento';
  await page.click('#tab-levantamiento');
  await page.click('#lista-comunas .opt:has-text("Alto Biobio")');
  await page.waitForTimeout(150);
  await page.click('#lista-estabs .opt:has-text("Escuela 1181 Ralco Lepoy")');
  await page.waitForTimeout(150);
  await page.click('#lista-recintos .opt:has-text("Sala de clases")');
  await page.click('#btn-siguiente'); // recinto no auto-avanza
  await page.click('#lista-generales .opt:has-text("Electrico")');
  await page.waitForTimeout(150);
  await page.click('#lista-especificos .opt:has-text("Luminaria interior")');
  await page.waitForTimeout(150);
  await page.fill('#lev-obs', 'Luminaria quemada en sala 1, requiere reemplazo del tubo LED.');
  await page.selectOption('#lev-prioridad', 'Alta'); // Infraestructura elige prioridad directa
  await page.click('#btn-siguiente');
  await page.setInputFiles('#lev-file', PHOTO);
  await page.waitForTimeout(400); // compresión + guardado en IndexedDB
  await page.click('#lev-submit');
  await page.waitForTimeout(700);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  const ticket1 = await page.textContent('.record-item:first-child .mono');
  assert(ticket1 && ticket1.trim().startsWith('SLEP-'), 'debía generarse un ticket SLEP-..., salió: ' + ticket1);
  log('OK ticket generado: ' + ticket1.trim());
  const TICKET1 = ticket1.trim();

  // ---------------------------------------------------------------
  section('NOTIFICACIÓN: correo disparado al crear el ticket');
  step = 'verificar notificacion de ticket';
  const mailLog1 = await page.evaluate(async (url) => {
    const r = await fetch(url, {method:'POST', body: JSON.stringify({action:'__mail_log'})});
    return (await r.json()).log;
  }, MOCK_URL);
  const notifTicket1 = mailLog1.find(m => m.tipo === 'ticket_nuevo' && m.ticket === TICKET1);
  assert(notifTicket1, 'debía haberse registrado una notificación de correo para ' + TICKET1);
  assert(notifTicket1.para.includes('pedro.maestro@sleppuelche.gob.cl'), 'el aviso debía llegar al gestor de la comuna, salió: ' + notifTicket1.para);
  assert(notifTicket1.para.includes('admin@sleppuelche.gob.cl'), 'el aviso debía llegar a quien levantó el ticket, salió: ' + notifTicket1.para);
  assert(notifTicket1.cc === 'rodrigo.bascunan@sleppuelche.gob.cl', 'la casilla central debía ir en copia, salió: ' + notifTicket1.cc);
  assert(notifTicket1.es_emergencia === false, 'el ticket normal no debía marcarse como emergencia en la notificación');
  log('OK notificación de ticket registrada -> ' + JSON.stringify(notifTicket1));

  // ---------------------------------------------------------------
  section('BODEGA: vale de entrega de material a pmaestro');
  step = 'bodega entrega material';
  await page.click('#tab-bodega');
  await clickSub(page, 'bodega', 'bod-inventario');
  const stockAntes = await page.textContent('#inv-materiales-list .inv-row:has-text("Tubo LED") .inv-stock');
  log('stock Tubo LED antes: ' + stockAntes.trim());
  await clickSub(page, 'bodega', 'bod-entregar');
  await page.waitForSelector('#bod-gestor option:has-text("Pedro Maestro")', { state: 'attached' });
  await page.selectOption('#bod-gestor', { label: 'Pedro Maestro · Maestro' });
  // tipo material ya está seleccionado por defecto
  await page.selectOption('#bod-item', { label: 'Tubo LED 18W' });
  await page.fill('#bod-cantidad', '3');
  await page.fill('#bod-ticket', TICKET1);
  await page.click('button:has-text("✅ Registrar entrega")');
  await page.waitForTimeout(600);
  await clickSub(page, 'bodega', 'bod-inventario');
  const stockDespues = await page.textContent('#inv-materiales-list .inv-row:has-text("Tubo LED") .inv-stock');
  log('stock Tubo LED después: ' + stockDespues.trim());
  assert(parseInt(stockDespues) === parseInt(stockAntes) - 3, 'el stock debía bajar en 3');
  log('OK stock descontado correctamente');

  await clickSub(page, 'bodega', 'bod-custodia');
  const saldoTxt = await page.textContent('#bod-saldos-list');
  assert(saldoTxt.includes('Pedro Maestro') && saldoTxt.includes('Tubo LED'), 'debía verse el saldo de Pedro Maestro');
  log('OK saldo visible: ' + saldoTxt.replace(/\s+/g,' ').trim());

  // ---------------------------------------------------------------
  section('BODEGA: acta de custodia de herramienta a pmaestro');
  step = 'bodega entrega herramienta';
  await clickSub(page, 'bodega', 'bod-entregar');
  await page.click('#bod-tipo-herramienta');
  await page.selectOption('#bod-gestor', { label: 'Pedro Maestro · Maestro' });
  await page.selectOption('#bod-item', { label: 'Taladro percutor' });
  await page.click('button:has-text("✅ Registrar entrega")');
  await page.waitForTimeout(600);
  await clickSub(page, 'bodega', 'bod-custodia');
  let herrTxt = await page.textContent('#bod-herr-gestor-list');
  assert(herrTxt.includes('Taladro percutor') && herrTxt.includes('Pedro Maestro'), 'la herramienta debía quedar en custodia de Pedro Maestro');
  log('OK herramienta en custodia');

  // ---------------------------------------------------------------
  section('BODEGA: leer factura con IA (varios ítems detectados)');
  step = 'leer factura con IA';
  await clickSub(page, 'bodega', 'bod-recepcion');
  const stockTuboAntesIA = parseInt(await page.textContent('#inv-materiales-list .inv-row:has-text("Tubo LED") .inv-stock'));
  await page.setInputFiles('#rec-ia-file', PHOTO);
  await page.waitForSelector('#rec-ia-status:has-text("Datos leídos")', { timeout: 15000 });
  assert((await page.inputValue('#rec-proveedor')) === 'Ferreteria Test SpA', 'el proveedor debía autocompletarse desde la factura leída por IA');
  assert((await page.inputValue('#rec-doc')) === 'FAC-9001', 'el N° de documento debía autocompletarse desde la factura leída por IA');
  const iaListTxt = await page.textContent('#rec-ia-list');
  assert(iaListTxt.includes('Tubo LED') && iaListTxt.includes('Ampolleta'), 'debían listarse los 2 ítems detectados por la IA para revisión');
  await page.click('#rec-ia-list .partida-row:has-text("Tubo LED") button:has-text("Registrar este ítem")');
  await page.waitForTimeout(600);
  await clickSub(page, 'bodega', 'bod-inventario');
  const stockTuboDespuesIA = parseInt(await page.textContent('#inv-materiales-list .inv-row:has-text("Tubo LED") .inv-stock'));
  assert(stockTuboDespuesIA === stockTuboAntesIA + 10, 'el ítem detectado por IA debía sumar 10 al stock de Tubo LED');
  log('OK factura leída con IA: proveedor/documento/ítems autocompletados y uno registrado (+10 Tubo LED)');
  await clickSub(page, 'bodega', 'bod-recepcion');

  // ---------------------------------------------------------------
  section('BODEGA: recepción de stock (compra) — flujo manual');
  step = 'bodega recepcion';
  await page.selectOption('#rec-material', { label: 'Ampolleta LED 9W' });
  await page.fill('#rec-cantidad', '20');
  await page.fill('#rec-valor', '1800');
  await page.fill('#rec-proveedor', 'Ferretería Central');
  await page.fill('#rec-doc', 'Factura 1234');
  await page.click('button:has-text("📥 Registrar recepción")');
  await page.waitForTimeout(600);
  await clickSub(page, 'bodega', 'bod-inventario');
  const stockAmpolleta = await page.textContent('#inv-materiales-list .inv-row:has-text("Ampolleta") .inv-stock');
  assert(parseInt(stockAmpolleta) === 25, 'Ampolleta debía quedar en 5+20=25, salió ' + stockAmpolleta);
  log('OK recepción sumó stock: ' + stockAmpolleta.trim());

  // ---------------------------------------------------------------
  section('CAJA CHICA: leer boleta con IA y registrar la compra');
  step = 'caja chica: leer boleta con IA';
  await page.click('#tab-cajachica');
  await clickSub(page, 'cajachica', 'cch-registrar');
  await page.setInputFiles('#cch-ia-file', PHOTO);
  await page.waitForSelector('#cch-ia-status:has-text("Datos leídos")', { timeout: 15000 });
  const cchMaterialSel = await page.locator('#cch-material').evaluate(el => el.options[el.selectedIndex].textContent);
  assert(cchMaterialSel.includes('Ampolleta LED 9W'), 'la IA debía matchear "Ampolleta LED 9W" en el catálogo, salió: ' + cchMaterialSel);
  assert((await page.inputValue('#cch-cantidad')) === '4', 'la cantidad debía autocompletarse en 4 desde la boleta leída por IA');
  assert((await page.inputValue('#cch-precio')) === '1800', 'el precio unitario debía autocompletarse en 1800 desde la boleta leída por IA');
  log('OK boleta leída con IA: elemento/cantidad/precio autocompletados (4 × $1.800)');

  step = 'caja chica: registrar compra';
  await page.fill('#cch-glosa', 'Compra urgente ferretería');
  await page.setInputFiles('#cch-file', PHOTO);
  await page.waitForTimeout(400); // compresión + guardado en IndexedDB
  await page.click('button:has-text("💾 Registrar compra")');
  await page.waitForTimeout(600);
  await page.click('#tab-bodega');
  await clickSub(page, 'bodega', 'bod-inventario');
  const stockAmpolletaTrasCCH = await page.textContent('#inv-materiales-list .inv-row:has-text("Ampolleta") .inv-stock');
  assert(parseInt(stockAmpolletaTrasCCH) === 29, 'Ampolleta debía quedar en 25+4=29 tras la compra de caja chica, salió ' + stockAmpolletaTrasCCH);
  log('OK caja chica sumó stock a Bodega: ' + stockAmpolletaTrasCCH.trim());

  step = 'caja chica: reporte';
  await page.click('#tab-cajachica');
  await clickSub(page, 'cajachica', 'cch-reporte');
  await page.waitForTimeout(200);
  const cchTotal = await page.textContent('#kpi-cch-total');
  const cchItems = await page.textContent('#kpi-cch-items');
  assert(cchTotal.replace(/\s/g,'') === '$7.200', 'el total de caja chica debía ser 4×$1.800=$7.200, salió: ' + cchTotal);
  assert(cchItems.trim() === '1', 'debía haber 1 compra registrada en caja chica, salió: ' + cchItems);
  const cchReportTxt = await page.textContent('#cch-reporte-list');
  assert(cchReportTxt.includes('Ampolleta LED 9W') && cchReportTxt.includes('Administrador') && cchReportTxt.includes('Compra urgente ferretería'),
    'el reporte debía mostrar el elemento, el usuario que la registró y la glosa: ' + cchReportTxt.replace(/\s+/g,' ').trim());
  log('OK reporte de caja chica: $7.200 total, 1 compra, elemento/usuario/glosa visibles');

  // ---------------------------------------------------------------
  section('SUBSANACIÓN (pmaestro): declarar material dentro de saldo, dejar EJECUTADO');
  step = 'logout admin';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');

  step = 'login pmaestro';
  await page.fill('#log-user', 'pmaestro');
  await page.fill('#log-pass', 'test1234');
  await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  assert((await page.textContent('#hdr-user')).includes('Maestro'), 'debía entrar como Maestro');
  // Maestro no debe ver Levantar, ni Gestión, ni Bodega
  assert(await page.isHidden('#tab-levantamiento'), 'Maestro no debería ver Levantar');
  assert(await page.isHidden('#tab-gestion'), 'Maestro no debería ver Gestión');
  log('OK visibilidad de pestañas correcta para Maestro');

  step = 'subsanar ticket 1';
  await page.click('#tab-subsanacion');
  await page.waitForTimeout(300);
  await page.click('.record-item:has-text("' + TICKET1 + '")');
  await page.waitForSelector('#modal-subsanacion.open');
  await page.selectOption('#modal-sub-content #sub-accion', { label: 'Cambio de ampolleta' });
  await page.fill('#modal-sub-content #sub-obs', 'Se reemplazó el tubo LED quemado.');
  await page.click('#modal-sub-content button:has-text("+ Agregar material")');
  await page.waitForSelector('#mat-lista select');
  const matValue = await page.$eval('#mat-lista select', sel => {
    const opt = [...sel.options].find(o => o.textContent.includes('Tubo LED 18W'));
    return opt ? opt.value : null;
  });
  assert(matValue, 'no se encontró la opción de material "Tubo LED 18W" en el saldo del gestor');
  await page.selectOption('#mat-lista select', matValue);
  await page.fill('#mat-lista input[type=number]', '2'); // dentro del saldo de 3
  await page.setInputFiles('#sub-file', PHOTO);
  await page.waitForTimeout(400);
  await page.selectOption('#modal-sub-content #sub-resuelto', 'si');
  await page.fill('#sub-horas', '2.5');
  await page.click('#modal-sub-content button:has-text("Registrar subsanación")');
  await page.waitForTimeout(700);

  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  let estadoChip = await page.textContent('.record-item:has-text("' + TICKET1 + '")');
  assert(estadoChip.includes('Ejecutado'), 'ticket debía quedar en Ejecutado (Maestro no autovalida), texto: ' + estadoChip.replace(/\s+/g,' '));
  log('OK estado = Ejecutado tras subsanar (pendiente de validación)');

  // ---------------------------------------------------------------
  section('CIERRE POR VOTO: el gestor da el OK desde el correo -> Cerrado y aviso a quien lo levantó');
  step = 'correo de voto al gestor';
  const leerMailLog = async () => (await (await fetch(MOCK_URL, {method:'POST', body: JSON.stringify({action:'__mail_log'})})).json()).log;
  const estadoServidor = async (t) => ((await (await fetch(MOCK_URL, {method:'POST', body: JSON.stringify({action:'pull', perfil:'Infraestructura'})})).json()).observaciones || []).find(o => o.ticket === t).estado;
  const votoMail = (await leerMailLog()).find(m => m.tipo === 'voto_cierre' && m.ticket === TICKET1);
  assert(votoMail && votoMail.para.includes('pedro.maestro@sleppuelche.gob.cl'), 'al quedar Ejecutado debía enviarse el correo de voto al gestor: ' + JSON.stringify(votoMail));
  log('OK correo de voto enviado al gestor con botones OK / rechazar');

  step = 'enlace alterado no vota';
  const htmlFalso = await (await fetch(votoMail.okUrl.replace(/k=[^&]+/, 'k=falso') + '&confirmar=1')).text();
  assert(htmlFalso.includes('Enlace no válido') && (await estadoServidor(TICKET1)) === 'Ejecutado', 'un enlace con firma alterada no debía cambiar el ticket');

  step = 'abrir el enlace solo pide confirmar (un antivirus que lo abra no vota)';
  const htmlPregunta = await (await fetch(votoMail.okUrl)).text();
  assert(htmlPregunta.includes('¿Confirmas') && (await estadoServidor(TICKET1)) === 'Ejecutado', 'abrir el enlace sin confirmar no debía cerrar el ticket');

  step = 'confirmar el voto OK';
  const htmlOk = await (await fetch(votoMail.okUrl + '&confirmar=1')).text();
  assert(htmlOk.includes('¡Listo!') && (await estadoServidor(TICKET1)) === 'Cerrado', 'el voto OK confirmado debía cerrar el ticket');
  const cierreMail = (await leerMailLog()).filter(m => m.tipo === 'ticket_cerrado' && m.ticket === TICKET1);
  assert(cierreMail.length === 1 && cierreMail[0].para.includes('admin@sleppuelche.gob.cl'), 'debía avisarse el cierre a quien levantó el ticket: ' + JSON.stringify(cierreMail));
  log('OK voto confirmado: ticket Cerrado y aviso de cierre a quien lo levantó');

  step = 'repetir el voto no hace nada';
  const htmlRepetido = await (await fetch(votoMail.okUrl + '&confirmar=1')).text();
  assert(htmlRepetido.includes('ya fue revisado'), 'un segundo voto debía indicar que el ticket ya fue revisado');
  assert((await leerMailLog()).filter(m => m.tipo === 'ticket_cerrado' && m.ticket === TICKET1).length === 1, 'no debía reenviarse el aviso de cierre');
  log('OK un voto repetido no cambia nada ni reenvía correos');

  step = 'logout pmaestro, login admin y ver el ticket cerrado en la app';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'admin');
  await page.fill('#log-pass', 'Puelche3281!');
  await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.waitForTimeout(600);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  estadoChip = await page.textContent('.record-item:has-text("' + TICKET1 + '")');
  assert(estadoChip.includes('Cerrado'), 'la app debía mostrar el ticket Cerrado tras el voto, salió: ' + estadoChip.replace(/\s+/g,' '));
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-validacion');
  await page.waitForTimeout(300);
  assert(!(await page.textContent('#ges-validacion-list')).includes(TICKET1), 'el ticket ya votado no debía seguir pendiente de validar en la app');
  log('OK la app refleja el cierre por voto');

  // ---------------------------------------------------------------
  section('VALIDACIÓN: no conforme -> Reabierto, vuelve a Subsanar de pmaestro');
  step = 'crear segundo ticket';
  await page.click('#tab-levantamiento');
  await page.click('#lista-comunas .opt:has-text("Alto Biobio")');
  await page.waitForTimeout(150);
  await page.click('#lista-estabs .opt:has-text("Escuela 1181 Ralco Lepoy")');
  await page.waitForTimeout(150);
  await page.click('#lista-recintos .opt:has-text("Bano estudiantes")');
  await page.click('#btn-siguiente');
  await page.click('#lista-generales .opt:has-text("Electrico")');
  await page.waitForTimeout(150);
  await page.click('#lista-especificos .opt:has-text("Luminaria interior")');
  await page.waitForTimeout(150);
  await page.fill('#lev-obs', 'Luminaria del baño parpadea.');
  await page.selectOption('#lev-prioridad', 'Media');
  await page.click('#btn-siguiente');
  await page.setInputFiles('#lev-file', PHOTO);
  await page.waitForTimeout(400);
  await page.click('#lev-submit');
  await page.waitForTimeout(700);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  const ticket2 = (await page.textContent('.record-item:first-child .mono')).trim();
  log('ticket 2: ' + ticket2);

  step = 'logout admin, login pmaestro, subsanar ticket2';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'pmaestro'); await page.fill('#log-pass', 'test1234'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-subsanacion');
  await page.waitForTimeout(300);
  await page.click('.record-item:has-text("' + ticket2 + '")');
  await page.waitForSelector('#modal-subsanacion.open');
  await page.selectOption('#modal-sub-content #sub-accion', { label: 'Cambio de ampolleta' });
  await page.fill('#modal-sub-content #sub-obs', 'Se ajustó el balasto.');
  await page.setInputFiles('#sub-file', PHOTO);
  await page.waitForTimeout(400);
  await page.selectOption('#modal-sub-content #sub-resuelto', 'si');
  await page.click('#modal-sub-content button:has-text("Registrar subsanación")');
  await page.waitForTimeout(700);

  step = 'logout pmaestro, login admin, rechazar validacion';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'admin'); await page.fill('#log-pass', 'Puelche3281!'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-validacion');
  await page.waitForTimeout(300);
  await page.click('#ges-validacion-list button:has-text("↩️ No conforme")');
  await page.waitForTimeout(600);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  const chip2 = await page.textContent('.record-item:has-text("' + ticket2 + '")');
  assert(chip2.includes('Reabierto'), 'ticket2 debía quedar Reabierto, salió: ' + chip2.replace(/\s+/g,' '));
  log('OK estado = Reabierto tras validar no conforme');

  step = 'confirmar que reabierto vuelve a Subsanar de pmaestro';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'pmaestro'); await page.fill('#log-pass', 'test1234'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-subsanacion');
  await page.waitForTimeout(300);
  const pendMaestro = await page.textContent('#pendientes-list');
  assert(pendMaestro.includes(ticket2), 'el ticket reabierto debía reaparecer en Subsanar del maestro');
  log('OK ticket reabierto visible de nuevo en Subsanar');

  // ---------------------------------------------------------------
  section('DEVOLUCIÓN de herramienta (Bodega/Infraestructura registra la devolución del taladro de pmaestro)');
  step = 'devolver herramienta';
  // Solo Infraestructura/Bodega tienen acceso al módulo Bodega (el Maestro no puede autoservirse
  // la devolución); en la práctica el maestro entrega la herramienta y quien la recibe la registra.
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'admin'); await page.fill('#log-pass', 'Puelche3281!'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-bodega');
  await clickSub(page, 'bodega', 'bod-custodia');
  await page.waitForTimeout(200);
  page.once('dialog', d => d.accept('Operativa'));
  await page.click('#bod-herr-gestor-list button:has-text("Devolver")');
  await page.waitForTimeout(600);
  const herrTxt2 = await page.textContent('#bod-herr-gestor-list');
  assert(!herrTxt2.includes('Taladro percutor'), 'la herramienta ya no debía figurar en custodia de nadie');
  log('OK herramienta devuelta y liberada');

  // ---------------------------------------------------------------
  section('EMERGENCIA vía botón flotante');
  step = 'crear emergencia';
  await page.click('#fab-emergencia');
  await page.waitForSelector('#modal-emergencia.open');
  await page.selectOption('#modal-emg-content #emg-comuna', { label: 'Alto Biobio' });
  await page.selectOption('#modal-emg-content #emg-estab', { label: 'Escuela 1181 Ralco Lepoy' });
  await page.click('#emg-tipos .opt:has-text("SIN LUZ")');
  await page.fill('#emg-obs', 'Corte total de suministro en el sector.');
  await page.setInputFiles('#emg-file', PHOTO);
  await page.waitForTimeout(400);
  await page.selectOption('#emg-clases', 'No');
  await page.click('#modal-emg-content button:has-text("Generar ticket de emergencia")');
  await page.waitForTimeout(700);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  const emgRow = await page.textContent('.record-item:first-child');
  assert(emgRow.includes('EMERGENCIA') && emgRow.includes('Alta'), 'debía figurar como emergencia con prioridad Alta: ' + emgRow.replace(/\s+/g,' '));
  log('OK ticket de emergencia generado con prioridad Alta automática');
  const ticketEmg = (await page.textContent('.record-item:first-child .mono')).trim();
  const mailLog2 = await page.evaluate(async (url) => {
    const r = await fetch(url, {method:'POST', body: JSON.stringify({action:'__mail_log'})});
    return (await r.json()).log;
  }, MOCK_URL);
  const notifEmg = mailLog2.find(m => m.tipo === 'ticket_nuevo' && m.ticket === ticketEmg);
  assert(notifEmg && notifEmg.es_emergencia === true, 'la emergencia también debía disparar notificación marcada como emergencia');
  log('OK notificación de emergencia registrada -> ' + JSON.stringify(notifEmg));

  // ---------------------------------------------------------------
  section('GESTIÓN: bandeja filtrable por Pendientes / Realizados / Todas');
  step = 'bandeja: filtro pendientes por defecto';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-bandeja');
  await page.waitForTimeout(200);
  assert((await page.inputValue('#ges-bandeja-filtro')) === 'pendientes', 'el filtro de la bandeja debía partir en "Pendientes"');
  let bandejaTxt = await page.textContent('#ges-bandeja-list');
  assert(bandejaTxt.includes(ticket2) && !bandejaTxt.includes(TICKET1),
    'Pendientes debía mostrar el ticket 2 (Reabierto) y la emergencia, pero no el ticket 1 (Cerrado): ' + bandejaTxt.replace(/\s+/g,' '));
  assert((await page.locator('#ges-bandeja-list .record-item').count()) === 2, 'Pendientes debía listar 2 tickets (Reabierto + emergencia Pendiente)');
  log('OK filtro Pendientes: 2 tickets (excluye el Cerrado)');

  step = 'bandeja: filtro realizados';
  await page.selectOption('#ges-bandeja-filtro', 'realizados');
  await page.waitForTimeout(200);
  bandejaTxt = await page.textContent('#ges-bandeja-list');
  assert(bandejaTxt.includes(TICKET1) && !bandejaTxt.includes(ticket2),
    'Realizados debía mostrar solo el ticket 1 (Cerrado): ' + bandejaTxt.replace(/\s+/g,' '));
  assert((await page.locator('#ges-bandeja-list .record-item').count()) === 1, 'Realizados debía listar 1 ticket');
  log('OK filtro Realizados: 1 ticket (el Cerrado)');

  step = 'bandeja: filtro todas';
  await page.selectOption('#ges-bandeja-filtro', 'todas');
  await page.waitForTimeout(200);
  bandejaTxt = await page.textContent('#ges-bandeja-list');
  assert(bandejaTxt.includes(TICKET1) && bandejaTxt.includes(ticket2),
    'Todas debía mostrar los 3 tickets (incluye Cerrado, Reabierto y emergencia): ' + bandejaTxt.replace(/\s+/g,' '));
  assert((await page.locator('#ges-bandeja-list .record-item').count()) === 3, 'Todas debía listar los 3 tickets de la red');
  log('OK filtro Todas: 3 tickets (toda la red)');

  // ---------------------------------------------------------------
  section('RUTAS: importar la planilla real de planificación');
  step = 'leer planilla de rutas';
  await clickSub(page, 'gestion', 'ges-rutas');
  await page.setInputFiles('#rutas-file', PLANILLA_RUTAS);
  await page.waitForSelector('#rutas-preview button:has-text("Cargar 75 rutas")', { timeout: 10000 });
  const previewTxt = await page.textContent('#rutas-preview');
  assert(previewTxt.includes('del 23-06-2026 al 15-09-2026'), 'la vista previa debía mostrar el rango de fechas de la planilla: ' + previewTxt);
  log('OK planilla leída: ' + previewTxt.replace(/\s+/g, ' ').trim().slice(0, 120));

  step = 'cargar rutas a la base de datos';
  await page.click('#rutas-cargar');
  await page.waitForSelector('#rutas-preview:has-text("Carga lista")', { timeout: 10000 });
  const rutasSrv = async () => (await (await fetch(MOCK_URL, {method:'POST', body: JSON.stringify({action:'rutas_pull', id_usuario:'U001'})})).json()).rutas;
  let enServidor = await rutasSrv();
  assert(enServidor.length === 75, 'debían quedar 75 rutas en el servidor, quedaron ' + enServidor.length);
  assert(!enServidor.some(r => /outlook/i.test(r.trabajo)), 'los restos de correo "[... | Outlook]" debían limpiarse del trabajo');
  const corrida = enServidor.find(r => r.establecimiento === 'IVC');
  assert(corrida && corrida.trabajo === 'Protección ventana cocina y gotera sala' && corrida.vehiculo === '', 'la fila corrida (trabajo en la columna vehículo) debía corregirse: ' + JSON.stringify(corrida));
  assert((await page.textContent('#rutas-kpis')).includes('75'), 'el tablero de rutas debía mostrar 75 salidas');
  assert((await page.textContent('#rutas-lista')).includes('Villa Las Peñas'), 'el detalle debía listar las rutas cargadas');
  log('OK 75 rutas en la base de datos, datos limpiados y visibles en la app');

  step = 'volver a importar no duplica';
  await page.setInputFiles('#rutas-file', PLANILLA_RUTAS);
  await page.waitForSelector('#rutas-preview button:has-text("Cargar 75 rutas")', { timeout: 10000 });
  await page.click('#rutas-cargar');
  await page.waitForSelector('#rutas-preview:has-text("0 nuevas, 75 actualizadas")', { timeout: 10000 });
  enServidor = await rutasSrv();
  assert(enServidor.length === 75, 'reimportar no debía duplicar rutas, quedaron ' + enServidor.length);
  log('OK reimportar la misma planilla actualiza y no duplica');

  step = 'filtrar rutas por maestro';
  await page.selectOption('#rutas-maestro', 'Juan Barra');
  await page.waitForTimeout(200);
  const kpiJuan = await page.textContent('#rutas-kpis .kpi-card:first-child .kpi-val');
  assert(kpiJuan.trim() === '13', 'Juan Barra tiene 13 salidas en la planilla, salió: ' + kpiJuan);
  await page.selectOption('#rutas-maestro', '');
  log('OK filtro por maestro: Juan Barra = 13 salidas');

  // ---------------------------------------------------------------
  section('REQUERIMIENTOS: planilla de correos -> tickets');
  step = 'leer planilla de requerimientos';
  await clickSub(page, 'gestion', 'ges-bandeja');
  await page.setInputFiles('#req-file', PLANILLA_REQ);
  await page.waitForSelector('#req-crear:has-text("Crear 2 ticket")', { timeout: 10000 });
  assert(await page.isEnabled('#req-crear'), 'los 2 colegios de la planilla debían reconocerse solos (Nuevo Mundo, Mariano Puga)');
  const obsSrv = async () => (await (await fetch(MOCK_URL, {method:'POST', body: JSON.stringify({action:'pull', id_usuario:'U001'})})).json()).observaciones;
  const antesReq = (await obsSrv()).length;
  step = 'crear tickets desde la planilla';
  await page.click('#req-crear');
  await page.waitForSelector('#req-preview:has-text("2 ticket(s) creados")', { timeout: 15000 });
  const listadoReq = await page.textContent('#req-preview');
  const ticketsReq = listadoReq.match(/SLEP-\d{4}-\d{6}/g) || [];
  assert(ticketsReq.length === 2, 'el listado debía mostrar 2 números de ticket: ' + listadoReq.replace(/\s+/g, ' '));
  let srvReq = (await obsSrv()).filter(o => String(o.id_local).startsWith('REQ_'));
  assert(srvReq.length === 2 && (await obsSrv()).length === antesReq + 2, 'debían quedar 2 tickets nuevos en el servidor');
  assert(srvReq.some(o => o.id_establecimiento === 'E026' && o.descripcion.startsWith('[Electricidad] Crear nuevos circuitos')),
    'el ticket de Nuevo Mundo debía quedar con área y requerimiento');
  assert(srvReq.some(o => o.id_establecimiento === 'E061' && /^2026-08-05/.test(new Date(o.fecha_registro).toISOString())),
    'el ticket de Mariano Puga debía conservar la fecha de solicitud 05-08-2026');
  const porEvaluar = +(await page.textContent('#ges-kpi-eval'));
  assert(porEvaluar >= 2, 'la Bandeja debía contar los tickets importados como Por evaluar, salió ' + porEvaluar);
  log('OK ' + ticketsReq.join(', ') + ' creados desde la planilla');
  step = 'reimportar requerimientos no duplica';
  await page.setInputFiles('#req-file', PLANILLA_REQ);
  await page.waitForSelector('#req-crear', { timeout: 10000 });
  await page.click('#req-crear');
  await page.waitForSelector('#req-preview:has-text("2 ticket(s) creados")', { timeout: 15000 });
  srvReq = (await obsSrv()).filter(o => String(o.id_local).startsWith('REQ_'));
  assert(srvReq.length === 2, 'reimportar no debía duplicar tickets, quedaron ' + srvReq.length);
  const listado2 = (await page.textContent('#req-preview')).match(/SLEP-\d{4}-\d{6}/g) || [];
  assert(listado2.join() === ticketsReq.join(), 'reimportar debía listar los mismos tickets');
  await page.screenshot({ path: path.join(__dirname, 'req.png'), fullPage: false });
  step = 'tickets importados visibles en Tickets';
  await page.click('#tab-registros'); await page.waitForTimeout(300);
  const regTxt = await page.textContent('#tab-content-registros');
  assert(ticketsReq.every(t => regTxt.includes(t)), 'los tickets importados debían verse en la pestaña Tickets');
  log('OK reimportar no duplica y los tickets se ven en la app');
  await page.click('#tab-gestion'); await page.waitForTimeout(300);

  // ---------------------------------------------------------------
  section('FOTOS: galería consolidada (Infraestructura)');
  step = 'galería de fotos';
  await clickSub(page, 'gestion', 'ges-fotos');
  await page.waitForTimeout(300);
  let galeriaTxt = await page.textContent('#fotos-lista');
  assert(galeriaTxt.includes(TICKET1) && galeriaTxt.includes('ANTES') && galeriaTxt.includes('DESPUÉS'),
    'la galería debía mostrar el ticket 1 con fotos de antes y después: ' + galeriaTxt.replace(/\s+/g, ' ').slice(0, 200));
  await page.selectOption('#fotos-estado', 'pendientes');
  await page.waitForTimeout(200);
  galeriaTxt = await page.textContent('#fotos-lista');
  assert(!galeriaTxt.includes(TICKET1), 'el filtro Pendientes no debía mostrar el ticket 1 (Cerrado)');
  await page.selectOption('#fotos-estado', '');
  log('OK galería muestra antes/después y filtra por estado');

  // ---------------------------------------------------------------
  section('GESTIÓN: leer OC con IA');
  step = 'leer OC con IA';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-oc');
  await page.click('button:has-text("+ Nueva orden de compra")');
  await page.waitForSelector('#modal-oc.open');
  await page.setInputFiles('#oc-ia-file', PHOTO);
  await page.waitForSelector('#oc-ia-status:has-text("Datos leídos")', { timeout: 15000 });
  assert((await page.inputValue('#oc-numero')) === 'OC-IA-001', 'el N° OC debía autocompletarse desde el documento leído por IA');
  assert((await page.inputValue('#oc-licitacion')) === 'LIC-IA-01', 'la licitación debía autocompletarse desde el documento leído por IA');
  const empresaSelId = await page.inputValue('#oc-empresa');
  assert(empresaSelId, 'la empresa debía matchearse automáticamente por nombre desde el documento leído por IA');
  const partidaCount = await page.locator('#oc-partidas-list .partida-row').count();
  assert(partidaCount === 1, 'la IA debía cargar exactamente 1 partida detectada, se encontraron ' + partidaCount);
  const partidaItemVal = await page.inputValue('#oc-partidas-list .partida-row input[placeholder="Ítem"]');
  assert(partidaItemVal === 'Pintura fachada principal', 'la partida detectada debía tener el ítem correcto, salió: ' + partidaItemVal);
  log('OK OC leída con IA: N°/licitación/empresa/partida autocompletados');
  await page.click('#modal-oc-content button:has-text("Cancelar")');
  await page.waitForTimeout(200);

  // ---------------------------------------------------------------
  section('GESTIÓN: OC + avance + recepción conforme (como admin/Infraestructura) — flujo manual');
  step = 'crear OC';
  await page.click('button:has-text("+ Nueva orden de compra")');
  await page.waitForSelector('#modal-oc.open');
  await page.selectOption('#modal-oc-content #oc-empresa', { label: 'Constructora Test SpA' });
  await page.fill('#modal-oc-content #oc-numero', 'OC-2026-001');
  await page.fill('#modal-oc-content #oc-licitacion', 'LIC-01');
  await page.click('#modal-oc-content button:has-text("+ Agregar partida")');
  await page.fill('#oc-partidas-list input[placeholder="Ítem"]', 'Pintura fachada principal');
  await page.fill('#oc-partidas-list input[placeholder="Unidad"]', 'm2');
  await page.fill('#oc-partidas-list input[placeholder="Cantidad"]', '100');
  await page.fill('#oc-partidas-list input[placeholder="Monto $"]', '500000');
  await page.click('#modal-oc-content button:has-text("✅ Registrar OC")');
  await page.waitForTimeout(600);
  let ocCard = await page.textContent('#ges-oc-list');
  assert(ocCard.includes('Pintura fachada principal'), 'la OC con su partida debía listarse');
  log('OK OC creada con su partida');

  step = 'registrar avance de partida al 100%';
  await page.click('#ges-oc-list button:has-text("📷 Registrar avance")');
  await page.waitForSelector('#modal-oc.open');
  await page.fill('#modal-oc-content #avc-pct', '100');
  await page.setInputFiles('#avc-file', PHOTO);
  await page.waitForTimeout(400);
  await page.click('#modal-oc-content button:has-text("💾 Guardar avance")');
  await page.waitForTimeout(600);
  ocCard = await page.textContent('#ges-oc-list');
  assert(ocCard.includes('100%'), 'el avance debía quedar en 100%');
  log('OK avance registrado al 100%');

  step = 'recepcionar OC';
  page.once('dialog', d => d.accept());
  await page.click('#ges-oc-list button:has-text("✅ Recepción conforme")');
  await page.waitForTimeout(600);
  ocCard = await page.textContent('#ges-oc-list');
  assert(ocCard.includes('OC RECEPCIONADA'), 'la OC debía quedar Recepcionada');
  log('OK OC recepcionada, pago habilitado');

  // ---------------------------------------------------------------
  section('REPORTES: una sola pestaña con costos, seguimiento, informes y analítica');
  step = 'reportes: costos';
  await page.click('#tab-reportes');
  assert(await page.isVisible('#rc-kpi-lineas'), 'la pestaña Reportes debía abrir en Costos');
  assert((await page.textContent('#rc-kpi-lineas')).trim() === '51', 'Costos debía mostrar 51 líneas cotizadas');
  const barras = await page.locator('#reportes-subtabs .subtab-btn').allTextContents();
  assert(barras.length === 4, 'Reportes debía tener 4 secciones (Costos, Seguimiento, Informes, Analítica IA), salió: ' + barras.join('|'));
  await page.click('#rc-tbody tr[data-k="Escuela Quillaileo"]');
  assert((await page.textContent('#rc-kpi-lineas')).trim() === '11', 'filtrar por Quillaileo debía dejar 11 líneas');
  assert((await page.textContent('#rc-pills')).includes('Escuela Quillaileo'), 'debía verse el filtro activo');
  await page.click('#rep-costos button:has-text("Limpiar filtros")');
  assert((await page.textContent('#rc-kpi-lineas')).trim() === '51', 'limpiar filtros debía volver a 51 líneas');
  log('OK Reportes · Costos: 51 líneas, filtro cruzado por colegio y limpiar filtros');
  step = 'gestion: todas las opciones';
  await page.click('#tab-gestion');
  const subGes = await page.locator('#gestion-subtabs .subtab-btn[data-sp]').allTextContents();
  assert(!subGes.some(t => /Reporter|Anal/.test(t)), 'Gestión ya no debía incluir Reportería ni Analítica IA, salió: ' + subGes.join('|'));
  await page.click('#ges-todas-btn');
  assert(await page.locator('#gestion-menu .menu-op').count() === 8, 'el menú debía listar 7 secciones de Gestión + Reportes');
  await page.click('#gestion-menu .menu-op:has-text("Rutas")');
  assert(await page.isVisible('#ges-rutas') && await page.isHidden('#gestion-menu'), 'elegir una opción debía abrirla y cerrar el menú');
  log('OK Gestión: botón "Todas las opciones" abre el menú y navega');

  // ---------------------------------------------------------------
  section('REPORTERÍA');
  step = 'reporteria';
  await page.click('#tab-reportes');
  await clickSub(page, 'reportes', 'rep-informes');
  await page.waitForTimeout(300);
  const resumen = await page.textContent('#ges-reporte-resumen');
  assert(/\d/.test(resumen), 'el resumen de reportería debía mostrar números');
  log('OK resumen de reportería renderiza: ' + resumen.replace(/\s+/g,' ').trim().slice(0,120));

  // ---------------------------------------------------------------
  section('REPORTE DE MANTENCIÓN POR COLEGIO');
  step = 'reporte por colegio - solo subsanados';
  await page.selectOption('#rpc-comuna', { label: 'Alto Biobio' });
  await page.selectOption('#rpc-estab', { label: 'Escuela 1181 Ralco Lepoy' });
  await page.fill('#rpc-desde', '2020-01-01');
  await page.fill('#rpc-hasta', '2030-12-31');
  await page.click('button:has-text("📄 Generar reporte")');
  await page.waitForTimeout(200);
  let rpcNums = await page.locator('#rpc-resumen .stat-num').allTextContents();
  assert(rpcNums[0] === '1' && rpcNums[1] === '1',
    'con "solo subsanados" debía mostrar 1 ticket (el ticket 1, ya Cerrado), salió: ' + rpcNums.join(','));
  log('OK reporte por colegio (solo subsanados): 1 ticket');

  step = 'reporte por colegio - profesional/cargo sugeridos';
  const rpcProfesional = await page.inputValue('#rpc-profesional');
  const rpcCargo = await page.inputValue('#rpc-cargo');
  assert(rpcProfesional === 'Administrador', 'el profesional responsable debía autocompletarse con el nombre de la sesión, salió: ' + rpcProfesional);
  assert(rpcCargo.includes('Eléctrica'), 'el cargo/especialidad debía sugerirse como eléctrica (las fallas del período son de Módulo 1 eléctrico), salió: ' + rpcCargo);
  log('OK profesional/cargo sugeridos: ' + rpcProfesional + ' · ' + rpcCargo);

  step = 'reporte por colegio - incluir pendientes';
  await page.check('#rpc-pendientes');
  await page.click('button:has-text("📄 Generar reporte")');
  await page.waitForTimeout(200);
  rpcNums = await page.locator('#rpc-resumen .stat-num').allTextContents();
  // 3 tickets del mismo colegio en total: ticket1 (Cerrado, subsanado), ticket2 (Reabierto,
  // pendiente) y el ticket de emergencia (Pendiente) creado más arriba en el mismo establecimiento.
  assert(rpcNums[0] === '3' && rpcNums[1] === '1',
    'con "incluir pendientes" debía mostrar 3 tickets totales (1 subsanado), salió: ' + rpcNums.join(','));
  log('OK reporte por colegio (incluir pendientes): 3 tickets, 1 subsanado');

  // ---------------------------------------------------------------
  section('ANALÍTICA IA (carga desde reportería + chat)');
  step = 'analitica ia';
  await clickSub(page, 'reportes', 'rep-ia');
  await page.click('button:has-text("📥 Cargar desde Reportería")');
  await page.waitForTimeout(500);
  const dashVisible = await page.isVisible('#ia-dashboard');
  assert(dashVisible, 'el dashboard de analítica debía mostrarse tras cargar datos');
  await page.fill('#ia-input', 'Resumir el período');
  await page.click('.chat-input-row button');
  await page.waitForTimeout(700);
  const chatTxt = await page.textContent('#ia-chat');
  assert(chatTxt.includes('Resumen'), 'DataBot debía responder con un resumen');
  log('OK Analítica IA carga datos y el chat responde');

  // ---------------------------------------------------------------
  section('SEGUIMIENTO (Módulo 7): costos, horas hombre y tareas por colegio');
  step = 'seguimiento tablero';
  await page.click('#tab-reportes');
  await clickSub(page, 'reportes', 'rep-seguimiento');
  await page.waitForTimeout(300);
  const segVals = await page.locator('#seg-kpis .kpi-val').allTextContents();
  // [tareas, resueltas, pendientes, horas, costo, dias]
  // 3 tickets del recorrido + 2 creados desde la planilla de requerimientos
  assert(segVals[0] === '5', 'Seguimiento debía contar 5 tareas totales en toda la red, salió: ' + segVals.join(','));
  assert(segVals[1] === '1', 'Seguimiento debía contar 1 tarea resuelta (ticket1 Cerrado), salió: ' + segVals.join(','));
  assert(segVals[2] === '4', 'Seguimiento debía contar 4 tareas pendientes, salió: ' + segVals.join(','));
  assert(segVals[3] === '2.5', 'Seguimiento debía sumar 2.5 horas hombre (declaradas en la subsanación del ticket1), salió: ' + segVals.join(','));
  const costoNum = +segVals[4].replace(/[^0-9]/g, '');
  assert(costoNum === 9000, 'Seguimiento debía costear $9.000 en materiales (2 Tubo LED × $4.500), salió: ' + segVals[4]);
  log('OK tablero de Seguimiento: ' + segVals.join(' · '));

  step = 'mapa de establecimientos georreferenciados';
  // cdnjs.cloudflare.com (Leaflet) puede estar bloqueado por la política de red de ESTE
  // sandbox de pruebas (no así en el navegador real de un usuario) — se detecta con
  // typeof L y se prueba lo que corresponda en cada caso, en vez de asumir que cargó.
  const leafletCargo = await page.evaluate(() => typeof window.L !== 'undefined').catch(()=>false);
  if (leafletCargo) {
    await page.waitForSelector('#seg-map .leaflet-interactive', { timeout: 8000 });
    assert(await page.isHidden('#seg-map-empty'), 'con un colegio con coordenadas cargadas, el mapa no debía mostrar el estado vacío');
    await page.click('#seg-map .leaflet-interactive');
    await page.waitForSelector('#modal-seg-colegio.open');
    const ventanaPendientesTxt = await page.textContent('#modal-seg-colegio-content');
    assert(ventanaPendientesTxt.includes('Escuela 1181 Ralco Lepoy') && ventanaPendientesTxt.includes('ticket(s) pendiente'),
      'la ventana de informes de pendientes debía mostrar el colegio y su cantidad de pendientes, salió: ' + ventanaPendientesTxt.replace(/\s+/g,' ').slice(0,200));
    await page.click('#modal-seg-colegio-content button:has-text("Cerrar")');
    await page.waitForTimeout(200);
    log('OK mapa muestra el pin del colegio y la ventana de pendientes al tocarlo');
  } else {
    await page.waitForSelector('#seg-map-empty', { state: 'visible', timeout: 8000 });
    const msgVacio = await page.textContent('#seg-map-empty');
    assert(/mapa/i.test(msgVacio), 'sin Leaflet disponible, el mapa debía mostrar un mensaje de reemplazo en vez de romper la pantalla, salió: ' + msgVacio);
    log('⚠️  cdnjs.cloudflare.com bloqueado en este sandbox (no es un bug de la app) — se verificó la degradación correcta (mensaje en vez de pantalla rota). El mapa con pines requiere probarse en un navegador real.');
  }

  // ---------------------------------------------------------------
  section('ADMINISTRACIÓN: agregar coordenadas a un establecimiento existente');
  step = 'editar establecimiento para agregar coordenadas';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-admin');
  await clickSub(page, 'admin', 'adm-establecimientos');
  await page.waitForTimeout(200);
  const estabListTxt = await page.textContent('#adm-establecimientos-list');
  assert(estabListTxt.includes('📍 con coordenadas'), 'el establecimiento ya sembrado con lat/lng debía marcarse "con coordenadas", salió: ' + estabListTxt.replace(/\s+/g,' '));
  await page.click('button:has-text("+ Nuevo establecimiento")');
  await page.waitForSelector('#modal-catalogo.open');
  await page.fill('#modal-catalogo-content #ct-nombre', 'Liceo Nuevo Test');
  await page.selectOption('#modal-catalogo-content #ct-id_comuna', { label: 'Mulchen' });
  await page.fill('#modal-catalogo-content #ct-lat', '-37.7167');
  await page.fill('#modal-catalogo-content #ct-lng', '-72.2333');
  await page.click('#modal-catalogo-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-catalogo:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);
  const estabListTxt2 = await page.textContent('#adm-establecimientos-list');
  assert(estabListTxt2.includes('Liceo Nuevo Test') && estabListTxt2.includes('Mulchen'),
    'el nuevo establecimiento debía listarse con su comuna, salió: ' + estabListTxt2.replace(/\s+/g,' '));
  log('OK establecimiento nuevo creado con comuna y coordenadas; el sembrado ya mostraba sus coordenadas');

  step = 'el mapa de Seguimiento ahora muestra 2 colegios';
  await page.click('#tab-reportes');
  await clickSub(page, 'reportes', 'rep-seguimiento');
  await page.waitForTimeout(400);
  if (leafletCargo) {
    const pines = await page.locator('#seg-map .leaflet-interactive').count();
    assert(pines === 2, 'el mapa debía mostrar 2 pines tras agregar el segundo colegio con coordenadas, salió: ' + pines);
    log('OK mapa actualizado con el nuevo colegio georreferenciado');
  } else {
    log('⚠️  (mismo bloqueo de cdnjs) se omite el conteo de pines — no aplica sin Leaflet cargado.');
  }

  // ---------------------------------------------------------------
  section('COORDINACIÓN: crear Coordinador y asignar colegio a un Maestro');
  step = 'crear usuario coordinador';
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-admin');
  await clickSub(page, 'admin', 'adm-usuarios');
  await page.click('button:has-text("+ Nuevo usuario")');
  await page.waitForSelector('#modal-usuario.open');
  await page.fill('#modal-usuario-content #us-nombre', 'Carla Coordinadora');
  await page.fill('#modal-usuario-content #us-login', 'ccoord');
  await page.fill('#modal-usuario-content #us-clave', 'test1234');
  await page.selectOption('#modal-usuario-content #us-perfil', 'Coordinador');
  await page.click('#modal-usuario-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-usuario:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);
  log('OK usuario ccoord (Coordinador) creado');

  step = 'login coordinador, verificar visibilidad restringida';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'ccoord'); await page.fill('#log-pass', 'test1234'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  assert(await page.isHidden('#tab-levantamiento'), 'Coordinador no debería ver Levantar');
  assert(await page.isHidden('#tab-subsanacion'), 'Coordinador no debería ver Subsanar');
  assert(await page.isHidden('#tab-bodega'), 'Coordinador no debería ver Bodega');
  assert(await page.isHidden('#tab-reportes'), 'Coordinador no debería ver Reportes (exclusivo Infraestructura)');
  assert(await page.isVisible('#tab-gestion'), 'Coordinador debería ver Gestión (solo el subtab Asignaciones)');
  log('OK visibilidad de pestañas correcta para Coordinador');

  step = 'coordinador solo ve el subtab Asignaciones';
  await page.click('#tab-gestion');
  await page.waitForTimeout(200);
  assert(await page.isVisible('#gestion-subtabs [data-sp="ges-asignaciones"]'), 'el subtab Asignaciones debía estar visible');
  assert(await page.isHidden('#gestion-subtabs [data-sp="ges-bandeja"]'), 'el subtab Bandeja no debía estar visible para Coordinador');
  assert(await page.isVisible('#ges-asignaciones'), 'el panel de Asignaciones debía mostrarse de entrada al abrir Gestión');
  log('OK Coordinador aterriza directo en Asignaciones y no ve el resto de Gestión');
  assert(await page.isVisible('#gestion-subtabs [data-sp="ges-rutas"]') && await page.isVisible('#gestion-subtabs [data-sp="ges-fotos"]'),
    'el Coordinador debía ver los subtabs Rutas y Fotos');
  await page.waitForTimeout(600);
  await clickSub(page, 'gestion', 'ges-fotos');
  await page.waitForTimeout(300);
  assert((await page.textContent('#fotos-lista')).includes(TICKET1), 'el Coordinador debía ver la galería consolidada de fotos');
  await clickSub(page, 'gestion', 'ges-rutas');
  await page.waitForTimeout(200);
  assert((await page.textContent('#rutas-kpis')).includes('75'), 'el Coordinador debía ver las rutas cargadas');
  await clickSub(page, 'gestion', 'ges-asignaciones');
  log('OK Coordinador ve Rutas y Fotos');

  step = 'personal de Infraestructura también es asignable';
  await page.waitForTimeout(600); // deja que sincronizarTodo() termine asignacion_pull tras el login
  await clickSub(page, 'gestion', 'ges-asignaciones');
  const opcionesAsigUsuario = await page.locator('#asig-usuario option').allTextContents();
  assert(opcionesAsigUsuario.some(t=>t.includes('Administrador') && t.includes('Infraestructura')),
    'admin (perfil Infraestructura) debía aparecer como asignable, opciones: ' + opcionesAsigUsuario.join(' | '));
  log('OK personal de Infraestructura aparece en el listado de asignables');

  step = 'asignar colegio a pmaestro';
  await page.selectOption('#asig-usuario', { label: 'Pedro Maestro · Maestro' });
  await page.selectOption('#asig-comuna', { label: 'Alto Biobio' });
  await page.selectOption('#asig-estab', { label: 'Escuela 1181 Ralco Lepoy' });
  await page.fill('#asig-tareas', 'Revisar luminarias sala 3 y cambiar llave de baño estudiantes');
  await page.click('button:has-text("➕ Asignar")');
  await page.waitForTimeout(600);
  const asigTxt = await page.textContent('#asig-lista');
  assert(asigTxt.includes('Pedro Maestro') && asigTxt.includes('Escuela 1181 Ralco Lepoy'),
    'la asignación debía listarse: Pedro Maestro -> Escuela 1181 Ralco Lepoy, salió: ' + asigTxt.replace(/\s+/g,' '));
  assert(asigTxt.includes('Revisar luminarias sala 3'), 'la tarea asignada debía verse en el listado: ' + asigTxt.replace(/\s+/g,' '));
  log('OK colegio y tareas asignados a Pedro Maestro desde Coordinación');

  step = 'notificación de ruta enviada a pmaestro (tiene correo cargado)';
  const rutaMailLog = await page.evaluate(async (url) => {
    const r = await fetch(url, {method:'POST', body: JSON.stringify({action:'__ruta_mail_log'})});
    return (await r.json()).log;
  }, MOCK_URL);
  const notifRuta = rutaMailLog.find(m => m.dest === 'pedro.maestro@sleppuelche.gob.cl');
  assert(notifRuta, 'debía haberse enviado un correo de ruta a pedro.maestro@sleppuelche.gob.cl');
  assert(notifRuta.comuna === 'Alto Biobio', 'la comuna de la ruta debía ser Alto Biobio, salió: ' + notifRuta.comuna);
  assert(notifRuta.establecimiento === 'Escuela 1181 Ralco Lepoy', 'el colegio de la ruta debía ser Escuela 1181 Ralco Lepoy, salió: ' + notifRuta.establecimiento);
  assert(notifRuta.tareas === 'Revisar luminarias sala 3 y cambiar llave de baño estudiantes', 'las tareas de la ruta no coinciden: ' + notifRuta.tareas);
  log('OK notificación de ruta diaria enviada -> ' + JSON.stringify(notifRuta));

  step = 'pmaestro sigue viendo su ticket tras quedar asignado a su propio colegio';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'pmaestro'); await page.fill('#log-pass', 'test1234'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-registros');
  await page.waitForTimeout(300);
  const registrosPmaestro = await page.textContent('#registros-list');
  assert(registrosPmaestro.includes(TICKET1), 'tras la asignación, pmaestro debía seguir viendo su ticket (mismo colegio asignado), salió: ' + registrosPmaestro.replace(/\s+/g,' ').slice(0,200));
  log('OK el filtro de asignación no excluye los tickets del colegio que sí le corresponde al Maestro');

  // ---------------------------------------------------------------
  section('DIRECTOR: solo ve los tickets que él levanta');
  step = 'crear usuario Director del colegio E001';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'admin'); await page.fill('#log-pass', 'Puelche3281!'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.click('#tab-gestion');
  await clickSub(page, 'gestion', 'ges-admin');
  await clickSub(page, 'admin', 'adm-usuarios');
  await page.click('button:has-text("+ Nuevo usuario")');
  await page.waitForSelector('#modal-usuario.open');
  await page.fill('#modal-usuario-content #us-nombre', 'Diana Directora');
  await page.fill('#modal-usuario-content #us-login', 'ddirectora');
  await page.fill('#modal-usuario-content #us-clave', 'test1234');
  await page.selectOption('#modal-usuario-content #us-perfil', 'Director');
  await page.selectOption('#modal-usuario-content #us-estab', { label: 'Escuela 1181 Ralco Lepoy' });
  await page.click('#modal-usuario-content button:has-text("Guardar")');
  await page.waitForSelector('#modal-usuario:not(.open)', { timeout: 5000 });
  await page.waitForTimeout(400);

  step = 'la directora no ve los tickets de otros en su colegio';
  await page.click('button[title="Salir"]');
  await page.waitForSelector('#screen-login.on');
  await page.fill('#log-user', 'ddirectora'); await page.fill('#log-pass', 'test1234'); await page.click('#btn-login');
  await page.waitForSelector('#screen-app.on', { timeout: 8000 });
  await page.waitForTimeout(600);
  assert(await page.isHidden('#tab-gestion'), 'la Directora no debía ver Gestión (ni la galería de fotos)');
  assert((await page.textContent('#stat-total')).trim() === '0', 'el Inicio de la Directora debía contar 0 tickets (los 3 del colegio son de otros), salió: ' + await page.textContent('#stat-total'));
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  assert(!(await page.textContent('#registros-list')).includes(TICKET1), 'la Directora no debía ver tickets levantados por otros');
  log('OK la Directora no ve los 3 tickets que otros levantaron en su colegio (ni en Inicio ni en Tickets)');

  step = 'la directora levanta su propio ticket y lo ve';
  await page.click('#tab-levantamiento');
  await page.click('#lista-recintos .opt:has-text("Sala de clases")');
  await page.click('#btn-siguiente');
  await page.click('#lista-generales .opt:has-text("Electrico")');
  await page.waitForTimeout(150);
  await page.click('#lista-especificos .opt:has-text("Luminaria interior")');
  await page.waitForTimeout(150);
  await page.fill('#lev-obs', 'Enchufe suelto en sala de la directora.');
  await page.click('#btn-siguiente');
  await page.setInputFiles('#lev-file', PHOTO);
  await page.waitForTimeout(400);
  await page.click('#lev-submit');
  await page.waitForTimeout(800);
  await page.click('#tab-registros');
  await page.waitForTimeout(200);
  const registrosDir = await page.locator('#registros-list .record-item').count();
  assert(registrosDir === 1, 'la Directora debía ver exactamente su propio ticket, vio ' + registrosDir);
  const pullDir = await (await fetch(MOCK_URL, {method:'POST', body: JSON.stringify({action:'pull', id_usuario: (await page.evaluate(() => sesion.id_usuario)), perfil:'Director'})})).json();
  assert(pullDir.observaciones.length === 1, 'el servidor debía entregarle a la Directora solo su ticket, entregó ' + pullDir.observaciones.length);
  log('OK la Directora ve solo su propio ticket (también lo que entrega el servidor)');

  // ---------------------------------------------------------------
  section('RESULTADO');
  const relevantes = errors.filter(e => !KNOWN_NETWORK_NOISE.test(e.text));
  const ruido = errors.filter(e => KNOWN_NETWORK_NOISE.test(e.text));
  if (ruido.length) {
    log(ruido.length + ' error(es) de red externa ignorados (CDN/fuentes bloqueadas en este sandbox, no son bugs de la app):');
    ruido.slice(0,5).forEach(e => log('  [ruido] (' + e.step + ') ' + e.text.slice(0,150)));
  }
  if (relevantes.length) {
    console.log('\n❌ ERRORES REALES DE APP (' + relevantes.length + '):');
    relevantes.forEach(e => console.log('  [' + e.step + '] ' + e.text));
    await browser.close();
    process.exit(1);
  }
  console.log('\n✅ TODO EL RECORRIDO PASÓ SIN ERRORES DE APLICACIÓN.');
  await browser.close();
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FALLÓ en paso "' + step + '": ' + msg);
}

async function clickSub(page, grupo, id) {
  const barId = grupo === 'admin' ? 'admin-subtabs' : grupo + '-subtabs';
  await page.click('#' + barId + ' [data-sp="' + id + '"]');
  await page.waitForTimeout(150);
}

main().catch(err => {
  console.error('\n💥 FALLO EN EL TEST (paso: ' + step + ')');
  console.error(err.stack || err.message);
  console.error('\nErrores de consola acumulados hasta el fallo:');
  errors.forEach(e => console.error('  [' + e.step + '] ' + e.text));
  process.exit(1);
});
