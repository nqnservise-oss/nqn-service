# Sincronización de stock

El inventario era local en cada navegador. Este cambio agrega una hoja STOCK a la base central, migración por ID y movimientos de cantidad deduplicados. Conserva una copia local anterior en `nqn_stock_before_cloud_v1`.

## Orden de instalación

1. Guardar una copia del proyecto Apps Script actual y exportar una copia de datos desde cada dispositivo. No borrar almacenamiento ni reinstalar la aplicación.
2. Incorporar los cambios de `codigo.gs` al proyecto Apps Script que usa la URL /exec configurada en la aplicación. Si el proyecto tiene cambios que no están en este repositorio, conservarlos e integrar únicamente las modificaciones de stock.
3. Actualizar la implementación existente de Apps Script con una versión nueva, conservando la misma URL /exec. Comprobar que la respuesta pull incluya `stock` y esquema 5. Esta publicación requiere acceso al proyecto Google; actualizar GitHub no la realiza.
4. Publicar juntos `index.html`, `stock-sync.js` y `sw.js`.
5. Abrir primero la computadora con el inventario completo y sincronizar. Luego abrir y sincronizar el celular. Los registros existentes se incorporan por ID; los creados por separado con distinto ID no se fusionan automáticamente por nombre.
6. Comparar nombres, unidades y costos. Asignar una unidad a una OT de prueba, guardar y sincronizar ambos dispositivos: debe descontarse una sola vez. Devolverla desde la OT y comprobar que se restituye una sola vez.

## Validación

`node tests/stock-sync.test.cjs` comprueba migración, dos dispositivos, consumos concurrentes, reintentos, devolución, eliminación, cambios pendientes y compatibilidad con un backend anterior.

Las pruebas son simuladas; no sustituyen la comprobación con la implementación real de Apps Script. Los movimientos rechazados por stock insuficiente permanecen pendientes para revisión. El libro de operaciones se conserva en el JSON de cada repuesto; si su historial crece hasta acercarse al límite de una celda de Sheets, se deberá migrar a una hoja de movimientos separada.
