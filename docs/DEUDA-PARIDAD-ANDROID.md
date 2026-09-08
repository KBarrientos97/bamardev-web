# Deuda de paridad con Android

Diferencias detectadas mirando la app al lado de la web. Se anotan acá cuando
aparecen para no perderlas, y se resuelven cuando el usuario las prioriza.

Estado: **1 y 2 hechos** (en el POS y en la carta del mesero), **3 pendiente**.

Referencia visual en [referencia-android/](referencia-android/).

---

## 1. ~~La selección de productos en el POS no se siente igual~~ ✅ HECHO

**Dónde**: Punto de venta, la grilla de productos.
Captura: `referencia-android/pos-seleccion-productos.png`

En Android, tocar un producto lo suma y la tarjeta **cambia de estado a la
vista**; en la web hoy no hay nada de eso.

Lo que falta, según `item_producto_pos.xml` (los estados los describe el propio
comentario del layout):

- **Normal**: borde gris claro (`bg_pos_card`).
- **En el carrito**: `bg_pos_card_selected` — **borde verde + fondo verde
  claro** — y aparece un **stepper embebido en la tarjeta**, debajo del precio.
- **Sin stock**: `alpha 0.5`, badge rojo "Sin stock" y click deshabilitado.

El stepper es una píldora de alto 36 dp con `−` / cantidad / `+`, y **en la
última unidad el `−` se convierte en un tacho rojo** — avisa que el próximo
toque saca el producto del pedido, no que lo baja a cero.

En la captura se ve con "Brasa cuarto" en 3 (muestra `−`) y "Brasa económico"
en 1 (muestra el tacho).

## 2. ~~El botón flotante del carrito no se ve así en la web~~ ✅ HECHO

**Dónde**: Punto de venta, abajo y centrado.
Misma captura que el punto 1.

Android tiene una **píldora flotante** (`fragment_pos.xml`, `fab_carrito`):

```
[icono carrito] [badge circular con el contador] [total grande]
```

- Alto 56 dp, fondo primario, elevación grande, centrada abajo con margen `lg`.
- **Oculta mientras el carrito está vacío** — no ocupa lugar hasta que hay algo.
- En la captura: carrito · `4` · **Bs 96.00**.

El comentario del layout explica por qué reemplazó a la barra inferior fija:
la barra ocupaba una franja aunque no hubiera nada cargado, y su botón mandaba
a cocina de una — un toque de más al lado del de revisar, con la comanda
todavía sin mirar.

## 3. El Historial del día no muestra las cuentas por cobrar

**Dónde**: POS → Historial del día.
Captura: `referencia-android/historial-cuentas-por-cobrar.png`

Verificado: `PantallaHistorial.tsx` no tiene **nada** de créditos. En Android,
debajo de los tres KPIs (`TOTAL DEL DÍA`, `VENTAS`, `TICKET PROM.`) va:

**Tarjeta ámbar `CUENTAS POR COBRAR`** (clickable, con `›` a la derecha):
- Monto grande: total por cobrar (en la captura, `Bs 773.00`).
- Sub-línea: `{n} créditos abiertos · {x} vencido · {y} fiado en tu turno`.
  El último dato es `historial_cxc_fiado_turno` — lo que fió **este** cajero en
  **su** turno, que es lo que le toca explicar al cerrar.

**Sección `COBRAR HOY O YA VENCIDOS`** con un link `Ver todos` a la derecha, y
una lista de tarjetas por crédito:
- Avatar con las iniciales del cliente, tintado por estado.
- Nombre + monto a la derecha, y un **badge**: `Vencido` (rojo) / `Abonado`
  (ámbar) / `Pendiente` (azul).
- `{código} · {n} art.`
- **Barra de progreso** de lo abonado sobre el total.
- Pie: a la izquierda `Atrasado {n} días · {fecha}` (en rojo) o
  `Vence en {n} días · {fecha}`; a la derecha `Abonado {monto}`.

Los datos ya existen en el backend (`/creditos` los devuelve con `saldo`,
`vencido`, `diasAtraso` y `diasParaVencer`), así que **es trabajo de web
solamente**.
