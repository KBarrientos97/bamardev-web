# Panel de meseros en la web — 08-sep-2026

Portado todo lo de `feature/panel-meseros` de Android (18 commits, 136
archivos), probado contra el backend real de QA con el negocio 6.

**19 commits en `dev`.** `main` sin tocar. Lint sin errores, 138 tests.

---

## Qué se hizo

### Panel del mesero (rol MESERO)

Entra directo a `/salon` con sus tres pestañas y **sin barra lateral**, igual
que `MeserosActivity` es una activity aparte en Android. No tiene POS ni caja:
*"el mesero no cobra"*.

| Pantalla | Qué hace |
|---|---|
| **Salón** | Plano de mesas con sus estados, KPIs, filtros por zona y "Mis mesas" |
| **Abrir mesa** | Stepper de 56px, atajos de grupo, referencia, unir/separar y reservar |
| **Tomar pedido** | La carta con el stock real, stepper embebido y píldora del carrito |
| **Carrito** | Cantidades, 8 indicaciones rápidas y campo libre |
| **Detalle de mesa** | Consumo, comandas agrupadas, y el pie que cambia según el estado |
| **Acciones** | Pasar, juntar, quitar un producto con motivo, y reservas |
| **Por servir** | Lo que falta llevar, de todas las mesas |
| **Mi turno** | Cobrado, mesas, comensales, propinas y cerrar turno |

### Administración (ADMIN)

- **Mesas del salón** en el menú lateral: alta, edición, zonas y "fuera de
  servicio".
- **Reporte "Ventas por mesero"**.

### Caja (CAJERO)

- **Mesas por cobrar** en el POS, con el cobro cableado: el total sale del
  consumo que cargó el mesero.

### Deuda de paridad — los tres puntos resueltos

1. La tarjeta del POS ahora muestra **borde verde y stepper embebido** cuando
   el producto está en el carrito, con el tacho en la última unidad.
2. El carrito del POS es una **píldora flotante** en vez de una barra.
3. El **Historial del día** muestra las cuentas por cobrar.

---

## Verificado en QA

El ciclo completo, contra el backend real:

```
mesero abre M1 (2 personas, "QA-PRUEBA mesero")
  → carga 2× Brasa cuarto con "Sin sal"
  → manda a cocina            → comanda C-027 guardada
  → "Ya lo llevé a la mesa"   → se habilita la cuenta
  → pide la cuenta            → la mesa pasa a CUENTA
caja ve "Mesas por cobrar (1)" con Bs 52,00
  → cobra con Bs 60           → venta V-000016, cambio Bs 8,00
  → la mesa queda PAGADA con su comprobante
mesero ve "Tocá para liberar"
  → libera                    → salón limpio, 9 de 9 mesas libres
```

Sin errores de consola en ningún paso.

## Bugs encontrados y corregidos

**Contrato del backend, comprobado contra respuestas reales:**

- Los ítems de comanda llegan como `{"id":"45","nombre":"Brasa cuarto",...}` —
  `nombre` y no `producto`, `enviadaEn` y no `creadaEn`, ids como string, **sin
  `subtotal`** (se calcula). Lo anulado viaja en su propia lista. Sin esto el
  detalle mostraba filas vacías y Bs 0.
- `mesasSinCerrar` es un array de **strings** (`["M1"]`). El aviso de "Mi
  turno" decía *"Te quedan: ."*
- `/salon/por-cobrar` devuelve **mesas completas**, no un resumen.
- El tipo `Credito` declaraba `diasVencido`, que no existe; el backend manda
  `diasAtraso` y `diasParaVencer`.

**Propios:**

- El total de la mesa había quedado en la pantalla de *entrega* en vez de la de
  *cobro*: al cobrar decía Bs 0,00.
- "Vender a crédito" aparecía al cobrar una mesa, pero ese flujo arma la venta
  desde el carrito, que ahí está vacío.

## Diferencias con Android corregidas

Salieron de comparar pantalla a pantalla:

- La mesa **PAGADA** muestra "Tocá para liberar" en vez del monto.
- La tarjeta de una mesa **RESERVADA** incluye cuánta gente viene.
- En el pie, si la mesa no es mía van las **iniciales del mesero** que la
  atiende.
- La pestaña "Por servir" lleva un **badge con el contador**.

Los textos de las 10 pantallas se compararon uno a uno contra `strings.xml`.

## Lo que quedó fuera

**Offline.** El panel de Android trabaja sin señal con una cola local que sube
cuando vuelve el wifi. La web no — es la misma deuda que ya tenía el POS, y la
pieza que la desbloquea (`clienteRequestId`) ya está en los endpoints.

## Estado de QA

Limpio. Los artículos `QA-PRUEBA-` se borraron y el salón quedó con sus 9 mesas
libres. La caja 55 sigue abierta, de la sesión anterior.
