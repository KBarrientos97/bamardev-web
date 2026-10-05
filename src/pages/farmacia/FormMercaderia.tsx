import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../../components/Icon";
import {
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Select,
} from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtFecha, fmtMoney, isoDia } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { contiene } from "../../lib/texto";
import { useAuth } from "../../store/AuthContext";
import type {
  ArticuloMovimiento,
  DetalleMovimientoInput,
  MovimientoInput,
  Producto,
} from "../../types";
import BuscadorArticulo from "./BuscadorArticulo";
import { concentracionAparte, conUnidad, detalleDe } from "./medicamento";
import SelectorProveedor, { type ProveedorElegido } from "./SelectorProveedor";
import {
  MOTIVOS_SALIDA,
  avisoVidaUtil,
  esPrecargaSalida,
  isoAMes,
  juntarMotivo,
  mesAIso,
  ordenarSucursales,
  partirMotivo,
  rutaDeEdicion,
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
  /**
   * Dónde se guarda, SÓLO en las sucursales donde la persona la tocó, y
   * atada a la sucursal para la que se escribió. Una sola ubicación suelta no
   * alcanzaba: "Cajón C" escrito mirando Centro se guardaba en Equipetrol si
   * después se cambiaba el selector, pisando la de Equipetrol y dejando
   * Centro vacío. Sin entrada para la sucursal elegida se muestra la que el
   * artículo ya tiene ahí. Vacía a propósito = quitarla.
   */
  ubicaciones?: Record<number, UbicacionEscrita>;
}

/** Una ubicación tecleada en el ingreso, para una sucursal en particular. */
interface UbicacionEscrita {
  texto: string;
  /**
   * La que el artículo tenía en ESA sucursal cuando se empezó a escribir. Se
   * guarda acá porque al momento de guardar la lista de artículos puede ser
   * la de otra sucursal, y comparar contra esa diría "no cambió" sin mirar.
   */
  antes: string;
}

/** El datalist de las ubicaciones que ya se usan en la sucursal. */
const LISTA_UBICACIONES = "ubicaciones-de-la-sucursal";

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
 *     ven en el registro; no se cargan desde acá. Quien manda mercadería a otra
 *     sucursal no está haciendo lo mismo que quien recibe una compra: la
 *     transferencia tiene su pantalla (`FormTransferencia`).
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
  const { incluye, usuario } = useAuth();
  // El extra "Aprobar movimientos" (doble control, se vende aparte): quien
  // carga sólo guarda y lo aprueba otra persona desde Movimientos, como antes.
  const dobleControl = incluye("aprobacion_inventario");

  const [tipo, setTipo] = useState<TipoMercaderia>(tipoInicial);
  const [almacenId, setAlmacenId] = useState(
    precarga ? String(precarga.almacenId) : "",
  );
  const [fecha, setFecha] = useState(isoDia(new Date()));
  const [comprobante, setComprobante] = useState("");
  // El proveedor elegido de la lista, y lo tecleado sin elegir (o el texto
  // de un ingreso de antes de la lista, que hay que pasar a uno de verdad).
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(null);
  const [proveedorTexto, setProveedorTexto] = useState("");
  const [motivo, setMotivo] = useState<string>(precarga?.motivo ?? "");
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<LineaForm[]>([]);
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

  // Las ubicaciones que ya se usan en la sucursal, para escribir "Estante 3"
  // igual que la vez anterior. Sólo al recibir: una salida no guarda nada.
  const ubicacionesUsadas = useApi(
    () =>
      almacenId && tipo === "ENTRADA"
        ? api.ubicacionesUsadas(Number(almacenId)).catch(() => [])
        : Promise.resolve([] as string[]),
    [almacenId, tipo],
  );

  /**
   * El nombre del almacén elegido. Acompaña a cada stock que se muestra: el
   * catálogo dice "60 unidades" sumando todos los almacenes y acá puede decir
   * "0" porque esas 60 están en el mostrador. Sin el nombre al lado, el número
   * parece un error.
   */
  const almacenNombre =
    (almacenes.datos ?? []).find((a) => String(a.id) === almacenId)?.nombre ?? "";
  const nombreSucursal = (id: number) =>
    (almacenes.datos ?? []).find((a) => a.id === id)?.nombre ?? "otra sucursal";

  /** Las líneas tal como están en el servidor, para saber qué se borró. */
  const originales = useRef<number[]>([]);
  const hidratado = useRef(false);
  const precargado = useRef(false);
  /** El guardado en curso. Ver `guardar()`: corta el doble clic. */
  const enVuelo = useRef(false);

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
        // El lote elegido en Vencimientos: la salida descuenta de ese y no
        // del que el FEFO tomaría primero (ver `PrecargaSalida`).
        loteCodigo: precarga.loteCodigo ?? "",
        loteMes: "",
      },
    ]);
  }, [articulos.datos, precarga]);

  // Sucursal por defecto, sólo al crear: la de quien carga y, si es el dueño
  // (no pertenece a ninguna), la principal. Antes era la primera de la lista,
  // que viene por nombre: con "Depósito" y "Mostrador" arrancaba en Depósito y
  // la mercadería se cargaba en el local equivocado sin que nadie lo notara.
  useEffect(() => {
    if (movId || almacenId) return;
    const lista = almacenes.datos ?? [];
    const sugerida =
      lista.find((a) => a.id === usuario?.sucursalId) ??
      lista.find((a) => a.esPrincipal) ??
      lista[0];
    if (sugerida) setAlmacenId(String(sugerida.id));
  }, [almacenes.datos, almacenId, movId, usuario?.sucursalId]);

  // Al editar, el formulario arranca con lo que ya está guardado. Una sola vez:
  // después manda lo que la persona esté escribiendo.
  useEffect(() => {
    const m = mov.datos;
    // La transferencia no se carga acá: se va a su pantalla (ver abajo).
    if (!m || hidratado.current || m.tipo === "TRANSFERENCIA") return;
    hidratado.current = true;

    setTipo(m.tipo === "SALIDA" ? "SALIDA" : "ENTRADA");
    setAlmacenId(String(m.almacen?.id ?? ""));
    setFecha(isoDia(new Date(m.fecha)));
    setComprobante(m.comprobante ?? "");
    if (m.tipo === "SALIDA") {
      const partes = partirMotivo(m.descripcion);
      setMotivo(partes.motivo);
      setNota(partes.nota);
    } else if (m.proveedor) {
      setProveedor(m.proveedor);
    } else {
      setProveedorTexto(m.descripcion ?? "");
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
    if (!almacenId) return { error: "Elegí la sucursal: define dónde entra o sale el stock." };
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
          error: `No hay stock suficiente de "${l.nombre}" en ${almacenNombre || "esa sucursal"}: quedan ${conUnidad(art.stock, art.unidad)}.`,
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
      } else if (tipo === "SALIDA" && l.loteCodigo.trim()) {
        // Una salida con lote es la baja de ESE lote (llega de Vencimientos o
        // de una salida guardada así); sin lote el servidor sale por FEFO.
        detalle.loteCodigo = l.loteCodigo.trim();
      }

      detalles.push(detalle);
    }
    return { detalles };
  }

  /** Lo que se va a mandar, o por qué todavía no se puede guardar. */
  function prepararGuardado():
    | { descripcion: string; detalles: DetalleMovimientoInput[] }
    | { error: string } {
    const revisado = revisarLineas();
    if ("error" in revisado) return revisado;

    // Lo tecleado y no elegido no se guarda como texto suelto: es justo lo
    // que partía las compras de un proveedor en tres nombres.
    if (entrada && !proveedor && proveedorTexto.trim()) {
      return {
        error: `Elegí el proveedor de la lista o crealo con «Crear»: "${proveedorTexto.trim()}" todavía no es uno.`,
      };
    }

    // La descripción sigue diciendo el proveedor: es lo que leen Android, el
    // restaurante y los movimientos de antes de la lista.
    const descripcion = entrada ? (proveedor?.nombre ?? "") : juntarMotivo(motivo, nota);
    return { descripcion, detalles: revisado.detalles };
  }

  /**
   * "Guardar y aprobar" revisa primero y recién con todo en orden pregunta:
   * confirmar algo que después no se puede guardar es una pregunta de más.
   */
  function pedirAprobacion() {
    const listo = prepararGuardado();
    if ("error" in listo) return setError(listo.error);
    setError("");
    setConfirmandoAprobar(true);
  }

  /**
   * Guardar deja el movimiento PENDIENTE: no toca el stock y se puede seguir
   * completando (sumar productos, la factura que llega después). Con `aprobar`
   * se guarda y se aprueba en el mismo momento, que es lo que mueve el stock.
   */
  async function guardar(aprobar = false) {
    // El ref y no `guardando`: un setState no deshabilita el botón hasta el
    // siguiente render, así que dos clics rápidos entran los dos en el mismo
    // tick. Acá eso es un ingreso de mercadería duplicado — stock que nunca
    // llegó, contado dos veces, y un movimiento de más que alguien tiene que
    // anular a mano.
    if (enVuelo.current) return;
    enVuelo.current = true;
    setError("");

    const listo = prepararGuardado();
    if ("error" in listo) {
      enVuelo.current = false;
      setConfirmandoAprobar(false);
      return setError(listo.error);
    }

    setGuardando(true);
    let id: number;
    try {
      // La ubicación es del artículo en la sucursal, no del movimiento, y se
      // guarda ANTES: si falla, todavía no se creó nada, y reintentar no deja
      // un ingreso duplicado.
      if (entrada) await guardarUbicaciones();
      if (movId) {
        await guardarEdicion(movId, listo.descripcion, listo.detalles);
        id = movId;
      } else {
        id = await guardarNuevo(listo.descripcion, listo.detalles);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
      // Se libera para poder reintentar. Al crear, lo que falló no llegó a
      // existir; al editar, cada paso que sí se hizo ya quedó anotado (ver
      // `guardarEdicion`), así que reintentar no lo repite.
      enVuelo.current = false;
      setGuardando(false);
      setConfirmandoAprobar(false);
      return;
    }

    if (aprobar) {
      try {
        await api.aprobarMovimiento(id);
      } catch (err) {
        return quedoPendiente(id, err);
      }
    }
    navigate("/inventario/movimientos");
  }

  /**
   * Se guardó, pero el servidor no lo dejó aprobar. El movimiento ya existe
   * PENDIENTE, así que se sigue desde lo guardado: reintentar con el
   * formulario de antes lo crearía de nuevo, o le sumaría otra vez los
   * renglones nuevos.
   */
  function quedoPendiente(id: number, err: unknown) {
    const motivoError = err instanceof Error ? err.message : "no se pudo";
    const aviso = `Se guardó como pendiente, pero no se pudo aprobar: ${motivoError}`;
    enVuelo.current = false;
    setGuardando(false);
    setConfirmandoAprobar(false);
    if (movId) {
      hidratado.current = false;
      mov.recargar();
      setError(aviso);
    } else {
      navigate(`/inventario/movimientos/${id}/editar`, { replace: true, state: { aviso } });
    }
  }

  /**
   * Las ubicaciones que cambiaron en este ingreso: las que la persona tocó y
   * dicen algo distinto de lo que el artículo tenía en ESA sucursal. Cada una
   * va a la sucursal para la que se escribió, no a la que quedó elegida al
   * final. Una vacía la borra, que es cómo se deja de usar.
   */
  async function guardarUbicaciones() {
    let guardadas = 0;
    for (const l of lineas) {
      for (const [id, u] of Object.entries(l.ubicaciones ?? {})) {
        const nueva = u.texto.trim();
        if (nueva === u.antes) continue;
        try {
          await api.fijarUbicacionProducto(l.articuloId, Number(id), nueva || null);
          guardadas++;
        } catch (err) {
          const motivoError = err instanceof Error ? err.message : "no se pudo";
          // Las anteriores ya se escribieron y no se deshacen: decir "no se
          // guardó nada" era mentir. Reintentar las vuelve a mandar iguales,
          // que no cambia nada.
          const queQuedo =
            guardadas === 0
              ? "La mercadería todavía no se guardó"
              : guardadas === 1
                ? "La ubicación anterior ya quedó guardada, pero la mercadería todavía no"
                : `Las ${guardadas} ubicaciones anteriores ya quedaron guardadas, pero la mercadería todavía no`;
          throw new Error(
            `No se pudo guardar la ubicación de "${l.nombre}" (${motivoError}). ${queQuedo}: probá de nuevo.`,
          );
        }
      }
    }
  }

  /** Crea el movimiento. El servidor SIEMPRE lo crea pendiente. */
  async function guardarNuevo(
    descripcion: string,
    detalles: DetalleMovimientoInput[],
  ): Promise<number> {
    const input: MovimientoInput = {
      tipo,
      almacenId: Number(almacenId),
      fecha,
      comprobante: entrada ? comprobante.trim() : "",
      descripcion,
      ...(entrada && proveedor ? { proveedorId: proveedor.id } : {}),
      detalles,
    };
    const creado = await api.crearMovimiento(input);
    return creado.id;
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
      proveedorId: entrada ? (proveedor?.id ?? null) : null,
    });

    // Lo que ya se hizo se anota apenas el servidor lo confirma: si una
    // llamada del medio falla, el reintento parte de lo que de verdad quedó.
    // Antes el renglón nuevo no guardaba su id —reintentar lo creaba otra vez y
    // al aprobar entraba doble— y el borrado seguía en la lista —reintentar
    // daba 404 y la pantalla quedaba trabada—.
    const vivos = new Set(lineas.map((l) => l.detalleId).filter(Boolean));
    for (const detalleId of [...originales.current]) {
      if (vivos.has(detalleId)) continue;
      await api.eliminarDetalleMovimiento(detalleId);
      originales.current = originales.current.filter((x) => x !== detalleId);
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
        const creado = await api.agregarDetalleMovimiento(id, cuerpo);
        originales.current = [...originales.current, creado.id];
        // Por artículo y no por posición: el buscador no deja repetir uno, y
        // mientras se guardaba alguien pudo quitar un renglón de más arriba.
        setLineas((ls) =>
          ls.map((l) =>
            !l.detalleId && l.articuloId === linea.articuloId ? { ...l, detalleId: creado.id } : l,
          ),
        );
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

  // Una transferencia tiene su pantalla. Abierta acá —que sólo conoce entrada y
  // salida— se guardaba como una entrada y la mercadería dejaba de viajar.
  if (movId && mov.datos?.tipo === "TRANSFERENCIA") {
    return <Navigate to={rutaDeEdicion(mov.datos)} replace />;
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
          {/* "Sucursal" y no "almacén": para el dueño es otro local del
              negocio, no un rincón. Un depósito central (que no vende) se
              ofrece igual, pero dice lo que es. */}
          <Campo label="Sucursal *">
            <Select
              value={almacenId}
              onChange={(e) => setAlmacenId(e.target.value)}
              className="border-warning bg-warning-bg/40"
            >
              <option value="">Elegí una</option>
              {ordenarSucursales(almacenes.datos ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tipo === "DEPOSITO" && !contiene(a.nombre, "deposito")
                    ? `${a.nombre} · depósito`
                    : a.nombre}
                </option>
              ))}
            </Select>
          </Campo>

          {entrada && (
            <Campo label="Proveedor">
              <SelectorProveedor
                valor={proveedor}
                texto={proveedorTexto}
                onElegir={setProveedor}
                onTexto={setProveedorTexto}
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
          <span>La sucursal es obligatoria: define dónde entra o sale el stock.</span>
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

        {entrada && (
          <datalist id={LISTA_UBICACIONES}>
            {(ubicacionesUsadas.datos ?? []).map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        )}

        {lineas.length > 0 && (
          // En el celular la tabla medía 737 px en 375: Cantidad y Costo —lo que
          // se escribe en cada renglón— quedaban fuera de la pantalla sin pista
          // de que había que deslizar. Ahí cada renglón es una tarjeta (ver
          // Renglon); desde `md` vuelve a ser la tabla de siempre.
          <div className="mb-3 rounded-xl border border-borde md:overflow-x-auto">
            <table className="block w-full text-[13px] md:table md:min-w-[720px]">
              <thead className="hidden md:table-header-group">
                <tr
                  className={`border-b border-borde-soft text-left text-[11px] font-bold uppercase tracking-wide ${
                    entrada ? "bg-muted text-texto-3" : "bg-danger-bg/60 text-danger-text"
                  }`}
                >
                  <th className="px-3.5 py-2.5">Producto</th>
                  {/* Con ancho propio, como Cantidad y Costo: sin él, en un
                      monitor chico el nombre del producto se comía la columna y
                      el lote quedaba en 38 px, una letra a la vista. El mínimo
                      firme está en los campos (ver Renglon). */}
                  <th className="px-3 py-2.5 w-36">Lote</th>
                  <th className="px-3 py-2.5 w-28">Vencimiento</th>
                  <th className="px-3 py-2.5 w-28">Cantidad</th>
                  <th className="px-3 py-2.5 w-28">Costo u.</th>
                  <th className="px-3.5 py-2.5 text-right">Subtotal</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="block divide-y divide-borde-soft md:table-row-group">
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
                    concentracion={porId.get(l.articuloId)?.concentracion}
                    ubicacionActual={porId.get(l.articuloId)?.ubicacion ?? null}
                    // Mientras llega la lista de la sucursal nueva, `porId`
                    // todavía es la de la anterior: su ubicación no es de acá.
                    ubicacionLista={!articulos.cargando}
                    nombreSucursal={nombreSucursal}
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
            ? "Elegí primero una sucursal…"
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
          <p className="mt-0.5 text-[12px] text-texto-3">
            {dobleControl
              ? "Queda pendiente: el stock se mueve cuando alguien lo aprueba en Movimientos."
              : "Guardar lo deja pendiente: el stock se mueve recién al aprobarlo."}
          </p>
        </div>
        {/* En el celular los tres no entran en una fila sin partir el texto:
            Cancelar y Guardar se reparten la primera y aprobar va abajo, entero. */}
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
            variante={dobleControl ? (entrada ? "primary" : "danger") : "soft"}
            onClick={() => guardar()}
            disabled={guardando}
            className="flex-1 sm:flex-none"
          >
            {guardando && !confirmandoAprobar
              ? "Guardando…"
              : movId
                ? "Guardar cambios"
                : entrada
                  ? "Guardar entrada"
                  : "Guardar salida"}
          </Boton>
          {!dobleControl && (
            <Boton
              variante={entrada ? "primary" : "danger"}
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
        titulo={entrada ? "Aprobar la entrada" : "Aprobar la salida"}
        texto={`Se guarda y ${entrada ? "se suma al" : "se descuenta del"} stock de ${
          almacenNombre || "la sucursal"
        } en este momento. Después sólo se puede revertir anulándolo.`}
        etiquetaOk="Aprobar"
        peligroso={!entrada}
        procesando={guardando}
        onCancel={() => setConfirmandoAprobar(false)}
        onOk={() => guardar(true)}
      />

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
          Cargá una entrada o una salida de stock en una sucursal. Al guardar queda en el
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
  concentracion,
  ubicacionActual,
  ubicacionLista,
  nombreSucursal,
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
  /** La del medicamento, si tiene: se muestra cuando el nombre no la trae. */
  concentracion: string | null | undefined;
  /** Dónde está hoy en la sucursal elegida, si alguien la cargó. */
  ubicacionActual: string | null;
  /** `false` mientras llega la lista de la sucursal elegida. */
  ubicacionLista: boolean;
  nombreSucursal: (id: number) => string;
  onEditar: (cambio: Partial<LineaForm>) => void;
  onQuitar: () => void;
}) {
  const escrita = l.ubicaciones?.[almacenId];
  // Lo escrito para OTRAS sucursales también se guarda (cada una en la suya),
  // así que se dice: si no, al volver a cambiar el selector quedaba invisible
  // algo que igual se iba a escribir.
  const enOtras = Object.entries(l.ubicaciones ?? {}).filter(
    ([id, u]) => Number(id) !== almacenId && u.texto.trim() !== u.antes,
  );

  function escribirUbicacion(texto: string) {
    onEditar({
      ubicaciones: {
        ...l.ubicaciones,
        [almacenId]: { texto, antes: escrita?.antes ?? ubicacionActual ?? "" },
      },
    });
  }

  function descartarUbicacion(id: number) {
    const resto = { ...l.ubicaciones };
    delete resto[id];
    onEditar({ ubicaciones: resto });
  }

  // "Ácido fólico" a secas no dice si llegó el de 1 mg o el de 5 mg. Sale de la
  // lista del almacén y no del renglón: así también la tiene el renglón que
  // llega desde Vencimientos o de un movimiento que se está editando.
  const conc = concentracionAparte({ nombre: l.nombre, concentracion });
  const pedido = parsearMonto(l.cantidad) ?? 0;
  const subtotal = pedido * (parsearMonto(l.costo) ?? 0);
  const aviso = entrada && conLote ? avisoVidaUtil(mesAIso(l.loteMes)) : null;
  // Se avisa acá y no recién al guardar: al cambiar de almacén los renglones
  // se quedan, y el que ya no entra tiene que saltar a la vista en el momento.
  const noAlcanza = !entrada && stock !== null && pedido > stock;

  // Las celdas de lote que no aplican ("—") sólo tienen sentido como columna:
  // en la tarjeta del celular ocupan lugar sin decir nada.
  const sinLoteEnCelular = conLote ? "block" : "hidden";

  return (
    <>
      {/* En el celular: grilla de dos columnas, el producto arriba a lo ancho y
          la X en la esquina. Desde `md`, una fila de tabla. */}
      <tr className="relative grid grid-cols-2 gap-x-1 pb-2 md:table-row md:pb-0">
        <td className="col-span-2 block px-3.5 pb-1 pr-12 pt-3 md:table-cell md:py-2.5 md:pr-3.5 md:align-middle">
          <span className="block text-sm font-bold text-texto">
            {l.nombre}
            {conc && <span className="ml-1.5 font-semibold text-texto-2">{conc}</span>}
          </span>
          {l.detalle && (
            <span className="block text-xs text-texto-4">{l.detalle}</span>
          )}
          {/* Al recibir se sabe en qué estante queda: se puede anotar, o no. */}
          {entrada && ubicacionLista && (
            <UbicacionEnIngreso
              valor={escrita?.texto ?? ubicacionActual ?? ""}
              actual={escrita?.antes ?? ubicacionActual ?? ""}
              tocada={escrita !== undefined}
              onCambiar={escribirUbicacion}
            />
          )}
          {entrada &&
            enOtras.map(([id, u]) => (
              <span key={id} className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-texto-3">
                <span>
                  En {nombreSucursal(Number(id))}:{" "}
                  {u.texto.trim() ? (
                    <strong className="font-semibold text-texto-2">{u.texto.trim()}</strong>
                  ) : (
                    "se quita"
                  )}{" "}
                  · se guarda ahí
                </span>
                <button
                  type="button"
                  onClick={() => descartarUbicacion(Number(id))}
                  className="font-semibold text-primary-700 hover:underline"
                >
                  No guardar
                </button>
              </span>
            ))}
          {!entrada && stock !== null && (
            <span
              className={`block text-xs ${
                noAlcanza ? "font-semibold text-danger-text" : "text-texto-3"
              }`}
            >
              Stock en {almacenNombre || "la sucursal"}: {conUnidad(stock, unidad)}
              {noAlcanza && " · no alcanza"}
            </span>
          )}
        </td>

        {/* Lote y vencimiento se escriben sólo al RECIBIR. Una salida no
            pregunta el lote: sale el más próximo a vencer, que es la regla del
            depósito — así que lo muestra en vez de preguntarlo. La excepción
            es la baja de un lote elegido en Vencimientos, que trae el suyo. */}
        {entrada ? (
          <>
            <td className={`${sinLoteEnCelular} px-3.5 py-1.5 md:table-cell md:px-3 md:py-2.5`}>
              <EtiquetaCelular>Lote</EtiquetaCelular>
              {conLote ? (
                <Input
                  value={l.loteCodigo}
                  onChange={(e) => onEditar({ loteCodigo: e.target.value })}
                  placeholder="Lote"
                  // El mínimo va en el campo y no sólo en la columna: con la
                  // tabla justa, el navegador achica las columnas por igual y
                  // el ancho de la columna no alcanza. Así la tabla se estira
                  // (y se desliza) antes que esconder el código que se copia
                  // de la factura.
                  className="min-w-[8rem] py-2"
                />
              ) : (
                <span className="text-texto-4">—</span>
              )}
            </td>
            <td className={`${sinLoteEnCelular} px-3.5 py-1.5 md:table-cell md:px-3 md:py-2.5`}>
              <EtiquetaCelular>Vencimiento</EtiquetaCelular>
              {conLote ? (
                <Input
                  value={l.loteMes}
                  onChange={(e) => onEditar({ loteMes: tecleoMes(e.target.value) })}
                  placeholder="MM/AAAA"
                  inputMode="numeric"
                  className="min-w-[6rem] py-2"
                />
              ) : (
                <span className="text-texto-4">—</span>
              )}
            </td>
          </>
        ) : (
          <td
            className={`${sinLoteEnCelular} col-span-2 px-3.5 py-1.5 md:table-cell md:px-3 md:py-2.5`}
            colSpan={2}
          >
            <EtiquetaCelular>Lote</EtiquetaCelular>
            {conLote ? (
              <LoteQueSale
                productoId={l.articuloId}
                almacenId={almacenId}
                almacenNombre={almacenNombre}
                elegido={l.loteCodigo.trim()}
                onSoltar={() => onEditar({ loteCodigo: "" })}
              />
            ) : (
              <span className="text-texto-4">—</span>
            )}
          </td>
        )}

        <td className="block px-3.5 py-1.5 md:table-cell md:px-3 md:py-2.5">
          <EtiquetaCelular>Cantidad</EtiquetaCelular>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={l.cantidad}
            onChange={(e) => onEditar({ cantidad: e.target.value })}
            className="min-w-[5rem] py-2"
          />
        </td>
        <td className="block px-3.5 py-1.5 md:table-cell md:px-3 md:py-2.5">
          <EtiquetaCelular>Costo u.</EtiquetaCelular>
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={l.costo}
            onChange={(e) => onEditar({ costo: e.target.value })}
            className="min-w-[5.5rem] py-2"
          />
        </td>
        <td
          className={`col-span-2 flex items-baseline justify-between px-3.5 pt-1.5 text-right text-sm font-bold md:table-cell md:py-2.5 ${
            entrada ? "text-texto" : "text-danger-text"
          }`}
        >
          <EtiquetaCelular>Subtotal</EtiquetaCelular>
          {fmtMoney(subtotal)}
        </td>
        <td className="absolute right-2 top-2 block md:static md:table-cell md:pr-2">
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
        <tr className="block md:table-row">
          <td colSpan={7} className="block px-3.5 pb-2.5 md:table-cell">
            <p className="rounded-lg bg-warning-bg px-2.5 py-2 text-xs text-warning-text">
              {aviso}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}

/** El nombre de la columna, dentro de la celda: sólo en la tarjeta del celular. */
function EtiquetaCelular({ children }: { children: string }) {
  return (
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-texto-4 md:hidden">
      {children}
    </span>
  );
}

/**
 * Dónde se guarda esta mercadería en la sucursal.
 *
 * Opcional de punta a punta: arranca con la ubicación que el artículo ya tiene
 * ahí, si tiene; cambiarla acá la actualiza al guardar el ingreso; y sin
 * ubicación es un link chico que no se confunde con un campo obligatorio.
 * El campo se abre sólo al tocarlo: diez renglones con un campo más cada uno
 * harían de la recepción una planilla.
 */
function UbicacionEnIngreso({
  valor,
  actual,
  tocada,
  onCambiar,
}: {
  valor: string;
  /** La que tiene hoy en la sucursal: para decir si esta es nueva o se quita. */
  actual: string;
  tocada: boolean;
  onCambiar: (v: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const limpia = valor.trim();

  if (editando) {
    return (
      <span className="mt-1 flex items-center gap-1.5">
        <span className="shrink-0 text-primary-700">
          <Icon name="pin" size={13} />
        </span>
        <input
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
          onBlur={() => setEditando(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setEditando(false);
            }
          }}
          list={LISTA_UBICACIONES}
          autoFocus
          maxLength={60}
          placeholder="Ej: Estante 3 · fila B"
          aria-label="Ubicación en la sucursal"
          className="w-full min-w-0 rounded-lg border border-borde bg-white px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
        />
      </span>
    );
  }

  if (!limpia) {
    return (
      <button
        type="button"
        onClick={() => setEditando(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
      >
        <Icon name="pin" size={12} /> Ubicación (opcional)
        {tocada && actual && (
          <span className="font-normal text-texto-4">· se quita al guardar</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      title="Cambiar la ubicación"
      className="mt-1 inline-flex max-w-full items-center gap-1 text-left text-xs font-semibold text-texto-2 hover:text-primary-700"
    >
      <span className="shrink-0 text-primary-700">
        <Icon name="pin" size={12} />
      </span>
      <span className="truncate">{limpia}</span>
      {tocada && limpia !== actual && (
        <span className="shrink-0 font-normal text-texto-4">· nueva</span>
      )}
      <span className="shrink-0 text-texto-4">
        <Icon name="edit" size={12} />
      </span>
    </button>
  );
}

/**
 * Qué lote se va a ir en esta salida.
 *
 * No es un campo: sin lote el servidor descuenta por FEFO —primero el que
 * vence antes—. Pero decirlo importa: quien da de baja "lo vencido" tiene que
 * poder confirmar que el sistema va a sacar el mismo lote que tiene en la mano.
 *
 * Con `elegido` (la baja de un lote que llega de Vencimientos) sale ese y no
 * el del FEFO, y se muestra ese. Si en la sucursal elegida no tiene saldo —se
 * cambió el selector, o el lote era de una entrada que pasó a salida— se avisa
 * y se ofrece volver al FEFO: el servidor la rechazaría al aprobar.
 */
function LoteQueSale({
  productoId,
  almacenId,
  almacenNombre,
  elegido,
  onSoltar,
}: {
  productoId: number;
  almacenId: number;
  almacenNombre: string;
  elegido: string;
  onSoltar: () => void;
}) {
  // Sin la feature el servidor responde 403, y el error se leía como "Sin lotes
  // con saldo": una mentira, los lotes están. La salida igual sale por FEFO.
  const { incluye } = useAuth();
  const conLotes = incluye("lotes");
  const lotes = useApi(
    () =>
      conLotes
        ? api.lotesDeProducto(productoId, almacenId || undefined)
        : Promise.resolve([]),
    [productoId, almacenId, conLotes],
  );

  if (!conLotes && !elegido) return <span className="text-texto-4">—</span>;
  if (lotes.cargando) return <span className="text-xs text-texto-4">…</span>;

  if (elegido) {
    // Sin la feature no hay lista contra qué comparar: se muestra el código.
    const lote = conLotes ? (lotes.datos ?? []).find((x) => x.codigo === elegido) : undefined;
    const sinSaldo = conLotes && !lote;
    return (
      <span className="block">
        <span className="block text-[13px] font-semibold text-texto">{elegido}</span>
        <span className={`block text-xs ${sinSaldo ? "font-semibold text-danger-text" : "text-texto-4"}`}>
          {sinSaldo
            ? `Sin saldo en ${almacenNombre || "esta sucursal"}`
            : lote?.vencimiento
              ? `sale este lote · vence ${fmtFecha(lote.vencimiento)}`
              : "sale este lote"}
        </span>
        <button
          type="button"
          onClick={onSoltar}
          className="text-xs font-semibold text-primary-700 hover:underline"
        >
          Que salga el que vence primero
        </button>
      </span>
    );
  }

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
