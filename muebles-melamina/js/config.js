/*
 * Configuración de la app. Editar aquí antes de publicar.
 *
 * modo:
 *   'demo'    -> el pago se simula en el navegador y el correo NO se envía. Solo para pruebas.
 *   'backend' -> el pago y el envío pasan por el servicio indicado en endpoint (ver README).
 *
 * endpoint: URL del backend que crea el pago, verifica que esté pagado y envía el correo.
 *           Vacío = no configurado.
 *
 * precioCLP: precio del informe. PLACEHOLDER: definir el precio final.
 */
window.CONFIG_MELAMINA = {
  modo: 'demo',
  precioCLP: 4990,
  endpoint: ''
};
