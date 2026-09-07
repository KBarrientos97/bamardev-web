import { useEffect, useMemo, useState } from "react";
import { parsearMonto } from "../../lib/dinero";
import { contiene } from "../../lib/texto";
import { Icon } from "../../components/Icon";
import { Buscador, Chips, EncabezadoPagina } from "../../components/filtros";
import {
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Modal,
  Select,
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type {
  Almacen,
  ArticuloMovimiento,
  // El componente local se llama igual que el tipo: alias para no chocar.
  DetalleMovimiento as LineaMovimiento,
  DetalleMovimientoInput,
  EstadoDocumento,
  Movimiento,
  MovimientoInput,
  TipoMovimiento,
} from "../../types";

type FiltroTipo = "todos" | TipoMovimiento;
type FiltroEstado = "todos" | EstadoDocumento;
type FiltroOrigen = "todos" | "PRODUCTO" | "INSUMO";

const OPC_TIPO = [
  ["todos", "Todos los tipos"],
  ["ENTRADA", "Entradas"],
  ["SALIDA", "Salidas"],
  ["AJUSTE", "Ajustes"],
] as const satisfies readonly (readonly [FiltroTipo, string])[];

const OPC_ESTADO = [
  ["todos", "Todos los estados"],
  ["PENDIENTE", "Pendientes"],
  ["APROBADO", "Aprobados"],
  ["ANULADO", "Anulados"],
] as const satisfies readonly (readonly [FiltroEstado, string])[];

const OPC_ORIGEN = [
  ["todos", "Todo el origen"],
  ["PRODUCTO", "Productos"],
  ["INSUMO", "Insumos"],
] as const satisfies readonly (readonly [FiltroOrigen, string])[];

const TONO_ESTADO: Record<EstadoDocumento, "verde" | "amarillo" | "rojo"> = {
  APROBADO: "verde",
  PENDIENTE: "amarillo",
  ANULADO: "rojo",
};

const ETIQUETA_TIPO: Record<TipoMovimiento, string> = {
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
};

/** Sólo la entrada suma: salida y ajuste se leen como movimiento negativo. */
function esEntrada(tipo: TipoMovimiento): boolean {
  return tipo === "ENTRADA";
}

export default function Movimientos() {
  const { incluye } = useAuth();
  const movimientos = useApi(() => api.getMovimientos(), []);
  const almacenes = useApi(() => api.getAlmacenes(), []);

  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>("todos");
  const [filtroOrigen, setFiltroOrigen] = useState<FiltroOrigen>("todos");
  /**
   * Arranca en HOY, como la app: en un local con movimientos diarios, abrir la
   * pantalla y ver el histórico entero no sirve — lo que se busca es lo de esta
   * jornada. Vacío = ver todo.
   */
  const [fecha, setFecha] = useState(isoDia(new Date()));
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = movimientos.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((m) => {
      if (
        texto &&
        !contiene(m.comprobante, texto) &&
        !contiene(m.descripcion, texto)
      )
        return false;
      if (fecha && isoDia(new Date(m.fecha)) !== fecha) return false;
      if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
      if (filtroEstado !== "todos" && m.estado !== filtroEstado) return false;
      if (filtroOrigen !== "todos" && m.origen !== filtroOrigen) return false;
      return true;
    });
  }, [lista, q, fecha, filtroTipo, filtroEstado, filtroOrigen]);

  const pendientes = lista.filter((m) => m.estado === "PENDIENTE").length;

  // Sin el circuito de aprobación los movimientos se aprueban al crearse, así
  // que filtrar por "pendientes" no devolvería nada. Se deja el chip si hay
  // pendientes viejos, para poder encontrarlos.
  const opcionesEstado = useMemo(
    () =>
      incluye("aprobacion_inventario") || pendientes > 0
        ? OPC_ESTADO
        : OPC_ESTADO.filter(([k]) => k !== "PENDIENTE"),
    [incluye, pendientes],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Movimientos"
        subtitulo={
          pendientes
            ? `${lista.length} registrados · ${pendientes} sin aprobar`
            : `${lista.length} registrados`
        }
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador
            valor={q}
            onChange={setQ}
            placeholder="Buscar por comprobante o descripción"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="rounded-xl border border-borde bg-white px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
          <button
            onClick={() => setFecha(fecha ? "" : isoDia(new Date()))}
            className="rounded-xl border border-borde bg-white px-3 py-2 text-[13px] font-semibold text-texto-2 hover:bg-muted"
          >
            {fecha ? "Ver todo" : "Sólo hoy"}
          </button>
          <span className="text-xs text-texto-3">
            {filtrados.length} {filtrados.length === 1 ? "movimiento" : "movimientos"}
            {fecha ? "" : " en total"}
          </span>
        </div>
        <Chips valor={filtroTipo} opciones={OPC_TIPO} onChange={setFiltroTipo} />
        <Chips valor={filtroEstado} opciones={opcionesEstado} onChange={setFiltroEstado} />
        <Chips valor={filtroOrigen} opciones={OPC_ORIGEN} onChange={setFiltroOrigen} />
      </div>

      <ErrorMsg>{errorAccion || movimientos.error}</ErrorMsg>

      {movimientos.cargando ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <div className="card">
          <Vacio
            icono="swap"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay movimientos"}
            texto={
              lista.length
                ? "Probá con otro texto o quitá los filtros."
                : "Registrá la primera entrada o salida de stock."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo movimiento
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtrados.map((m) => (
            <TarjetaMovimiento key={m.id} mov={m} onClick={() => setDetalleId(m.id)} />
          ))}
        </ul>
      )}

      {detalleId !== null && (
        <DetalleMovimiento
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onCambio={() => {
            setDetalleId(null);
            movimientos.recargar();
          }}
          onError={setErrorAccion}
        />
      )}

      <FormMovimiento
        abierto={creando}
        almacenes={almacenes.datos ?? []}
        onClose={() => setCreando(false)}
        onGuardado={() => {
          setCreando(false);
          movimientos.recargar();
        }}
      />
    </div>
  );
}

function TarjetaMovimiento({ mov: m, onClick }: { mov: Movimiento; onClick: () => void }) {
  const entrada = esEntrada(m.tipo);

  return (
    <li>
      <button
        onClick={onClick}
        className="card flex w-full items-center gap-3 p-4 text-left transition-shadow hover:shadow-md"
      >
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            entrada ? "bg-primary-50 text-primary-700" : "bg-danger-bg text-danger-text"
          }`}
        >
          <Icon name={entrada ? "trendingUp" : "trendingDown"} size={19} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-texto">
              {m.comprobante ?? `#${m.id}`}
            </span>
            <Badge tono={TONO_ESTADO[m.estado]}>{m.estado}</Badge>
            {m.origen && <Badge tono="azul">{m.origen}</Badge>}
          </div>
          {m.descripcion && (
            <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">{m.descripcion}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-texto-3">
            <span className="flex items-center gap-1">
              <Icon name="calendar" size={12} /> {fmtFecha(m.fecha)}
            </span>
            <span className="flex items-center gap-1">
              <Icon name="warehouse" size={12} /> {m.almacen?.nombre ?? "—"}
            </span>
            <span>
              {m.items} {m.items === 1 ? "artículo" : "artículos"}
            </span>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-texto">{fmtMoney(m.monto)}</p>
          <p
            className={`text-xs font-semibold ${
              entrada ? "text-primary-700" : "text-danger-text"
            }`}
          >
            {ETIQUETA_TIPO[m.tipo]}
          </p>
        </div>
      </button>
    </li>
  );
}

function DetalleMovimiento({
  id,
  onClose,
  onCambio,
  onError,
}: {
  id: number;
  onClose: () => void;
  onCambio: () => void;
  onError: (mensaje: string) => void;
}) {
  const mov = useApi(() => api.getMovimiento(id), [id]);
  const [confirmando, setConfirmando] = useState<"aprobar" | "anular" | "eliminar" | null>(
    null,
  );
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  /** Línea que se está editando, o "nueva" para agregar una. */
  const [editandoLinea, setEditandoLinea] = useState<LineaMovimiento | "nueva" | null>(
    null,
  );
  const [aBorrarLinea, setABorrarLinea] = useState<LineaMovimiento | null>(null);

  const m = mov.datos;
  const detalles = m?.detalles ?? [];
  /**
   * Sólo se editan las líneas de un movimiento PENDIENTE: uno aprobado ya movió
   * el stock, y cambiarle una cantidad dejaría el inventario diciendo una cosa
   * y el documento otra.
   */
  const editable = m?.estado === "PENDIENTE";

  /** Artículos del almacén con su stock, para el tope de las salidas. */
  const articulosAlmacen = useApi(
    () => (m ? api.getArticulosMovimiento(m.almacen?.id) : Promise.resolve([])),
    [m?.almacen?.id],
  );

  async function borrarLinea() {
    if (!aBorrarLinea) return;
    setError("");
    try {
      await api.eliminarDetalleMovimiento(aBorrarLinea.id);
      setABorrarLinea(null);
      mov.recargar();
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la línea");
      setABorrarLinea(null);
    }
  }
  const total = detalles.reduce(
    (acc, d) => acc + (d.subtotal ?? d.cantidad * d.costo),
    0,
  );

  async function ejecutar() {
    if (!m || !confirmando) return;
    setError("");
    setProcesando(true);
    try {
      if (confirmando === "aprobar") await api.aprobarMovimiento(m.id);
      else if (confirmando === "anular") await api.anularMovimiento(m.id);
      else await api.eliminarMovimiento(m.id);
      setConfirmando(null);
      onError("");
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar la acción");
      setConfirmando(null);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <>
      <Modal
        abierto
        titulo="Detalle del movimiento"
        subtitulo={m ? (m.comprobante ?? `#${m.id}`) : "Cargando…"}
        onClose={onClose}
        ancho="max-w-2xl"
        acciones={
          m?.estado === "PENDIENTE" ? (
            <>
              <Boton
                variante="danger"
                icono="trash"
                disabled={procesando}
                onClick={() => setConfirmando("eliminar")}
              >
                Eliminar
              </Boton>
              <Boton icono="check" disabled={procesando} onClick={() => setConfirmando("aprobar")}>
                Aprobar
              </Boton>
            </>
          ) : m?.estado === "APROBADO" ? (
            <Boton
              variante="danger"
              icono="x"
              disabled={procesando}
              onClick={() => setConfirmando("anular")}
            >
              Anular
            </Boton>
          ) : undefined
        }
      >
        {mov.cargando ? (
          <Cargando />
        ) : !m ? (
          <ErrorMsg>{mov.error || "No se pudo cargar el movimiento"}</ErrorMsg>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
                  esEntrada(m.tipo)
                    ? "bg-primary-100 text-primary-700"
                    : "bg-danger-bg text-danger-text"
                }`}
              >
                <Icon name={esEntrada(m.tipo) ? "trendingUp" : "trendingDown"} size={26} />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-texto">
                  {ETIQUETA_TIPO[m.tipo]} · {m.comprobante ?? `#${m.id}`}
                </h3>
                <p className="text-[13px] text-texto-3">
                  {m.descripcion || "Sin descripción"}
                </p>
                <Badge tono={TONO_ESTADO[m.estado]} className="mt-1.5">
                  {m.estado}
                </Badge>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3">
              <Dato label="Almacén" valor={m.almacen?.nombre ?? "—"} />
              <Dato label="Origen" valor={m.origen ?? "—"} />
              <Dato label="Fecha" valor={fmtFecha(m.fecha)} />
              <Dato
                label="Aprobado"
                valor={m.fechaAprobacion ? fmtFechaHora(m.fechaAprobacion) : "—"}
              />
            </dl>

            <div>
              <h4 className="mb-2 text-[13px] font-bold text-texto">
                Artículos del movimiento
              </h4>
              {detalles.length === 0 ? (
                <p className="text-[13px] text-texto-3">Este movimiento no tiene líneas.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-borde">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-borde-soft bg-muted text-left">
                        <th className="px-3.5 py-2 font-semibold text-texto-3">Artículo</th>
                        <th className="px-3.5 py-2 text-right font-semibold text-texto-3">
                          Cantidad
                        </th>
                        <th className="px-3.5 py-2 text-right font-semibold text-texto-3">
                          Costo
                        </th>
                        <th className="px-3.5 py-2 text-right font-semibold text-texto-3">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde-soft">
                      {detalles.map((d) => (
                        <tr key={d.id}>
                          <td className="px-3.5 py-2.5 text-texto">
                            {d.producto}
                            {d.descripcion && (
                              <span className="block text-xs text-texto-4">
                                {d.descripcion}
                              </span>
                            )}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-texto">
                            {fmtNum(d.cantidad, 2)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right text-texto">
                            {fmtMoney(d.costo)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-bold text-texto">
                            {fmtMoney(d.subtotal ?? d.cantidad * d.costo)}
                          </td>
                          {/* Editar y borrar sólo mientras está pendiente:
                              después el stock ya se movió. */}
                          {editable && (
                            <td className="px-2 py-2.5">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setEditandoLinea(d)}
                                  aria-label={`Editar ${d.producto}`}
                                  className="rounded-lg p-1.5 text-texto-3 hover:bg-muted hover:text-texto"
                                >
                                  <Icon name="edit" size={15} />
                                </button>
                                <button
                                  onClick={() => setABorrarLinea(d)}
                                  aria-label={`Quitar ${d.producto}`}
                                  className="rounded-lg p-1.5 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
                                >
                                  <Icon name="trash" size={15} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-borde bg-muted">
                        <td colSpan={3} className="px-3.5 py-2.5 font-semibold text-texto-2">
                          Total
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-sm font-bold text-texto">
                          {fmtMoney(total)}
                        </td>
                        {editable && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {editable && (
                <button
                  onClick={() => setEditandoLinea("nueva")}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-borde py-2.5 text-[13px] font-semibold text-texto-2 hover:bg-muted"
                >
                  <Icon name="plus" size={16} />
                  Agregar artículo
                </button>
              )}
            </div>

            {m.estado === "PENDIENTE" && (
              <div className="flex items-start gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
                <Icon name="alert" size={17} />
                <span>
                  Todavía no tocó el inventario: recién al aprobarlo se mueve el stock de
                  verdad.
                </span>
              </div>
            )}
            {m.estado === "ANULADO" && (
              <div className="flex items-start gap-2 rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
                <Icon name="info" size={17} />
                <span>Movimiento anulado: su efecto sobre el stock ya se revirtió.</span>
              </div>
            )}

            <ErrorMsg>{error}</ErrorMsg>
          </div>
        )}
      </Modal>

      <Confirmar
        abierto={confirmando === "aprobar"}
        titulo="Aprobar movimiento"
        texto="Aprobar es lo que realmente mueve el stock del almacén. Después sólo se puede revertir anulándolo."
        etiquetaOk="Aprobar"
        procesando={procesando}
        onCancel={() => setConfirmando(null)}
        onOk={ejecutar}
      />

      <Confirmar
        abierto={confirmando === "anular"}
        titulo="Anular movimiento"
        texto="Anular revierte el stock que este movimiento había aplicado. La operación queda registrada como anulada."
        etiquetaOk="Anular"
        peligroso
        procesando={procesando}
        onCancel={() => setConfirmando(null)}
        onOk={ejecutar}
      />

      <Confirmar
        abierto={confirmando === "eliminar"}
        titulo="Eliminar movimiento"
        texto="Se borra el movimiento pendiente con todas sus líneas. Como nunca se aprobó, el stock no cambia."
        etiquetaOk="Eliminar"
        peligroso
        procesando={procesando}
        onCancel={() => setConfirmando(null)}
        onOk={ejecutar}
      />

      {editandoLinea && m && (
        <FormLineaMovimiento
          movimiento={m}
          linea={editandoLinea === "nueva" ? null : editandoLinea}
          articulos={articulosAlmacen.datos ?? []}
          otrasLineas={detalles.filter(
            (d) => editandoLinea === "nueva" || d.id !== editandoLinea.id,
          )}
          onClose={() => setEditandoLinea(null)}
          onGuardado={() => {
            setEditandoLinea(null);
            mov.recargar();
            onCambio();
          }}
        />
      )}

      <Confirmar
        abierto={!!aBorrarLinea}
        titulo="Quitar artículo"
        texto={`¿Sacar "${aBorrarLinea?.producto}" de este movimiento?`}
        etiquetaOk="Quitar"
        peligroso
        onCancel={() => setABorrarLinea(null)}
        onOk={borrarLinea}
      />
    </>
  );
}

/**
 * Alta y edición de una línea de un movimiento ya guardado.
 *
 * En una SALIDA el tope es el stock del artículo en ese almacén menos lo que ya
 * comprometen las otras líneas del mismo movimiento. Se valida acá y con el
 * disponible a la vista: sin esto el error llegaba recién al aprobar, cuando el
 * dueño ya había cargado diez líneas y no sabía cuál era la que sobraba.
 * Es lo que hacen `AgregarArticuloMovimientoFragment` y su par de edición.
 */
function FormLineaMovimiento({
  movimiento: m,
  linea,
  articulos,
  otrasLineas,
  onClose,
  onGuardado,
}: {
  movimiento: Movimiento;
  /** null = alta. */
  linea: LineaMovimiento | null;
  articulos: ArticuloMovimiento[];
  /** Las demás líneas del movimiento: lo que ya tienen comprometido. */
  otrasLineas: LineaMovimiento[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = !!linea;
  const [productoId, setProductoId] = useState(String(linea?.productoId ?? ""));
  const [cantidad, setCantidad] = useState(linea ? String(linea.cantidad) : "");
  const [costo, setCosto] = useState(linea ? String(linea.costo) : "");
  const [descripcion, setDescripcion] = useState(linea?.descripcion ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const elegido = articulos.find((a) => String(a.id) === productoId);
  const esSalida = m.tipo === "SALIDA";

  /**
   * Cuánto se puede sacar de este artículo. Descuenta lo que ya comprometen
   * las otras líneas: cargar dos veces el mismo producto sumaba más de lo que
   * hay y el rechazo aparecía recién al aprobar.
   */
  const comprometido = otrasLineas
    .filter((d) => String(d.productoId) === productoId)
    .reduce((acc, d) => acc + d.cantidad, 0);
  const disponible = elegido ? Math.max(0, elegido.stock - comprometido) : null;

  async function guardar() {
    if (guardando) return;
    setError("");

    if (!productoId) return setError("Elegí un artículo.");
    const cant = parsearMonto(cantidad);
    if (cant === null || cant <= 0) return setError("La cantidad tiene que ser mayor a 0.");
    const cst = costo === "" ? 0 : parsearMonto(costo);
    if (cst === null || cst < 0) return setError("El costo no puede ser negativo.");

    // El artículo puede haber quedado fuera de la lista (deshabilitado o dado
    // de baja): ahí no se bloquea, decide el backend.
    if (esSalida && disponible !== null && cant > disponible) {
      return setError(
        comprometido > 0
          ? `Sólo quedan ${fmtNum(disponible, 2)} disponibles (ya hay ${fmtNum(comprometido, 2)} en otra línea de este movimiento).`
          : `No hay stock suficiente: quedan ${fmtNum(disponible, 2)}.`,
      );
    }

    setGuardando(true);
    try {
      const input = {
        productoId: Number(productoId),
        cantidad: cant,
        costo: cst,
        descripcion: descripcion.trim(),
      };
      if (linea) await api.actualizarDetalleMovimiento(linea.id, input);
      else await api.agregarDetalleMovimiento(m.id, input);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la línea");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={esEdicion ? "Editar artículo" : "Agregar artículo"}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Artículo">
          <Select
            value={productoId}
            onChange={(e) => {
              const id = e.target.value;
              setProductoId(id);
              // El costo del artículo se autocompleta SIEMPRE, también en 0:
              // saltearlo dejaba pegado el costo del artículo anterior.
              const a = articulos.find((x) => String(x.id) === id);
              if (a && !esEdicion) setCosto(String(a.costo ?? 0));
            }}
            // Cambiar de artículo en una línea ya guardada obligaría a
            // revalidar el stock de dos productos a la vez; se edita la
            // cantidad o se quita la línea y se agrega otra.
            disabled={esEdicion}
          >
            <option value="">Elegí un artículo</option>
            {articulos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} · {fmtNum(a.stock, 2)} en stock
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
          <Campo
            label="Cantidad"
            hint={
              esSalida && disponible !== null
                ? `Disponible: ${fmtNum(disponible, 2)}`
                : undefined
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.001"
              min="0"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              autoFocus
            />
          </Campo>
          <Campo label="Costo unitario">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={costo}
              onChange={(e) => setCosto(e.target.value)}
            />
          </Campo>
        </div>

        <Campo label="Detalle" hint="Opcional">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-bold text-texto">{valor}</dd>
    </div>
  );
}

/** Línea en edición: el costo viaja como texto para no pelear con el input. */
interface LineaDetalle {
  articuloId: number;
  nombre: string;
  unidad: string;
  cantidad: string;
  costo: string;
}

function FormMovimiento({
  abierto,
  almacenes,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  almacenes: Almacen[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  // La clave remonta el formulario en cada apertura: un movimiento a medias
  // no debe reaparecer la próxima vez que se abra el modal.
  if (!abierto) return null;
  return <FormMovimientoCuerpo almacenes={almacenes} onClose={onClose} onGuardado={onGuardado} />;
}

function FormMovimientoCuerpo({
  almacenes,
  onClose,
  onGuardado,
}: {
  almacenes: Almacen[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { incluye } = useAuth();
  const conAprobacion = incluye("aprobacion_inventario");
  const [tipo, setTipo] = useState<TipoMovimiento>("ENTRADA");
  const [almacenId, setAlmacenId] = useState(String(almacenes[0]?.id ?? ""));
  const [fecha, setFecha] = useState(isoDia(new Date()));
  const [comprobante, setComprobante] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [lineas, setLineas] = useState<LineaDetalle[]>([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // El stock que muestra cada artículo es el del almacén elegido, así que la
  // lista se vuelve a pedir cuando cambia.
  const articulos = useApi(
    () => api.getArticulosMovimiento(almacenId ? Number(almacenId) : undefined),
    [almacenId],
  );

  // Cambiar de almacén invalida los costos y stocks ya prellenados.
  useEffect(() => {
    setLineas([]);
  }, [almacenId]);

  const disponibles = (articulos.datos ?? []).filter(
    (a) => !lineas.some((l) => l.articuloId === a.id),
  );

  const total = lineas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.costo), 0);

  function agregarLinea(art: ArticuloMovimiento) {
    setLineas((ls) => [
      ...ls,
      {
        articuloId: art.id,
        nombre: art.nombre,
        unidad: art.unidad,
        cantidad: "1",
        // Se prellena con el costo del artículo: en la mayoría de las entradas
        // se compra al mismo precio de la última vez.
        costo: String(art.costo),
      },
    ]);
  }

  function editarLinea(i: number, cambio: Partial<LineaDetalle>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  async function guardar() {
    setError("");

    if (!almacenId) return setError("Elegí un almacén.");
    if (lineas.length === 0) return setError("Agregá al menos un artículo.");

    const detalles: DetalleMovimientoInput[] = [];
    for (const l of lineas) {
      const cantidad = parsearMonto(String(l.cantidad));
      if (cantidad === null || cantidad <= 0)
        return setError(`La cantidad de "${l.nombre}" tiene que ser mayor a cero.`);
      const costo = l.costo === "" ? 0 : parsearMonto(String(l.costo));
      if (costo === null || costo < 0)
        return setError(`El costo de "${l.nombre}" tiene que ser un número válido.`);

      // En una SALIDA no se puede sacar más de lo que hay. Se avisa acá y no
      // al aprobar: con diez líneas cargadas, un rechazo del backend no dice
      // cuál de todas es la que sobra.
      if (tipo === "SALIDA") {
        const art = (articulos.datos ?? []).find((a) => a.id === l.articuloId);
        // Si el artículo ya no está en la lista (deshabilitado o dado de baja)
        // no se bloquea: decide el backend.
        if (art && cantidad > art.stock) {
          return setError(
            `No hay stock suficiente de "${l.nombre}": quedan ${fmtNum(art.stock, 2)}.`,
          );
        }
      }

      detalles.push({ productoId: l.articuloId, cantidad, costo });
    }

    const input: MovimientoInput = {
      tipo,
      almacenId: Number(almacenId),
      fecha,
      comprobante: comprobante.trim(),
      descripcion: descripcion.trim(),
      detalles,
    };

    setGuardando(true);
    try {
      const creado = await api.crearMovimiento(input);
      // El backend SIEMPRE crea el movimiento pendiente y sólo aprobarlo
      // mueve el stock. Sin la capacidad de aprobación no habría botón para
      // hacerlo y la mercadería nunca entraría, así que se aprueba de una:
      // el negocio que no compró el circuito de dos pasos igual carga stock.
      if (!conAprobacion) await api.aprobarMovimiento(creado.id);
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
      titulo="Nuevo movimiento"
      subtitulo="Nace pendiente: recién al aprobarlo se mueve el stock"
      onClose={onClose}
      ancho="max-w-2xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
              {(Object.keys(ETIQUETA_TIPO) as TipoMovimiento[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO[t]}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Almacén">
            <Select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
              <option value="">Elegí uno</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo label="Comprobante" hint="Nº de factura o nota, si hay">
            <Input value={comprobante} onChange={(e) => setComprobante(e.target.value)} />
          </Campo>
        </div>

        <Campo label="Descripción">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <div className="rounded-xl border border-borde p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[13px] font-bold text-texto">Artículos</h4>
            <span className="text-xs text-texto-3">
              {lineas.length} {lineas.length === 1 ? "línea" : "líneas"}
            </span>
          </div>

          {lineas.length === 0 ? (
            <p className="py-2 text-[13px] text-texto-3">
              Agregá los productos o insumos que entran o salen.
            </p>
          ) : (
            <ul className="mb-3 space-y-2.5">
              {lineas.map((l, i) => (
                <li key={l.articuloId} className="rounded-xl bg-muted p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-texto">
                      {l.nombre}
                      {l.unidad && (
                        <span className="ml-1 font-normal text-texto-4">({l.unidad})</span>
                      )}
                    </span>
                    <button
                      onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                      aria-label={`Quitar ${l.nombre}`}
                      className="rounded-lg p-1.5 text-danger-text hover:bg-danger-bg"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 items-end gap-2">
                    <Campo label="Cantidad">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0.01"
                        value={l.cantidad}
                        onChange={(e) => editarLinea(i, { cantidad: e.target.value })}
                      />
                    </Campo>
                    <Campo label="Costo">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={l.costo}
                        onChange={(e) => editarLinea(i, { costo: e.target.value })}
                      />
                    </Campo>
                    <div className="pb-2.5 text-right">
                      <p className="text-[11px] font-semibold uppercase text-texto-4">
                        Subtotal
                      </p>
                      <p className="text-sm font-bold text-texto">
                        {fmtMoney(Number(l.cantidad) * Number(l.costo))}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Select
            value=""
            disabled={!almacenId || articulos.cargando}
            onChange={(e) => {
              const art = (articulos.datos ?? []).find(
                (a) => a.id === Number(e.target.value),
              );
              if (art) agregarLinea(art);
            }}
          >
            <option value="">
              {!almacenId
                ? "Elegí primero un almacén…"
                : articulos.cargando
                  ? "Cargando artículos…"
                  : "+ Agregar artículo…"}
            </option>
            {disponibles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre} — {fmtNum(a.stock, 2)} {a.unidad}
                {a.esInsumo ? " (insumo)" : ""}
              </option>
            ))}
          </Select>

          {lineas.length > 0 && (
            <div className="mt-3 flex items-center justify-between border-t border-borde-soft pt-3">
              <span className="text-[13px] font-semibold text-texto-2">Total</span>
              <span className="text-base font-bold text-texto">{fmtMoney(total)}</span>
            </div>
          )}
        </div>

        <ErrorMsg>{error || articulos.error}</ErrorMsg>
      </div>
    </Modal>
  );
}
