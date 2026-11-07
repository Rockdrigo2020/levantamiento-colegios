# Calculadora de planchas de melamina

Aplicación web de una sola página (HTML, CSS y JavaScript sin dependencias). El usuario:

1. Ingresa las medidas exteriores del mueble (ancho, alto, profundidad) y el grosor de la plancha.
2. Indica cuántos espacios tiene a lo ancho y a lo alto, y la medida libre de cada uno. Los totales se validan contra los espacios.
3. Elige formatos de plancha, fondo, ancho de sierra y piezas adicionales (puertas, cajones, etc.).
4. La app calcula la lista de corte, cuántas planchas necesita por formato y dibuja la distribución de cortes.
5. Confirma las medidas y paga el informe.
6. Recibe el informe por correo, o lo descarga o imprime. El informe incluye tiendas sugeridas en Chile.

## Ver en local

Abrir `index.html` en el navegador, o servir la carpeta con cualquier servidor estático.

Pruebas del motor de cálculo (Node 18 o superior):

```
node muebles-melamina/tests/motor.test.js
```

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Estructura de la página y pasos del asistente |
| `css/estilos.css` | Estilos responsivos (pensados para teléfono primero) |
| `js/config.js` | Modo de pago, precio y URL del backend |
| `js/catalogo.js` | Formatos de plancha, grosores y tiendas |
| `js/motor.js` | Cálculo: piezas, validación de medidas, empaquetado de cortes con kerf |
| `js/app.js` | Interfaz, informe HTML, pago y envío |
| `tests/motor.test.js` | Pruebas del motor (sin dependencias) |

## Supuestos del cálculo

- Las medidas de espacios son **libres** (hueco interior). El ancho total = suma de espacios + grosor de cada lateral y división. El alto total = suma de espacios + grosor de tapa, base y cada estante. Si no cuadra (tolerancia 1 mm), la app lo indica y no avanza.
- Piezas generadas: 2 laterales (alto × profundidad), tapa y base (ancho interior × profundidad), divisiones verticales, y un estante por columna entre cada par de filas.
- Fondo: medida exterior (ancho × alto), con grosor propio. Ajustar en obra según el rebaje.
- Empaquetado: MaxRects con ancho de sierra (kerf) aplicado a cada pieza. Se puede desactivar el giro de piezas si la veta debe ir en una dirección.
- No se calculan cantos (tapacantos), rebajes ni perforaciones.
- Formatos incluidos: 183 × 250 cm y 152 × 244 cm (medidas comunes en Sodimac y Easy). Se puede agregar una medida personalizada en mm.
- Grosores: 12, 15 y 18 mm en el cuerpo; 3, 5 y 9 mm en el fondo.

## Pago y envío (lo que falta para producción)

La app no puede verificar pagos ni enviar correos por sí sola en el navegador. Por eso el modo viene en **`demo`**: el pago se simula y el correo está deshabilitado. Mostrará un aviso visible.

Para producción, editar `js/config.js`:

```js
window.CONFIG_MELAMINA = {
  modo: 'backend',
  precioCLP: 4990,          // PLACEHOLDER: definir el precio final
  endpoint: 'https://...'   // servicio que crea el pago, verifica y envía el correo
};
```

### Contrato del backend

Todas las llamadas usan `Content-Type: text/plain` (evita preflight CORS). Las respuestas son JSON.

| Llamada | Entrada | Salida esperada |
|---|---|---|
| `POST {endpoint}?accion=crearPago` | `{orden, monto}` | `{initPoint}`: URL de la pasarela. El backend debe redirigir de vuelta a `index.html?orden=...&pago=ok` |
| `GET {endpoint}?accion=estadoPago&orden=...` | — | `{pagado: true/false}`. **Debe consultarse al proveedor de pagos (o a su webhook), nunca confiar en el navegador** |
| `POST {endpoint}?accion=enviarInforme` | `{orden, email, asunto, html}` | `{ok: true}`. **Debe rechazar si la orden no está pagada** |

Opciones de backend: Google Apps Script (el repositorio ya usa Apps Script en `apps-script/`), Cloudflare Worker, o un servicio propio.

Proveedores de pago típicos en Chile: Mercado Pago, Webpay (Transbank), Flow, Khipu. Para el correo: Gmail/Apps Script, Resend, SendGrid o similar.

## Verificar antes de publicar

- Precio final en `js/config.js`.
- Enlaces y disponibilidad de tiendas en `js/catalogo.js`. Construmart no se confirmó como vendedor de melamina; revisar su sitio.
- Stock, precios y formatos cambian por tienda. El informe pide confirmarlos antes de comprar.
