# BamarDev — App web

Punto de venta e inventario en el navegador, sobre el mismo backend
multi-tenant que usa la app Android. Es la app del **negocio** (vender, caja,
inventario, reportes); la administración comercial de BamarDev vive aparte en
`bamardev-web-licencia`.

## Correr en local

```bash
npm install
npm run dev        # http://localhost:5173
```

En desarrollo el API se consume **por el proxy de Vite**: el cliente pega a
`/api` y Vite lo reenvía a QA. Es a propósito — `CORS_ORIGINS` del VPS no
incluye `localhost`, así que una llamada directa la bloquearía el navegador.
Los builds sí pegan directo, con la URL de `VITE_API_URL`.

Para entrar hace falta el **alias del negocio** además de usuario y clave: el
mismo `admin` existe en varios negocios y sin alias el backend no sabe a cuál.

## Ambientes

| | QA | PROD |
|---|---|---|
| App | `app-qa.bamardev.com` | `app.bamardev.com` |
| API | `api-qa.bamardev.com/api` | `api.bamardev.com/api` |

`push a dev` despliega QA y `push a main` despliega PROD, igual que el panel.
Los tests corren en Actions antes de desplegar.

> Al publicar un dominio nuevo hay que agregarlo a `CORS_ORIGINS` en
> `/opt/stack/.env` del VPS, o el navegador bloqueará las llamadas.

## Comandos

```bash
npm run dev        # desarrollo con proxy a QA
npm run build:qa   # build apuntando a QA
npm run build      # build apuntando a PROD
npm test           # tests unitarios
npm run lint
```

## Cómo está armado

```
src/
  lib/api.ts        cliente del API y manejo de errores
  lib/permisos.ts   qué ve cada quien (rol ∩ plan)
  lib/format.ts     moneda, fechas y números
  components/       piezas compartidas de UI
  pages/pos/        punto de venta, caja, entregas y fiado
  pages/inventario/ catálogo, categorías, insumos, almacenes, movimientos
  pages/            usuarios, cuentas por cobrar, reportes
  pages/repartidor/ app de entregas
```

### Permisos

El backend expone dos vocabularios distintos y **no los cruza**:

- `usuario.modulos` — MAYÚSCULAS (`POS`, `CAJA`…): lo que la persona puede hacer.
- `negocio.features` — minúsculas (`pos`, `fiado`…): lo que el negocio compró.

La intersección se hace en el cliente (`lib/permisos.ts`), y las dos
comprobaciones **fallan abiertas**: si la lista viene vacía se muestra. Una
sesión vieja sin módulos se quedaría sin menú, y eso es peor que mostrar de
más — el backend igual responde 403 si de verdad no corresponde.

### Cosas del backend que conviene saber

- **El total lo calcula el backend** desde las líneas y exige que los pagos
  sumen exactamente eso. No hay campo de descuento, y la tarifa de envío va
  aparte: no entra en el total de la venta.
- **Las formas de pago se resuelven por nombre**, no por id: los ids son
  autoincrementales por negocio.
- **Al editar un usuario**, los campos opcionales que se quieren borrar van
  como cadena vacía, no como `null`.
- **El token dura 7 días y no hay refresh**: al vencer se vuelve al login.
- Un **403 con `codigo: LICENCIA_*`** puede llegar en cualquier request, no
  sólo en el login: el backend revalida la vigencia en cada llamada.

## Diseño

Sale del HTML `Sistema JAUSI - Inventario y POS (offline).html` de la raíz del
repo padre; sus fuentes editables están en `jausi-src/`.
