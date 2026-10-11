import { useEffect, useId, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import type { ArticuloMovimiento } from "../../types";

/**
 * Elegir un artículo escribiendo, en vez de recorrer un desplegable.
 *
 * El desplegable de siempre listaba el catálogo entero por orden alfabético
 * —bebidas, insumos y platos mezclados— y encontrar "Coca Cola 2L" entre ocho
 * Coca Colas era leer la lista de arriba abajo. Acá se escribe y la lista se
 * achica: cada palabra cuenta por separado ("coca 2" encuentra "Coca Cola 2L")
 * y no importan las tildes ni las mayúsculas.
 *
 * Tocar el campo vacío (o la flecha abajo) muestra todo, como el desplegable:
 * quien no sabe cómo se llama algo todavía puede recorrer la lista.
 *
 * La lista va DEBAJO del campo y no flotando encima del formulario: este
 * buscador vive al pie de un modal que se desplaza, y una lista flotante
 * quedaba cortada por el borde del modal.
 */
export default function ElegirArticulo({
  articulos,
  onElegir,
  bloqueado,
  autoFocus,
}: {
  articulos: ArticuloMovimiento[];
  onElegir: (articulo: ArticuloMovimiento) => void;
  /** Por qué todavía no se puede elegir ("Elegí primero un almacén…"). */
  bloqueado?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const idLista = useId();

  const encontrados = useMemo(() => {
    const palabras = q.trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return articulos;
    return articulos.filter((a) => palabras.every((p) => contiene(a.nombre, p)));
  }, [articulos, q]);

  const visible = abierto && !bloqueado;
  const idOpcion = (i: number) => `${idLista}-${i}`;

  // Al abrirse, la lista entera a la vista: el buscador está al pie del modal
  // y en el celular los resultados quedaban debajo del borde, sin que nadie
  // supiera que había que deslizar. jsdom no tiene scrollIntoView: de ahí el `?.`.
  useEffect(() => {
    if (visible) document.getElementById(idLista)?.scrollIntoView?.({ block: "nearest" });
  }, [idLista, visible]);

  // Con las flechas, el marcado tiene que quedar a la vista aunque la lista se
  // desplace.
  useEffect(() => {
    if (!visible) return;
    document.getElementById(`${idLista}-${marcado}`)?.scrollIntoView?.({ block: "nearest" });
  }, [idLista, marcado, visible]);

  function elegir(a: ArticuloMovimiento) {
    onElegir(a);
    // El campo queda listo para el siguiente: en una compra se cargan varios.
    setQ("");
    setAbierto(false);
    setMarcado(0);
  }

  return (
    <div>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-4">
          <Icon name="search" size={17} />
        </span>
        <input
          value={q}
          disabled={!!bloqueado}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
            setMarcado(0);
          }}
          // Se abre al tocarlo, al escribir o con la flecha; NO al recibir el
          // foco. El foco también llega solo (al abrirse el modal, o al volver
          // a la ventana con un clic justo encima del campo), y la lista que
          // aparecía en ese instante agrandaba el modal: el campo se corría y
          // el clic caía sobre un artículo, que quedaba elegido sin querer.
          onClick={() => setAbierto(true)}
          // Un momento antes de cerrar: si no, el toque en la opción no llega.
          onBlur={() => window.setTimeout(() => setAbierto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              // Con la lista abierta, Escape cierra la lista y nada más: si
              // llegaba al modal, cerraba el formulario con todo lo cargado.
              if (visible) {
                e.stopPropagation();
                setAbierto(false);
              }
              return;
            }
            if (!visible) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAbierto(true);
              }
              return;
            }
            if (encontrados.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setMarcado((m) => (m + 1) % encontrados.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setMarcado((m) => (m - 1 + encontrados.length) % encontrados.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              elegir(encontrados[Math.min(marcado, encontrados.length - 1)]);
            }
          }}
          role="combobox"
          aria-expanded={visible}
          aria-controls={idLista}
          aria-autocomplete="list"
          aria-activedescendant={visible && encontrados.length ? idOpcion(marcado) : undefined}
          aria-label="Buscar artículo"
          placeholder={bloqueado ?? "Buscá el artículo para agregarlo…"}
          className="w-full rounded-xl border border-borde bg-white py-2.5 pl-10 pr-3.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted"
        />
      </div>

      {visible && (
        <ul
          id={idLista}
          role="listbox"
          aria-label="Artículos"
          className="mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-borde bg-white py-1"
        >
          {encontrados.length === 0 ? (
            <li className="px-3.5 py-2.5 text-[13px] text-texto-3">
              {q.trim()
                ? `Ningún artículo coincide con «${q.trim()}».`
                : "No quedan artículos para agregar."}
            </li>
          ) : (
            encontrados.map((a, i) => (
              <li key={a.id} id={idOpcion(i)} role="option" aria-selected={marcado === i}>
                <button
                  type="button"
                  tabIndex={-1}
                  // mousedown y no click: se adelanta al blur del campo.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(a);
                  }}
                  className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm ${
                    marcado === i ? "bg-primary-50 text-texto" : "text-texto-2 hover:bg-muted"
                  }`}
                >
                  <span className="min-w-0 truncate font-semibold">{a.nombre}</span>
                  {a.esInsumo && (
                    <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-semibold text-texto-3">
                      insumo
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-texto-3">
                    {fmtNum(a.stock, 2)} {a.unidad}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
