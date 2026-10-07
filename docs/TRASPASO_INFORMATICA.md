# LevantApp · traspaso para Informática

Documento para quien continúe el desarrollo y la operación. No contiene claves ni tokens: dónde viven se indica más abajo.

## 1. Qué es
PWA offline-first para levantar fallas de infraestructura en los colegios del SLEP Puelche, subsanarlas, controlar bodega y seguir el avance. Un solo archivo de interfaz (`index.html`, ~4.500 líneas) y un backend en Google Apps Script con Google Sheets como base de datos.

| Pieza | Dónde |
|---|---|
| App publicada | https://rockdrigo2020.github.io/levantamiento-colegios (GitHub Pages, rama `main`) |
| Repositorio | `Rockdrigo2020/levantamiento-colegios` |
| Backend | proyecto Apps Script "LevantApp SLEP Puelche", implementación web `/exec` (la URL está en `index.html`, constante `SERVIDOR`) |
| Base de datos | hoja de Google `1lA7mOtYB7UYT4FbW-s4O_YBw20B2z9vo-varEG3V6iM` (22 hojas) |
| Fotos | carpeta de Drive `16p1X10k4_dP53NFFZj3tlotnftpRqZSm` |
| Diagramas | `docs/diagramas_levantapp.html` (arquitectura y agente de correo) |
| Accesos por perfil | `docs/Accesos_por_perfil_LevantApp.pptx` |

## 2. Contenido del repositorio
- `index.html`: toda la interfaz y la lógica (sin framework ni build).
- `sw.js`: Service Worker (HTML network-first; assets cache-first). Subir `CACHE` cuando cambien archivos precacheados.
- `vendor/`: SheetJS y Chart.js locales (la red del SLEP bloquea `cdnjs`; el CDN queda como respaldo).
- `apps-script/Codigo.gs`: backend completo. `appsscript.json`: manifiesto.
- `BACKEND_ACCIONES.md`: contrato de las acciones del backend.
- `pruebas/`: mock del backend y recorrido e2e (ver `pruebas/README.md`).
- `docs/`: prompts del agente de Outlook, planillas y listados cargados, diagramas.
- `CLAUDE.md`, `.claude/`: instrucciones y hooks para Claude Code (grafo con graphify).

## 3. Cómo se despliega
- **Interfaz:** un merge a `main` publica solo en GitHub Pages (1–2 min). Los equipos toman la versión nueva al recargar; en la app instalada puede requerir abrirla dos veces.
- **Backend (manual):** Apps Script no se publica desde el repositorio. Copiar `apps-script/Codigo.gs` completo al editor, guardar y luego *Implementar → Administrar implementaciones → editar → Versión: Nueva versión*. Sin ese último paso la URL `/exec` sigue sirviendo el código anterior. Tras agregar hojas, ejecutar `setup` una vez (es idempotente).
- **Pendiente de verificar:** que la versión desplegada incluya el último `Codigo.gs`. El cambio más reciente es `fotos_agregar` (sumar fotos a un ticket que ya tiene alguna). Sin él, la app lo avisa y guarda las fotos en el equipo.
- Recomendado: pasar a `clasp` para desplegar desde el repositorio.

## 4. Configuración del backend (Propiedades del script)
Solo los nombres; los valores los tiene el administrador del proyecto.
`MAIL_NOTIFICACIONES` (copia de avisos de tickets), `URL_WEBAPP` (base de los enlaces de voto), `VOTO_SECRET` (se crea sola), `GEMINI_API_KEY` (lectura de documentos con IA), `WA_TOKEN`, `WA_PHONE_ID`, `WA_VERIFY_TOKEN` (bot de WhatsApp). Los correlativos `SEQ_SLEP_2026`, `SEQ_EMG_2026` se guardan también ahí.

## 5. Modelo de datos (hojas)
Definido en `SCHEMA` de `Codigo.gs`. **Regla:** las columnas nuevas se agregan siempre al final. Principales: `OBSERVACION` (ticket), `SUBSANACION`, `MATERIAL_USADO`, `COMENTARIO`, `USUARIO`, `COMUNA` (`id_gestor` = gestor de la comuna), `ESTABLECIMIENTO`, `RECINTO`, `ELEMENTO_GENERAL/ESPECIFICO`, `ACCION_TIPO`, `MATERIAL`, `HERRAMIENTA`, `BODEGA_*`, `CAJA_CHICA`, `EMPRESA`, `OC`, `OC_PARTIDA`, `VALIDACION`, `ASIGNACION`, `RUTA`.

## 6. Perfiles y permisos
Cinco perfiles: Infraestructura, Coordinador, Bodega, Director, Maestro. Detalle en el PowerPoint. El **gestor de comuna** no es un perfil: se define en `COMUNA.id_gestor` y da el OK de cierre con un enlace firmado que llega por correo.

## 7. Flujos clave
- **Ticket:** Pendiente → En proceso → Ejecutado (maestro terminó) → Cerrado (OK de Infraestructura o del gestor) / Reabierto. Numeración `SLEP-AAAA-NNNNNN` y `EMG-AAAA-NNNNNN`, asignada por el servidor. `guardarObservacion` es idempotente por `id_local`.
- **Cola offline:** cada registro se guarda en `localStorage`/IndexedDB y se envía con reintentos (5 s → 5 min).
- **Correos (MailApp):** ticket nuevo (gestor + creador, copia a `MAIL_NOTIFICACIONES`), OK de cierre (gestor), ticket cerrado (creador), ruta asignada.
- **Importar requerimientos:** Gestión → Bandeja → "Crear tickets desde planilla". Lee Establecimiento, Fecha, Área, Requerimiento/Observación y opcionales RBD, Solicitante, Riesgo (→ prioridad). Reimportar no duplica.
- **Acción ejecutada:** el catálogo `AREAS_ACCION` de `index.html` (ids `AX-…`) ofrece unas 200 acciones por área; las del servidor se mantienen. Se muestran por el área `[Área]` de la descripción del ticket.
- **Fotos a tickets ya creados:** detalle del ticket → "Agregar fotografías" (hasta 3).

## 8. Estado de los datos (al 07-10-2026)
82 tickets en la hoja: 14 anteriores + 68 importados desde planillas de requerimientos (SLEP-2026-000013 a 000080), todos Pendiente y sin fotos. Listado en `docs/listado_tickets_cargados.txt`. Pendiente: el ticket 053 (Mi Pequeño Mundo) decía "16 requerimientos" y solo se nombraron 9; faltan 7. No hay pantalla para borrar tickets: se hace en la hoja.

## 9. Hallazgos de seguridad y deuda técnica (verificados en el código)
Orden sugerido de prioridad:
1. **No hay sesión en el servidor.** `login` devuelve el usuario y la app envía su `id_usuario` en cada acción; el servidor confía en ese dato. Quien conozca la URL `/exec` y un id (por ejemplo `U001`, el administrador) puede ejecutar acciones como ese usuario. Solución: emitir en `login` un token firmado con HMAC (como `firmaVoto`) con vencimiento y verificarlo en cada acción.
2. **Acciones sin control de perfil:** `guardarSubsanacion`, `guardarObservacion`, `guardarComentario`, `pull`, `gestion_pull` y `bodega_pull` no verifican quién pregunta. `pull` solo filtra por perfil si el cliente lo declara. Agregar `permisoXxx()` a cada una.
3. **Claves:** `hash()` es SHA-256 con un prefijo fijo (sin sal por usuario). Si el administrador crea un usuario sin clave queda `cambiar123`. Usar sal por usuario y forzar el cambio en el primer ingreso.
4. **Solo bloqueo visual:** el detalle de un ticket ofrece "Registrar subsanación" a todo perfil distinto de Director, incluidos Bodega y Coordinador, aunque no tengan la pestaña Subsanar. Limitarlo a Maestro e Infraestructura (y validarlo en el servidor, ver punto 2).
5. **Cuota de Gmail:** una cuenta gratuita envía unos 100 destinatarios al día. `enviarCorreo` traga los errores: en cargas masivas los tickets se crean pero pueden no salir los avisos. Conviene registrar los fallos en una hoja.
6. **Credenciales expuestas:** durante esta sesión se escribió en el chat la clave del usuario `admin` (y la de una cuenta de correo personal). Cambiarlas.
7. **Despliegue manual** del backend y sin pruebas automáticas contra el Apps Script real (solo contra el mock).

## 10. Seguir trabajando con Claude Code
Clonar el repositorio y abrir Claude Code en la carpeta: lee `CLAUDE.md`. Las pruebas del mock están en `pruebas/`. Trabajar en una rama, probar contra el mock y abrir un PR a `main`. Para preguntas de arquitectura, `graphify query "<pregunta>"` una vez construido el grafo (`/graphify .`).

## 11. Pendientes sugeridos
Los puntos 1–4 de la sección 9; los 7 requerimientos faltantes de Mi Pequeño Mundo; el agente de correo de Outlook (`docs/PROMPT_AGENTE_OUTLOOK_8000.md`, requiere conector de Microsoft 365 y un usuario de servicio); administrar el catálogo de acciones desde una hoja en vez de `index.html`.
