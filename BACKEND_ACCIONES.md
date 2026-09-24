# Contrato de acciones del backend (Google Apps Script)

> **✅ Ya implementado.** `apps-script/Codigo.gs` en este repo es la copia completa y
> actualizada del proyecto real de Apps Script (`LevantApp SLEP Puelche`,
> `SHEET_ID = 1lA7mOtYB7UYT4FbW-s4O_YBw20B2z9vo-varEG3V6iM`), con las 12 acciones nuevas
> ya escritas siguiendo exactamente el mismo estilo, esquema y helpers (`leer`/`upsert`/
> `buscar`/`subirFoto`/`hash`) que el resto del archivo. Este documento describe el
> contrato para referencia; el código ya lo cumple.
>
> **Cómo aplicarlo** (no se puede subir automáticamente: el editor de Apps Script no
> tiene una API de escritura accesible desde aquí):
> 1. Abre el proyecto: https://script.google.com/home/projects/1lqsCres0DexM6W4iMsUw3vwIJy89-QNDGiQmsgwdYbL56Wc18vb1IPth/edit
> 2. Abre el archivo `Código.gs`, selecciona todo (Ctrl/Cmd+A) y pégale encima el
>    contenido de `apps-script/Codigo.gs` de este repo.
> 3. Guarda (Ctrl/Cmd+S).
> 4. **Implementar → Administrar implementaciones → ✏️ (editar la implementación web
>    activa) → Versión: Nueva versión → Implementar.** Sin este paso, la URL `/exec` que
>    usa la app (`SERVIDOR` en `index.html`) sigue sirviendo el código viejo.
> 5. Ejecuta una vez la función `setup` desde el editor (selector de función arriba,
>    ▶ Ejecutar) para crear las hojas nuevas (`HERRAMIENTA`, `BODEGA_MOVIMIENTO`,
>    `BODEGA_SALDO`, `BODEGA_CUSTODIA`, `BODEGA_RECEPCION`, `EMPRESA`, `OC`, `OC_PARTIDA`,
>    `VALIDACION`) y sembrar el catálogo base de 8 herramientas. Es idempotente: no
>    duplica nada si ya la habías corrido antes.
> 6. Carga stock inicial de materiales: por ahora no hay pantalla masiva para esto, así
>    que la forma más rápida es abrir la hoja `MATERIAL` directamente y rellenar a mano
>    las columnas `stock` y `minimo` (quedaron en blanco a propósito, sin inventar
>    números); desde ahí en adelante todo se mueve solo vía `bodega_recepcion`.

Este documento describe cada `action` que `index.html` envía al Apps Script (`SERVIDOR`,
la constante `const SERVIDOR = 'https://script.google.com/macros/s/.../exec'` en el
`<script>` principal). El frontend siempre hace `POST` con `Content-Type: text/plain`
(para evitar el preflight CORS que Apps Script no responde) y un cuerpo JSON
`{action, ...}`. Se espera que el backend responda siempre JSON con al menos
`{status:'ok'|'error', message?}`.

Si una acción todavía no existe en el servidor, el frontend no se rompe: `api()` recibe
`null`/una respuesta sin `status:'ok'`, y el registro queda **guardado localmente y en
cola de sincronización** (mismo mecanismo que ya usan `observacion` y `subsanacion` hoy).
Se reintenta solo cuando hay conexión, con backoff exponencial (5 s → 5 min).

---

## Acciones que YA EXISTEN (sin cambios de contrato, se documentan como referencia)

| Acción | Payload | Respuesta esperada |
|---|---|---|
| `login` | `{action:'login', usuario, clave}` | `{status:'ok', usuario:{id_usuario, nombre, perfil, id_establecimiento}}` |
| `catalogos` | `{action:'catalogos'}` | `{status:'ok', comunas[], establecimientos[], recintos[], generales[], especificos[], materiales[], acciones[]}` |
| `observacion` | `{action:'observacion', data:{...}}` | `{status:'ok', ticket}` |
| `subsanacion` | `{action:'subsanacion', data:{...}}` | `{status:'ok'}` |
| `priorizar` | `{action:'priorizar', id_usuario, ticket, prioridad, estado, justificacion}` | `{status:'ok'}` |
| `pull` | `{action:'pull', perfil, id_establecimiento}` | `{status:'ok', observaciones[]}` |

### Extensiones aditivas a acciones existentes (no rompen nada, solo agregan campos)

- **`catalogos`**: agregar dos arreglos nuevos a la respuesta:
  - `usuarios[]` — **solo si quien pide es perfil `Infraestructura`** (por privacidad):
    `{id_usuario, nombre, usuario_login, perfil, id_establecimiento}` (nunca la clave).
  - `empresas[]`: `{id_empresa, nombre, rut}`.
- **`observacion`**: la fila enviada ahora puede incluir `fotos_antes` (arreglo de hasta 3
  fotos en base64; `foto_antes` sigue enviándose con la primera, para compatibilidad).
- **`subsanacion`**: la fila enviada ahora puede incluir `fotos_despues` (arreglo, misma
  lógica que arriba), y dos campos nuevos:
  - `validado` (boolean): `true` si quien cerró ya era perfil Infraestructura (autovalidado).
  - `materiales[]` ya existía; ahora siempre corresponde a material con vale de bodega vigente
    (el frontend ya no permite declarar material sin saldo).
- **`priorizar`**: agregar `id_gestor_asignado` (string, opcional) — el gestor de
  mantenimiento al que Infraestructura asigna el ticket.
- **`pull`**: sin cambios de contrato — ya filtraba solo cuando `perfil === 'Director'` y
  `id_establecimiento` venían juntos, así que Infraestructura (y Maestro) ya recibían toda
  la red. El frontend ahora manda `id_establecimiento` vacío para todo perfil que no sea
  Director, para que quede explícito.
- **`catalogos`**: ahora recibe `id_usuario` (el de quien pide) para decidir si incluir
  `usuarios[]` en la respuesta.

---

## Acciones NUEVAS · Módulo 3 (Bodega)

### `bodega_pull`
Trae el estado actual de inventario, saldos y custodia. Se llama en cada sincronización.

```json
{"action":"bodega_pull", "id_usuario":"USR_1", "perfil":"Infraestructura"}
```
Respuesta:
```json
{
  "status":"ok",
  "materiales":  [{"id_material":"MAT_1","nombre":"Ampolleta LED","unidad":"un","stock":40,"minimo":10}],
  "herramientas":[{"id_herramienta":"HER_1","nombre":"Taladro Bosch","codigo":"T-014"}],
  "saldos":      [{"id_usuario":"USR_2","id_material":"MAT_1","cantidad":6}],
  "custodia":    [{"id_herramienta":"HER_1","id_usuario":"USR_2","estado":"En custodia","fecha":"2026-09-01T12:00:00Z"}]
}
```
`custodia[].estado` ∈ `En custodia | Devuelta`.

### `bodega_entrega`
Vale de entrega (material) o acta de custodia (herramienta). El frontend ya descontó el
stock/actualizó el saldo local de forma optimista; el servidor debe hacer lo mismo y
persistirlo (hoja "Bodega_Movimientos" o similar).

```json
{"action":"bodega_entrega", "data":{
  "id_local":"BOD_xxx", "tipo":"material", "id_material":"MAT_1", "cantidad":5,
  "id_usuario_recibe":"USR_2", "id_usuario_entrega":"USR_1",
  "ticket_asociado":"SLEP-2026-000148", "fecha":"2026-09-16T10:00:00Z"
}}
```
Para herramientas, `tipo:"herramienta"` y `id_herramienta` en vez de `id_material`/`cantidad`.
Respuesta: `{"status":"ok"}`.

### `bodega_cierre_material`
Se dispara automáticamente cuando un maestro declara consumo de material en una
subsanación (Módulo 2). Descuenta el saldo del gestor e imputa el costo al establecimiento
del ticket.

```json
{"action":"bodega_cierre_material", "data":{
  "id_local":"BODC_xxx", "id_usuario":"USR_2", "id_material":"MAT_1",
  "cantidad_consumida":3, "ticket":"SLEP-2026-000148", "fecha":"..."
}}
```
El sobrante (saldo restante del gestor que no se declaró como consumido) se considera
"pendiente de devolución a bodega": no hay un movimiento explícito, es simplemente
`saldo_actual - cantidad_consumida` en la hoja de saldos.

### `bodega_devolucion_herramienta`
```json
{"action":"bodega_devolucion_herramienta", "data":{
  "id_local":"BODD_xxx", "id_herramienta":"HER_1", "id_usuario":"USR_2",
  "estado_devuelto":"Operativa", "fecha":"..."
}}
```
`estado_devuelto` ∈ `Operativa | Con desgaste | En reparación | Baja` (texto libre, el
frontend lo pide con `prompt()`; se recomienda migrarlo a un `<select>` en una próxima
iteración de UI si se quiere restringir valores).

### `bodega_recepcion`
Ingreso de stock por compra (aumenta `materiales[].stock`).
```json
{"action":"bodega_recepcion", "data":{
  "id_local":"BODR_xxx", "id_material":"MAT_1", "cantidad":50, "valor_unitario":1200,
  "proveedor":"Ferretería X", "documento":"Factura 4521", "fecha":"...",
  "id_usuario":"USR_1", "fotos":["data:image/jpeg;base64,..."]
}}
```

### `bodega_caja_chica`
Compra pagada con caja chica (pestaña **🧾 Caja Chica**, mismo acceso que Bodega:
Infraestructura o el perfil Bodega). Igual que `bodega_recepcion` — suma stock del
material elegido y guarda la foto de respaldo (aquí, la boleta) — pero queda en su propia
hoja `CAJA_CHICA` para poder reportar aparte qué se compró con caja chica y quién lo hizo.
```json
{"action":"bodega_caja_chica", "data":{
  "id_local":"CCH_xxx", "id_material":"MAT_1", "cantidad":4, "precio_unitario":1800,
  "glosa":"Compra urgente ferretería", "fecha":"...",
  "id_usuario":"USR_1", "fotos":["data:image/jpeg;base64,..."]
}}
```
`fotos[0]` (si viene) se sube a Drive como `foto_boleta_url`. El usuario que registra la
compra queda asociado en `id_usuario` — es quien aparece en el reporte de Caja Chica.

### `caja_chica_pull`
Trae el historial completo de `CAJA_CHICA` para el subtab **📊 Reporte** (mismo
`permisoBodega`).
```json
{"action":"caja_chica_pull", "id_usuario":"USR_1"}
```
Respuesta: `{"status":"ok", "registros":[{"id_local":..., "id_material":..., "cantidad":...,
"precio_unitario":..., "id_usuario":..., "foto_boleta_url":..., "glosa":..., "fecha":...}]}`.
El frontend calcula el monto total (`cantidad × precio_unitario`) y resuelve el nombre del
material/usuario localmente contra `inv.materiales`/`cat.usuarios` — no viaja duplicado.

---

## Acciones NUEVAS · Módulo 5 (Gestión y control) — acceso exclusivo perfil Infraestructura

### `gestion_pull`
```json
{"action":"gestion_pull"}
```
Respuesta: `{"status":"ok", "ocs":[{...OC con partidas...}]}`.

### `gestion_oc`
Registra una orden de compra con sus partidas.
```json
{"action":"gestion_oc", "data":{
  "id_local":"OC_xxx", "id_empresa":"EMP_1", "numero_oc":"OC-2026-014",
  "id_licitacion":"LIC-882", "estado":"Vigente", "fecha":"...", "id_usuario":"USR_1",
  "partidas":[{"id_local":"PART_1","item":"Pintura fachada","unidad":"m2","cantidad":300,"monto":4500000,"avance":0}]
}}
```

### `gestion_avance`
Avance de una partida específica, con foto.
```json
{"action":"gestion_avance", "data":{
  "id_oc":"OC_xxx", "id_local":"PART_1", "item":"Pintura fachada",
  "avance":40, "fotos":["data:image/jpeg;base64,..."]
}}
```

### `gestion_recepcion_oc`
Marca la OC completa como recepcionada conforme (habilita estado de pago).
```json
{"action":"gestion_recepcion_oc", "data":{"id_local":"OC_xxx", "estado":"Recepcionada", ...}}
```

### `validar_subsanacion`
Cierre del ciclo del Módulo 2: Infraestructura valida el trabajo ejecutado por el maestro.
```json
{"action":"validar_subsanacion", "data":{
  "id_local":"VAL_xxx", "id_local_obs":"OBS_xxx", "id_subsanacion":"SUB_xxx",
  "ticket":"SLEP-2026-000148", "conforme":true, "id_usuario_valida":"USR_1", "fecha":"..."
}}
```
Si `conforme:true` → el servidor debe dejar el ticket en estado `Cerrado` (ya lo hace el
frontend localmente) y descontar el pendiente de la bandeja de la red.
Si `conforme:false` → estado `Reabierto`; el frontend ya vuelve a mostrarlo en la pestaña
Subsanar del mismo maestro (`id_usuario_ejecuta` de la última subsanación).

### `admin_usuario`
Alta o edición de un usuario (login). Exclusivo de Infraestructura — el backend valida
`id_usuario_actor` contra la tabla `USUARIO` antes de escribir nada.
```json
{"action":"admin_usuario", "data":{
  "id_local":"ADM_xxx", "id_usuario":"USR_9", "nombre":"Juan Pérez",
  "usuario_login":"jperez", "correo":"jperez@sleppuelche.gob.cl", "clave":"******",
  "perfil":"Maestro", "id_establecimiento":"", "es_edicion":false, "id_usuario_actor":"USR_1"
}}
```
`clave` viaja vacía cuando es una edición sin cambio de contraseña — el backend NO debe
sobrescribir la clave existente en ese caso. `perfil` ∈ `Director | Maestro |
Infraestructura | Bodega | Coordinador`. `correo` se agregó **al final** de
`SCHEMA.USUARIO` (mismo motivo de siempre — no desalinear filas existentes); hoy se usa
solo como `replyTo` en la notificación de tickets nuevos (ver
`notificarTicket`/`MAIL_NOTIFICACIONES` más abajo), no para enviar login/clave por correo.

### `admin_catalogo`
Alta de un material, herramienta o empresa desde la UI de Administración. También
exclusivo de Infraestructura, mismo chequeo de `id_usuario_actor`.
```json
{"action":"admin_catalogo", "data":{
  "id_local":"ADM_xxx", "tipo_catalogo":"material", "id_material":"MAT_9",
  "nombre":"Cinta aisladora", "unidad":"un", "minimo":5, "stock":0, "id_usuario_actor":"USR_1"
}}
```
`tipo_catalogo` ∈ `material | herramienta | empresa | establecimiento` (los campos varían
según el tipo, ver `CATALOGO_CFG` en `index.html` para la lista exacta de campos por tipo).
Desde el Módulo 7 (Seguimiento), `establecimiento` permite crear colegios nuevos o editar
uno existente (mismo `id_establecimiento`) para completarle comuna, RBD, dirección y
**coordenadas** (`lat`/`lng`) — estas últimas alimentan el mapa de Seguimiento. `lat`/`lng`
se agregaron **al final** de `SCHEMA.ESTABLECIMIENTO`, mismo motivo de siempre (no
desalinear filas ya existentes).

---

## Acciones NUEVAS · Lectura de documentos con IA (OC y facturas)

### `leer_documento_ia`
Sube una foto o PDF de una OC, una factura/guía de despacho o una boleta de caja chica y
devuelve los campos estructurados que Gemini detectó, para autocompletar el formulario
correspondiente (**Gestión → Nueva OC**, **Bodega → Recepción** o **Caja Chica →
Registrar compra**). No escribe nada en la planilla — es de solo lectura, y por eso se
responde sin tomar el `LockService` lock (una llamada a Gemini puede demorar varios
segundos).

```json
{"action":"leer_documento_ia", "imagen":"data:application/pdf;base64,...", "tipo":"oc",
 "id_usuario":"USR_1"}
```
`imagen` es un data URL completo (`data:<mime>;base64,<datos>`), tal cual lo entrega
`FileReader.readAsDataURL()` — funciona con fotos (`image/*`) y PDF. `tipo` ∈ `oc |
factura | boleta`. Requiere que quien llama tenga perfil `Infraestructura` o `Bodega`
(`permisoBodega`).

Respuesta para `tipo:"oc"`:
```json
{"status":"ok", "datos":{
  "empresa":"Constructora Ejemplo SpA", "rut_empresa":"76.111.222-3",
  "numero_oc":"OC-2026-045", "id_licitacion":"LIC-12", "fecha":"2026-09-17",
  "items":[{"descripcion":"Pintura fachada", "unidad":"m2", "cantidad":120, "monto":850000}]
}}
```
Respuesta para `tipo:"factura"` y `tipo:"boleta"` (misma forma — una boleta de caja chica
es, en la práctica, una factura simplificada; si no detalla líneas por separado, Gemini
devuelve un solo ítem con la descripción general de la compra):
```json
{"status":"ok", "datos":{
  "empresa":"Ferretería Ejemplo Ltda", "rut_empresa":"77.333.444-5",
  "numero_documento":"FAC-9001", "fecha":"2026-09-17",
  "items":[{"descripcion":"Tubo LED 18W", "unidad":"unidad", "cantidad":10, "valor_unitario":4300}]
}}
```
El frontend intenta emparejar `empresa`/cada `descripcion` de ítem contra los catálogos
ya cargados (`cat.empresas` / `inv.materiales`) por coincidencia de nombre; si no
encuentra match, deja el campo vacío para que el usuario lo complete a mano — nunca crea
registros nuevos automáticamente ni guarda nada sin que el usuario revise y confirme.

**Requiere configurar una API key de Gemini** (gratis) para que esta acción funcione:
1. Genera una key en https://aistudio.google.com/apikey (cuenta de Google, sin costo).
2. En el editor de Apps Script: **Extensiones → Propiedades del proyecto → Propiedades
   del script → Agregar propiedad del script**, nombre `GEMINI_API_KEY`, valor la key.
3. Sin esta propiedad configurada, la acción responde
   `{"status":"error","message":"Falta configurar GEMINI_API_KEY..."}` y el botón "Leer
   con IA" muestra ese mensaje — el resto de la app sigue funcionando normal.

---

## Notificación por correo al ingresar un ticket

`guardarObservacion` llama a `notificarTicket(o, ticket)` cada vez que se crea un ticket
nuevo (`!prev`, o sea que no existía antes por `id_local`) — tanto levantamientos
normales como emergencias. Reemplaza al antiguo `alertaEmergencia`, que solo cubría
emergencias y usaba la propiedad `MAIL_EMERGENCIA`.

**Requiere configurar el destino** en el editor de Apps Script: **Extensiones →
Propiedades del proyecto → Propiedades del script → Agregar propiedad del script**,
nombre `MAIL_NOTIFICACIONES`, valor `rodrigo.bascunan@sleppuelche.gob.cl`. Sin esta
propiedad configurada, `notificarTicket` no hace nada (falla silenciosa, igual que antes
con `MAIL_EMERGENCIA`) — el resto de la creación del ticket sigue funcionando normal.

Por ahora el destino está centralizado en una sola casilla (todos los tickets, de
cualquier colegio o usuario, llegan al mismo correo). Si el usuario que levantó el ticket
tiene `correo` cargado en su ficha (`USUARIO.correo`), se usa como `replyTo` del correo,
para que una respuesta directa le llegue a esa persona aunque el envío esté centralizado.
El cuerpo incluye: ticket, establecimiento, tipo de emergencia y continuidad de clases
(solo si `es_emergencia`), prioridad, descripción y quién lo ingresó.

---

## Acciones NUEVAS · Módulo 7 (Coordinación y Seguimiento)

Nuevo perfil **Coordinador** (además de `Director | Maestro | Infraestructura | Bodega`):
asigna qué establecimiento(s) debe atender cada Maestro/Director. Con al menos una
asignación activa, ese usuario solo ve/sincroniza/subsana los tickets de sus colegios
asignados (en toda la app: Subsanar, Tickets, lo que baja `pull`); sin asignaciones,
mantiene la visibilidad de red completa de siempre. `permisoCoordinador()` acepta tanto
`Coordinador` como `Infraestructura`.

### `asignacion_pull`
```json
{"action":"asignacion_pull", "id_usuario":"USR_1"}
```
Requiere `permisoCoordinador`. Responde:
```json
{"status":"ok",
 "asignaciones":[{"id_local":"ASIG_x","id_usuario":"USR_2","id_establecimiento":"E001",
                   "id_usuario_coordinador":"USR_1","fecha":"...","activa":"true"}],
 "usuarios":[{"id_usuario":"USR_2","nombre":"Pedro Maestro","perfil":"Maestro"}]}
```
`usuarios` incluye perfiles `Maestro | Director | Infraestructura` (personal de terreno
asignable). Asignarle un colegio a un `Infraestructura` **no** acota su acceso — sigue
viendo toda la red en Gestión/Bodega/Reportería/Seguimiento — la asignación queda solo
como registro de cobertura. Solo `Maestro` se acota de verdad (ver cambios en `pull`).

### `asignacion_guardar`
Crea o desactiva una asignación (idempotente por `id_local`).
```json
{"action":"asignacion_guardar", "data":{
  "id_local":"ASIG_x", "id_usuario":"USR_2", "id_establecimiento":"E001",
  "id_usuario_coordinador":"USR_1", "activa": true
}}
```
`activa:false` es la forma de quitar una asignación sin perder el historial de la fila.

### Cambios en acciones existentes
- **`login`**: la respuesta ahora incluye `establecimientos_asignados` (arreglo de
  `id_establecimiento`), calculado desde `ASIGNACION` en el momento del login.
- **`catalogos`**: el arreglo `usuarios` ahora también viaja cuando quien pide es
  `Coordinador` (antes solo `Infraestructura`).
- **`pull`**: si `d.perfil==='Maestro'` y llega `d.id_establecimientos` (arreglo, no
  vacío), filtra las observaciones a esos establecimientos — igual que ya hacía para
  `Director` con `d.id_establecimiento` (singular). También suma `materiales_usados` a
  la respuesta (ver más abajo).
- **`SUBSANACION`**: nueva columna `horas` (horas hombre trabajadas), agregada **al
  final** del `SCHEMA` por la misma razón de siempre (no desalinear filas existentes).

### `materiales_usados` en la respuesta de `pull`
Antes, `pull` no devolvía `MATERIAL_USADO`, así que un dispositivo (p. ej. el de
Infraestructura) nunca veía qué materiales declaró un Maestro en una subsanación hecha
desde SU propio teléfono — el tablero de Seguimiento no podría costear correctamente.
Ahora `pull` también responde `materiales_usados: [{id_subsanacion, id_material,
cantidad}, ...]` filtrado a las subsanaciones incluidas en la respuesta, y el frontend
las reagrupa por `id_subsanacion` al fusionar (`fusionar()` en `index.html`).

---

## Notas de implementación

- Todas las acciones nuevas siguen exactamente el mismo patrón resiliente que ya usan
  `observacion`/`subsanacion`: se guardan localmente primero (optimista), se encolan, y se
  reintentan solas cuando hay señal. No es necesario que el backend responda rápido ni que
  la app esté abierta para que el envío finalmente ocurra (hay reintento en background y al
  reabrir la app).
- Los `id_local` son generados por el cliente (`uid('PREFIJO')`) y deben guardarse en el
  backend como referencia idempotente: si la misma acción llega dos veces con el mismo
  `id_local` (reintento tras una respuesta ambigua), debe actualizar en vez de duplicar.
- Las fotos siempre viajan en un arreglo `fotos` (o `fotos_antes`/`fotos_despues` según el
  caso) de strings `data:image/jpeg;base64,...`, ya comprimidas a máx. 1280px por el
  cliente antes de enviarlas.
- Permisos: igual que `priorizar` ya hacía, cada acción sensible se revalida en el
  servidor (no solo en la UI) buscando al usuario actor en `USUARIO` y comprobando su
  `perfil`. `bodega_entrega`/`bodega_recepcion` exigen `Infraestructura` o `Bodega`;
  `gestion_oc`/`validar_subsanacion`/`admin_usuario`/`admin_catalogo` exigen
  `Infraestructura`. Un actor sin permiso recibe `{status:'error'}` y el registro queda
  en cola local hasta que alguien con el perfil correcto lo reintente.
