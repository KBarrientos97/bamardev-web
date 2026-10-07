import { useState } from "react";
import HistorialCostos from "../../components/HistorialCostos";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Cargando, Modal } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import { contiene } from "../../lib/texto";
import { tienePermiso } from "../../lib/permisos";
import { useAuth } from "../../store/AuthContext";
import type { Existencia, Producto } from "../../types";
import {
  COLOR_TRAMO,
  CONDICION,
  concentracionAparte,
  conUnidad,
  detalleDe,
  textoVida,
} from "./medicamento";

/**
 * Las dos piezas del catálogo de una farmacia: la tarjeta de la grilla y la
 * ficha que se abre al tocarla.
 *
 * Viven acá y no en `inventario/Productos.tsx` por lo mismo de siempre: la
 * pantalla de artículos la comparten todos los rubros y la pollería que ya
 * trabaja no tiene por qué enterarse de que existe un vencimiento. Productos
 * elige cuál dibujar según el rubro y nada más.
 *
 * Lo que cambia respecto de la tarjeta común no es estética:
 *
 *  · **no lleva ícono.** En una pollería el dibujo del pollo es lo que el
 *    cajero busca; acá hay 1.842 cajas blancas y lo que distingue una de otra
 *    es el laboratorio, que entra justo en el lugar del ícono;
 *  · **el stock es un punto de color**, no un recuadro. Se recorre la grilla
 *    entera de un vistazo buscando el rojo;
 *  · **la ficha abre por lo que se pregunta**: registro sanitario, código de
 *    barras, en qué almacén está y qué lote se va a vender primero. El precio y
 *    el margen siguen estando, más abajo: son del dueño, no del mostrador.
 */
export function TarjetaMedicamento({
  producto: p,
  stock,
  onClick,
}: {
  producto: Producto;
  /**
   * Cuánto hay. Es el total del negocio salvo que arriba se haya elegido un
   * almacén, y entonces es el de ese: la tarjeta tiene que decir lo mismo que
   * el filtro que está puesto.
   */
  stock: number;
  onClick: () => void;
}) {
  const agotado = stock <= 0;
  const bajo = !agotado && stock <= p.stockMinimo;
  const detalle = detalleDe(p);
  const condicion = CONDICION[p.condicionVenta];
  // "Ácido fólico" a secas no dice si es el de 1 mg o el de 5 mg. Cuando el
  // nombre no la trae (el formulario la pide en su propio campo), va al lado.
  const concentracion = concentracionAparte(p);

  return (
    <li>
      <button
        onClick={onClick}
        className="card flex h-full w-full flex-col p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`min-w-0 flex-1 text-[15px] font-bold ${
              agotado ? "text-texto-3" : "text-texto"
            }`}
          >
            {p.nombre}
            {concentracion && <span className="ml-1.5 font-semibold">{concentracion}</span>}
          </h3>
          <span className="mt-0.5 shrink-0 text-texto-4">
            <Icon name="chevronRight" size={17} />
          </span>
        </div>

        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {detalle || p.descripcion || "Sin ficha cargada"}
        </p>

        {(p.condicionVenta !== "LIBRE" || p.controlado || !p.habilitado) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {condicion && <Badge tono={condicion.tono}>{condicion.texto}</Badge>}
            {p.controlado && <Badge tono="rojo">Controlado</Badge>}
            {!p.habilitado && <Badge tono="gris">Inactivo</Badge>}
          </div>
        )}

        {/* `mt-auto`: con o sin chips, el pie queda a la misma altura en todas
            las tarjetas de la fila. */}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-borde-soft pt-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">
              Precio
            </p>
            <p
              className={`truncate text-[17px] font-bold ${
                agotado ? "text-texto-3" : "text-texto"
              }`}
            >
              {fmtMoney(p.precio)}
            </p>
          </div>

          <span
            className={`flex shrink-0 items-center gap-1.5 pb-0.5 text-[13px] ${
              agotado ? "text-danger-text" : bajo ? "text-warning-text" : "text-texto-3"
            }`}
          >
            <span
              aria-hidden
              className={`h-2 w-2 rounded-full ${
                agotado ? "bg-danger" : bajo ? "bg-warning" : "bg-primary"
              }`}
            />
            {agotado ? "Agotado" : conUnidad(stock, p.unidadMedida?.nombre)}
          </span>
        </div>
      </button>
    </li>
  );
}

export function FichaMedicamento({
  producto: p,
  enPapelera,
  onClose,
  onEditar,
  onEliminar,
  onRestaurar,
}: {
  producto: Producto;
  enPapelera: boolean;
  onClose: () => void;
  onEditar: (p: Producto) => void;
  onEliminar: (p: Producto) => void;
  onRestaurar: (p: Producto) => void;
}) {
  const [viendoCostos, setViendoCostos] = useState(false);
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;

  return (
    <>
      <Modal
        abierto
        titulo={p.nombre}
        onClose={onClose}
        ancho="max-w-2xl"
        encabezado={<EncabezadoFicha producto={p} />}
        acciones={
          enPapelera ? (
            <Boton icono="check" onClick={() => onRestaurar(p)}>
              Restaurar
            </Boton>
          ) : (
            <>
              <Boton variante="ghost" icono="trendingDown" onClick={() => setViendoCostos(true)}>
                Historial de costos
              </Boton>
              <Boton variante="danger" icono="trash" onClick={() => onEliminar(p)}>
                Eliminar
              </Boton>
              <Boton icono="edit" onClick={() => onEditar(p)}>
                Editar
              </Boton>
            </>
          )
        }
      >
        <div className="space-y-5">
          <Seccion titulo="Identificación">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Dato label="Registro sanitario" valor={p.registroSanitario || "—"} />
              <Dato label="Código de barras" valor={p.codBarra || "—"} />
              <Dato label="Precio" valor={fmtMoney(p.precio)} />
              <Dato label="Costo" valor={fmtMoney(p.costo)} />
              <Dato label="Margen" valor={`${Math.round(margen * 100)}%`} />
              <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
            </div>
          </Seccion>

          <StockPorSucursal producto={p} />

          <LotesFefo producto={p} />

          {p.controlado && (
            <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
              <strong>Medicamento controlado.</strong> Su venta se asienta en el libro que
              corresponde.
            </p>
          )}
        </div>
      </Modal>

      {viendoCostos && (
        <HistorialCostos
          productoId={p.id}
          nombre={p.nombre}
          onClose={() => setViendoCostos(false)}
        />
      )}
    </>
  );
}

/**
 * La ficha que se abre desde Buscar medicamento: la misma que la del catálogo,
 * con lo que hace falta para responderle a quien está esperando y sin nada del
 * dueño. No hay costo, margen ni costo por lote, y no se edita ni se borra:
 * quien atiende no debería poder cambiar un precio con el cliente enfrente.
 *
 * Lo único que se puede hacer es lo que la persona vino a hacer: sumarlo a la
 * venta.
 */
export function FichaMostrador({
  producto: p,
  onClose,
  onAgregar,
  onCambio,
  sucursalActual,
}: {
  producto: Producto;
  onClose: () => void;
  /** Sin esto no hay botón: agotado, o un rol que no vende. */
  onAgregar?: () => void;
  /** Se cambió la ubicación: la lista de atrás la vuelve a pedir. */
  onCambio?: () => void;
  /** Dónde se está vendiendo (la sucursal de la caja): es el "acá". */
  sucursalActual?: number | null;
}) {
  return (
    <Modal
      abierto
      titulo={p.nombre}
      onClose={onClose}
      ancho="max-w-2xl"
      encabezado={<EncabezadoFicha producto={p} />}
      acciones={
        onAgregar && (
          <Boton icono="plus" onClick={onAgregar}>
            Agregar a la venta
          </Boton>
        )
      }
    >
      <div className="space-y-5">
        <Seccion titulo="Identificación">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Dato label="Registro sanitario" valor={p.registroSanitario || "—"} />
            <Dato label="Código de barras" valor={p.codBarra || "—"} />
            <Dato label="Precio" valor={fmtMoney(p.precio)} />
            <Dato label="Principio activo" valor={p.principioActivo || "—"} />
            <Dato label="Concentración" valor={p.concentracion || "—"} />
            <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
          </div>
        </Seccion>

        <StockPorSucursal producto={p} onCambio={onCambio} aca={sucursalActual} />

        <LotesFefo producto={p} conCosto={false} />

        {p.controlado && (
          <p className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger-text">
            <strong>Medicamento controlado.</strong> Se dispensa con la receta que
            corresponde y queda asentado en el libro.
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * La franja de color de la ficha: el nombre es lo primero que se lee y lo que
 * hay que confirmar antes de mirar cualquier número.
 */
function EncabezadoFicha({ producto: p }: { producto: Producto }) {
  const condicion = CONDICION[p.condicionVenta];
  const concentracion = concentracionAparte(p);
  return (
    <div className="bg-gradient-to-r from-primary-700 to-primary px-5 pb-5 pt-5 text-white">
      <h2 className="pr-12 text-xl font-bold leading-tight">
        {p.nombre}
        {concentracion && (
          <span className="ml-1.5 font-semibold text-white/85">{concentracion}</span>
        )}
      </h2>
      <p className="mt-0.5 text-[13px] text-white/80">
        {detalleDe(p) || "Sin ficha farmacéutica cargada"}
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
          {condicion ? condicion.largo : "Libre"}
        </span>
        {p.controlado && (
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-danger-text">
            Controlado
          </span>
        )}
        {!p.habilitado && (
          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            Inactivo
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Cuánto hay en cada sucursal, y dónde está.
 *
 * Es la respuesta a "¿tenés?" cuando la respuesta es "acá no, pero en la
 * sucursal X sí": por eso sale de `GET /productos/:id/existencias`, que lee
 * cualquiera que atienda y trae sólo cantidades. Lo de antes (`GET /almacenes`)
 * era del dueño, traía el inventario entero con costos, y al cajero le dejaba
 * ver sólo su total.
 *
 * Con un solo local no hay nada que comparar: se ve el total y, si alguien la
 * cargó, la ubicación. La ubicación es opcional de punta a punta: si nadie la
 * cargó no aparece, y el botón para cargarla sólo lo ve quien ordena el local.
 */
function StockPorSucursal({
  producto: p,
  onCambio,
  aca,
}: {
  producto: Producto;
  /** Se cambió una ubicación: quien tiene la lista la vuelve a pedir. */
  onCambio?: () => void;
  /**
   * La sucursal desde la que se mira. Por defecto la del usuario; el dueño no
   * pertenece a ninguna, y en el mostrador su "acá" es la de la caja.
   */
  aca?: number | null;
}) {
  const { usuario } = useAuth();
  const existencias = useApi(() => api.existenciasProducto(p.id), [p.id]);
  const lista = existencias.datos ?? [];
  const unidad = p.unidadMedida?.nombre;
  const varias = lista.length > 1;
  // Con el desglose a mano, el total es el del negocio entero. Sin él (cargando
  // o un corte), el que ya venía con el artículo.
  const total = varias ? lista.reduce((a, e) => a + e.cantidad, 0) : p.stockTotal;

  const miSucursal = usuario?.sucursalId ?? null;
  const donde = aca ?? miSucursal;
  /**
   * La sucursal desde la que se mira, si es una de la lista. Va primera: la
   * pregunta del mostrador es "¿hay ACÁ?". Antes el cuadro destacado decía
   * "Total" con la suma del negocio —la ficha decía 100 donde la tarjeta del
   * punto de venta decía 65— y el de acá se perdía entre los demás.
   */
  const deAca = varias ? lista.find((e) => e.almacenId === donde) : undefined;
  const otras = deAca ? lista.filter((e) => e !== deAca) : lista;
  // La ubicación la carga quien edita el catálogo (lo mismo que pide el
  // backend); atado a una sucursal, sólo en la suya.
  const ordena = tienePermiso(usuario, "catalogo.editar");
  const puedeUbicar = (e: Existencia) =>
    ordena && (miSucursal == null || miSucursal === e.almacenId);

  const alGuardar = () => {
    existencias.recargar();
    onCambio?.();
  };

  return (
    <Seccion titulo={varias ? "Stock por sucursal" : "Stock"}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {deAca && (
          <CajaSucursal
            existencia={deAca}
            unidad={unidad}
            productoId={p.id}
            mia
            puedeUbicar={puedeUbicar(deAca)}
            onGuardado={alGuardar}
          />
        )}
        {/* La suma dice que es la suma: "Total" a secas, al lado del número
            de acá, se leía como lo que hay en este local. */}
        <Caja
          etiqueta={varias ? "Todas las sucursales" : "Total"}
          valor={conUnidad(total, unidad)}
          destacada={!deAca}
        />
        {varias &&
          otras.map((e) => (
            <CajaSucursal
              key={e.almacenId}
              existencia={e}
              unidad={unidad}
              productoId={p.id}
              mia={false}
              puedeUbicar={puedeUbicar(e)}
              onGuardado={alGuardar}
            />
          ))}
      </div>
      {/* Un solo local: la ubicación va abajo del total, si la hay. */}
      {!varias && lista[0] && (
        <div className="mt-2">
          <Ubicacion
            productoId={p.id}
            existencia={lista[0]}
            editable={puedeUbicar(lista[0])}
            onGuardado={alGuardar}
          />
        </div>
      )}
      <p className="mt-2 text-xs text-texto-4">
        Stock mínimo: {fmtNum(p.stockMinimo)} · avisa cuando baje de ahí
      </p>
    </Seccion>
  );
}

function CajaSucursal({
  existencia: e,
  unidad,
  productoId,
  mia,
  puedeUbicar,
  onGuardado,
}: {
  existencia: Existencia;
  unidad?: string | null;
  productoId: number;
  /** La sucursal de quien mira: se marca, y no se ofrece llamarse a sí misma. */
  mia: boolean;
  puedeUbicar: boolean;
  onGuardado: () => void;
}) {
  const noHay = e.cantidad <= 0;
  return (
    <div
      className={`min-w-0 rounded-xl p-3 ${
        mia ? "bg-white ring-1 ring-primary-200" : "bg-muted"
      }`}
    >
      <p className="flex min-w-0 items-center gap-1.5 text-xs text-texto-3">
        <span className="truncate" title={e.nombre}>
          {e.nombre}
        </span>
        {/* Un depósito no vende: se aclara, salvo que el nombre ya lo diga. */}
        {e.tipo === "DEPOSITO" && !contiene(e.nombre, "deposito") && (
          <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] font-bold uppercase text-texto-3">
            depósito
          </span>
        )}
        {mia && (
          <span className="shrink-0 rounded bg-primary-50 px-1 text-[10px] font-bold uppercase text-primary-700">
            acá
          </span>
        )}
      </p>
      <p
        className={`mt-0.5 truncate text-lg font-bold ${
          noHay ? "text-danger-text" : "text-texto"
        }`}
      >
        {noHay ? "No hay" : conUnidad(e.cantidad, unidad)}
      </p>
      <Ubicacion
        productoId={productoId}
        existencia={e}
        editable={puedeUbicar}
        onGuardado={onGuardado}
      />
      {/* "Acá no hay, pero en Equipetrol sí": el teléfono a un toque para
          confirmar que la caja está de verdad antes de mandar al cliente. */}
      {!mia && !noHay && e.telefono && (
        <a
          href={`tel:${e.telefono}`}
          className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
        >
          <Icon name="phone" size={13} /> Llamar · {e.telefono}
        </a>
      )}
    </div>
  );
}

/**
 * La ubicación en una sucursal: se muestra si alguien la cargó, y quien ordena
 * el local la puede cargar o cambiar ahí mismo. Vacía se borra.
 */
function Ubicacion({
  productoId,
  existencia: e,
  editable,
  onGuardado,
}: {
  productoId: number;
  existencia: Existencia;
  editable: boolean;
  onGuardado: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  // Las que ya se usan en esa sucursal, para escribir "Estante 3" igual que
  // la vez anterior y no inventar "Est. 3".
  const sugeridas = useApi(
    () => (editando ? api.ubicacionesUsadas(e.almacenId) : Promise.resolve([])),
    [editando, e.almacenId],
  );

  const abrir = () => {
    setTexto(e.ubicacion ?? "");
    setError("");
    setEditando(true);
  };

  const guardar = async () => {
    if (guardando) return;
    setGuardando(true);
    setError("");
    try {
      await api.fijarUbicacionProducto(productoId, e.almacenId, texto.trim() || null);
      setEditando(false);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  if (!editando) {
    if (e.ubicacion) {
      return (
        <p className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold text-texto-2">
          <span className="shrink-0 text-primary-700">
            <Icon name="pin" size={13} />
          </span>
          <span className="truncate" title={e.ubicacion}>
            {e.ubicacion}
          </span>
          {editable && (
            <button
              onClick={abrir}
              aria-label={`Cambiar la ubicación en ${e.nombre}`}
              title="Cambiar la ubicación"
              className="ml-auto shrink-0 rounded p-0.5 text-texto-4 hover:text-primary-700"
            >
              <Icon name="edit" size={13} />
            </button>
          )}
        </p>
      );
    }
    if (!editable) return null;
    return (
      <button
        onClick={abrir}
        className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
      >
        <Icon name="pin" size={12} /> Agregar ubicación
      </button>
    );
  }

  const idLista = `ubicaciones-${productoId}-${e.almacenId}`;
  return (
    <form
      className="mt-1.5 space-y-1.5"
      onSubmit={(ev) => {
        ev.preventDefault();
        void guardar();
      }}
    >
      <input
        value={texto}
        onChange={(ev) => setTexto(ev.target.value)}
        list={idLista}
        autoFocus
        maxLength={60}
        placeholder="Ej: Estante 3 · fila B"
        aria-label={`Ubicación en ${e.nombre}`}
        className="w-full rounded-lg border border-borde bg-white px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
      />
      <datalist id={idLista}>
        {(sugeridas.datos ?? []).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-texto-3 hover:bg-muted"
        >
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-texto-4">Vacía se borra: es opcional.</p>
      {error && <p className="text-[11px] text-danger-text">{error}</p>}
    </form>
  );
}

/**
 * Los lotes con saldo, en el orden en que se van a vender (FEFO: primero el que
 * vence antes). Es el corazón de la ficha: responde "¿qué le estoy por dar a
 * esta persona?" sin ir a Vencimientos.
 */
function LotesFefo({
  producto: p,
  conCosto = true,
}: {
  producto: Producto;
  /** El costo de cada partida es del dueño: el mostrador no lo ve. */
  conCosto?: boolean;
}) {
  // Sin la feature el servidor responde 403: la sección no se dibuja, como
  // cualquier otra cosa que el plan no incluye.
  const { incluye } = useAuth();
  const conLotes = incluye("lotes");
  const lotes = useApi(
    () => (conLotes && p.manejaLote ? api.lotesDeProducto(p.id) : Promise.resolve([])),
    [p.id, p.manejaLote, conLotes],
  );

  // Un rol sin permiso sobre los lotes (o un corte) recibe un error: la sección
  // no se dibuja, en vez de decir "no queda saldo" cuando no se sabe.
  if (!conLotes || lotes.error) return null;

  if (!p.manejaLote) {
    return (
      <Seccion titulo="Lotes (FEFO)">
        <p className="text-[13px] text-texto-3">
          Este artículo no maneja lotes (no vence).
        </p>
      </Seccion>
    );
  }

  const lista = lotes.datos ?? [];

  return (
    <Seccion titulo="Lotes (FEFO)">
      {lotes.cargando ? (
        <Cargando texto="Buscando lotes…" />
      ) : lista.length === 0 ? (
        <p className="text-[13px] text-texto-3">
          No queda saldo en ningún lote: lo que entre en el próximo ingreso será el
          primero en salir.
        </p>
      ) : (
        <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
          {lista.map((l) => {
            const color = COLOR_TRAMO[l.tramo ?? "LEJOS"];
            return (
              <li key={l.loteId} className="flex items-center gap-3 px-3.5 py-2.5">
                <span
                  aria-hidden
                  className={`h-8 w-1 shrink-0 rounded-full ${color.barra}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-texto">{l.codigo}</p>
                  <p className="truncate text-xs text-texto-3">
                    {l.vencimiento ? fmtFecha(l.vencimiento) : "Sin fecha"}
                    {l.almacen && ` · ${l.almacen.nombre}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${color.fondo} ${color.texto}`}
                >
                  {textoVida(l.diasRestantes)}
                </span>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold text-texto">
                    {conUnidad(l.cantidad, p.unidadMedida?.nombre)}
                  </p>
                  {conCosto && l.costoUnitario !== null && (
                    <p className="text-xs text-texto-3">{fmtMoney(l.costoUnitario)}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Seccion>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-texto-4">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-texto-3">{label}</dt>
      <dd className="mt-0.5 truncate text-[15px] font-bold text-texto" title={valor}>
        {valor}
      </dd>
    </div>
  );
}

function Caja({
  etiqueta,
  valor,
  destacada,
}: {
  etiqueta: string;
  valor: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 ${
        destacada ? "bg-primary-50 ring-1 ring-primary-100" : "bg-muted"
      }`}
    >
      <p className="truncate text-xs text-texto-3">{etiqueta}</p>
      <p
        className={`mt-0.5 truncate text-lg font-bold ${
          destacada ? "text-primary-700" : "text-texto"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}
