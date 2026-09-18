import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import {
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Input,
  Select,
} from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtFecha, fmtMoney, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type {
  ArticuloMovimiento,
  DetalleMovimientoInput,
  MovimientoInput,
  Producto,
} from "../../types";
import BuscadorArticulo from "./BuscadorArticulo";
import { conUnidad, detalleDe } from "./medicamento";
import {
  MOTIVOS_SALIDA,
  avisoVidaUtil,
  esPrecargaSalida,
  isoAMes,
  juntarMotivo,
  mesAIso,
  partirMotivo,
  tecleoMes,
} from "./mercaderia";

/** Los dos únicos tipos que se cargan desde acá. */
type TipoMercaderia = "ENTRADA" | "SALIDA";

/**
 * Una línea mientras se edita. Los números viajan como TEXTO a propósito: con
 * `number` el campo no deja escribir "1," ni borrar el último dígito.
 *
 * Lo que NO guarda: el stock, la unidad y si el artículo lleva lote. Eso se
 * busca en la lista del almacén cada vez que se dibuja, porque cambiar de
 * almacén cambia el stock y una copia vieja mentiría.
 */
interface LineaForm {
  /** Id del detalle en el servidor. Sin esto es una línea nueva. */
  detalleId?: number;
  articuloId: number;
  nombre: string;
  /** "Paracetamol · BAGÓ · Comprimido": lo que separa dos que se llaman igual. */
  detalle: string;
  cantidad: string;
  costo: string;
  loteCodigo: string;
  /** MM/AAAA, como viene impreso en el envase. */
  loteMes: string;
}

/**
 * Recibir mercadería del proveedor o dar de baja stock.
 *
 * Es el formulario de movimientos de siempre, contado como lo cuenta una
 * farmacia. Tres diferencias con el de Inventario, y ninguna es cosmética:
 *
 *  1. **Ocupa la pantalla entera.** Una recepción de droguería son diez o
 *     quince renglones con lote y vencimiento cada uno; en un diálogo de 600 px
 *     eso se scrollea a ciegas.
 *  2. **Entrada y salida preguntan cosas distintas.** Una entrada quiere saber
 *     de quién viene y con qué factura; una salida quiere saber **por qué**, y
 *     esa es la pregunta que después arma el número de mermas.
 *  3. **No ofrece ajuste ni transferencia.** Siguen existiendo en el motor y se
 *     ven en el registro; simplemente no se cargan desde acá. Quien mueve
 *     mercadería entre el mostrador y el depósito no está haciendo lo mismo que
 *     quien recibe una compra.
 *
 * Con `movId` (ruta `…/:id/editar`) edita un movimiento PENDIENTE en vez de
 * crear uno. Uno aprobado ya movió el stock y no se toca: se corrige con una
 * salida, que es lo que deja rastro.
 */
export default function FormMercaderia({
  tipoInicial = "ENTRADA",
}: {
  tipoInicial?: TipoMercaderia;
}) {
  const navigate = useNavigate();
  const { id } = useParams();
  const movId = id ? Number(id) : null;

  // Vencimientos manda acá al tocar "Dar de baja" en un lote. Llega con el
  // almacén, el motivo y qué sacar; lo demás es un formulario normal.
  const { state } = useLocation();
  const precarga = esPrecargaSalida(state) ? state : null;
  const { incluye } = useAuth();
  const conAprobacion = incluye("aprobacion_inventario");

  const [tipo, setTipo] = useState<TipoMercaderia>(tipoInicial);
  const [almacenId, setAlmacenId] = useState(
    precarga ? String(precarga.almacenId) : "",
  );
  const [fecha, setFecha] = useState(isoDia(new Date()));
  const [comprobante, setComprobante] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [motivo, setMotivo] = useState<string>(precarga?.motivo ?? "");
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const almacenes = useApi(() => api.getAlmacenes(), []);
  const mov = useApi(
    () => (movId ? api.getMovimiento(movId) : Promise.resolve(null)),
    [movId],
  );
  // El stock y el costo son los del almacén elegido, así que la lista se vuelve
  // a pedir cuando cambia.
  const articulos = useApi(
    () => api.getArticulosMovimiento(almacenId ? Number(almacenId) : undefined),
    [almacenId],
  );

  const porId = useMemo(
    () => new Map((articulos.datos ?? []).map((a) => [a.id, a])),
    [articulos.datos],
  );

  /**
   * El nombre del almacén elegido. Acompaña a cada stock que se muestra: el
   * catálogo dice "60 unidades" sumando todos los almacenes y acá puede decir
   * "0" porque esas 60 están en el mostrador. Sin el nombre al lado, el número
   * parece un error.
   */
  const almacenNombre =
    (almacenes.datos ?? []).find((a) => String(a.id) === almacenId)?.nombre ?? "";

  /** Las líneas tal como están en el servidor, para saber qué se borró. */
  const originales = useRef<number[]>([]);
  const hidratado = useRef(false);
  const precargado = useRef(false);

  // El renglón que viene de Vencimientos. Espera a que llegue la lista del
  // almacén porque de ahí sale el costo, y se hace una sola vez: después es un
  // formulario común y quien lo esté editando manda.
  useEffect(() => {
    if (!precarga || precargado.current) return;
    const art = (articulos.datos ?? []).find((a) => a.id === precarga.productoId);
    if (!art) return;
    precargado.current = true;
    setLineas([
      {
        articuloId: art.id,
        nombre: art.nombre,
        detalle: "",
        cantidad: String(precarga.cantidad),
        costo: String(art.costo ?? 0),
        loteCodigo: "",
        loteMes: "",
      },
    ]);
  }, [articulos.datos, precarga]);

  // Primer almacén por defecto, sólo al crear: en una farmacia de un local es
  // el único y no tiene sentido hacer elegir.
  useEffect(() => {
    if (movId || almacenId) return;
    const primero = almacenes.datos?.[0];
    if (primero) setAlmacenId(String(primero.id));
  }, [almacenes.datos, almacenId, movId]);

  // Al editar, el formulario arranca con lo que ya está guardado. Una sola vez:
  // después manda lo que la persona esté escribiendo.
  useEffect(() => {
    const m = mov.datos;
    if (!m || hidratado.current) return;
    hidratado.current = true;

    setTipo(m.tipo === "SALIDA" ? "SALIDA" : "ENTRADA");
    setAlmacenId(String(m.almacen?.id ?? ""));
    setFecha(isoDia(new Date(m.fecha)));
    setComprobante(m.comprobante ?? "");
    if (m.tipo === "SALIDA") {
      const partes = partirMotivo(m.descripcion);
      setMotivo(partes.motivo);
      setNota(partes.nota);
    } else {
      setProveedor(m.descripcion ?? "");
    }

    const detalles = m.detalles ?? [];
    originales.current = detalles.map((d) => d.id);
    setLineas(
      detalles.map((d) => ({
        detalleId: d.id,
        articuloId: d.productoId,
        nombre: d.producto,
        detalle: d.descripcion ?? "",
        cantidad: String(d.cantidad),
        costo: String(d.costo),
        loteCodigo: d.loteCodigo ?? "",
        loteMes: isoAMes(d.loteVencimiento),
      })),
    );
  }, [mov.datos]);

  const entrada = tipo === "ENTRADA";
  const total = lineas.reduce(
    (acc, l) => acc + (parsearMonto(l.cantidad) ?? 0) * (parsearMonto(l.costo) ?? 0),
    0,
  );

  /** Si la línea tiene que pedir lote y vencimiento. */
  function llevaLote(l: LineaForm): boolean {
    // `|| !!l.loteCodigo`: un artículo que se deshabilitó después de entrar no
    // aparece en la lista del almacén, pero su línea ya cargada sigue teniendo
    // lote y no hay que esconderlo.
    return (porId.get(l.articuloId)?.manejaLote ?? false) || !!l.loteCodigo;
  }

  function editarLinea(i: number, cambio: Partial<LineaForm>) {
    // El error es de un intento de guardar anterior: en cuanto se toca algo deja
    // de ser cierto, y dejarlo abajo mientras se corrige el renglón que señala
    // hace dudar de si el arreglo sirvió.
    if (error) setError("");
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...cambio } : l)));
  }

  function agregarLinea(art: ArticuloMovimiento, p: Producto) {
    if (error) setError("");
    setLineas((ls) => [
      ...ls,
      {
        articuloId: art.id,
        nombre: art.nombre,
        detalle: detalleDe(p),
        cantidad: "1",
        // El costo de la última compra: en la mayoría de las entradas se
        // compra al mismo precio de la vez anterior.
        costo: String(art.costo ?? 0),
        loteCodigo: "",
        loteMes: "",
      },
    ]);
    setBuscando(false);
  }

  /**
   * Cambiar de almacén NO borra lo cargado. Vaciar la lista era tirar el
   * trabajo de alguien de forma irreversible —y sin avisar— cuando lo único
   * que hizo fue corregir a qué sucursal iba.
   *
   * Lo único que de verdad depende del almacén es el STOCK, y se reacomoda
   * solo: la lista de artículos se vuelve a pedir, cada renglón muestra el
   * stock del almacén nuevo y avisa en rojo si ahora no alcanza. El costo NO
   * es por almacén —viene del producto— así que no había nada que recalcular.
   *
   * Mientras el movimiento esté PENDIENTE todavía no tocó el inventario, así
   * que corregir el almacén es tan válido como corregir una cantidad.
   */

  /** Arma las líneas para el servidor, o devuelve el primer error legible. */
  function revisarLineas(): { detalles: DetalleMovimientoInput[] } | { error: string } {
    if (!almacenId) return { error: "Elegí el almacén: define en qué sucursal se mueve el stock." };
    if (tipo === "SALIDA" && !motivo)
      return { error: "Elegí por qué sale la mercadería: es lo que después arma el número de mermas." };
    if (lineas.length === 0) return { error: "Agregá al menos un producto." };

    const detalles: DetalleMovimientoInput[] = [];
    for (const l of lineas) {
      const cantidad = parsearMonto(l.cantidad);
      if (cantidad === null || cantidad <= 0)
        return { error: `La cantidad de "${l.nombre}" tiene que ser mayor a cero.` };

      const costo = l.costo === "" ? 0 : parsearMonto(l.costo);
      if (costo === null || costo < 0)
        return { error: `El costo de "${l.nombre}" tiene que ser un número válido.` };

      // No se puede sacar más de lo que hay. Se avisa acá y no al aprobar: con
      // diez líneas cargadas, un rechazo del servidor no dice cuál sobra.
      const art = porId.get(l.articuloId);
      if (tipo === "SALIDA" && art && cantidad > art.stock)
        return {
          error: `No hay stock suficiente de "${l.nombre}" en ${almacenNombre || "ese almacén"}: quedan ${conUnidad(art.stock, art.unidad)}.`,
        };

      const detalle: DetalleMovimientoInput = { productoId: l.articuloId, cantidad, costo };

      if (tipo === "ENTRADA" && llevaLote(l)) {
        // Sin lote la mercadería entra al stock pero NO aparece en
        // Vencimientos: es exactamente el agujero que esta pantalla existe
        // para tapar, así que no se deja pasar.
        if (!l.loteCodigo.trim())
          return {
            error: `Falta el lote de "${l.nombre}". Sin lote esa mercadería no aparece en Vencimientos.`,
          };
        const iso = mesAIso(l.loteMes);
        if (!iso)
          return {
            error: `El vencimiento de "${l.nombre}" se escribe MM/AAAA, como en el envase (por ejemplo 04/2028).`,
          };
        detalle.loteCodigo = l.loteCodigo.trim();
        detalle.loteVencimiento = iso;
      }

      detalles.push(detalle);
    }
    return { detalles };
  }

  async function guardar() {
    if (guardando) return;
    setError("");

    const revisado = revisarLineas();
    if ("error" in revisado) return setError(revisado.error);

    const descripcion = entrada ? proveedor.trim() : juntarMotivo(motivo, nota);

    setGuardando(true);
    try {
      if (movId) await guardarEdicion(movId, descripcion, revisado.detalles);
      else await guardarNuevo(descripcion, revisado.detalles);
      navigate("/inventario/movimientos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      setGuardando(false);
    }
  }

  async function guardarNuevo(descripcion: string, detalles: DetalleMovimientoInput[]) {
    const input: MovimientoInput = {
      tipo,
      almacenId: Number(almacenId),
      fecha,
      comprobante: entrada ? comprobante.trim() : "",
      descripcion,
      detalles,
    };
    const creado = await api.crearMovimiento(input);
    // El servidor SIEMPRE lo crea pendiente y sólo aprobarlo mueve el stock.
    // Sin el circuito de aprobación no habría botón para hacerlo y la
    // mercadería nunca entraría, así que se aprueba de una.
    if (!conAprobacion) await api.aprobarMovimiento(creado.id);
  }

  /**
   * Editar es otra cosa que crear: la cabecera va por PATCH y cada línea tiene
   * su propia llamada. Se **borra primero** para que, al bajar una cantidad y
   * sacar un renglón en el mismo guardado, la validación de stock del servidor
   * vea el almacén como va a quedar y no como estaba.
   *
   * La factura viaja igual que al crear: una salida no lleva factura, así que
   * pasar de entrada a salida la borra. La fecha, sólo si se cambió: el
   * servidor la guarda a mediodía, y reenviarla igual le cambiaría la hora a un
   * movimiento cargado a las 21:30 sin que nadie la haya tocado.
   */
  async function guardarEdicion(
    id: number,
    descripcion: string,
    detalles: DetalleMovimientoInput[],
  ) {
    const fechaOriginal = mov.datos ? isoDia(new Date(mov.datos.fecha)) : fecha;
    await api.actualizarMovimiento(id, {
      tipo,
      almacenId: Number(almacenId),
      comprobante: entrada ? comprobante.trim() : "",
      ...(fecha !== fechaOriginal ? { fecha } : {}),
      descripcion,
    });

    const vivos = new Set(lineas.map((l) => l.detalleId).filter(Boolean));
    for (const detalleId of originales.current) {
      if (!vivos.has(detalleId)) await api.eliminarDetalleMovimiento(detalleId);
    }

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i];
      const cuerpo = detalles[i];
      if (linea.detalleId) {
        // `loteCodigo: ""` borra el lote de la línea; omitirlo lo dejaría
        // pegado aunque el campo se haya vaciado.
        await api.actualizarDetalleMovimiento(linea.detalleId, {
          cantidad: cuerpo.cantidad,
          costo: cuerpo.costo,
          loteCodigo: cuerpo.loteCodigo ?? "",
          loteVencimiento: cuerpo.loteVencimiento ?? "",
        });
      } else {
        await api.agregarDetalleMovimiento(id, cuerpo);
      }
    }
  }

  const volver = () => navigate("/inventario/movimientos");

  if (movId && mov.cargando) {
    return (
      <div className="mx-auto max-w-5xl p-5">
        <Cargando />
      </div>
    );
  }

  if (movId && mov.datos && mov.datos.estado !== "PENDIENTE") {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        <Encabezado titulo={`Movimiento #${movId}`} onVolver={volver} />
        <div className="card p-5">
          <p className="text-sm text-texto-2">
            Este movimiento ya está {mov.datos.estado.toLowerCase()}: el stock se movió y no
            se edita. Si hay que corregirlo, cargá una salida — así queda el rastro de qué
            pasó y cuándo.
          </p>
          <Boton className="mt-4" variante="ghost" onClick={volver}>
            Volver al registro
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5 pb-10">
      <Encabezado
        titulo={movId ? `Editar movimiento #${movId}` : "Nuevo movimiento"}
        onVolver={volver}
      />

      {/* ── Cabecera: qué se está haciendo ── */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-texto-4">
            Tipo de movimiento
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <BotonTipo
              activo={entrada}
              tono="entrada"
              icono="trendingUp"
              etiqueta="Entrada"
              onClick={() => setTipo("ENTRADA")}
            />
            <BotonTipo
              activo={!entrada}
              tono="salida"
              icono="trendingDown"
              etiqueta="Salida"
              onClick={() => setTipo("SALIDA")}
            />
          </div>
        </div>

        {!entrada && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-danger-text">
              Motivo
            </p>
            <div className="flex flex-wrap gap-2">
              {MOTIVOS_SALIDA.map((m) => (
                <button
                  key={m}
                  onClick={() => setMotivo(m)}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    motivo === m
                      ? "bg-danger text-white"
                      : "border border-danger/40 bg-white text-danger-text hover:bg-danger-bg"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`grid gap-3 ${entrada ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"}`}>
          <Campo label="Almacén *">
            <Select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="border-warning bg-warning-bg/40"
            >
              <option value="">Elegí uno</option>
              {(almacenes.datos ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
          </Campo>

          {entrada && (
            <Campo label="Proveedor">
              <Input
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Droguería / laboratorio"
              />
            </Campo>
          )}

          {entrada && (
            <Campo label="Nº factura">
              <Input
                value={comprobante}
                onChange={(e) => setComprobante(e.target.value)}
                placeholder="F-0000"
              />
            </Campo>
          )}

          <Campo label="Fecha">
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>

          {!entrada && (
            <Campo label="Nota (opcional)">
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: caja mojada en depósito"
              />
            </Campo>
          )}
        </div>

        <p className="flex items-start gap-2 text-xs text-texto-3">
          <Icon name="info" size={15} />
          <span>El almacén es obligatorio: define en qué sucursal se mueve el stock.</span>
        </p>
      </section>

      {/* ── Los renglones ── */}
      <section className="card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-texto">Productos</h2>
          <span className="text-xs text-texto-3">
            {lineas.length} {lineas.length === 1 ? "línea" : "líneas"}
          </span>
        </div>

        {lineas.length > 0 && (
          <div className="mb-3 overflow-x-auto rounded-xl border border-borde">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr
                  className={`border-b border-borde-soft text-left text-[11px] font-bold uppercase tracking-wide ${
                    entrada ? "bg-muted text-texto-3" : "bg-danger-bg/60 text-danger-text"
                  }`}
                >
                  <th className="px-3.5 py-2.5">Producto</th>
                  <th className="px-3 py-2.5">Lote</th>
                  <th className="px-3 py-2.5">Vencimiento</th>
                  <th className="px-3 py-2.5 w-28">Cantidad</th>
                  <th className="px-3 py-2.5 w-28">Costo u.</th>
                  <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde-soft">
                {lineas.map((l, i) => (
                  <Renglon
                    key={l.detalleId ?? `nuevo-${l.articuloId}`}
                    linea={l}
                    entrada={entrada}
                    conLote={llevaLote(l)}
                    almacenId={Number(almacenId)}
                    almacenNombre={almacenNombre}
                    stock={porId.get(l.articuloId)?.stock ?? null}
                    unidad={porId.get(l.articuloId)?.unidad}
                    onEditar={(cambio) => editarLinea(i, cambio)}
                    onQuitar={() => setLineas((ls) => ls.filter((_, j) => j !== i))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <button
          onClick={() => setBuscando(true)}
          disabled={!almacenId || articulos.cargando}
          className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
            entrada
              ? "border-primary/50 bg-primary-50/40 text-primary-700 hover:bg-primary-50"
              : "border-danger/50 bg-danger-bg/30 text-danger-text hover:bg-danger-bg/60"
          }`}
        >
          <Icon name="search" size={16} />
          {!almacenId
            ? "Elegí primero un almacén…"
            : articulos.cargando
              ? "Cargando artículos…"
              : "Buscar y agregar producto…"}
        </button>
      </section>

      <ErrorMsg>{error || articulos.error || almacenes.error}</ErrorMsg>

      {/* ── El total y el botón que cierra ── */}
      <section className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-texto-4">
            Total · {entrada ? "Entrada" : "Salida"}
          </p>
          <p
            className={`text-2xl font-bold tracking-tight ${
              entrada ? "text-texto" : "text-danger-text"
            }`}
          >
            {fmtMoney(total)}
          </p>
        </div>
        <div className="flex gap-2">
          <Boton variante="ghost" onClick={volver} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            variante={entrada ? "primary" : "danger"}
            onClick={guardar}
            disabled={guardando}
          >
            {guardando
              ? "Guardando…"
              : movId
                ? "Guardar cambios"
                : entrada
                  ? "Guardar entrada"
                  : "Guardar salida"}
          </Boton>
        </div>
      </section>

      {buscando && (
        <BuscadorArticulo
          articulos={articulos.datos ?? []}
          almacenNombre={almacenNombre}
          yaElegidos={lineas.map((l) => l.articuloId)}
          onElegir={agregarLinea}
          onClose={() => setBuscando(false)}
        />
      )}
    </div>
  );
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
          Cargá una entrada o una salida de stock en un almacén. Al guardar queda en el
          registro de Movimientos.
        </p>
      </div>
    </header>
  );
}

function BotonTipo({
  activo,
  tono,
  icono,
  etiqueta,
  onClick,
}: {
  activo: boolean;
  tono: "entrada" | "salida";
  icono: "trendingUp" | "trendingDown";
  etiqueta: string;
  onClick: () => void;
}) {
  const encendido =
    tono === "entrada" ? "bg-primary-boton text-white" : "bg-danger text-white";
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-bold transition-colors ${
        activo
          ? encendido
          : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      <Icon name={icono} size={18} />
      {etiqueta}
    </button>
  );
}

function Renglon({
  linea: l,
  entrada,
  conLote,
  almacenId,
  almacenNombre,
  stock,
  unidad,
  onEditar,
  onQuitar,
}: {
  linea: LineaForm;
  entrada: boolean;
  conLote: boolean;
  almacenId: number;
  almacenNombre: string;
  /** null cuando el almacén no mueve ese artículo (deshabilitado o de baja). */
  stock: number | null;
  /** La del artículo: frasco, caja, unidad… No es siempre "u.". */
  unidad: string | undefined;
  onEditar: (cambio: Partial<LineaForm>) => void;
  onQuitar: () => void;
}) {
  const pedido = parsearMonto(l.cantidad) ?? 0;
  const subtotal = pedido * (parsearMonto(l.costo) ?? 0);
  const aviso = entrada && conLote ? avisoVidaUtil(mesAIso(l.loteMes)) : null;
  // Se avisa acá y no recién al guardar: al cambiar de almacén los renglones
  // se quedan, y el que ya no entra tiene que saltar a la vista en el momento.
  const noAlcanza = !entrada && stock !== null && pedido > stock;

  return (
    <>
      <tr>
        <td className="px-3.5 py-2.5 align-middle">
          <span className="block text-sm font-bold text-texto">{l.nombre}</span>
          {l.detalle && (
            <span className="block text-xs text-texto-4">{l.detalle}</span>
          )}
          {!entrada && stock !== null && (
            <span
              className={`block text-xs ${
                noAlcanza ? "font-semibold text-danger-text" : "text-texto-3"
              }`}
            >
              Stock en {almacenNombre || "el almacén"}: {conUnidad(stock, unidad)}
              {noAlcanza && " · no alcanza"}
            </span>
          )}
        </td>

        {/* Lote y vencimiento se escriben sólo al RECIBIR. Una salida no elige
            lote: sale el más próximo a vencer, que es la regla del depósito y
            no una decisión de quien carga el formulario — así que lo muestra
            en vez de preguntarlo. */}
        {entrada ? (
          <>
            <td className="px-3 py-2.5">
              {conLote ? (
                <Input
                  value={l.loteCodigo}
                  onChange={(e) => onEditar({ loteCodigo: e.target.value })}
                  placeholder="Lote"
                  className="py-2"
                />
              ) : (
                <span className="text-texto-4">—</span>
              )}
            </td>
            <td className="px-3 py-2.5">
              {conLote ? (
                <Input
                  value={l.loteMes}
                  onChange={(e) => onEditar({ loteMes: tecleoMes(e.target.value) })}
                  placeholder="MM/AAAA"
                  inputMode="numeric"
                  className="py-2"
                />
              ) : (
                <span className="text-texto-4">—</span>
              )}
            </td>
          </>
        ) : (
          <td className="px-3 py-2.5" colSpan={2}>
            {conLote ? (
              <LoteQueSale
                productoId={l.articuloId}
                almacenId={almacenId}
                almacenNombre={almacenNombre}
              />
            ) : (
              <span className="text-texto-4">—</span>
            )}
          </td>
        )}

        <td className="px-3 py-2.5">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={l.cantidad}
            onChange={(e) => onEditar({ cantidad: e.target.value })}
            className="py-2"
          />
        </td>
        <td className="px-3 py-2.5">
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={l.costo}
            onChange={(e) => onEditar({ costo: e.target.value })}
            className="py-2"
          />
        </td>
        <td
          className={`px-3.5 py-2.5 text-right text-sm font-bold ${
            entrada ? "text-texto" : "text-danger-text"
          }`}
        >
          {fmtMoney(subtotal)}
        </td>
        <td className="pr-2">
          <button
            onClick={onQuitar}
            aria-label={`Quitar ${l.nombre}`}
            className="rounded-lg p-1.5 text-danger-text transition-colors hover:bg-danger-bg"
          >
            <Icon name="x" size={16} />
          </button>
        </td>
      </tr>

      {aviso && (
        <tr>
          <td colSpan={7} className="px-3.5 pb-2.5">
            <p className="rounded-lg bg-warning-bg px-2.5 py-2 text-xs text-warning-text">
              {aviso}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Qué lote se va a ir en esta salida.
 *
 * No es un campo: el servidor descuenta por FEFO —primero el que vence antes— y
 * dejar elegir acá sería prometer una decisión que no se respeta. Pero decirlo
 * importa: quien da de baja "lo vencido" tiene que poder confirmar que el
 * sistema va a sacar el mismo lote que tiene en la mano.
 */
function LoteQueSale({
  productoId,
  almacenId,
  almacenNombre,
}: {
  productoId: number;
  almacenId: number;
  almacenNombre: string;
}) {
  const lotes = useApi(
    () => api.lotesDeProducto(productoId, almacenId || undefined),
    [productoId, almacenId],
  );

  if (lotes.cargando) return <span className="text-xs text-texto-4">…</span>;

  const primero = (lotes.datos ?? [])[0];
  if (!primero)
    return (
      <span className="text-xs text-texto-4">
        Sin lotes con saldo en {almacenNombre || "este almacén"}
      </span>
    );

  // El almacén va en el texto porque cada uno tiene SUS partidas: el mismo
  // medicamento sale con otro lote y otro vencimiento según de dónde se saque.
  // Sin decirlo, cambiar de almacén parece que cambió el dato por su cuenta.
  const donde = almacenNombre ? " de " + almacenNombre : "";

  return (
    <span className="block">
      <span className="block text-[13px] font-semibold text-texto">{primero.codigo}</span>
      <span className="block text-xs text-texto-4">
        {primero.vencimiento
          ? `sale este${donde} · vence ${fmtFecha(primero.vencimiento)}`
          : `sale este${donde}`}
      </span>
    </span>
  );
}
