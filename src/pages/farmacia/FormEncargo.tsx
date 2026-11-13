import { useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import type { Almacen, Producto } from "../../types";
import { concentracionAparte, conUnidad, detalleDe } from "./medicamento";
import { Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";
import { paraVender } from "../pos/useCarrito";

/**
 * El alta de un encargo, en su propio archivo (11-nov-2026) porque ya no la
 * abre sólo la pantalla de Encargos: el punto de venta la abre desde una
 * tarjeta agotada y la ficha del medicamento desde "Encargar". Antes, anotar
 * lo que faltó eran siete acciones por el menú, y en el mostrador nadie las
 * hace con el cliente esperando: el encargo no se anotaba y la venta se perdía.
 */

/** "Amoxicilina 500 mg" aunque la ficha traiga la concentración aparte. */
function nombreCompleto(p: Producto): string {
  const concentracion = concentracionAparte(p);
  return concentracion ? `${p.nombre} ${concentracion}` : p.nombre;
}

/**
 * Alta de un encargo. El producto es OPCIONAL a propósito: la mitad de lo que
 * piden es algo que la farmacia no vende todavía, y si hay que darlo de alta
 * primero, nadie lo anota y la venta se pierde igual.
 */
export function FormEncargo({
  productoInicial = null,
  sucursales,
  sucursalId = null,
  onClose,
  onGuardado,
}: {
  /**
   * El artículo con el que se abre (el POS lo manda al tocar "Encargar" en una
   * tarjeta agotada): así anotar lo que faltó es un toque y no siete.
   */
  productoInicial?: Producto | null;
  /**
   * Los locales entre los que elegir: sólo los manda quien puede (el dueño con
   * 2+ locales). Sin esto no hay selector y el encargo queda donde está quien
   * lo anota, que es lo que el servidor resuelve solo.
   */
  sucursales?: Almacen[];
  /**
   * Dónde se anota: el local elegido (con selector) o el de la caja que ya
   * conoce quien abre el formulario. Sin esto, el servidor decide (su caja
   * abierta, su sucursal o la principal).
   */
  sucursalId?: number | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [producto, setProducto] = useState<Producto | null>(productoInicial);
  const [descripcion, setDescripcion] = useState(() =>
    productoInicial ? nombreCompleto(productoInicial) : "",
  );
  const [cantidad, setCantidad] = useState("1");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [nota, setNota] = useState("");
  const [almacenId, setAlmacenId] = useState<number | null>(sucursalId);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  /** Corta el doble clic: dos en el mismo tick anotaban el encargo dos veces. */
  const enVuelo = useRef(false);

  async function guardar() {
    if (enVuelo.current) return;
    setError("");
    if (!descripcion.trim()) return setError("Escribí qué te pidieron.");

    enVuelo.current = true;
    setGuardando(true);
    try {
      await api.crearEncargo({
        ...(producto ? { productoId: producto.id } : {}),
        descripcion: descripcion.trim(),
        cantidad: Number(cantidad) || 1,
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: clienteTelefono.trim(),
        nota: nota.trim(),
        ...(almacenId != null ? { almacenId } : {}),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      // Sólo si falló: guardado, el formulario se cierra y no hay reintento.
      enVuelo.current = false;
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Nuevo encargo"
      subtitulo="Lo que te pidieron y no tenías"
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Anotar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <Campo label="Qué pidieron" hint="Con las palabras del cliente">
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="La crema para la alergia, la de pomo azul"
            autoFocus
          />
        </Campo>

        {/* Un <div> y no `Campo`: `Campo` es un <label>, y dentro de un label
            tocar el nombre del artículo elegido "apretaba" el botón de quitarlo
            (el label activa al primer control que tiene adentro). */}
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-texto-2">
            Artículo del catálogo
          </span>
          <ElegirArticulo elegido={producto} onElegir={setProducto} sucursalId={almacenId} />
          <span className="mt-1 block text-xs text-texto-4">
            Opcional: si todavía no lo vendés, dejalo vacío
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[7rem_1fr_1fr]">
          <Campo label="Cantidad">
            <Input
              type="number"
              inputMode="decimal"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
            />
          </Campo>
          <Campo label="Quién lo pidió">
            <Input
              value={clienteNombre}
              onChange={(e) => setClienteNombre(e.target.value)}
              placeholder="Doña Marta"
            />
          </Campo>
          <Campo label="Teléfono" hint="Para avisarle cuando llegue">
            <Input
              value={clienteTelefono}
              onChange={(e) => setClienteTelefono(e.target.value)}
              placeholder="70012345"
            />
          </Campo>
        </div>

        <Campo label="Nota">
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Lo necesita para el viernes"
          />
        </Campo>

        {sucursales && sucursales.length > 1 && (
          <Campo label="Sucursal" hint="Dónde lo pidieron: ahí se avisa cuando llegue">
            <Select
              value={almacenId ?? ""}
              onChange={(e) => setAlmacenId(e.target.value ? Number(e.target.value) : null)}
              aria-label="Sucursal del encargo"
            >
              {sucursales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * El artículo del catálogo, buscándolo.
 *
 * Antes era un desplegable con los primeros 100 productos: con el catálogo de
 * una farmacia de verdad (2.000 medicamentos) lo que pedían casi nunca estaba
 * en la lista, y lo que estaba era imposible de recorrer. Busca en el
 * servidor, igual que el mostrador: nombre, droga, laboratorio o código.
 *
 * Elegido, dice cuánto hay: si hay stock, quizás no hace falta encargarlo.
 */
export function ElegirArticulo({
  elegido,
  onElegir,
  sucursalId = null,
}: {
  elegido: Producto | null;
  onElegir: (p: Producto | null) => void;
  /** El stock que se muestra es el de este local; null = el que decida el servidor. */
  sucursalId?: number | null;
}) {
  const [q, setQ] = useState("");
  const buscando = q.trim() !== "";
  // Sin texto no se trae nada: el catálogo entero no sirve para elegir.
  const busqueda = useBusquedaProductos({ q, limite: 8, activo: buscando, sucursalId });

  if (elegido) {
    const concentracion = concentracionAparte(elegido);
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary-50/50 px-3.5 py-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-texto">
            {elegido.nombre}
            {concentracion && (
              <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>
            )}
          </span>
          <span className="block truncate text-xs text-texto-3">
            {[elegido.laboratorio, stockDe(elegido)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onElegir(null)}
          aria-label="Quitar el artículo"
          className="shrink-0 rounded-lg p-1.5 text-texto-3 hover:bg-white hover:text-texto"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-texto-4">
          <Icon name="search" size={17} />
        </span>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscá por nombre, droga o laboratorio"
          aria-label="Artículo del catálogo"
          className="pl-10"
        />
      </div>

      {buscando &&
        (busqueda.cargando && busqueda.items.length === 0 ? (
          <p className="text-xs text-texto-3">Buscando…</p>
        ) : busqueda.items.length === 0 ? (
          <p className="text-xs text-texto-3">
            {`No hay nada con "${q.trim()}" en el catálogo: dejalo vacío y anotá lo que pidieron.`}
          </p>
        ) : (
          <ul className="max-h-56 divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde">
            {busqueda.items.map((p) => {
              const concentracion = concentracionAparte(p);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onElegir(p);
                      setQ("");
                    }}
                    className="flex w-full items-center gap-3 px-3.5 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-texto">
                        <Resaltado texto={p.nombre} q={q} />
                        {concentracion && (
                          <span className="ml-1.5 font-semibold text-texto-2">{concentracion}</span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-texto-3">
                        {detalleDe(p) || "Sin ficha cargada"}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-texto-3">{stockDe(p)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

function stockDe(p: Producto): string {
  // Lo vencido no cuenta: no se le puede entregar al cliente que encargó.
  const hay = paraVender(p);
  return hay > 0 ? `Hay ${conUnidad(hay, p.unidadMedida?.nombre)}` : "Agotado";
}
