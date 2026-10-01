import { useState } from "react";
import { Chips, EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Encargo, EstadoEncargo, Producto } from "../../types";
import { concentracionAparte, conUnidad, detalleDe } from "./medicamento";
import { Resaltado } from "./piezas";
import { useBusquedaProductos } from "./useBusquedaProductos";
import { paraVender } from "../pos/useCarrito";

/**
 * Encargos: lo que alguien pidió y no había.
 *
 * Es la pantalla más barata del rubro y la que más venta recupera. Hoy, cuando
 * una farmacia no tiene algo, la respuesta es "no tengo" y el cliente cruza la
 * calle. Anotarlo convierte eso en "te lo consigo para el jueves" — y de paso
 * le dice al dueño qué comprar, que es la otra mitad del valor.
 *
 * El flujo es lineal y de un paso por vez: anotado → pedido → llegó →
 * entregado. Por eso el botón principal de cada tarjeta dice lo que sigue ("Ya
 * lo pedí", "Llegó", "Se lo entregué") en vez de abrir un selector de estados:
 * en el mostrador no se elige un estado, se cuenta lo que acaba de pasar.
 */

const ESTADOS: Record<
  EstadoEncargo,
  { label: string; tono: "gris" | "azul" | "verde" | "amarillo"; siguiente?: EstadoEncargo; accion?: string }
> = {
  ANOTADO: { label: "Anotado", tono: "gris", siguiente: "PEDIDO", accion: "Ya lo pedí" },
  PEDIDO: { label: "Pedido", tono: "azul", siguiente: "LLEGO", accion: "Llegó" },
  LLEGO: { label: "Llegó", tono: "amarillo", siguiente: "ENTREGADO", accion: "Se lo entregué" },
  ENTREGADO: { label: "Entregado", tono: "verde" },
  CANCELADO: { label: "Cancelado", tono: "gris" },
};

type Filtro = "abiertos" | EstadoEncargo;

const OPCIONES: readonly (readonly [Filtro, string])[] = [
  ["abiertos", "Pendientes"],
  ["ANOTADO", "Anotados"],
  ["PEDIDO", "Pedidos"],
  ["LLEGO", "Llegaron"],
  ["ENTREGADO", "Entregados"],
] as const;

export default function Encargos() {
  const [filtro, setFiltro] = useState<Filtro>("abiertos");
  const lista = useApi(
    () =>
      api.getEncargos(
        filtro === "abiertos" ? {} : { estado: filtro, incluirCerrados: true },
      ),
    [filtro],
  );
  const [creando, setCreando] = useState(false);
  const [cancelando, setCancelando] = useState<Encargo | null>(null);
  const [moviendo, setMoviendo] = useState<number | null>(null);
  const [error, setError] = useState("");

  const datos = lista.datos;

  async function mover(encargo: Encargo, estado: EstadoEncargo) {
    setError("");
    setMoviendo(encargo.id);
    try {
      await api.cambiarEstadoEncargo(encargo.id, estado);
      lista.recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setMoviendo(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Encargos"
        subtitulo={
          datos ? `${datos.abiertos} esperando` : "Lo que pidieron y no había"
        }
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
        Cuando alguien pregunta por algo que no hay, anotalo acá con su teléfono.
        Al llegar la mercadería tenés a quién avisarle — y el dueño ve qué le
        están pidiendo.
      </p>

      {datos && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Contador n={datos.anotados} titulo="Anotados" ayuda="Falta pedirlos" />
          <Contador n={datos.pedidos} titulo="Pedidos" ayuda="En camino" />
          <Contador
            n={datos.llegaron}
            titulo="Llegaron"
            ayuda="Avisar al cliente"
            destacado={datos.llegaron > 0}
          />
          <Contador n={datos.entregados} titulo="Entregados" ayuda="Listos" />
        </div>
      )}

      <Chips valor={filtro} opciones={OPCIONES} onChange={(v) => setFiltro(v as Filtro)} />

      <ErrorMsg>{error || lista.error}</ErrorMsg>

      {lista.cargando ? (
        <Cargando />
      ) : !datos || datos.items.length === 0 ? (
        <div className="card">
          <Vacio
            icono="bell"
            titulo={filtro === "abiertos" ? "No hay nada pendiente" : "Sin encargos acá"}
            texto="Anotá lo que te pidan y no tengas: es la venta que hoy se va a la farmacia de enfrente."
            accion={
              <Boton icono="plus" onClick={() => setCreando(true)}>
                Nuevo encargo
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {datos.items.map((e) => (
            <Tarjeta
              key={e.id}
              encargo={e}
              procesando={moviendo === e.id}
              onAvanzar={() => {
                const sig = ESTADOS[e.estado].siguiente;
                if (sig) void mover(e, sig);
              }}
              onCancelar={() => setCancelando(e)}
            />
          ))}
        </ul>
      )}

      {creando && (
        <FormEncargo
          onClose={() => setCreando(false)}
          onGuardado={() => {
            setCreando(false);
            lista.recargar();
          }}
        />
      )}

      <Confirmar
        abierto={!!cancelando}
        titulo="Cancelar el encargo"
        texto={
          cancelando
            ? `"${cancelando.descripcion}" queda cerrado sin entregar. Se usa cuando el cliente no volvió o el proveedor no lo consiguió.`
            : ""
        }
        etiquetaOk="Cancelar el encargo"
        peligroso
        onCancel={() => setCancelando(null)}
        onOk={() => {
          if (cancelando) void mover(cancelando, "CANCELADO");
          setCancelando(null);
        }}
      />
    </div>
  );
}

function Contador({
  n,
  titulo,
  ayuda,
  destacado,
}: {
  n: number;
  titulo: string;
  ayuda: string;
  /** "Llegaron" es el único que pide acción hoy: alguien está esperando. */
  destacado?: boolean;
}) {
  return (
    <div className={`card p-4 ${destacado ? "ring-2 ring-warning" : ""}`}>
      <p
        className={`text-3xl font-extrabold ${
          n === 0 ? "text-texto-4" : destacado ? "text-warning-text" : "text-texto"
        }`}
      >
        {n}
      </p>
      <p className="text-[13px] font-bold text-texto">{titulo}</p>
      <p className="text-xs text-texto-3">{ayuda}</p>
    </div>
  );
}

function Tarjeta({
  encargo: e,
  procesando,
  onAvanzar,
  onCancelar,
}: {
  encargo: Encargo;
  procesando: boolean;
  onAvanzar: () => void;
  onCancelar: () => void;
}) {
  const estado = ESTADOS[e.estado];
  const abierto = e.estado !== "ENTREGADO" && e.estado !== "CANCELADO";

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-bold text-texto">{e.descripcion}</h3>
            <Badge tono={estado.tono}>{estado.label}</Badge>
            {e.muyPedido && <Badge tono="rojo">Muy pedido</Badge>}
          </div>
          {e.producto && (
            <p className="mt-0.5 text-[13px] text-texto-3">
              {e.producto.nombre}
              {e.producto.laboratorio && ` · ${e.producto.laboratorio}`}
              {e.cantidad > 1 && ` · ${fmtNum(e.cantidad)} u.`}
            </p>
          )}
        </div>

        {abierto && (
          <div className="flex shrink-0 items-center gap-2">
            {estado.accion && (
              <Boton icono="check" onClick={onAvanzar} disabled={procesando}>
                {procesando ? "…" : estado.accion}
              </Boton>
            )}
            <button
              onClick={onCancelar}
              aria-label="Cancelar el encargo"
              className="rounded-lg p-2 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
            >
              <Icon name="x" size={17} />
            </button>
          </div>
        )}
      </div>

      {/* Ya hay stock de lo que encargó: se le puede avisar aunque el encargo
          figure todavía como pedido al proveedor. Pasa seguido — la mercadería
          entra por una compra normal y nadie relaciona una cosa con la otra. */}
      {e.hayStock && abierto && e.estado !== "LLEGO" && (
        <p className="mt-2 rounded-lg bg-warning-bg px-3 py-2 text-[13px] text-warning-text">
          Ya hay stock de esto en el inventario: podés avisarle.
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-texto-3">
        {e.clienteNombre && (
          <span className="flex items-center gap-1.5 font-semibold text-texto-2">
            <Icon name="user" size={15} />
            {e.clienteNombre}
          </span>
        )}
        {e.clienteTelefono && (
          <a
            href={`tel:${e.clienteTelefono}`}
            className="flex items-center gap-1.5 text-primary-700 hover:underline"
          >
            <Icon name="phone" size={15} />
            {e.clienteTelefono}
          </a>
        )}
        <span className="flex items-center gap-1.5">
          <Icon name="clock" size={15} />
          {e.diasEsperando === 0
            ? "Hoy"
            : e.diasEsperando === 1
              ? "Hace 1 día"
              : `Hace ${e.diasEsperando} días`}
          <span className="text-texto-4">({fmtFecha(e.creadoEn)})</span>
        </span>
        {e.pedidoPor > 1 && <span>{e.pedidoPor} personas lo están esperando</span>}
      </div>

      {e.nota && <p className="mt-2 text-[13px] italic text-texto-3">{e.nota}</p>}
    </li>
  );
}

/**
 * Alta de un encargo. El producto es OPCIONAL a propósito: la mitad de lo que
 * piden es algo que la farmacia no vende todavía, y si hay que darlo de alta
 * primero, nadie lo anota y la venta se pierde igual.
 */
function FormEncargo({
  onClose,
  onGuardado,
}: {
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [producto, setProducto] = useState<Producto | null>(null);
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (!descripcion.trim()) return setError("Escribí qué te pidieron.");

    setGuardando(true);
    try {
      await api.crearEncargo({
        ...(producto ? { productoId: producto.id } : {}),
        descripcion: descripcion.trim(),
        cantidad: Number(cantidad) || 1,
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: clienteTelefono.trim(),
        nota: nota.trim(),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
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
          <ElegirArticulo elegido={producto} onElegir={setProducto} />
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
function ElegirArticulo({
  elegido,
  onElegir,
}: {
  elegido: Producto | null;
  onElegir: (p: Producto | null) => void;
}) {
  const [q, setQ] = useState("");
  const buscando = q.trim() !== "";
  // Sin texto no se trae nada: el catálogo entero no sirve para elegir.
  const busqueda = useBusquedaProductos({ q, limite: 8, activo: buscando });

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
