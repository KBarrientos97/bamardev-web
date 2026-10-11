import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtFecha, fmtNum, isoDia } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type {
  Almacen,
  ArticuloMovimiento,
  DetalleMovimientoInput,
  LoteConSaldo,
  MovimientoInput,
  Producto,
} from "../../types";
import BuscadorArticulo from "./BuscadorArticulo";
import { concentracionAparte, conUnidad, detalleDe } from "./medicamento";
import { ordenarSucursales, vencidasQueSalen } from "./mercaderia";

/** Un renglón mientras se edita. La cantidad viaja como texto, como en el ingreso. */
interface LineaTransferencia {
  /** Id del detalle en el servidor. Sin esto es un renglón nuevo. */
  detalleId?: number;
  articuloId: number;
  nombre: string;
  /** "Paracetamol · BAGÓ · Comprimido": lo que separa dos que se llaman igual. */
  detalle: string;
  cantidad: string;
}

/**
 * Mandar mercadería de una sucursal a otra.
 *
 * Es la TRANSFERENCIA del motor: un solo documento con dos puntas que, al
 * aprobarse, saca el stock del origen y lo pone en el destino. El lote viaja
 * con la mercadería —el servidor lo elige por FEFO, como en una baja—, así que
 * acá no se pregunta: se muestra cuál sale.
 *
 * Tiene pantalla propia y no es un tercer botón de Ingreso/Salida: no lleva
 * proveedor, ni factura, ni motivo, y sí lleva dos sucursales. Meterla en ese
 * formulario —el de todos los días— era llenarlo de "si es transferencia…".
 *
 * Con `:id` edita una transferencia PENDIENTE: todavía no movió nada, así que
 * se corrige todo, también de dónde sale y a dónde va. Una aprobada se corrige
 * anulándola, que devuelve al origen las mismas partidas que viajaron.
 */
export default function FormTransferencia() {
  const navigate = useNavigate();
  const { id } = useParams();
  const movId = id ? Number(id) : null;
  const { state } = useLocation();
  const { incluye, usuario } = useAuth();
  // El extra "Aprobar movimientos" (doble control): quien carga sólo guarda y
  // aprueba otra persona desde Movimientos, igual que en Ingreso y Salida.
  const dobleControl = incluye("aprobacion_inventario");
  /** El usuario de una sucursal sólo manda desde la suya: el servidor no le deja otra. */
  const miSucursal = usuario?.sucursalId ?? null;

  const [origenId, setOrigenId] = useState("");
  const [destinoId, setDestinoId] = useState("");
  const [fecha, setFecha] = useState(isoDia(new Date()));
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<LineaTransferencia[]>([]);
  const [buscando, setBuscando] = useState(false);
  // Llega con aviso cuando se guardó pero no se pudo aprobar (ver `quedoPendiente`).
  const [error, setError] = useState(() => avisoDe(state));
  const [guardando, setGuardando] = useState(false);
  const [confirmandoAprobar, setConfirmandoAprobar] = useState(false);

  const almacenes = useApi(() => api.getAlmacenes(), []);
  const mov = useApi(
    () => (movId ? api.getMovimiento(movId) : Promise.resolve(null)),
    [movId],
  );
  // El stock que importa es el del ORIGEN: es de ahí de donde sale.
  const articulos = useApi(
    () =>
      origenId
        ? api.getArticulosMovimiento(Number(origenId))
        : Promise.resolve([] as ArticuloMovimiento[]),
    [origenId],
  );
  const porId = useMemo(
    () => new Map((articulos.datos ?? []).map((a) => [a.id, a])),
    [articulos.datos],
  );

  /** Los renglones tal como están en el servidor, para saber qué se borró. */
  const originales = useRef<number[]>([]);
  const hidratado = useRef(false);
  /** El guardado en curso: corta el doble clic, que crearía dos transferencias. */
  const enVuelo = useRef(false);

  const todas = useMemo(() => almacenes.datos ?? [], [almacenes.datos]);
  /** Un local desactivado no manda ni recibe mercadería. */
  const activas = useMemo(() => ordenarSucursales(todas.filter((a) => a.activo)), [todas]);
  const nombreDe = (valor: string) => todas.find((a) => String(a.id) === valor)?.nombre ?? "";
  const origenNombre = nombreDe(origenId);
  const destinoNombre = nombreDe(destinoId);
  const mismaSucursal = !!origenId && origenId === destinoId;

  // De dónde sale, sólo al crear: la sucursal de quien carga y, si es el dueño
  // (no pertenece a ninguna), la principal.
  useEffect(() => {
    if (movId || origenId || activas.length === 0) return;
    const sugerida =
      activas.find((a) => a.id === miSucursal) ??
      activas.find((a) => a.esPrincipal) ??
      activas[0];
    setOrigenId(String(sugerida.id));
  }, [activas, miSucursal, movId, origenId]);

  // A dónde va, sólo al crear y sólo si no hay nada que elegir: con dos
  // sucursales, la otra. Con más, lo elige quien carga.
  useEffect(() => {
    if (movId || destinoId || !origenId) return;
    const otras = activas.filter((a) => String(a.id) !== origenId);
    if (otras.length === 1) setDestinoId(String(otras[0].id));
  }, [activas, destinoId, movId, origenId]);

  // Al editar, el formulario arranca con lo guardado. Una sola vez: después
  // manda lo que la persona esté escribiendo.
  useEffect(() => {
    const m = mov.datos;
    if (!m || hidratado.current || m.tipo !== "TRANSFERENCIA") return;
    hidratado.current = true;
    setOrigenId(String(m.almacen?.id ?? ""));
    setDestinoId(String(m.almacenDestino?.id ?? ""));
    setFecha(isoDia(new Date(m.fecha)));
    setNota(m.descripcion ?? "");
    const detalles = m.detalles ?? [];
    originales.current = detalles.map((d) => d.id);
    setLineas(
      detalles.map((d) => ({
        detalleId: d.id,
        articuloId: d.productoId,
        nombre: d.producto,
        detalle: d.descripcion ?? "",
        cantidad: String(d.cantidad),
      })),
    );
  }, [mov.datos]);

  function editarLinea(i: number, cambio: Partial<LineaTransferencia>) {
    // El error es de un intento anterior: en cuanto se toca algo deja de ser cierto.
    if (error) setError("");
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  function agregarLinea(art: ArticuloMovimiento, p: Producto) {
    if (error) setError("");
    setLineas((ls) => [
      ...ls,
      { articuloId: art.id, nombre: art.nombre, detalle: detalleDe(p), cantidad: "1" },
    ]);
    setBuscando(false);
  }

  /** Arma los renglones para el servidor, o devuelve el primer error legible. */
  function revisar(): { detalles: DetalleMovimientoInput[] } | { error: string } {
    if (!origenId) return { error: "Elegí de qué sucursal sale la mercadería." };
    if (!destinoId) return { error: "Elegí a qué sucursal va la mercadería." };
    if (mismaSucursal)
      return { error: `Elegí otra sucursal de destino: la mercadería sale de ${origenNombre}.` };
    if (lineas.length === 0) return { error: "Agregá al menos un producto." };

    const detalles: DetalleMovimientoInput[] = [];
    for (const l of lineas) {
      const cantidad = parsearMonto(l.cantidad);
      if (cantidad === null || cantidad <= 0)
        return { error: `La cantidad de "${l.nombre}" tiene que ser mayor a cero.` };
      // No se manda lo que no hay. Se avisa acá y no al aprobar: con diez
      // renglones, el rechazo del servidor no dice cuál sobra. Un artículo que
      // ya no está en la lista (deshabilitado) no se frena: decide el servidor.
      const art = porId.get(l.articuloId);
      if (art && cantidad > art.stock) {
        // "u." ya trae su punto: sin esto el mensaje terminaba en "100 u..".
        const quedan = conUnidad(art.stock, art.unidad);
        return {
          error: `No hay stock suficiente de "${l.nombre}" en ${origenNombre || "esa sucursal"}: quedan ${quedan}${quedan.endsWith(".") ? "" : "."}`,
        };
      }
      // Sin costo: lo pone el servidor, el del producto. Una transferencia no
      // es una compra y no tiene un precio propio que anotar.
      detalles.push({ productoId: l.articuloId, cantidad });
    }
    return { detalles };
  }

  /** "Guardar y aprobar" revisa primero: confirmar algo que no se puede guardar sobra. */
  function pedirAprobacion() {
    const listo = revisar();
    if ("error" in listo) return setError(listo.error);
    setError("");
    setConfirmandoAprobar(true);
  }

  /**
   * Guardar la deja PENDIENTE: la mercadería todavía no salió. Con `aprobar`
   * se guarda y se aprueba en el mismo momento, que es lo que la mueve.
   */
  async function guardar(aprobar = false) {
    if (enVuelo.current) return;
    enVuelo.current = true;
    setError("");

    const listo = revisar();
    if ("error" in listo) {
      enVuelo.current = false;
      setConfirmandoAprobar(false);
      return setError(listo.error);
    }

    setGuardando(true);
    let guardadoId: number;
    try {
      if (movId) {
        await guardarEdicion(movId, listo.detalles);
        guardadoId = movId;
      } else {
        guardadoId = await guardarNueva(listo.detalles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      // Se libera para poder reintentar. Al editar, lo que sí se hizo ya quedó
      // anotado (ver `guardarEdicion`): reintentar no lo repite.
      enVuelo.current = false;
      setGuardando(false);
      setConfirmandoAprobar(false);
      return;
    }

    if (aprobar) {
      try {
        await api.aprobarMovimiento(guardadoId);
      } catch (err) {
        return quedoPendiente(guardadoId, err);
      }
    }
    navigate("/inventario/movimientos");
  }

  /**
   * Se guardó, pero el servidor no la dejó aprobar (no alcanzó el stock, por
   * ejemplo). Ya existe PENDIENTE, así que se sigue desde lo guardado:
   * reintentar con el formulario de antes la crearía de nuevo.
   */
  function quedoPendiente(guardadoId: number, err: unknown) {
    const motivo = err instanceof Error ? err.message : "no se pudo";
    const aviso = `Se guardó como pendiente, pero no se pudo aprobar: ${motivo}`;
    enVuelo.current = false;
    setGuardando(false);
    setConfirmandoAprobar(false);
    if (movId) {
      hidratado.current = false;
      mov.recargar();
      setError(aviso);
    } else {
      navigate(`/inventario/movimientos/transferencia/${guardadoId}/editar`, {
        replace: true,
        state: { aviso },
      });
    }
  }

  /** Crea la transferencia. El servidor SIEMPRE la crea pendiente. */
  async function guardarNueva(detalles: DetalleMovimientoInput[]): Promise<number> {
    const input: MovimientoInput = {
      tipo: "TRANSFERENCIA",
      almacenId: Number(origenId),
      almacenDestinoId: Number(destinoId),
      fecha,
      comprobante: "",
      descripcion: nota.trim(),
      detalles,
    };
    const creada = await api.crearMovimiento(input);
    return creada.id;
  }

  /**
   * La cabecera va por PATCH —con las dos sucursales— y cada renglón con su
   * llamada. Se borra primero, como en el ingreso. La fecha, sólo si se tocó:
   * reenviarla le cambiaría la hora a una transferencia cargada a la noche.
   */
  async function guardarEdicion(idMov: number, detalles: DetalleMovimientoInput[]) {
    const fechaOriginal = mov.datos ? isoDia(new Date(mov.datos.fecha)) : fecha;
    await api.actualizarMovimiento(idMov, {
      almacenId: Number(origenId),
      almacenDestinoId: Number(destinoId),
      descripcion: nota.trim(),
      ...(fecha !== fechaOriginal ? { fecha } : {}),
    });

    // Cada paso se anota apenas el servidor lo confirma, como en el ingreso:
    // si uno del medio falla, reintentar no vuelve a crear el renglón que ya
    // entró (al aprobar viajaría doble) ni a borrar uno que ya no está (404).
    const vivos = new Set(lineas.map((l) => l.detalleId).filter(Boolean));
    for (const detalleId of [...originales.current]) {
      if (vivos.has(detalleId)) continue;
      await api.eliminarDetalleMovimiento(detalleId);
      originales.current = originales.current.filter((x) => x !== detalleId);
    }
    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      if (linea.detalleId) {
        await api.actualizarDetalleMovimiento(linea.detalleId, {
          cantidad: detalles[i].cantidad,
        });
      } else {
        const creado = await api.agregarDetalleMovimiento(idMov, detalles[i]);
        originales.current = [...originales.current, creado.id];
        // Por artículo: el buscador no deja repetir uno, y la posición pudo
        // cambiar si mientras tanto se quitó un renglón.
        setLineas((ls) =>
          ls.map((l) =>
            !l.detalleId && l.articuloId === linea.articuloId ? { ...l, detalleId: creado.id } : l,
          ),
        );
      }
    }
  }

  const volver = () => navigate("/inventario/movimientos");

  if ((movId && mov.cargando) || almacenes.cargando) {
    return (
      <div className="mx-auto max-w-5xl p-5">
        <Cargando />
      </div>
    );
  }

  // Una entrada o una salida abierta por esta dirección va a su pantalla: acá
  // se guardaría como transferencia.
  if (movId && mov.datos && mov.datos.tipo !== "TRANSFERENCIA") {
    return <Navigate to={`/inventario/movimientos/${movId}/editar`} replace />;
  }

  if (movId && mov.datos && mov.datos.estado !== "PENDIENTE") {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <Encabezado titulo={`Transferencia #${movId}`} onVolver={volver} />
        <div className="card p-5">
          <p className="text-sm text-texto-2">
            Esta transferencia ya está {mov.datos.estado.toLowerCase()}: la mercadería ya se movió
            y no se edita. Si hay que corregirla, anulala desde Movimientos: devuelve al origen
            las mismas partidas que viajaron.
          </p>
          <Boton className="mt-4" variante="ghost" onClick={volver}>
            Volver al registro
          </Boton>
        </div>
      </div>
    );
  }

  // Con un solo local no hay a dónde mandar nada. Al editar no se frena: la
  // transferencia ya existe y se tiene que poder corregir o borrar.
  if (!movId && almacenes.datos && activas.length < 2) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <Encabezado titulo="Transferir mercadería" onVolver={volver} />
        <div className="card p-5">
          <p className="text-sm text-texto-2">
            Para transferir hacen falta al menos dos sucursales activas, y este negocio tiene{" "}
            {activas.length === 1 ? "una" : "ninguna"}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/inventario/almacenes"
              className="rounded-xl bg-primary-boton px-4 py-2 text-sm font-semibold text-white"
            >
              Ver sucursales
            </Link>
            <Boton variante="ghost" onClick={volver}>
              Volver al registro
            </Boton>
          </div>
        </div>
      </div>
    );
  }

  // Las opciones de cada lado. La elegida se ofrece aunque ya no esté activa:
  // al editar una vieja, el desplegable tiene que poder mostrarla.
  const desde = conLaElegida(
    miSucursal != null ? activas.filter((a) => a.id === miSucursal) : activas,
    todas,
    origenId,
  );
  const hacia = conLaElegida(activas, todas, destinoId);
  const unidades = lineas.reduce((acc, l) => acc + (parsearMonto(l.cantidad) ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5 pb-10">
      <Encabezado
        titulo={movId ? `Editar transferencia #${movId}` : "Transferir mercadería"}
        onVolver={volver}
      />

      {/* ── De dónde a dónde ── */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Sale de *">
            <Select value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
              <option value="">Elegí una</option>
              {desde.map((a) => (
                <option key={a.id} value={a.id}>
                  {nombreConTipo(a)}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo
            label="Va a *"
            error={
              mismaSucursal
                ? `Tiene que ser otra: la mercadería sale de ${origenNombre}.`
                : undefined
            }
          >
            <Select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              <option value="">Elegí una</option>
              {hacia.map((a) => (
                <option key={a.id} value={a.id}>
                  {nombreConTipo(a)}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>

          <Campo label="Nota (opcional)">
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej: reposición semanal"
            />
          </Campo>
        </div>

        <p className="flex items-start gap-2 text-xs text-texto-3">
          <Icon name="info" size={15} />
          <span>
            {origenNombre && destinoNombre && !mismaSucursal
              ? `Al aprobarla, la mercadería sale de ${origenNombre} y entra en ${destinoNombre} con su mismo lote.`
              : "Al aprobarla, la mercadería sale de una sucursal y entra en la otra con su mismo lote."}
          </span>
        </p>
      </section>

      {/* ── Qué se manda ── */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-texto">Productos</h2>
          <span className="text-xs text-texto-3">
            {lineas.length} {lineas.length === 1 ? "línea" : "líneas"}
          </span>
        </div>

        {lineas.length > 0 && (
          <ul className="mb-3 space-y-2.5">
            {lineas.map((l, i) => {
              const art = porId.get(l.articuloId);
              return (
                <Renglon
                  key={l.detalleId ?? `nuevo-${l.articuloId}`}
                  linea={l}
                  articulo={art}
                  conLote={art?.manejaLote ?? false}
                  origenId={Number(origenId)}
                  origenNombre={origenNombre}
                  onEditar={(cambio) => editarLinea(i, cambio)}
                  onQuitar={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                />
              );
            })}
          </ul>
        )}

        <button
          onClick={() => setBuscando(true)}
          disabled={!origenId || articulos.cargando}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-info-text/40 bg-info-bg/40 py-3 text-[13px] font-semibold text-info-text transition-colors hover:bg-info-bg disabled:opacity-60"
        >
          <Icon name="search" size={16} />
          {!origenId
            ? "Elegí primero de dónde sale…"
            : articulos.cargando
              ? "Cargando artículos…"
              : "Buscar y agregar producto…"}
        </button>
      </section>

      <ErrorMsg>{error || articulos.error || almacenes.error || mov.error}</ErrorMsg>

      {/* ── Cierre ── */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-texto-4">
            Transferencia
          </p>
          <p className="text-lg font-bold text-texto">
            {lineas.length} {lineas.length === 1 ? "producto" : "productos"} ·{" "}
            {fmtNum(unidades)} u.
          </p>
          <p className="mt-0.5 text-[12px] text-texto-3">
            {dobleControl
              ? "Queda pendiente: la mercadería se mueve cuando alguien la aprueba en Movimientos."
              : "Guardar la deja pendiente: la mercadería se mueve recién al aprobarla."}
          </p>
        </div>
        {/* En el celular: Cancelar y Guardar se reparten la fila, aprobar abajo entero. */}
        <div className="ml-auto flex w-full flex-wrap justify-end gap-2 sm:w-auto">
          <Boton
            variante="ghost"
            onClick={volver}
            disabled={guardando}
            className="flex-1 sm:flex-none"
          >
            Cancelar
          </Boton>
          <Boton
            variante={dobleControl ? "primary" : "soft"}
            onClick={() => guardar()}
            disabled={guardando}
            className="flex-1 sm:flex-none"
          >
            {guardando && !confirmandoAprobar
              ? "Guardando…"
              : movId
                ? "Guardar cambios"
                : "Guardar transferencia"}
          </Boton>
          {!dobleControl && (
            <Boton
              icono="check"
              onClick={pedirAprobacion}
              disabled={guardando}
              className="basis-full sm:basis-auto"
            >
              Guardar y aprobar
            </Boton>
          )}
        </div>
      </section>

      <Confirmar
        abierto={confirmandoAprobar}
        titulo="Aprobar la transferencia"
        texto={`Sale de ${origenNombre || "la sucursal de origen"} y entra en ${
          destinoNombre || "la de destino"
        } en este momento, con su lote. Después sólo se puede revertir anulándola.`}
        etiquetaOk="Aprobar"
        procesando={guardando}
        onCancel={() => setConfirmandoAprobar(false)}
        onOk={() => guardar(true)}
      />

      {buscando && (
        <BuscadorArticulo
          articulos={articulos.datos ?? []}
          almacenNombre={origenNombre}
          yaElegidos={lineas.map((l) => l.articuloId)}
          onElegir={agregarLinea}
          onClose={() => setBuscando(false)}
        />
      )}
    </div>
  );
}

/** Las opciones de un desplegable, sumando la elegida si quedó afuera. */
function conLaElegida(lista: Almacen[], todas: Almacen[], elegida: string): Almacen[] {
  if (!elegida || lista.some((a) => String(a.id) === elegida)) return lista;
  const extra = todas.find((a) => String(a.id) === elegida);
  return extra ? [...lista, extra] : lista;
}

/** El depósito central (no vende) se ofrece igual, pero dice lo que es. */
function nombreConTipo(a: Almacen): string {
  return a.tipo === "DEPOSITO" && !contiene(a.nombre, "deposito")
    ? `${a.nombre} · depósito`
    : a.nombre;
}

/** El aviso con que se llega después de guardar sin poder aprobar. */
function avisoDe(state: unknown): string {
  const aviso = (state as { aviso?: unknown } | null)?.aviso;
  return typeof aviso === "string" ? aviso : "";
}

function Encabezado({ titulo, onVolver }: { titulo: string; onVolver: () => void }) {
  return (
    <header className="flex items-start gap-3">
      <button
        onClick={onVolver}
        aria-label="Volver al registro"
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-borde bg-white text-texto-2 transition-colors hover:bg-muted"
      >
        <Icon name="arrowLeft" size={18} />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold text-texto">{titulo}</h1>
        <p className="mt-0.5 text-[13px] text-texto-3">
          Mandá mercadería de una sucursal a otra. Al guardar queda en el registro de
          Movimientos.
        </p>
      </div>
    </header>
  );
}

/**
 * Un renglón: qué se manda, cuánto hay en el origen y qué lote viaja.
 *
 * Tarjeta y no fila de tabla: son tres datos por producto, y en el celular una
 * tabla se desliza de costado y esconde la cantidad.
 */
function Renglon({
  linea: l,
  articulo,
  conLote,
  origenId,
  origenNombre,
  onEditar,
  onQuitar,
}: {
  linea: LineaTransferencia;
  /** Undefined cuando el origen no mueve ese artículo (deshabilitado o de baja). */
  articulo: ArticuloMovimiento | undefined;
  conLote: boolean;
  origenId: number;
  origenNombre: string;
  onEditar: (cambio: Partial<LineaTransferencia>) => void;
  onQuitar: () => void;
}) {
  const conc = concentracionAparte({ nombre: l.nombre, concentracion: articulo?.concentracion });
  const pedido = parsearMonto(l.cantidad) ?? 0;
  // Se avisa acá y no recién al guardar: al cambiar de origen los renglones se
  // quedan, y el que ya no alcanza tiene que saltar a la vista en el momento.
  const noAlcanza = !!articulo && pedido > articulo.stock;

  return (
    <li className="rounded-xl border border-borde p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-texto">
            {l.nombre}
            {conc && <span className="ml-1.5 font-semibold text-texto-2">{conc}</span>}
          </p>
          {l.detalle && <p className="text-xs text-texto-4">{l.detalle}</p>}
          {articulo && (
            <p className={`text-xs ${noAlcanza ? "font-semibold text-danger-text" : "text-texto-3"}`}>
              En {origenNombre || "el origen"}: {conUnidad(articulo.stock, articulo.unidad)}
              {noAlcanza && " · no alcanza"}
            </p>
          )}
        </div>
        <button
          onClick={onQuitar}
          aria-label={`Quitar ${l.nombre}`}
          className="shrink-0 rounded-lg p-1.5 text-danger-text transition-colors hover:bg-danger-bg"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-end">
        <div className="min-w-0">
          {conLote && (
            <LoteQueViaja
              productoId={l.articuloId}
              origenId={origenId}
              origenNombre={origenNombre}
              cantidad={pedido}
            />
          )}
        </div>
        <Campo label="Cantidad">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={l.cantidad}
            onChange={(e) => onEditar({ cantidad: e.target.value })}
            aria-label={`Cantidad de ${l.nombre}`}
          />
        </Campo>
      </div>
    </li>
  );
}

/**
 * Qué lote viaja. No es un campo: el servidor saca por FEFO —primero el que
 * vence antes— y dejar elegir acá sería prometer algo que no se respeta.
 *
 * Y si lo primero que sale está VENCIDO, lo dice: el FEFO del servidor no lo
 * saltea, y mandarlo a otra sucursal es mandar algo que ahí tampoco se vende.
 */
function LoteQueViaja({
  productoId,
  origenId,
  origenNombre,
  cantidad,
}: {
  productoId: number;
  origenId: number;
  origenNombre: string;
  cantidad: number;
}) {
  // Sin la feature el servidor responde 403: no se muestra nada. El lote viaja igual.
  const { incluye } = useAuth();
  const conLotes = incluye("lotes");
  const lotes = useApi(
    () =>
      conLotes && origenId
        ? api.lotesDeProducto(productoId, origenId)
        : Promise.resolve([] as LoteConSaldo[]),
    [productoId, origenId, conLotes],
  );

  if (!conLotes) return null;
  if (lotes.cargando) return <span className="text-xs text-texto-4">…</span>;

  const lista = lotes.datos ?? [];
  const primero = lista[0];
  if (!primero)
    return (
      <span className="text-xs text-texto-4">
        Sin lotes con saldo en {origenNombre || "el origen"}
      </span>
    );

  const vencidas = vencidasQueSalen(lista, cantidad);
  return (
    <div>
      <span className="block text-[13px] font-semibold text-texto">Lote {primero.codigo}</span>
      <span className="block text-xs text-texto-4">
        {primero.vencimiento
          ? `viaja primero · vence ${fmtFecha(primero.vencimiento)}`
          : "viaja primero"}
      </span>
      {vencidas > 0 && (
        <p className="mt-1.5 rounded-lg bg-danger-bg px-2.5 py-1.5 text-xs text-danger-text">
          Ojo: viajan {fmtNum(vencidas)} u. vencidas. Si no las querés mandar, dalas de baja
          antes desde Vencimientos.
        </p>
      )}
    </div>
  );
}
