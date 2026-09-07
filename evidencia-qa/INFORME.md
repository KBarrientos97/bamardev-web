# Pruebas funcionales en QA — 07-sep-2026

Probado contra `app-qa.bamardev.com` con el backend real de QA
(`api-qa.bamardev.com`), negocio **6 · Pollos Don Omar**, usuario `admin`.
Sin mocks: cada venta, cada cierre y cada artículo de acá quedó escrito en
`bamardev_qa`.

Alcance pedido: **login, ventas, registro de productos, apertura y cierre de
caja**. No se tocó PROD en ningún momento.

## Resultado

| Flujo | Estado |
|---|---|
| Login (sin alias / clave mala / correcto) | ✅ |
| POS: carrito, agrupado de líneas, Mesa/Llevar | ✅ |
| Cobro efectivo con cálculo de cambio | ✅ |
| Cobro por QR con confirmación manual | ✅ |
| Venta a crédito | ✅ |
| Límite de crédito + PIN de encargado | ✅ (con 1 bug, corregido) |
| Impresión del ticket (rollo 80 mm) | ✅ |
| Registro de artículos | ⚠️ (1 bug de backend) |
| Apertura de caja | ✅ |
| Cierre de caja con arqueo y corte de billetes | ✅ (con 1 bug, corregido) |

Sin errores de consola en ningún flujo.

## Bugs encontrados

### 1. El resumen del cierre mostraba "Efectivo contado Bs 0,00" — CORREGIDO

Al cerrar caja, el resumen decía Bs 0,00 y dejaba la hora de cierre en "—",
aunque el backend guardaba bien el monto (turno 52: `montoCierre` 683.5,
`montoDiferencia` 0).

La pantalla releía la caja con `/caja/actual`, que responde `{caja:null}` apenas
queda cerrada: caía siempre al fallback, que no tiene los montos. Ahora usa la
caja que devuelve el propio POST de cierre.

Commit `e48bc4c`.

### 2. Un ADMIN no podía autorizar un fiado sobre el límite — CORREGIDO

El diálogo de autorización esconde el campo "Usuario del encargado" cuando quien
está en la caja ya puede supervisar, pero mandaba igual el string vacío. El
backend lo rechazaba y el cajero veía, en pantalla y en inglés:

```
credito.autorizadorUsername must be longer than or equal to 3 characters
```

En QA **sólo el ADMIN tiene PIN** (los dos SUPERVISOR están inactivos), así que
era el único que podía autorizar — y no podía. Ahora firma con su propio
username; el mensaje de error ya sale en español.

Commit `7d81a84`.

### 3. El stock inicial de un artículo nuevo se pierde — SIN CORREGIR (backend)

Al crear un artículo con stock inicial, **el stock queda en 0 y no se registra
ningún movimiento de entrada**.

No es de la web: se capturó el `POST /productos` y el campo viaja bien.

```json
{"nombre":"QA-PRUEBA-Refresco2","precio":7.5,"tipoProducto":"ALMACENABLE",
 "costo":4,"stockMinimo":3,"categoriaId":31,"stockInicial":10}
```

El backend responde OK, crea el artículo y descarta el `stockInicial`.
Reproducido dos veces (ids 145 y 146); el último movimiento de inventario sigue
siendo el #43 del 02-sep.

**Queda pendiente**: es backend, y estaba fuera de alcance. El impacto es que
todo artículo nuevo arranca en cero y hay que cargarle el stock a mano por
Movimientos.

## Lo que quedó sin probar

- **Roles SUPERVISOR y REPARTIDOR**: las claves no son las del seed y probar a
  ciegas da 429. Sus pantallas no se ejercitaron.
- **PIN correcto del admin**: no es `1234`. Se verificó que el flujo bloquea y
  que el mensaje ahora es legible, pero no se completó un fiado autorizado.
- **Impresora térmica real**: la impresión se validó con el PDF que genera
  Chrome (80 mm, ver `ticket-rollo80.pdf`). El corte del rollo y la densidad
  sólo se confirman imprimiendo en la tienda.
- **Compartir por WhatsApp**: `navigator.share` con archivos necesita un móvil.

## Datos dejados en QA

Todo lo creado lleva el prefijo `QA-PRUEBA-` para poder borrarlo:

- Artículos **145** y **146** (`QA-PRUEBA-Refresco`, `QA-PRUEBA-Refresco2`).
- Turno **52** cerrado con nota `QA-PRUEBA cierre automatico 07-sep`.
- Turno **55** abierto con nota `QA-PRUEBA apertura automatica` (Bs 100).
- Ventas del turno 55 (efectivo, QR y un fiado a Omar).
- Cliente **David** (id 4) quedó con `limiteCredito = 30`, que antes era nulo —
  se le puso para poder probar el tope.

⚠️ **La caja 55 quedó abierta.**

## Evidencia

| Archivo | Qué muestra |
|---|---|
| `video-venta.gif` | Login → POS → carrito → cobro con cambio → recibo |
| `video-caja.gif` | Cierre con arqueo y corte billete por billete |
| `video-limite-credito.gif` | Fiado que pasa el techo → pide PIN |
| `video-producto.gif` | Alta de artículo con selector de íconos |
| `ticket-rollo80.pdf` | El ticket impreso en rollo de 80 mm |
| `ticket-carta.pdf` | El mismo ticket si lo mandan a hoja Carta |
| `capturas/` | 37 capturas paso a paso (no versionadas) |
