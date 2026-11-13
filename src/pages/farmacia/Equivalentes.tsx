import { Cargando, ErrorMsg } from "../../components/ui";
import { fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Producto } from "../../types";
import {
  drogaDe,
  ordenarEquivalentes,
  pedirEquivalentes,
  textoStock,
  tienePrincipioActivo,
} from "./buscarEquivalentes";
import { concentracionAparte } from "./medicamento";
import { sePuedeVender } from "./ventaFarmacia";

/**
 * El panel de equivalentes: los otros medicamentos con la misma droga y la
 * misma concentración, con el precio y el stock de la sucursal, para
 * contestar "no hay BAGÓ, hay INTI a Bs 0,45" sin buscar a mano (#11).
 *
 * Es una pieza y no una pantalla porque la pregunta aparece en tres lugares
 * distintos: en la tarjeta agotada del punto de venta, en la ficha del
 * mostrador y en la ficha del catálogo. Las tres muestran lo mismo; sólo
 * cambia si desde ahí se puede vender (`onAgregar`).
 *
 * Pide la lista al montarse. Sin principio activo en la ficha no pide nada:
 * el backend devolvería vacío y "no hay otro" sería mentira — lo que no hay
 * es el dato, y se dice eso.
 */
export function Equivalentes({
  producto: p,
  sucursalId = null,
  rotuloStock = null,
  onAgregar,
}: {
  producto: Producto;
  /** La sucursal de la caja: de ahí salen el stock y el precio de cada uno. */
  sucursalId?: number | null;
  /**
   * De qué local es ese stock, en palabras ("Equipetrol", "todo el negocio"):
   * quien atiende tiene que saber si "hay 12" es de su estante. Lo manda quien
   * sabe que hay 2+ locales; sin esto no se dice nada, como con un solo local.
   */
  rotuloStock?: string | null;
  /**
   * Sumar un equivalente a la venta. Sin esto no hay botón: la ficha del
   * catálogo (del dueño) no vende, y quien sólo consulta tampoco.
   */
  onAgregar?: (p: Producto) => void;
}) {
  const conDroga = tienePrincipioActivo(p);
  const pedido = useApi(
    () => (conDroga ? pedirEquivalentes(p.id, sucursalId) : Promise.resolve([])),
    [p.id, sucursalId, conDroga],
  );

  if (!conDroga) {
    return (
      <p className="text-[13px] text-texto-3">
        Sin principio activo en la ficha: cargalo para ver equivalentes.
      </p>
    );
  }

  const lista = ordenarEquivalentes(pedido.datos ?? []);

  return (
    <div className="space-y-2">
      <p className="text-[13px] text-texto-3">
        Mismo principio activo (<span className="font-semibold text-texto-2">{drogaDe(p)}</span>)
      </p>
      {rotuloStock && (
        <p className="text-xs text-texto-4">Stock y precio de {rotuloStock}</p>
      )}

      {pedido.cargando ? (
        <Cargando texto="Buscando equivalentes…" />
      ) : pedido.error ? (
        <ErrorMsg onReintentar={pedido.recargar}>{pedido.error}</ErrorMsg>
      ) : lista.length === 0 ? (
        <p className="text-[13px] text-texto-3">
          No hay otro con la misma droga y concentración.
        </p>
      ) : (
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
          {lista.map((e) => (
            <FilaEquivalente key={e.id} producto={e} onAgregar={onAgregar} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Un equivalente. Lo que lo distingue del que no hay es el laboratorio, así
 * que va destacado debajo del nombre; a la derecha lo que se le contesta al
 * cliente: cuánto sale y si hay.
 */
function FilaEquivalente({
  producto: e,
  onAgregar,
}: {
  producto: Producto;
  onAgregar?: (p: Producto) => void;
}) {
  const vendible = sePuedeVender(e);
  const stock = textoStock(e);
  const concentracion = concentracionAparte(e);

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5 ${
        vendible ? "" : "bg-muted/40"
      }`}
    >
      <div className="min-w-0 flex-1 basis-40">
        <p className={`truncate text-[13px] font-bold ${vendible ? "text-texto" : "text-texto-3"}`}>
          {e.nombre}
          {concentracion && <span className="ml-1 font-semibold text-texto-2">{concentracion}</span>}
        </p>
        <p className="truncate text-xs text-texto-3">
          <span className="font-semibold text-texto-2">{e.laboratorio || "Sin laboratorio"}</span>
          {e.formaFarmaceutica && ` · ${e.formaFarmaceutica}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[15px] font-extrabold ${vendible ? "text-primary-700" : "text-texto-3"}`}>
          {fmtMoney(e.precio)}
        </p>
        <p className={`text-xs ${stock.sinStock ? "font-semibold text-danger-text" : "text-texto-3"}`}>
          {stock.texto}
        </p>
      </div>
      {/* En el teléfono ocupa su renglón: con el nombre, el precio y el stock
          en 375 px no entraba y se partía la palabra. */}
      {onAgregar && vendible && (
        <button
          type="button"
          onClick={() => onAgregar(e)}
          className="basis-full rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-primary-600 sm:basis-auto"
        >
          Agregar a la venta
        </button>
      )}
    </li>
  );
}
