import { useState } from "react";
import { Icon, type NombreIcono } from "../../components/Icon";
import { aCentavos } from "../../lib/dinero";
import { fmtCantidad, fmtMoney } from "../../lib/format";
import type { ReporteCierreProductos } from "../../types";
import {
  redondearCantidad,
  renglonesVisibles,
  renglonVendido,
  separarTiempoDeMesa,
  textoCantidadPorPrecio,
  textoMesasCobradas,
  textoProductos,
  textoUnidades,
  type RenglonVendido,
} from "./productosVendidos";

/**
 * Lo que se vendió en un turno, por categoría y producto: las unidades, lo
 * recaudado y cada producto con su cantidad, su precio y su total. Ya viene
 * agrupado y ordenado del backend.
 *
 * Lo usan el cierre de caja (el modal "Productos vendidos", en todos los
 * rubros), Reportes › Cierres y Supervisión del billar ("Lo que salió en el
 * turno"): es el mismo número en todos lados.
 *
 * Cantidades sin ",00" y plata siempre con sus centavos: "3 u × Bs 10,00"
 * (Kevin, 25-oct). El ajuste de ese mismo día había sacado los ceros también
 * de la plata ("Bs 50" debajo de un KPI de "Bs 50,00") y los demás rubros
 * seguían con "4,00 unidades".
 *
 * El billar cobra el tiempo jugado como un producto más ("Tiempo de mesa"):
 * acá va aparte, arriba, y no cuenta como unidades (ver `separarTiempoDeMesa`).
 *
 * `limite`: cuántos productos se ven de entrada; el resto con "Ver los N". En
 * Supervisión la tarjeta crecía sin tope en el celular y empujaba las mesas,
 * que es lo que se vigila, más de una pantalla y media abajo. Sin `limite`
 * (el modal del cierre, que tiene su propio scroll) se ven todos.
 */
export default function ListaProductosVendidos({ d, limite }: { d: ReporteCierreProductos; limite?: number }) {
  const { tiempo, productos } = separarTiempoDeMesa(d);
  const hayProductos = productos.lineas > 0;
  return (
    <div className="@container space-y-3">
      {(tiempo || hayProductos) && (
        <div className="divide-y divide-borde rounded-xl bg-muted text-[13px]">
          {tiempo && <Resumen icono="clock" texto={`Tiempo de mesa · ${textoMesasCobradas(tiempo.mesas)}`} total={tiempo.total} />}
          {hayProductos && (
            <Resumen texto={`${textoUnidades(productos.unidades)} · ${textoProductos(productos.lineas)}`} total={productos.total} />
          )}
        </div>
      )}
      {hayProductos ? (
        <TablaDeProductos
          limite={limite}
          grupos={productos.categorias.map((c) => ({
            clave: c.nombre,
            nombre: c.nombre,
            unidades: c.unidades,
            total: c.total,
            renglones: c.items.map(renglonVendido),
          }))}
        />
      ) : (
        tiempo && <p className="text-[13px] text-texto-3">Ningún producto: sólo tiempo de mesa.</p>
      )}
    </div>
  );
}

/**
 * La misma lista sin categorías: lo que van pidiendo las mesas y cuentas
 * abiertas en la Supervisión del billar. El mismo renglón que lo ya cobrado,
 * para que las dos columnas se lean igual (antes una decía "3 × Bs 10" y la
 * otra "3 u", sin precio).
 */
export function ListaDeProductos({ renglones, limite }: { renglones: RenglonVendido[]; limite?: number }) {
  const unidades = redondearCantidad(renglones.reduce((t, r) => t + r.cantidad, 0));
  const total = aCentavos(renglones.reduce((t, r) => t + r.total, 0));
  return (
    <div className="@container space-y-3">
      <div className="rounded-xl bg-muted text-[13px]">
        <Resumen texto={`${textoUnidades(unidades)} · ${textoProductos(renglones.length)}`} total={total} />
      </div>
      <TablaDeProductos limite={limite} grupos={[{ clave: "todos", unidades, total, renglones }]} />
    </div>
  );
}

function Resumen({ icono, texto, total }: { icono?: NombreIcono; texto: string; total: number }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5 text-texto-2">
        {icono && (
          <span className="shrink-0 text-texto-3">
            <Icon name={icono} size={14} />
          </span>
        )}
        <span>{texto}</span>
      </span>
      <span className="shrink-0 font-bold tabular-nums text-texto">{fmtMoney(total)}</span>
    </div>
  );
}

/**
 * Las columnas. Angosto (el celular, el modal en el celular, una de las dos
 * columnas de Supervisión): el nombre y el total, con "3 u × Bs 10,00" abajo
 * del nombre. Desde 448 px de lista (@md: el modal del cierre en la compu, la
 * tarjeta de Supervisión a 1280 con el menú abierto): Producto · Cant. ·
 * Precio · Total. Es por el ancho de la LISTA y no de la pantalla: con
 * `lg:` a 1280 cada columna de Supervisión quedaba en ~245 px y los nombres se
 * cortaban en "PACEÑA BOT…". Anchos fijos para que las cifras queden
 * alineadas entre renglones y categorías, que son grillas distintas.
 */
const COLUMNAS = "grid-cols-[minmax(0,1fr)_auto] gap-x-3 @md:grid-cols-[minmax(0,1fr)_3rem_6rem_6.5rem]";

interface Grupo {
  clave: string;
  /** Sin nombre no lleva encabezado (lo pedido en las mesas no tiene categorías). */
  nombre?: string;
  unidades: number;
  total: number;
  renglones: RenglonVendido[];
}

function TablaDeProductos({ grupos, limite }: { grupos: Grupo[]; limite?: number }) {
  const [todos, setTodos] = useState(false);
  const porGrupo = grupos.map((g) => g.renglones.length);
  const recorte = renglonesVisibles(porGrupo, limite);
  const visibles = todos ? porGrupo : recorte.visibles;
  const cuantos = porGrupo.reduce((t, n) => t + n, 0);
  return (
    <div>
      {/* Los títulos son de las columnas que se ven con ancho; para el lector de
          pantalla cada renglón ya dice "3 u × Bs 10,00" (ver Renglon). */}
      <div
        aria-hidden
        className={`hidden ${COLUMNAS} mb-1.5 border-b border-borde-soft pb-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3 @md:grid`}
      >
        <span>Producto</span>
        <span className="text-right">Cant.</span>
        <span className="text-right">Precio</span>
        <span className="text-right">Total</span>
      </div>

      <div className="space-y-3">
        {grupos.map((g, i) =>
          visibles[i] > 0 ? (
            <div key={g.clave}>
              {g.nombre && <EncabezadoGrupo g={g} />}
              <ul className="divide-y divide-borde-soft">
                {g.renglones.slice(0, visibles[i]).map((r) => (
                  <Renglon key={r.clave} r={r} />
                ))}
              </ul>
            </div>
          ) : null,
        )}
      </div>

      {recorte.ocultos > 0 && (
        <button
          type="button"
          aria-expanded={todos}
          onClick={() => setTodos((v) => !v)}
          className="mt-1 inline-flex min-h-10 items-center gap-1.5 text-[13px] font-semibold text-primary-700 hover:underline"
        >
          <Icon name={todos ? "arrowUp" : "chevronDown"} size={15} />
          {todos ? "Ver menos" : `Ver los ${cuantos} productos`}
        </button>
      )}
    </div>
  );
}

/** La categoría: con ancho, sus unidades caen en la columna "Cant." y su total en "Total". */
function EncabezadoGrupo({ g }: { g: Grupo }) {
  return (
    <div className={`grid ${COLUMNAS} items-baseline border-b border-borde-soft pb-1`}>
      <h4 className="min-w-0 break-words text-[13px] font-bold text-texto">
        {g.nombre}
        <span className="font-normal text-texto-3 @md:sr-only"> · {fmtCantidad(g.unidades)} u</span>
      </h4>
      <span aria-hidden className="hidden text-right text-xs tabular-nums text-texto-3 @md:block">
        {fmtCantidad(g.unidades)}
      </span>
      <span aria-hidden className="hidden @md:block" />
      <span className="text-right text-xs font-semibold tabular-nums text-texto-2">{fmtMoney(g.total)}</span>
    </div>
  );
}

/**
 * Un producto. El nombre largo baja a un segundo renglón en vez de cortarse
 * ("PACEÑA BOT…" sin forma de leerlo entero); si pasa de dos, el nombre
 * completo queda en el `title`. "3 u × Bs 10,00" va abajo del nombre en
 * angosto y en las columnas con ancho; para el lector de pantalla queda
 * siempre el texto de abajo (las columnas se le esconden).
 */
function Renglon({ r }: { r: RenglonVendido }) {
  return (
    <li className={`grid ${COLUMNAS} items-baseline py-1.5 text-[13px]`}>
      <div className="min-w-0">
        <p className="line-clamp-2 break-words text-texto-2" title={r.nombre}>
          {r.nombre}
        </p>
        <p className="text-[12px] tabular-nums text-texto-3 @md:sr-only">{textoCantidadPorPrecio(r.cantidad, r.precio)}</p>
      </div>
      <span aria-hidden className="hidden text-right tabular-nums text-texto-2 @md:block">
        {fmtCantidad(r.cantidad)}
      </span>
      {r.precio == null ? (
        <span
          aria-hidden
          className="hidden text-right text-[12px] italic text-texto-3 @md:block"
          title="Se vendió a distintos precios en el turno: el total es la suma de cada venta."
        >
          varios precios
        </span>
      ) : (
        <span aria-hidden className="hidden text-right tabular-nums text-texto-3 @md:block">
          {fmtMoney(r.precio)}
        </span>
      )}
      <span className="text-right font-bold tabular-nums text-texto">{fmtMoney(r.total)}</span>
    </li>
  );
}
