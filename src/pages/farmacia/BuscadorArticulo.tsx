import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg, Modal, Vacio } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import type { ArticuloMovimiento, Producto } from "../../types";
import { concentracionAparte, conUnidad, detalleDe } from "./medicamento";
import { Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";

/**
 * Elegir qué entra o qué sale, buscando.
 *
 * Reemplaza al desplegable del formulario de siempre, y no por gusto: un
 * desplegable con 1.842 opciones ordenadas por nombre es inservible, y en una
 * farmacia hay media docena de renglones que se llaman "Paracetamol 500 mg" y
 * sólo se distinguen por el laboratorio.
 *
 * Por eso la búsqueda pega al servidor (la misma de "Buscar medicamento": mira
 * nombre, droga, laboratorio y código de barras, y el lector USB escribe solo)
 * pero el **stock y el costo** salen de la lista de artículos del almacén
 * elegido, que es la única que sabe cuánto hay *ahí*. Un producto que la
 * búsqueda encuentra pero el almacén no mueve —deshabilitado, o que no lleva
 * stock— se muestra apagado y explica por qué, en vez de desaparecer y dejar a
 * alguien buscándolo.
 *
 * Y el almacén se **nombra**, arriba y en cada renglón. Es la confusión
 * garantizada de esta pantalla: el catálogo dice "60 unidades" porque suma
 * todos los almacenes, y acá puede decir "0" porque esas 60 están en el
 * mostrador y no en el depósito. Los dos números son ciertos; lo que faltaba
 * era decir de cuál se está hablando.
 */
export default function BuscadorArticulo({
  articulos,
  almacenNombre,
  yaElegidos,
  onElegir,
  onClose,
}: {
  /** Lo que el almacén elegido puede mover, con su stock y su costo. */
  articulos: ArticuloMovimiento[];
  /** El almacén del formulario: sin su nombre el stock no se puede interpretar. */
  almacenNombre: string;
  /** Ids que ya están en el formulario: no se agregan dos veces. */
  yaElegidos: number[];
  onElegir: (articulo: ArticuloMovimiento, producto: Producto) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const busqueda = useBusquedaProductos({ q });

  return (
    <Modal abierto titulo="Agregar producto" onClose={onClose} ancho="max-w-xl">
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4">
            <Icon name="search" size={19} />
          </span>
          <input
            ref={campo}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, genérico o laboratorio…"
            className="w-full rounded-xl border border-borde bg-white py-3 pl-11 pr-10 text-[15px] outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
          {q && (
            <button
              onClick={() => {
                setQ("");
                campo.current?.focus();
              }}
              aria-label="Limpiar"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-texto-4 hover:bg-muted hover:text-texto-2"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-texto-3">
          <span>
            {busqueda.cargando
              ? "Buscando…"
              : `${busqueda.total} ${busqueda.total === 1 ? "producto" : "productos"}`}
          </span>
          {almacenNombre && (
            <span className="font-semibold text-texto-2">
              Stock en {almacenNombre}
            </span>
          )}
        </p>

        <ErrorMsg>{busqueda.error}</ErrorMsg>

        {busqueda.cargando && busqueda.items.length === 0 ? (
          <Cargando texto="Buscando…" />
        ) : busqueda.items.length === 0 ? (
          <Vacio
            icono="search"
            titulo={q ? `No hay nada con "${q}"` : "El catálogo está vacío"}
            texto={
              q
                ? "Probá con la droga en vez de la marca, o con menos letras."
                : "Cargá el primer medicamento desde el catálogo."
            }
          />
        ) : (
          <>
            {/* Alto acotado y scroll propio: la lista no tiene que empujar el
                buscador fuera de la vista. */}
            <ul className="max-h-[52vh] divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde">
              {busqueda.items.map((p) => (
                <Fila
                  key={p.id}
                  producto={p}
                  q={q}
                  articulo={articulos.find((a) => a.id === p.id)}
                  yaEsta={yaElegidos.includes(p.id)}
                  onElegir={onElegir}
                />
              ))}
            </ul>

            {busqueda.hayMas && (
              <button
                onClick={busqueda.traerMas}
                disabled={busqueda.trayendoMas}
                className="w-full rounded-xl border border-dashed border-borde py-2.5 text-[13px] font-semibold text-texto-2 hover:bg-muted disabled:opacity-60"
              >
                {busqueda.trayendoMas
                  ? "Trayendo…"
                  : `Ver más (${busqueda.items.length} de ${busqueda.total})`}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Fila({
  producto: p,
  q,
  articulo,
  yaEsta,
  onElegir,
}: {
  producto: Producto;
  q: string;
  /** Falta cuando el almacén no lo mueve (no lleva stock, o está de baja). */
  articulo: ArticuloMovimiento | undefined;
  yaEsta: boolean;
  onElegir: (articulo: ArticuloMovimiento, producto: Producto) => void;
}) {
  const detalle = detalleDe(p);
  const concentracion = concentracionAparte(p);

  // El stock es el del ALMACÉN elegido, no el total del catálogo: es lo que de
  // verdad se puede sacar de acá.
  const stock = articulo?.stock ?? 0;
  const agotado = stock <= 0;
  const bajo = !agotado && stock <= p.stockMinimo;

  const bloqueo = !articulo
    ? "No se mueve por almacén"
    : yaEsta
      ? "Ya está en la lista"
      : null;

  return (
    <li className={`flex items-center gap-3 px-3.5 py-2.5 ${bloqueo ? "opacity-55" : ""}`}>
      <span
        aria-hidden
        className={`h-2 w-2 shrink-0 rounded-full ${
          agotado ? "bg-danger" : bajo ? "bg-warning" : "bg-primary"
        }`}
      />

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-texto">
          <Resaltado texto={p.nombre} q={q} />
          {concentracion && (
            <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-texto-3">
          {detalle ? <Resaltado texto={detalle} q={q} /> : "Sin ficha cargada"}
        </span>
      </span>

      {bloqueo ? (
        <span className="shrink-0 text-xs text-texto-4">{bloqueo}</span>
      ) : (
        <>
          <span className="shrink-0 text-right text-xs">
            <span className="block text-texto-3">{conUnidad(stock, articulo?.unidad)}</span>
            {/* El catálogo suma todos los almacenes y acá se mira uno solo. Si
                no coinciden hay que decirlo, o el "0" parece un error cuando en
                realidad la mercadería está en el otro almacén. */}
            {p.stockTotal !== stock && (
              <span className="block text-texto-4">de {fmtNum(p.stockTotal)} en total</span>
            )}
          </span>
          <button
            onClick={() => articulo && onElegir(articulo, p)}
            aria-label={`Agregar ${p.nombre}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-colors hover:bg-primary-100"
          >
            <Icon name="plus" size={17} />
          </button>
        </>
      )}
    </li>
  );
}
