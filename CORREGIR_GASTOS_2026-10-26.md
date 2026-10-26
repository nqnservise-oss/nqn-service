# Corrección de gastos OT / Cierre Z — 26 de octubre de 2026

## Caso reportado
- OT 036.
- Repuesto por $50.000 abonado con Mercado Pago el 26/10/2026.
- Al regresar al formulario, total de gastos registrados = $0; no aparece en Gastos ni en Cierre Z.
- La fecha de creación de la OT (23/10/2026) no debe confundirse con fecha de pago.

## Cambios incluidos
- La elección de Mercado Pago no abre otra app automáticamente, porque eso puede interrumpir el formulario en un celular. Se mantiene el botón explícito «Abrir Mercado Pago».
- Evita doble clic, verifica el gasto guardado antes de decir «guardado» y muestra error si algún paso falla.
- El Apps Script de esta copia ahora crea una hoja GASTOS, persiste upsertExpense/deleteExpense, devuelve gastos en pull y los incluye en backups.
- En Cierre Z un gasto pagado con MP **no reduce el efectivo**: aparece en Gastos y en el movimiento neto de Mercado Pago.
- Se actualiza caché de la PWA.

## IMPORTANTE: no está publicado automáticamente
Un cambio en GitHub no actualiza por sí solo Google Apps Script. Antes de desplegar, hacer una copia de la base de datos y del código **realmente implementado** en Apps Script. Si ese código ya contiene funciones más nuevas que las del repositorio, integrar estos cambios, NO reemplazar ciegamente el servidor en producción.

### Seguridad de la sincronización
El archivo antiguo tenía una clave privada escrita en texto claro en un repositorio público; esa clave debe considerarse comprometida. La rama corregida elimina la clave del código, pero la clave histórica permanece en el historial de Git. Rotarla es obligatorio. En Apps Script > Configuración del proyecto > Propiedades de secuencia de comandos, guardar **una clave nueva** en la propiedad `SYNC_KEY`; actualizar esa misma clave **solamente** dentro de la configuración local NQN Service > Copias > Google Drive. Nunca pegarla en GitHub, un issue, una captura o este chat. Configurar la propiedad antes del despliegue: sin ella las peticiones serán rechazadas.

## Instalación
1. Respaldar datos de la app (Copias) y la versión actual de Apps Script.
2. Confirmar que la implementación del servidor corresponda con `codigo.gs` de este repositorio; si es diferente, integrar solamente los cambios para GASTOS.
3. Configurar una nueva `SYNC_KEY` en Script Properties y actualizar la clave de la app en los dispositivos autorizados.
4. Desplegar nueva versión de la implementación web de Apps Script, conservando la URL `/exec` existente. Ejecutar `setupNQNService` una vez si corresponde para crear la hoja GASTOS.
5. Tras aprobar e integrar el PR, actualizar NQN Service en el navegador/PWA. Verificar versión del caché `nqn-service-v949-gastos-caja`.
6. Confirmar ANTES de registrar nuevamente que el gasto de la OT 036 no existe ya en otro dispositivo o en la base GASTOS. Si está ausente, cargar una sola vez $50.000, categoría Repuestos, medio Mercado Pago, fecha 26/10/2026.
7. Comprobar que se vea inmediatamente en: OT 036 («Total de gastos registrados»), pestaña Gastos e historial de Cierre Z del 26/10/2026. Controlar que no reste del efectivo y sí de «Movimiento neto Mercado Pago».
8. Comprobar sincronización en otro dispositivo y refrescar; el registro debe seguir visible. Repetir prueba con gasto de efectivo en otra OT y verificar que descuente sólo efectivo.

## Diagnóstico pendiente
No hubo acceso a la sesión real ni a registros del navegador. El salto a Mercado Pago y el backend incompleto son defectos verificables del código del repositorio, pero no está confirmado cuál de ellos causó la pérdida concreta de los $50.000. Los cambios NO reconstruyen automáticamente ese gasto perdido.
