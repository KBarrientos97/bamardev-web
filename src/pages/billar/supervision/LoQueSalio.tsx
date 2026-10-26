import { Fragment, type ReactNode } from "react";
import { esPositivo } from "../../../lib/dinero";
import { fmtMoney } from "../../../lib/format";
import type { ReporteCierreProductos } from "../../../types";
import ListaProductosVendidos, { ListaDeProductos } from "../../pos/ListaProductosVendidos";
import { Circulo } from "../ui";
import { cuentaDelPorCobrar, type DesglosePorCobrar, type PedidoEnCurso } from "./Supervision.datos";

// ── Lo que salió en el turno ────────────────────────────────────────────────

/** Cuántos productos se ven de entrada de cada lado; el resto, con "Ver los N". */
const DE_ENTRADA = 6;

/**
 * Lo que salió en el turno (25-oct): lo ya cobrado, por categoría y producto,
 * y lo que van pidiendo las mesas y cuentas que siguen abiertas. Es para ver,
 * sin abrir cada mesa, qué salió y qué va saliendo.
 *
 * "Ya cobrado" es lo vendido en el turno en TODAS las cajas del local (el
 * backend lo arma con el filtro del KPI "Vendido en el turno"), así que su
 * total es ese número. Lo pedido en las mesas abiertas no es lo que falta
 * cobrar: la columna decía "sin cobrar" y listaba como deuda lo que el cliente
 * ya había adelantado. El pie hace la cuenta hasta el KPI "Por cobrar" (tiempo
 * + consumos − adelantado), que en la pantalla no se podía reconstruir.
 *
 * El diseño (Kevin, 25-oct): el mismo renglón en las dos columnas ("3 u × Bs
 * 10,00"); dos columnas sólo si las dos tienen algo y la TARJETA es ancha (con
 * el menú y la actividad al costado, a 1280 px mide ~556 px: van una debajo de
 * la otra); y un lado vacío es una línea chica, no media tarjeta en blanco.
 */
export function TarjetaLoQueSalio({
  productos,
  enCurso,
  porCobrar,
  verEnCurso,
}: {
  productos: ReporteCierreProductos;
  /** Lo que van pidiendo las mesas y cuentas abiertas (`consumosEnCurso`). */
  enCurso: PedidoEnCurso[];
  /** Cómo se llega al KPI "Por cobrar" (`desglosePorCobrar`, con las mismas vistas que el KPI). */
  porCobrar: DesglosePorCobrar;
  /**
   * Si la caja del turno está abierta (`seVeLoPedido`). Las mesas abiertas son
   * de ahora: en un turno cerrado no hay ninguna de ese turno.
   */
  verEnCurso: boolean;
}) {
  const hayCobrado = productos.lineas > 0;
  const hayPedido = verEnCurso && enCurso.length > 0;
  const dosColumnas = hayCobrado && hayPedido;
  const conAdelanto = verEnCurso && esPositivo(porCobrar.pagado);
  const conPie = verEnCurso && (esPositivo(porCobrar.tiempo) || esPositivo(porCobrar.consumos) || esPositivo(porCobrar.pagado));
  // Sola, la lista no pasa de 768 px: en un monitor, a todo el ancho de la
  // tarjeta, el total quedaba a ~700 px del nombre.
  const tope = dosColumnas ? "" : "max-w-3xl";

  return (
    <section aria-label="Lo que salió en el turno" className="card @container overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde-soft px-4 py-3.5 sm:px-5">
        <Circulo icono="box" tono="gris" size={36} />
        <h2 className="min-w-[11rem] flex-1 text-[15px] font-bold text-texto">Lo que salió en el turno</h2>
        <p className="text-[12px] text-texto-3">
          <span className="font-semibold tabular-nums text-texto-2">{fmtMoney(productos.total)} cobrado</span>
          {/* El adelanto ya está en el cajón y no es una venta: sin esto, la
              plata que entró por mesas abiertas no aparecía en la tarjeta. */}
          {conAdelanto && ` · ${fmtMoney(porCobrar.pagado)} adelantado en mesas y cuentas abiertas`}
        </p>
      </header>

      <div className={`grid gap-x-6 gap-y-4 px-4 py-4 sm:px-5 ${dosColumnas ? "@3xl:grid-cols-2" : ""}`}>
        {hayCobrado ? (
          <Columna titulo="Ya cobrado" punto="bg-primary" className={tope}>
            <ListaProductosVendidos d={productos} limite={DE_ENTRADA} />
          </Columna>
        ) : (
          <LineaVacia>{verEnCurso ? "Todavía no se cobró nada en este turno." : "En este turno no se cobró nada."}</LineaVacia>
        )}
        {verEnCurso &&
          (hayPedido ? (
            <Columna titulo="Pedido en mesas y cuentas abiertas" punto="bg-amber-500" className={tope}>
              <ListaDeProductos
                limite={DE_ENTRADA}
                renglones={enCurso.map((p) => ({
                  clave: `p${p.productoId}`,
                  nombre: p.nombre,
                  cantidad: p.cantidad,
                  precio: p.precio,
                  total: p.total,
                }))}
              />
            </Columna>
          ) : (
            <LineaVacia>Nada pedido en mesas y cuentas abiertas.</LineaVacia>
          ))}
      </div>

      {conPie && <PieDelPorCobrar d={porCobrar} />}
    </section>
  );
}

function Columna({ titulo, punto, className, children }: { titulo: string; punto: string; className: string; children: ReactNode }) {
  return (
    <div className={`min-w-0 space-y-2.5 ${className}`}>
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${punto}`} />
        {titulo}
      </h3>
      {children}
    </div>
  );
}

/** Un lado sin nada: una línea a todo el ancho, no una columna punteada que deja media tarjeta en blanco. */
function LineaVacia({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-borde px-3.5 py-2.5 text-[13px] text-texto-3">{children}</p>;
}

/** La cuenta que lleva de lo pedido al KPI "Por cobrar": el mismo número, en ámbar como el KPI. */
function PieDelPorCobrar({ d }: { d: DesglosePorCobrar }) {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-borde-soft bg-slate-50/80 px-4 py-3.5 sm:px-5">
      <div className="min-w-0 flex-1 basis-56">
        <p className="text-[13px] font-bold text-texto">Por cobrar en mesas y cuentas abiertas</p>
        <p className="text-[12px] tabular-nums text-texto-2">
          {cuentaDelPorCobrar(d).map((parte, i) => (
            <Fragment key={parte}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">{parte}</span>
            </Fragment>
          ))}
        </p>
        {esPositivo(d.deMas) && (
          <p className="text-[12px] text-texto-3">{fmtMoney(d.deMas)} adelantados de más se devuelven al cerrar la mesa.</p>
        )}
      </div>
      <span className="text-[20px] font-extrabold tabular-nums text-amber-800">{fmtMoney(d.porCobrar)}</span>
    </footer>
  );
}
