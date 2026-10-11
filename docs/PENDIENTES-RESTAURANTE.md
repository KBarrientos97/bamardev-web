# Pendientes del restaurante

Lo que el sistema del restaurante todavía no tiene y quedó decidido postergar.
Se anota acá para no perderlo; se hace cuando Kevin lo prioriza.

---

## 1. Transferir mercadería entre sucursales

**Anotado:** 4-oct-2026.

**Qué es:** mandar stock de un local (o del depósito central) a otro, en un solo
movimiento que al aprobarse saca de un lado y pone en el otro.

**Cómo está hoy:**

| Parte | Estado |
|---|---|
| Servidor | **Listo.** Crea, edita (también el destino, desde `fd7b812`), aprueba y anula transferencias, con bitácora en las dos sucursales. Tiene e2e en `sucursales.e2e-spec.ts`. |
| Web de farmacia | **Listo** (`28f3c6f`): pantalla `src/pages/farmacia/FormTransferencia.tsx`. |
| Web del restaurante | **No tiene.** La opción "Transferencia" del formulario de Movimientos nunca funcionó (no pedía destino y el servidor la rechazaba siempre); se sacó el 4-oct (`22e6da9`). |
| App Android | **No tiene, y no entiende las transferencias.** |

**Por qué se postergó:** la app Android todavía no sabe qué es una
transferencia. Si se cargaran desde la web del restaurante:

- La app la **mostraría como una Entrada** (verde, como si sumara stock):
  `tipoMovApiACodigo` en `data/remote/dto/MovimientoDto.kt` manda todo lo que no
  es SALIDA ni AJUSTE a `"E"`.
- **Editar desde la app una transferencia pendiente la rompe:**
  `DetalleMovimientoFragment.kt` arma la edición con `tipoApi = if (ENTRADA) "E"
  else "S"` y la manda como entrada; el servidor la convierte en una entrada
  común y la mercadería deja de viajar.

Aprobar y anular desde la app sí funcionan bien (no dependen del tipo).

**Orden para hacerlo:**

1. **App Android primero:** mostrar la transferencia como tal ("Centro →
   Equipetrol", el destino viene en `almacenDestino` del servidor) y no dejar
   editarla desde la app (aprobar y anular, sí).
2. **Después la web del restaurante:** la misma pantalla de farmacia adaptada al
   rubro (sin lotes, con insumos y sus unidades).

**Antes de arrancar, confirmar:** que algún restaurante que use el sistema tenga
más de un local o un depósito central. Con un solo local, transferir no sirve.

---

## 2. Movimientos en la web con el diseño de farmacia

**Anotado:** 4-oct-2026. **Estado:** Kevin lo va a conversar con Gerardo; por
ahora la web del restaurante queda con su diseño (modal).

**La idea:** que "Nuevo" y "Editar" de Movimientos sean, en la web del
restaurante, como el Ingreso/Salida de farmacia: pantalla completa, botones
grandes Entrada/Salida, renglones en tabla y Cancelar · Guardar · Guardar y
aprobar. La app Android queda como está.

**A tener en cuenta si se hace:**

- **Guardar dejaría el movimiento pendiente.** Hoy la web del restaurante
  aprueba sola al guardar (sin el extra "Aprobar movimientos"); con el diseño de
  farmacia sería Guardar / Guardar y aprobar, igual que la app.
- **No copiar los motivos de salida de farmacia sin decidirlo antes.** El motivo
  ("Vencimiento", "Producto dañado", "Robo / pérdida") decide qué se resta como
  merma en el Estado de resultado (`reportes/mermas.ts` del backend). Las salidas
  del restaurante hoy son texto libre y no restan: casi siempre son insumos para
  la cocina, que ya están en el costo del plato. Si se agregan motivos, hace falta
  uno como "Uso en cocina" que no reste.
- Sin lote ni ubicación (estante) ni lista de proveedores: son de farmacia.
- Con productos e insumos y el buscador del restaurante (`ElegirArticulo.tsx`).
