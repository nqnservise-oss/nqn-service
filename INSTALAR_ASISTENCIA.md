# Control de asistencia - NQN Service

Estado: **implementado en la rama de revisión; todavía NO publicado ni activado en el servidor**.

## Reglas confirmadas

- Jornada de lunes a viernes: 09:00 a 17:00 (días sin fichaje = pendientes de revisión, no ausencias automáticas).
- Tolerancia de ingreso hasta 09:15 inclusive.
- A partir de las 09:16, la tardanza cuenta desde las 09:00: 09:20 = 20 minutos.
- Salida anterior a las 17:00: todos los minutos anticipados.
- Sumatoria mensual por empleado; reporte imprimible / Guardar como PDF.
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
| Entrada 09:00 | 0 min de tardanza |
| Entrada 09:15 | 0 min de tardanza |
| Entrada 09:16 | 16 min de tardanza |
| Entrada 09:20 | 20 min de tardanza |
| Salida 16:40 | 20 min anticipados |
| Salida 17:00 | 0 min anticipados |
| Segunda entrada mismo día | Rechazada por servidor |
| Salida sin ingreso | Rechazada por servidor |
| Celular o PC no autorizada | Sin fichaje |
| Sin conexión de red | Sin fichaje, sin confirmación falsa |
| Corrección con admin PIN y motivo | Fichaje original conservado + ajuste auditable |
| Empleado consulta reporte | Sólo su ficha visible en interfaz |
| Cierre de mes | Total tardanzas y retiros anticipados por separado y total general |
