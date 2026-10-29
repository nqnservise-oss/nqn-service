# Control de asistencia - NQN Service

Estado: **cambios de asistencia en revisión; no se confirma que estén publicados ni activados en el servidor**.

## Reglas confirmadas

- Jornada de lunes a viernes. Hasta el 27/10/2026 se respeta el horario anterior, 09:00 a 17:00, con tolerancia de ingreso hasta 09:15.
- Desde el **28/10/2026**, horario de verano **08:30 a 16:30**; tolerancia de entrada hasta **08:45 inclusive**.
- A partir de las 08:46, la tardanza cuenta completa desde las 08:30: 08:46 = 16 minutos. Las entradas dentro de la tolerancia no generan tardanza.
- Salida anterior a las 16:30: se registran todos los minutos anticipados, sin compensar automáticamente con ingreso temprano.
- **Horas extras:** desde el 28/10/2026 se computa el tiempo trabajado después de las 16:30 (para fechas anteriores, después de las 17:00). Requiere entrada y salida; si la entrada es posterior al horario de salida, se cuenta desde la entrada real. No se compensa con tardanzas.
- **Jornadas registradas:** se suma sólo un día que tenga entrada y salida en orden. No reemplaza la revisión de ausencias, licencias o feriados.
- La vista del empleado muestra por fecha el horario, la hora de ingreso, un estado «Llegada tarde» **en rojo** si corresponde, y la duración de la tardanza o salida anticipada.
- Para evitar exportar un PDF con fichajes vacíos o no actualizados, primero se requiere una respuesta correcta del servidor al presionar **Actualizar**. Si la actualización falla, el reporte permanece bloqueado.
- El resumen del mes aparece **debajo de los registros diarios** en pantalla, y **encima de la tabla diaria** en la impresión / Guardar como PDF. Ambos muestran jornadas registradas, cantidad y duración de tardanzas, salidas anticipadas y horas extras, además de fichajes faltantes; las horas extras se detallan por fecha.
- Los días sin fichaje quedan pendientes de revisión; nunca se interpretan como ausencias automáticas. El cambio de horario no reinterpreta los días previos.
- Sólo PC vinculada al taller, con PIN personal al fichar; la hora la asigna Apps Script.
- Una entrada y una salida por día; ajustes sólo administrador con PIN y motivo; ningún ajuste borra los eventos originales.
- Sin internet no es posible fichar; jamás se simula que un fichaje fue confirmado.
- No se aplican descuentos salariales automáticos.

## Puesta en funcionamiento - requiere configurar Google Apps Script

1. Revisar y **aprobar/combinar** la rama en GitHub cuando esté lista. No publicar antes de preparar el servidor.
2. Abrir el proyecto Apps Script que usa NQN Service para sincronización. Agregar un archivo de script denominado **asistencia-backend.gs** con el contenido del mismo archivo de este repositorio.
3. En el archivo principal del proyecto Apps Script, dentro de la función `doGet(e)`, después de la línea:
   `const action = p.action || 'pull';`
   agregar exactamente:
   `if (action === 'attendanceRead') return attendanceDoGet_(p);`
4. En `doPost(e)`, **después de validar el token y antes de validar `action === 'apply'`**, agregar:
   `if (body.action === 'attendanceEvent') return json_(attendanceEvent_(body));`
5. Ejecutar **una vez** la función `setupAttendanceKiosk()` desde el editor de Apps Script, con la cuenta del administrador. Leer en el **registro de ejecución** la clave de puesto generada. **No compartirla ni pegarla en el repositorio.** Guardarla en un administrador de contraseñas.
6. Implementar una **nueva versión** de la implementación web de Apps Script, conservando la misma URL `/exec` que usa la aplicación.
7. En la PC del taller, abrir NQN Service con una cuenta administradora. Ir a **Control de asistencia > Configuración de la computadora del taller > Vincular esta PC** y pegar la clave creada en el paso anterior.
8. Comprobar que el botón **Actualizar** muestra “Datos actualizados desde el servidor”, y probar una entrada y una salida con un empleado de prueba. Desde otro navegador sin clave, los fichajes deben ser rechazados.
9. Comprobar que el reporte mensual del empleado no muestra los registros de otros en la interfaz y que las correcciones sólo aparecen tras validar un PIN de administrador.
10. Recién luego comunicar el procedimiento de fichaje a los empleados. No dejar la computadora sin bloquear cuando esté desatendida.

## Archivo central `codigo.gs` en GitHub

Este repositorio contiene una clave de sincronización histórica dentro de `codigo.gs`. Por seguridad, **no se hizo reemplazo masivo de ese archivo** para implementar asistencia. Los dos hooks anteriores deben agregarse manualmente en el Apps Script real. También sería recomendable migrar esa clave existente a Script Properties y rotarla en una tarea independiente.

## Limitaciones que no se deben ocultar

La “PC autorizada” se identifica por una clave privada guardada en ese navegador. **No es un bloqueo físico imposible de copiar**: un usuario avanzado con acceso a esa PC puede extraer la clave. El modelo actual de PIN de la aplicación tampoco constituye una identidad laboral fuerte. Para decisiones salariales o exigencias legales, contrastar con supervisión y consultar la normativa aplicable.

El reporte considera lunes a viernes; **feriados, licencias, vacaciones y turnos especiales** se deben revisar manualmente. Los registros no se transfieren al cierre Z ni se tratan como pagos o deducciones. La hoja `ASISTENCIA` reside en el Spreadsheet central, pero no está todavía incluida en los backups de archivos JSON del sistema antiguo.

## Pruebas de aceptación

| Caso | Resultado esperado |
| --- | --- |
| Entrada 27/10 a las 09:20 | 20 min tarde con horario anterior |
| Entrada 28/10 a las 08:30 | 0 min de tardanza |
| Entrada 28/10 a las 08:39 | 0 min de tardanza |
| Entrada 28/10 a las 08:45 | 0 min de tardanza |
| Entrada 28/10 a las 08:46 | 16 min de tardanza, etiqueta roja |
| Salida 28/10 a las 16:01 | 29 min anticipados |
| Salida 28/10 a las 16:30 | 0 min anticipados |
| Ingreso 08:30, salida 17:15 el 28/10 | 45 min extra; 0 min anticipados |
| Ingreso 09:00, salida 17:15 el 28/10 | 30 min tarde y 45 min extra, sin compensación |
| Ingreso 16:45, salida 17:15 el 28/10 | 30 min extra, tiempo real trabajado |
| Sólo salida 17:15 sin ingreso registrado | 0 min extra; fichaje incompleto |
| Ingreso 08:30 sin salida registrada | 0 min extra; fichaje incompleto |
| Mes con entrada 08:39 y salida 16:01 el 28/10 | 0 tardanzas; 29 min de salida anticipada, sólo en su fecha |
| Final de tabla de historial | Resumen mensual debajo, totales independientes |
| Segunda entrada mismo día | Rechazada por servidor |
| Salida sin ingreso | Rechazada por servidor |
| Celular o PC no autorizada | Sin fichaje |
| Sin conexión de red | Sin fichaje, sin confirmación falsa |
| Corrección con admin PIN y motivo | Fichaje original conservado + ajuste auditable |
| Empleado consulta reporte | Sólo su ficha visible en interfaz |
| Cierre de mes | Total tardanzas, retiros anticipados y horas extras por separado (cantidad de días y tiempo total) |
| Exportación del reporte | Resumen al inicio, detalle diario con columna Horas extras, opción Guardar como PDF y orientación horizontal A4 |
