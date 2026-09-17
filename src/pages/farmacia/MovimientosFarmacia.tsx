import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Vacio,
} from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtFecha, fmtFechaHora, fmtMoney, fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { DetalleMovimiento, EstadoDocumento, Movimiento } from "../../types";
import {
  esEntrada,
  etiquetaTipo,
  isoAMes,
  mesAIso,
  resumenArticulos,
  tecleoMes,
} from "./mercaderia";

type FiltroTipo = "todos" | "ENTRADA" | "SALIDA";

const OPC_TIPO = [
  ["todos", "Todos los tipos"],
  ["ENTRADA", "Entradas"],
  ["SALIDA", "Salidas"],
] as const satisfies readonly (readonly [FiltroTipo, string])[];

const TONO_ESTADO: Record<EstadoDocumento, "verde" | "amarillo" | "rojo"> = {
  APROBADO: "verde",
  PENDIENTE: "amarillo",
  ANULADO: "rojo",
};

/**
 * El registro de todo lo que entró y salió del almacén.
 *
 * Es la misma lista de Movimientos de Inventario, contada para una farmacia, y
 * se diferencia en tres cosas:
 *
 *  1. **No arranca filtrada por hoy.** En una pollería entran mercaderías todos
 *     los días y "hoy" es el filtro correcto; en una farmacia la droguería pasa
 *     dos veces por semana, así que abrir la pantalla y encontrarla vacía era
 *     hacerle creer al dueño que no había nada cargado.
 *  2. **Dos filtros, no cinco.** Entradas y salidas. El estado se lee en el
 *     chip de cada tarjeta y el origen (producto / insumo) no significa nada
 *     acá: una farmacia no tiene insumos, así que la etiqueta era siempre la
 *     misma y no enseñaba nada.
 *  3. **Explica cómo se arregla un error**, arriba de todo. Es la pregunta que
 *     aparece el primer día: cargué mal una recepción, ¿ahora qué? La respuesta
 *     depende de si ya se aprobó, y conviene que esté escrita antes de que
 *     alguien invente su propia forma.
 *
 * Las entradas y las salidas se cargan en `FormMercaderia`, que ocupa la
 * pantalla entera; acá sólo se consultan, se aprueban y se anulan.
 */
export default function MovimientosFarmacia() {
  const navigate = useNavigate();
  const movimientos = useApi(() => api.getMovimientos(), []);

  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = movimientos.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim();
    return lista.filter((m) => {
      if (filtroTipo !== "todos" && m.tipo !== filtroTipo) return false;
      if (
        texto &&
        !contiene(m.comprobante, texto) &&
        !contiene(m.descripcion, texto) &&
        // "¿Cuándo entró la última amoxicilina?" se contesta buscándola acá.
        !(m.productos ?? []).some((p) => contiene(p, texto))
      )
        return false;
      return true;
    });
  }, [lista, q, filtroTipo]);

  const pendientes = lista.filter((m) => m.estado === "PENDIENTE").length;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Movimientos"
        subtitulo={
          pendientes
            ? `${lista.length} registrados · ${pendientes} sin aprobar`
            : `${lista.length} registrados · entradas y salidas de stock`
        }
        accion={
          <Boton icono="plus" onClick={() => navigate("/inventario/movimientos/ingreso")}>
            Nuevo movimiento
          </Boton>
        }
      />

      <div className="flex items-start gap-2.5 rounded-xl bg-info-bg px-4 py-3 text-[13px] text-info-text">
        <span className="mt-0.5 shrink-0">
          <Icon name="info" size={17} />
        </span>
        <p>
          Este es el <strong>registro de todo el stock por almacén</strong>. Con{" "}
          <strong>Nuevo movimiento</strong> cargás una <strong>entrada</strong> (recepción
          de proveedor, con lote y vencimiento) o una <strong>salida</strong> (baja por
          vencimiento, daño, robo o carga de más). Si un movimiento pendiente tiene un
          error, usá <strong>Editar</strong>; si ya está aprobado, corregilo con una salida.
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador
            valor={q}
            onChange={setQ}
            placeholder="Buscar por medicamento, factura, proveedor o motivo"
          />
        </div>
        <Chips valor={filtroTipo} opciones={OPC_TIPO} onChange={setFiltroTipo} />
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
                ? "Probá con otro texto o sacá el filtro."
                : "Empezá por la primera recepción de la droguería."
            }
            accion={
              !lista.length && (
                <Boton
                  icono="plus"
                  onClick={() => navigate("/inventario/movimientos/ingreso")}
                >
                  Cargar un ingreso
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtrados.map((m) => (
            <Tarjeta key={m.id} mov={m} onClick={() => setDetalleId(m.id)} />
          ))}
        </ul>
      )}

      {detalleId !== null && (
        <DetalleMercaderia
          id={detalleId}
          onClose={() => setDetalleId(null)}
          onCambio={() => movimientos.recargar()}
          onCerrarYRecargar={() => {
            setDetalleId(null);
            movimientos.recargar();
          }}
          onError={setErrorAccion}
        />
      )}
    </div>
  );
}

function Tarjeta({ mov: m, onClick }: { mov: Movimiento; onClick: () => void }) {
  const entrada = esEntrada(m.tipo);

  // Lo que hace reconocible al movimiento de un vistazo: en una entrada, de qué
  // droguería vino; en una salida, por qué se dio de baja.
  const detalle = [
    fmtFecha(m.fecha),
    m.almacen?.nombre,
    resumenArticulos(m.productos, m.items),
    m.descripcion || null,
  ]
    .filter(Boolean)
    .join(" · ");

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
            <span className="text-sm font-bold text-texto">#{m.id}</span>
            {m.comprobante && (
              <span className="text-[13px] font-semibold text-texto-2">
                {m.comprobante}
              </span>
            )}
            <Badge tono={TONO_ESTADO[m.estado]}>{m.estado}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">{detalle}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-texto">{fmtMoney(m.monto)}</p>
          <p
            className={`text-xs font-semibold ${
              entrada ? "text-primary-700" : "text-danger-text"
            }`}
          >
            {etiquetaTipo(m.tipo)}
          </p>
        </div>
      </button>
    </li>
  );
}

/**
 * El detalle de un movimiento, con lo que se puede hacer sin salir de acá.
 *
 * Los renglones se corrigen **en los dos lados**: acá, con el lápiz y el tacho
 * de cada fila, para el arreglo rápido de "puse 12 y eran 10"; y en el
 * formulario entero con "Editar", para cuando hay que sumar productos o cambiar
 * el proveedor. Obligar a abrir el formulario para sacar un renglón era pedir
 * seis clics por una cantidad mal tipeada.
 *
 * Todo eso sólo mientras está PENDIENTE: uno aprobado ya movió el stock y
 * cambiarle una cantidad dejaría el inventario diciendo una cosa y el documento
 * otra. Ahí la única salida honesta es anularlo.
 */
function DetalleMercaderia({
  id,
  onClose,
  onCambio,
  onCerrarYRecargar,
  onError,
}: {
  id: number;
  onClose: () => void;
  /** Cambió algo adentro: refresca la lista de atrás sin cerrar el diálogo. */
  onCambio: () => void;
  onCerrarYRecargar: () => void;
  onError: (mensaje: string) => void;
}) {
  const navigate = useNavigate();
  const mov = useApi(() => api.getMovimiento(id), [id]);
  const [confirmando, setConfirmando] = useState<"aprobar" | "anular" | "eliminar" | null>(
    null,
  );
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [editandoLinea, setEditandoLinea] = useState<DetalleMovimiento | null>(null);
  const [aQuitar, setAQuitar] = useState<DetalleMovimiento | null>(null);

  const m = mov.datos;
  const detalles = m?.detalles ?? [];
  const pendiente = m?.estado === "PENDIENTE";
  const entrada = m ? esEntrada(m.tipo) : true;
  const total = detalles.reduce((acc, d) => acc + (d.subtotal ?? d.cantidad * d.costo), 0);
  const conLote = detalles.some((d) => d.loteCodigo);

  async function quitarLinea() {
    if (!aQuitar) return;
    setError("");
    try {
      await api.eliminarDetalleMovimiento(aQuitar.id);
      setAQuitar(null);
      mov.recargar();
      onCambio();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo quitar el renglón");
      setAQuitar(null);
    }
  }

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
      onCerrarYRecargar();
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
        titulo={m ? `${etiquetaTipo(m.tipo)} · #${m.id}` : "Cargando…"}
        subtitulo={m?.comprobante ?? undefined}
        onClose={onClose}
        ancho="max-w-2xl"
        acciones={
          pendiente ? (
            <>
              <Boton
                variante="ghost"
                icono="edit"
                disabled={procesando}
                onClick={() => navigate(`/inventario/movimientos/${id}/editar`)}
              >
                Editar
              </Boton>
              <Boton
                variante="danger"
                icono="trash"
                disabled={procesando}
                onClick={() => setConfirmando("eliminar")}
              >
                Eliminar
              </Boton>
              <Boton
                icono="check"
                disabled={procesando}
                onClick={() => setConfirmando("aprobar")}
              >
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
            <div
              className={`flex items-center gap-3 rounded-xl p-4 ${
                entrada ? "bg-primary-50" : "bg-danger-bg/60"
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                  entrada
                    ? "bg-primary-100 text-primary-700"
                    : "bg-danger-bg text-danger-text"
                }`}
              >
                <Icon name={entrada ? "trendingUp" : "trendingDown"} size={24} />
              </span>
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold text-texto">
                  {etiquetaTipo(m.tipo)} · #{m.id}
                </h3>
                <p className="text-[13px] text-texto-3">
                  {m.descripcion || (entrada ? "Sin proveedor anotado" : "Sin motivo anotado")}
                </p>
                <Badge tono={TONO_ESTADO[m.estado]} className="mt-1.5">
                  {m.estado}
                </Badge>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Dato label="Almacén" valor={m.almacen?.nombre ?? "—"} />
              <Dato label="Fecha" valor={fmtFecha(m.fecha)} />
              <Dato label={entrada ? "Nº factura" : "Motivo"} valor={pieDeDato(m, entrada)} />
              {m.fechaAprobacion && (
                <Dato label="Aprobado" valor={fmtFechaHora(m.fechaAprobacion)} />
              )}
            </dl>

            <div>
              <h4 className="mb-2 text-[13px] font-bold text-texto">
                Productos del movimiento
              </h4>
              {detalles.length === 0 ? (
                <p className="text-[13px] text-texto-3">Este movimiento no tiene renglones.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-borde">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-borde-soft bg-muted text-left text-[11px] font-bold uppercase tracking-wide text-texto-3">
                        <th className="px-3.5 py-2">Producto</th>
                        {conLote && <th className="px-3 py-2">Lote</th>}
                        <th className="px-3 py-2 text-right">Cant.</th>
                        <th className="px-3 py-2 text-right">Costo</th>
                        <th className="px-3.5 py-2 text-right">Subtotal</th>
                        {pendiente && <th className="w-20" />}
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
                          {conLote && (
                            <td className="px-3 py-2.5">
                              {d.loteCodigo ? (
                                <>
                                  <span className="block font-semibold text-texto">
                                    {d.loteCodigo}
                                  </span>
                                  {d.loteVencimiento && (
                                    <span className="block text-xs text-texto-4">
                                      vence {isoAMes(d.loteVencimiento)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <span className="text-texto-4">—</span>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right text-texto">
                            {fmtNum(d.cantidad, 2)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-texto">
                            {fmtMoney(d.costo)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-bold text-texto">
                            {fmtMoney(d.subtotal ?? d.cantidad * d.costo)}
                          </td>
                          {/* El arreglo rápido, sin abrir el formulario entero.
                              Sólo con el movimiento pendiente: después el stock
                              ya se movió. */}
                          {pendiente && (
                            <td className="px-2 py-2.5">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setEditandoLinea(d)}
                                  aria-label={`Editar ${d.producto}`}
                                  className="rounded-lg p-1.5 text-texto-3 transition-colors hover:bg-muted hover:text-texto"
                                >
                                  <Icon name="edit" size={15} />
                                </button>
                                <button
                                  onClick={() => setAQuitar(d)}
                                  aria-label={`Quitar ${d.producto}`}
                                  className="rounded-lg p-1.5 text-texto-3 transition-colors hover:bg-danger-bg hover:text-danger-text"
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
                        <td
                          colSpan={conLote ? 4 : 3}
                          className="px-3.5 py-2.5 font-semibold text-texto-2"
                        >
                          Total
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-sm font-bold text-texto">
                          {fmtMoney(total)}
                        </td>
                        {pendiente && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {pendiente && (
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
        texto="Se borra el movimiento pendiente con todos sus renglones. Como nunca se aprobó, el stock no cambia."
        etiquetaOk="Eliminar"
        peligroso
        procesando={procesando}
        onCancel={() => setConfirmando(null)}
        onOk={ejecutar}
      />

      <Confirmar
        abierto={!!aQuitar}
        titulo="Quitar producto"
        texto={`¿Sacar "${aQuitar?.producto}" de este movimiento?`}
        etiquetaOk="Quitar"
        peligroso
        onCancel={() => setAQuitar(null)}
        onOk={quitarLinea}
      />

      {editandoLinea && (
        <EditarRenglon
          linea={editandoLinea}
          entrada={entrada}
          onClose={() => setEditandoLinea(null)}
          onGuardado={() => {
            setEditandoLinea(null);
            mov.recargar();
            onCambio();
          }}
        />
      )}
    </>
  );
}

/** El dato de la tercera casilla: la factura en una entrada, el motivo en una salida. */
function pieDeDato(m: Movimiento, entrada: boolean): string {
  if (entrada) return m.comprobante || "—";
  return m.descripcion || "—";
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-bold text-texto" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

/**
 * El arreglo rápido de un renglón: cantidad, costo y —si es una entrada con
 * lote— el lote y su vencimiento.
 *
 * No deja cambiar el producto. Cambiarlo obligaría a revalidar el stock de dos
 * artículos a la vez, y para eso está sacar el renglón y agregar el correcto,
 * que además deja el movimiento contando lo que de verdad pasó.
 */
function EditarRenglon({
  linea: d,
  entrada,
  onClose,
  onGuardado,
}: {
  linea: DetalleMovimiento;
  entrada: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [cantidad, setCantidad] = useState(String(d.cantidad));
  const [costo, setCosto] = useState(String(d.costo));
  const [loteCodigo, setLoteCodigo] = useState(d.loteCodigo ?? "");
  const [loteMes, setLoteMes] = useState(isoAMes(d.loteVencimiento));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Sólo se toca el lote de una entrada que ya lo traía: una salida no elige
  // lote, sale el más próximo a vencer.
  const conLote = entrada && !!d.loteCodigo;

  async function guardar() {
    if (guardando) return;
    setError("");

    const cant = parsearMonto(cantidad);
    if (cant === null || cant <= 0) return setError("La cantidad tiene que ser mayor a 0.");
    const cst = costo === "" ? 0 : parsearMonto(costo);
    if (cst === null || cst < 0) return setError("El costo no puede ser negativo.");

    let vencimiento: string | undefined;
    if (conLote) {
      if (!loteCodigo.trim())
        return setError("Falta el lote: sin él la mercadería no aparece en Vencimientos.");
      const iso = mesAIso(loteMes);
      if (!iso) return setError("El vencimiento se escribe MM/AAAA, como en el envase.");
      vencimiento = iso;
    }

    setGuardando(true);
    try {
      await api.actualizarDetalleMovimiento(d.id, {
        cantidad: cant,
        costo: cst,
        ...(conLote ? { loteCodigo: loteCodigo.trim(), loteVencimiento: vencimiento } : {}),
      });
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el renglón");
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Editar renglón"
      subtitulo={d.producto}
      onClose={onClose}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Cantidad">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
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

        {conLote && (
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Lote">
              <Input value={loteCodigo} onChange={(e) => setLoteCodigo(e.target.value)} />
            </Campo>
            <Campo label="Vencimiento" hint="MM/AAAA">
              <Input
                value={loteMes}
                onChange={(e) => setLoteMes(tecleoMes(e.target.value))}
                placeholder="MM/AAAA"
                inputMode="numeric"
              />
            </Campo>
          </div>
        )}

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
