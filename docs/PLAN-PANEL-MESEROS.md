# Panel de meseros en la web

Portar a la web todo lo de `feature/panel-meseros` de Android (18 commits, 136
archivos), **igual en diseño y experiencia**. El backend ya está: las 19 rutas
de `/salon` están desplegadas en QA y el token del rol MESERO entra.

Referencia visual en [referencia-android/](referencia-android/).

---

## Cómo cambia la navegación según el rol

Esto es lo primero, porque define dónde vive cada pantalla.

### MESERO — panel propio, sin menú lateral

En Android el mesero **no ve el menú del admin**: `AuthenticationActivity` lo
manda a `MeserosActivity`, que tiene sus **3 tabs abajo** y nada más.

```
Salón          Por servir          Mi turno
```

El comentario del menú lo justifica: *"Las tres cosas que hace un mesero en un
turno: mirar el salón, llevar lo que está listo y ver cómo le fue. No hay una
cuarta a propósito — cada tab de más es un lugar donde buscar con las manos
ocupadas."*

Y el de la Activity: *"No tiene drawer ni caja: **el mesero no cobra**, así que
no hay nada de apertura/cierre de caja ni acceso al POS."*

**En la web**: el rol MESERO entra directo a `/salon` y ve una barra de 3
pestañas, sin la barra lateral. Ya está hecho (`rutaInicial` en `permisos.ts`,
con sus tests).

⚠️ El login del usuario `mesero` en QA llega con **`modulos: []`**, así que el
enrutado va por **rol**, no por módulos — igual que Android.

### ADMIN — "Mesas del salón" es un ítem más del menú lateral

Captura: `referencia-android/menu-admin-mesas.png`

En el drawer del admin, entre Inventario y Reportes:

```
Inventario          ← activo
Mesas del salón     ← el nuevo (icono de grilla 2x2)
Reportes
Ventas
Usuarios
─────────────
Cerrar Sesión
```

**En la web**: entrada nueva en la barra lateral, visible sólo para
ADMIN/SUPERVISOR (sección `mesas` en `permisos.ts`, ya definida).

### CAJERO — "Mesas por cobrar" dentro del POS

No es una sección del menú: es una pantalla del POS, porque la cuenta que el
mesero manda a caja la cobra el cajero desde ahí.

---

## Pantallas a construir

### A. Panel del mesero (rol MESERO)

| # | Pantalla | Qué es |
|---|---|---|
| A1 | **Salón** | El plano de mesas. KPIs, filtros por zona y "Mis mesas", grilla de tarjetas por estado. |
| A2 | **Abrir mesa** | Cuántas personas y a nombre de quién. Encadena con la carta. |
| A3 | **Tomar pedido** | La carta (`/salon/carta`) + carrito. Manda la comanda. |
| A4 | **Detalle de mesa** | Hoja con el consumo, las comandas y las acciones. El pie cambia según el estado. |
| A5 | **Por servir** | Lista de lo que falta llevar, de todas las mesas. |
| A6 | **Mi turno** | Cómo le fue: cobrado, mesas, comensales, propinas. Y cerrar turno. |

La especificación detallada de A2–A6 (textos exactos, estados, endpoints y los
comentarios de diseño de Android) está al final de este documento.

### B. Administración (rol ADMIN)

**B1. Mesas del salón** — captura: `referencia-android/admin-mesas-salon.png`

```
Mesas                                    [ + Nueva ]
9 en servicio · 48 lugares

┌─────────────────────────────────────────────────┐
│ ⓘ Las mesas se registran acá                    │
│   El mesero no crea mesas: sólo abre las que    │
│   registres y anota cuántas personas se sientan.│
│   Una mesa fuera de servicio desaparece de su   │
│   panel.                                        │
└─────────────────────────────────────────────────┘

┌────────┐ ┌────────┐ ┌────────┐
│   9    │ │   48   │ │   4    │
│En serv.│ │Lugares │ │ Zonas  │
└────────┘ └────────┘ └────────┘

🔍 Buscar mesa por nombre o código
( Todas ) ( Salón ) ( Terraza ) ( Barra ) ( Privado )

┌─────────────────────────────────────────────────┐
│ ▦  Mesa M1                                    › │
│    Salón                                        │
│    ┌──────────────┐ ┌──────────────┐            │
│    │ Capacidad    │ │ Zona         │            │
│    │ 6 personas   │ │ Salón        │            │
│    └──────────────┘ └──────────────┘            │
│    Disponible para el mesero               M1   │
└─────────────────────────────────────────────────┘
```

Textos exactos (de `strings.xml`):
- Título `Mesas`, botón `Nueva`, subtítulo `{n} en servicio · {m} lugares`
- KPIs: `En servicio` · `Lugares` · `Zonas`
- Buscador: `Buscar mesa por nombre o código`; filtro `Todas` + una por zona
- Pie de la tarjeta: `Disponible para el mesero` / `Oculta en el panel de meseros`
- Estado: `En servicio` / `Fuera de servicio`
- Vacío: `Todavía no hay mesas registradas. Tocá "Nueva" para cargar la primera.`
- Vacío con filtro: `No hay mesas que coincidan con la búsqueda.`
- Detalle: `Detalle de la Mesa` · `Datos que usa el panel de meseros`

**B2. Reporte de meseros** — `/reportes/meseros`, ya existe en el backend.

### C. Caja (rol CAJERO)

**C1. Mesas por cobrar** — `/salon/por-cobrar`, dentro del POS. La cuenta llega
del mesero y el cajero la cobra.

---

## Estado — TERMINADO

- [x] Tipos del salón (`src/types/salon.ts`)
- [x] Endpoints en el interceptor (`api.ts`)
- [x] Rol MESERO y secciones `salon` / `mesas` (`permisos.ts`)
- [x] **A1** Salón · **A2** Abrir mesa · **A3** Tomar pedido · **A4** Detalle
      (con las tres acciones del menú, el modo de quitar y las reservas) ·
      **A5** Por servir · **A6** Mi turno
- [x] **B1** Mesas del salón (admin) · **B2** Reporte de meseros
- [x] **C1** Mesas por cobrar (caja)
- [x] Los tres puntos de [DEUDA-PARIDAD-ANDROID.md](DEUDA-PARIDAD-ANDROID.md)

Verificado en QA contra el backend real: abrir mesa → mandar comanda →
marcarla servida → pedir la cuenta → la mesa llega a la cola del cajero.

Cuatro diferencias con Android salieron de comparar pantalla a pantalla y ya
están corregidas (ver el commit "Paridad con Android"). Los textos de las 10
pantallas se compararon uno a uno contra `strings.xml`.

### Lo que quedó fuera

- **Offline**: el panel de Android funciona sin señal con una cola local que
  sube cuando vuelve el wifi. La web no, igual que el resto de la app — es la
  misma deuda que ya estaba anotada para el POS.

---

## Reglas que no se pueden perder

Salen de los comentarios de Android y son decisiones ya tomadas:

- **El mesero no cobra.** Nada de POS, caja ni cobro en su panel.
- **Todo endpoint del salón devuelve la mesa entera**, no un "ok": el salón lo
  cambian varias personas a la vez, así que la pantalla se pinta con lo que
  quedó en el servidor y no con lo que la app supone.
- **Guard anti doble toque compartido**: *"un doble toque en 'Enviar a cocina'
  es un pedido cobrado dos veces."*
- **`clienteRequestId` en abrir mesa y en comanda**: el backend las dedupe.
- **Un estado de mesa desconocido se trata como LIBRE**: es el estado donde
  nada de lo que haga el mesero rompe algo.
- **Cada estado tiene UNA acción principal.** *"Ofrecer siempre las mismas
  cinco es lo que hace que alguien mande a caja una mesa vacía o libere una sin
  cobrar."*

---

## Paleta de estados de mesa

Los hex son los de `colors.xml`, y se nombran por el estado, no por el color.

| Estado | Texto | Color | Fondo | Borde |
|---|---|---|---|---|
| LIBRE | Libre | — | blanco | `#CBD5E1` punteado |
| OCUPADA | Ocupada | `#D97706` | `#FFFBEB` | `#FCD34D` |
| CUENTA | Por cobrar | `#DC2626` | `#FEF2F2` | `#FCA5A5` |
| PAGADA | Pagada | `#059669` | `#ECFDF5` | `#6EE7B7` |
| RESERVADA | Reservada | `#2563EB` | `#EFF6FF` | `#93C5FD` |

---

## Anatomía de la tarjeta de mesa

*"Está pensada para leerse de lejos y de reojo, caminando: primero el código (a
dónde ir), después el color (qué pasa ahí) y recién después los números."*

```
┌──────────────────────────┐
│ M1              [Ocupada]│  código grande + badge de estado
│ 👤 3/4                   │  gente / capacidad
│                          │
│ Bs 27.50                 │  consumo (oculto si está libre)
│ 1h 35m          Mi mesa  │  hace cuánto · de quién
│ + Tomar pedido           │  CTA sólo si está libre
└──────────────────────────┘
        ⓵ ← badge flotante: comandas por llevar
```

El alto es fijo para que la grilla no quede escalonada.

---

## Especificación detallada de A2–A6

> Lo que sigue lo relevó un agente leyendo los layouts y fragments de Android.
> Textos, estados y endpoints son exactos.

### Convenciones

- Moneda `Bs 27.50` (2 decimales); tiempos relativos `1h 36m`, `12m`.
- Chips: píldora, `maxLines=1`, alto cómodo — *"se tocan con el pulgar y con la
  otra mano ocupada."*
- Banners: info (azul), alerta (ámbar), bloqueo (amarillo).

### A2. Abrir mesa

*"Son dos datos: cuántos son y (opcional) a nombre de quién. La maqueta los
presentaba como 'Paso 1' y 'Paso 2'; acá van sin numerar, porque numerar dos
campos hace parecer un trámite lo que son diez segundos con el cliente parado
al lado."*

1. **Toolbar**: atrás · `Abrir {M1}` (o `M1 + M2` si está unida) · subtítulo
   `{zona} · {n} lugares` con **capacidadTotal**.
2. **Nota de la mesa** (banner info, si existe).
3. `¿CUÁNTAS PERSONAS SON?` → card con **stepper de 56 dp** (*"a 40dp se erraba
   el toque"*), número gigante, y chips de atajo `[1,2,4,6,8]` + capacidad.
   - Inicial **2** (*"el grupo más común en un resto bar"*), rango 1..30.
   - Si excede: banner ámbar `La mesa es para {n} personas. Podés seguir igual.`
     — **aviso, no bloqueo**.
4. `¿A NOMBRE DE QUIÉN? (OPCIONAL)` → input 60 chars, placeholder
   `Ej: Sr. Mamani, cumpleaños…`, ayuda `Sirve para encontrar la mesa cuando el
   salón está lleno.`
5. **Footer**: `Abrir y tomar pedido` (primario) · `Unir otra mesa` /
   `Separar las mesas` · `No están ahora · reservar`.

Al abrir con éxito **encadena directo con la carta**.

### A3. Tomar pedido + carrito

*"Tocar un producto lo suma directo: en el mostrador el mesero repite lo que el
cliente le canta, y pedir una confirmación por producto duplicaría los toques
del momento más rápido del turno."*

- Toolbar `Pedido · {mesa}` + badge con el total de ítems.
- Buscador `Buscar en la carta…` + chips de categoría (`Todos` primero).
- **La misma grilla del POS**, 2 columnas, con el stepper embebido — ver el
  punto 1 de [DEUDA-PARIDAD-ANDROID.md](DEUDA-PARIDAD-ANDROID.md), que la web
  todavía no tiene ni en el POS.
- **FAB del carrito** flotante abajo, oculto si está vacío — ver el punto 2 de
  la misma deuda.
- Carrito (hoja): cada línea con su **id propio**, no por producto — *"el mismo
  plato puede ir dos veces con indicaciones distintas."* Stepper por línea, y
  en la última unidad el `−` se vuelve tacho.
- 8 indicaciones rápidas: `Sin cebolla`, `Sin sal`, `Sin picante`,
  `Para llevar`, `Poco cocido`, `Bien cocido`, `Aderezo aparte`, `Sin hielo`
  (colapsadas por defecto) + campo libre de 120 chars.
- Botón `Enviar a cocina · {total}` → `POST /salon/mesas/{id}/comandas`.
- Al enviar: vacía el carrito, avisa `Pedido enviado a cocina` y **vuelve al
  salón** (*"el mesero sigue con otra mesa, no se queda mirando la carta"*).

### A4. Detalle de mesa (hoja)

*"El pie cambia según el estado, y ese es el punto: en cada momento hay UNA
acción obvia y el resto pasa a segundo plano."*

- Cabecera: nombre + `{zona} · abierta hace {t}`, botón de menú y cerrar.
- Menú desplegable: `Pasar a otra mesa` · `Juntar con otra mesa` ·
  `Quitar un producto`.
- **Hero de consumo** (oscuro): `CONSUMO DE LA MESA` + monto + `{n} personas ·
  {m} ítems · {x} por persona`.
- **Comandas agrupadas** (no una lista plana): *"así es como vuelven: el mesero
  levanta del pase lo que salió junto."* Badge por estado: `En cocina` ·
  `Preparando` · `Listo para llevar` · `Servido` · `Anulado`.
  - La cantidad va en un cuadradito a la izquierda, *"alineadas verticalmente
    se cuentan de un vistazo"*; la nota en ámbar debajo.
  - Lo anulado se muestra **tachado, no se borra**, con `Anulado · {motivo}`.
  - Botón ancho al pie de cada comanda: `Ya lo llevé a la mesa`.

**El pie según el estado:**

| Estado | Primario | Secundario |
|---|---|---|
| OCUPADA sin consumo | `Agregar pedido` | `Liberar la mesa · nadie pidió nada` |
| OCUPADA con pendientes | `Agregar pedido` | `Pedir la cuenta` **apagado** + banner |
| OCUPADA lista | `Agregar pedido` | `Pedir la cuenta · pasar a caja` |
| CUENTA | `Agregar pedido` | — (banner: ya está en caja) |
| PAGADA | `Levantar y liberar la mesa` | — |
| RESERVADA | `Ya llegaron · abrir mesa` | `Cambiar la reserva` + `Anular reserva` |

Dos cosas frenan la cuenta: *"Sin nada pedido no hay cuenta que mandar: la
cajera perdería el viaje y la mesa quedaría trabada esperando un cobro de Bs 0.
Con pedidos todavía sin llevar, la cuenta se estaría cerrando con comida en
camino."*

### A5. Por servir

*"Es la lista de trabajo del mesero: mientras tenga algo acá, tiene algo que
hacer. Muestra las comandas de TODAS las mesas y no sólo las suyas — si un
compañero está en la cocina y el plato se enfría en el pase, el que pasa lo
lleva."*

- Header `Por servir` + `{n} pedidos para llevar a las mesas`.
- Fila: **badge cuadrado con el código de la mesa** (verde si está lista, ámbar
  si sigue en cocina), productos resumidos en una línea, meta
  `{zona} · {comanda} · hace {t}`, y botón `Servido` a la derecha —
  *"lejos del cuadro de la mesa, para que no se toque de paso."*
- Orden: primero lo listo, después lo más viejo.
- Vacío: `No hay nada esperando. Todo servido.`

### A6. Mi turno

*"El número grande es sólo lo cobrado. Lo que está en mesas abiertas va más
abajo y aparte: todavía puede cambiar y no entró a ningún cajón. Mezclarlos es
exactamente el error que hubo que corregir cuatro veces en el cierre de caja."*

- Hero: nombre, `{turno} · desde {día y hora}`, monto gigante y el kicker
  **`COBRADO EN MI TURNO`**.
- 3 KPIs: `Mesas cerradas` (verde) · `Abiertas ahora` (ámbar) · `Comensales`.
- `{monto} · Ticket promedio`.
- `PROPINAS DEL TURNO` — **oculto si es 0** (*"una tarjeta grande en Bs 0 le
  recuerda al mesero lo que no ganó"*).
- `{monto} en mesas abiertas` + `Todavía sin cobrar en caja`.
- `MESAS QUE CERRÉ HOY` con el historial.
- `Cerrar mi turno`: **apagado** si le quedan mesas, con el banner que las
  nombra — *"sin los códigos, el mesero tiene que recorrer el salón adivinando
  cuáles son suyas."* Al confirmar: `POST /salon/turno/cerrar` → avisa
  `Turno cerrado. ¡Buen descanso!` y cierra sesión.
