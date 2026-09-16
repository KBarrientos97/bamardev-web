import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Cargando, Confirmar, ErrorMsg, Vacio } from "../../components/ui";
import { fmtMoney, fmtNum } from "../../lib/format";
import type { Producto } from "../../types";
import CampoBusqueda from "./CampoBusqueda";
import {
  CONDICION,
  concentracionAparte,
  conUnidad,
  detalleDe,
  pideConfirmacion,
} from "./medicamento";
import { ChipsCondicion, Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";

/**
 * El catálogo del punto de venta, para una farmacia.
 *
 * Reemplaza a la grilla de tarjetas, que es la entrada correcta cuando el
 * catálogo son 40 productos con foto y el cajero se los sabe de memoria. Con
 * 2.000 cajas de remedios que se llaman casi igual, la grilla no sirve como
 * entrada: **la búsqueda manda**. Por eso acá el campo ocupa el lugar de honor
 * y los resultados son una lista densa, no tarjetas.
 *
 * Todo lo que viene después —el carrito, el cobro, la caja, el recibo— es el
 * mismo de siempre. Lo único que cambia es cómo se elige qué vender.
 */
export default function BuscadorVenta({
  onAgregar,
  enCarrito,
}: {
  onAgregar: (p: Producto) => void;
  /** Cuánto hay de cada producto en el carrito, para mostrarlo en la fila. */
  enCarrito: Map<number, number>;
}) {
  const [q, setQ] = useState("");
  const [confirmar, setConfirmar] = useState<Producto | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  // Sólo lo vendible: un artículo apagado se sigue editando desde el catálogo,
  // pero no tiene por qué aparecer acá con el cliente esperando.
  const busqueda = useBusquedaProductos({ q, soloHabilitados: true });

  /**
   * Agrega, o se detiene a preguntar si el producto lo exige.
   *
   * La confirmación no es un trámite: un controlado o una receta valorada
   * obligan a quedarse con el papel y asentarlo en el libro. Que el sistema
   * pare un segundo es lo que convierte eso en un acto deliberado en vez de un
   * clic más.
   */
  function elegir(p: Producto) {
    if (pideConfirmacion(p)) {
      setConfirmar(p);
      return;
    }
    agregar(p);
  }

  function agregar(p: Producto) {
    onAgregar(p);
    // El foco vuelve al campo y el texto se limpia: en el mostrador se carga
    // un producto atrás de otro, y volver a tipear desde cero es más rápido
    // que borrar lo anterior a mano.
    setQ("");
    campo.current?.focus();
  }

  /**
   * Enter carga el único resultado. Es lo que hace que el lector de código de
   * barras funcione solo: escribe el código y manda Enter, como un teclado.
   * Con más de un resultado no hace nada — elegir por la persona cuál de tres
   * remedios parecidos va al carrito sería peligroso.
   */
  function alEnter() {
    if (busqueda.items.length === 1) elegir(busqueda.items[0]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-borde bg-white px-4 py-3">
        <CampoBusqueda
          ref={campo}
          valor={q}
          onChange={setQ}
          onEnter={alEnter}
          placeholder="Buscá o escaneá: nombre, droga, laboratorio…"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-24 lg:pb-4">
        <ErrorMsg>{busqueda.error}</ErrorMsg>

        {busqueda.cargando && busqueda.items.length === 0 ? (
          <Cargando texto="Buscando…" />
        ) : busqueda.items.length === 0 ? (
          <Vacio
            icono="search"
            titulo={q ? `No hay nada con "${q}"` : "Buscá para empezar"}
            texto={
              q
                ? "Probá con la droga en vez de la marca, o con menos letras."
                : "Escribí el nombre o pasá el producto por el lector."
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-borde-soft overflow-hidden rounded-2xl border border-borde bg-white">
              {busqueda.items.map((p) => (
                <FilaVenta
                  key={p.id}
                  producto={p}
                  q={q}
                  cantidad={enCarrito.get(p.id) ?? 0}
                  onAgregar={() => elegir(p)}
                />
              ))}
            </ul>

            {busqueda.hayMas && (
              <div className="mt-3 flex justify-center">
                <Boton
                  variante="ghost"
                  onClick={busqueda.traerMas}
                  disabled={busqueda.trayendoMas}
                >
                  {busqueda.trayendoMas
                    ? "Trayendo…"
                    : `Ver más (${busqueda.items.length} de ${busqueda.total})`}
                </Boton>
              </div>
            )}
          </>
        )}
      </div>

      <Confirmar
        abierto={!!confirmar}
        titulo={
          confirmar?.controlado ? "Medicamento controlado" : "Este necesita receta"
        }
        texto={
          confirmar
            ? `${confirmar.nombre}${
                CONDICION[confirmar.condicionVenta]
                  ? ` — ${CONDICION[confirmar.condicionVenta]!.largo}`
                  : ""
              }. Pedí la receta y quedátela: se asienta en el libro.`
            : ""
        }
        etiquetaOk="Tengo la receta"
        onCancel={() => setConfirmar(null)}
        onOk={() => {
          if (confirmar) agregar(confirmar);
          setConfirmar(null);
        }}
      />
    </div>
  );
}

function FilaVenta({
  producto: p,
  q,
  cantidad,
  onAgregar,
}: {
  producto: Producto;
  q: string;
  cantidad: number;
  onAgregar: () => void;
}) {
  const agotado = p.stockTotal <= 0;
  const detalle = detalleDe(p);
  const concentracion = concentracionAparte(p);

  return (
    <li>
      <button
        onClick={onAgregar}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-bold text-texto">
              <Resaltado texto={p.nombre} q={q} />
              {concentracion && (
                <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>
              )}
            </span>
            <ChipsCondicion producto={p} />
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[13px] text-texto-3">
            <span className="truncate">
              {detalle ? <Resaltado texto={detalle} q={q} /> : "Sin ficha cargada"}
            </span>
            {/* El stock se muestra pero no frena la venta: el mostrador sabe
                mejor que el sistema lo que tiene en el cajón, y en una farmacia
                el ajuste viene después por Movimientos. */}
            <span className={agotado ? "shrink-0 font-semibold text-danger-text" : "shrink-0"}>
              {agotado ? "· Agotado" : `· ${conUnidad(p.stockTotal, p.unidadMedida?.nombre)}`}
            </span>
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-bold text-texto">{fmtMoney(p.precio)}</span>
          {cantidad > 0 && (
            <span className="text-[12px] font-bold text-primary-700">
              {fmtNum(cantidad)} en el carrito
            </span>
          )}
        </span>

        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Icon name="plus" size={19} />
        </span>
      </button>
    </li>
  );
}
