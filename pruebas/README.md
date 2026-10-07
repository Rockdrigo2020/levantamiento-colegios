# Pruebas de LevantApp (mock + Playwright)

- `mock-server.js`: servidor Node que replica `apps-script/Codigo.gs` (mismas acciones y reglas) para probar sin tocar la hoja real. Puerto 8934. Guarda el estado en memoria: **reinícialo antes de cada corrida**. Expone `__mail_log` con los correos "enviados".
- `e2e.js`: recorrido completo con Playwright (login, levantamiento, bodega, subsanación, validación, OC, emergencia, administración, reportería, rutas, requerimientos, fotos).

Antes de correrlo, ajustar en `e2e.js`: el `executablePath` de Chromium (por defecto `/opt/pw-browsers/chromium`) y `PLANILLA_REQ` / `PLANILLA_RUTAS` (planillas Excel de ejemplo que **no** están en el repositorio; `docs/Requerimientos_Mantencion_Correos_2.xlsx` sirve para la de requerimientos, pero el test espera 2 filas).

```bash
cd pruebas && npm install          # playwright y xlsx
node mock-server.js &              # terminal aparte
node e2e.js
```
Si el Excel no carga offline, `e2e.js` sirve SheetJS desde `node_modules` (el CDN suele estar bloqueado).
