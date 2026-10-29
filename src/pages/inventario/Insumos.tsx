import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { contiene } from "../../lib/texto";
import HistorialCostos from "../../components/HistorialCostos";
import { parsearMonto } from "../../lib/dinero";
import { Icon } from "../../components/Icon";
import { Buscador, Chips, EncabezadoPagina, FilaFiltros } from "../../components/filtros";
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
import { fmtCantidad, fmtFecha, fmtMoney } from "../../lib/format";
import { finDeMes, hoyIso, inicioDeMes } from "../../lib/gastos";
import { DESCARTABLES_A_GASTOS, insumosSinStock } from "../../lib/rubro";
import { useApi } from "../../lib/useApi";
import { useSucursales } from "../../lib/useSucursales";
import { useAuth } from "../../store/AuthContext";
import type {
  Almacen,
  Categoria,
  CompraDeInsumo,
  ComprasInsumos,
  Insumo,
  InsumoInput,
  UnidadMedida,
} from "../../types";
import { RUTA_REGISTRAR_COMPRA } from "./Movimientos";

type FiltroStock = "todos" | "bajo" | "sin" | "papelera";

const OPC_STOCK = [
  ["todos", "Todos"],
  ["bajo", "Bajo stock"],
  ["sin", "Sin stock"],
  ["papelera", "Dados de baja"],
] as const satisfies readonly (readonly [FiltroStock, string])[];

/**
 * Restaurante (`insumosSinStock`): "Bajo stock" y "Sin stock" filtrarían por
 * un número que no baja nunca —ahí vender un plato no descuenta insumos—, así
 * que quedan "Todos" y la papelera.
 */
const OPC_SIN_STOCK = OPC_STOCK.filter(([k]) => k === "todos" || k === "papelera");

/** Lo comprado de cada insumo en el mes, por id. */
type Invertido = ReadonlyMap<number, CompraDeInsumo>;

/** Bajo el punto de reorden hay que reponer; en cero ya no se puede producir. */
function estadoStock(i: Insumo): "sin" | "bajo" | "ok" {
  if (i.stock <= 0) return "sin";
  if (i.puntoReorden > 0 && i.stock <= i.puntoReorden) return "bajo";
  return "ok";
}

export default function Insumos() {
  const { rubro, puede } = useAuth();
  const navigate = useNavigate();
  // Restaurante: sin stock, y en su lugar lo invertido en el mes.
  const sinStock = insumosSinStock(rubro);
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  // La papelera es otra lista del backend, no un filtro sobre la que ya está.
  const enPapelera = filtroStock === "papelera";
  // Sin depósitos: acá la pregunta es "qué le falta a este local para trabajar
  // hoy", y el stock del depósito no está en su gondola.
  const suc = useSucursales();
  const insumos = useApi(
    () => api.getInsumos(enPapelera, suc.sucursalId),
    [enPapelera, suc.sucursalId],
  );
  // El mes que corre, del 1 al 1 del siguiente (`hasta` exclusivo, como el mes
  // de Gastos). No depende de la papelera: lo comprado de un insumo dado de
  // baja también se gastó. Fuera del restaurante no se pide nada.
  const hoy = hoyIso();
  const desdeMes = inicioDeMes(hoy);
  const hastaMes = finDeMes(hoy);
  const compras = useApi<ComprasInsumos | null>(
    () =>
      sinStock
        ? api.getComprasInsumos({ desde: desdeMes, hasta: hastaMes, sucursalId: suc.sucursalId })
        : Promise.resolve(null),
    [sinStock, desdeMes, hastaMes, suc.sucursalId],
  );
  /**
   * Lo invertido del filtro que está a la vista. Null mientras no se sabe: se
   * está pidiendo, o el backend todavía no tiene el endpoint (responde 400).
   * Ahí no se dibuja nada de lo invertido y el error no se muestra: un "Sin
   * compras" o un "Bs 0,00" se leerían como que no se compró nada, y la
   * pantalla igual sirve sin el dato.
   *
   * Se mira `cargando` porque `useApi` conserva los datos viejos mientras
   * recarga: al cambiar de sucursal, el "compraste Bs X" y el "Este mes" de
   * cada tarjeta seguían con la plata de la sucursal anterior (o de todas), con
   * el chip nuevo ya marcado, y si la lista llegaba primero salía con los
   * montos del otro local.
   */
  const comprasAlDia = compras.cargando ? null : compras.datos;
  const invertido = useMemo<Invertido | null>(
    () => (comprasAlDia ? new Map(comprasAlDia.porInsumo.map((c) => [c.insumoId, c])) : null),
    [comprasAlDia],
  );
  const nombreMes = new Date(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, 1).toLocaleDateString(
    "es-BO",
    { month: "long" },
  );
  // La compra se carga en Movimientos, como siempre: el botón lleva al
  // formulario de la entrada ya abierto. Sin permiso para mover inventario no
  // se ofrece, o terminaría en una pantalla que no puede abrir.
  const registraCompras = sinStock && puede("movimientos");
  // `true` trae sólo las categorías de insumo: las de venta no aplican acá.
  const categorias = useApi(() => api.getCategorias(true), []);
  const unidades = useApi(() => api.getUnidades(), []);
  const almacenes = useApi(() => api.getAlmacenes(), []);

  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<Insumo | null>(null);
  const [editando, setEditando] = useState<Insumo | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Insumo | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = insumos.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((i) => {
      if (
        texto &&
        !contiene(i.nombre, texto) &&
        !contiene(i.codigo, texto) &&
        !contiene(i.proveedor, texto)
      )
        return false;

      const estado = estadoStock(i);
      if (filtroStock === "bajo") return estado === "bajo";
      if (filtroStock === "sin") return estado === "sin";
      return true;
    });
  }, [lista, q, filtroStock]);

  /** Devuelve al catálogo un insumo dado de baja. */
  async function restaurar(i: Insumo) {
    setErrorAccion("");
    try {
      await api.restaurarInsumo(i.id);
      setDetalle(null);
      insumos.recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  }

  async function borrar() {
    if (!aBorrar || borrando) return;
    setErrorAccion("");
    setBorrando(true);
    try {
      await api.eliminarInsumo(aBorrar.id);
      setABorrar(null);
      setDetalle(null);
      insumos.recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Insumos"
        subtitulo={`${lista.length} materias primas`}
        // En la papelera no se ofrece "Nuevo": el alta cae en el catálogo y el
        // insumo recién creado desaparecería de la lista que estás mirando.
        // "Registrar compra" tampoco: se compra lo que está en el catálogo.
        accion={
          !enPapelera && (
            <div className="flex flex-wrap justify-end gap-2">
              {registraCompras && (
                <Boton variante="soft" icono="cart" onClick={() => navigate(RUTA_REGISTRAR_COMPRA)}>
                  Registrar compra
                </Boton>
              )}
              <Boton icono="plus" onClick={() => setCreando(true)}>
                Nuevo
              </Boton>
            </div>
          )
        }
      />

      {sinStock && comprasAlDia && <ResumenInvertido compras={comprasAlDia} nombreMes={nombreMes} />}

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador
            valor={q}
            onChange={setQ}
            placeholder="Buscar por nombre, código o proveedor"
          />
        </div>
        <FilaFiltros>
          {suc.elegir && (
            <Chips titulo="Sucursal" valor={suc.valorChip} opciones={suc.opciones} onChange={suc.alElegir} />
          )}
          <Chips
            titulo={sinStock ? "Mostrar" : "Stock"}
            valor={filtroStock}
            opciones={sinStock ? OPC_SIN_STOCK : OPC_STOCK}
            onChange={setFiltroStock}
          />
        </FilaFiltros>
      </div>

      <ErrorMsg>{errorAccion || insumos.error}</ErrorMsg>

      {insumos.cargando ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <div className="card">
          <Vacio
            icono="sack"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay insumos"}
            texto={
              lista.length
                ? "Probá con otro texto o quitá los filtros."
                : sinStock
                  ? "Cargá la materia prima que comprás para la cocina."
                  : "Cargá la materia prima que comprás y controlás."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo insumo
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((i) => (
            <TarjetaInsumo
              key={i.id}
              insumo={i}
              sinStock={sinStock}
              invertido={invertido}
              onClick={() => setDetalle(i)}
            />
          ))}
        </ul>
      )}

      <DetalleInsumo
        insumo={detalle}
        enPapelera={enPapelera}
        sinStock={sinStock}
        invertido={invertido}
        onClose={() => setDetalle(null)}
        onEditar={(i) => {
          setDetalle(null);
          setEditando(i);
        }}
        onEliminar={(i) => setABorrar(i)}
        onRestaurar={restaurar}
      />

      <FormInsumo
        abierto={creando || !!editando}
        insumo={editando}
        sinStock={sinStock}
        categorias={categorias.datos ?? []}
        unidades={unidades.datos ?? []}
        almacenes={almacenes.datos ?? []}
        onClose={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={() => {
          setCreando(false);
          setEditando(null);
          insumos.recargar();
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo="Eliminar insumo"
        texto={`¿Eliminar "${aBorrar?.nombre}"? Se pierde su ficha, no los movimientos ya registrados.`}
        etiquetaOk="Eliminar"
        peligroso
        procesando={borrando}
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

/**
 * Lo invertido en insumos en el mes que corre (restaurante). Reemplaza al stock
 * como la pregunta de esta pantalla: no "cuánto queda", que ahí no baja nunca,
 * sino "cuánta plata se fue en materia prima".
 */
function ResumenInvertido({ compras, nombreMes }: { compras: ComprasInsumos; nombreMes: string }) {
  return (
    <section aria-label="Lo invertido en insumos" className="card flex items-start gap-3 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
        <Icon name="cart" size={21} />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] text-texto">
          {compras.numCompras === 0 ? (
            `En ${nombreMes} todavía no registraste compras de insumos.`
          ) : (
            <>
              En {nombreMes} compraste <b className="tabular-nums">{fmtMoney(compras.total)}</b> en insumos ·{" "}
              {compras.numCompras} {compras.numCompras === 1 ? "compra" : "compras"}
            </>
          )}
        </p>
        {/* Lo que el dueño va a buscar al ver la plata: dónde resta. Restarla
            en el resultado contaría la comida dos veces (ver EstadoResultado). */}
        <p className="mt-0.5 text-[12.5px] leading-snug text-texto-3">
          Cada compra se registra en Movimientos, como una entrada. En el Estado de resultado no se resta aparte: entra
          por el costo cargado en cada plato.
        </p>
      </div>
    </section>
  );
}

function TarjetaInsumo({
  insumo: i,
  sinStock,
  invertido,
  onClick,
}: {
  insumo: Insumo;
  /** Restaurante: en vez del stock, lo comprado en el mes. */
  sinStock: boolean;
  /** Null = no se sabe (pidiéndolo, o un backend sin el endpoint): la celda no va. */
  invertido: Invertido | null;
  onClick: () => void;
}) {
  const estado = sinStock ? null : estadoStock(i);
  const unidad = i.unidad?.abreviatura ?? i.unidad?.nombre ?? "";
  const compra = invertido?.get(i.id);
  // Sin el dato, la celda del mes no se dibuja: un "Sin compras" ahí sería
  // inventado. Queda el costo solo.
  const conCelda = !sinStock || invertido != null;

  return (
    <li>
      <button
        onClick={onClick}
        className="card w-full p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca text-white">
            <Icon name="sack" size={21} />
          </span>
          <div className="flex items-center gap-2">
            {estado === "sin" && <Badge tono="rojo">Sin stock</Badge>}
            {estado === "bajo" && <Badge tono="amarillo">Reponer</Badge>}
            {!i.habilitado && <Badge tono="gris">Inactivo</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{i.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {i.codigo ? `${i.codigo} · ` : ""}
          {i.categoria?.nombre ?? "Sin categoría"}
        </p>

        <div className={`mt-3 grid gap-2 rounded-xl bg-muted p-2.5 ${conCelda ? "grid-cols-2" : "grid-cols-1"}`}>
          {sinStock ? (
            invertido && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-texto-4">Este mes</p>
                <p className={`text-sm font-bold ${compra ? "text-texto" : "text-texto-4"}`}>
                  {compra ? fmtMoney(compra.total) : "Sin compras"}
                </p>
              </div>
            )
          ) : (
            <div>
              <p className="text-[11px] font-semibold uppercase text-texto-4">Stock</p>
              <p className="text-sm font-bold text-texto">
                {/* "25 kg", "2,5 kg", "0,125 kg": salía "25,00 kg" (Kevin, 25-oct). */}
                {fmtCantidad(i.stock)} {unidad}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Costo</p>
            <p className="text-sm font-bold text-texto">{fmtMoney(i.costoCompra)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-texto-4">
            {i.proveedor || "Sin proveedor"}
          </span>
          {i.vencimiento && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-texto-4">
              <Icon name="calendar" size={12} /> {fmtFecha(i.vencimiento)}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function DetalleInsumo({
  insumo: i,
  enPapelera,
  sinStock,
  invertido,
  onClose,
  onEditar,
  onEliminar,
  onRestaurar,
}: {
  insumo: Insumo | null;
  /** En la papelera el insumo no se edita: se restaura o se deja. */
  enPapelera: boolean;
  /** Restaurante: sin stock ni punto de reorden; con lo comprado en el mes. */
  sinStock: boolean;
  /** Null = no se sabe: el bloque del mes no va. */
  invertido: Invertido | null;
  onClose: () => void;
  onEditar: (i: Insumo) => void;
  onEliminar: (i: Insumo) => void;
  onRestaurar: (i: Insumo) => void;
}) {
  const [viendoCostos, setViendoCostos] = useState(false);
  if (!i) return null;
  const estado = estadoStock(i);
  const unidad = i.unidad?.abreviatura ?? i.unidad?.nombre ?? "";

  return (
    <Modal
      abierto
      titulo="Detalle del insumo"
      subtitulo={i.nombre}
      onClose={onClose}
      acciones={
        enPapelera ? (
          <Boton icono="check" onClick={() => onRestaurar(i)}>
            Restaurar
          </Boton>
        ) : (
          <>
            <Boton variante="danger" icono="trash" onClick={() => onEliminar(i)}>
              Eliminar
            </Boton>
            <Boton icono="edit" onClick={() => onEditar(i)}>
              Editar
            </Boton>
          </>
        )
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setViendoCostos(true)}
          className="flex w-full items-center gap-2 rounded-xl border border-borde px-3.5 py-2.5 text-left text-[13px] font-semibold text-texto-2 hover:bg-muted"
        >
          <Icon name="trendingDown" size={17} />
          <span className="flex-1">Historial de costos</span>
          <Icon name="chevronRight" size={16} />
        </button>

        {viendoCostos && (
          <HistorialCostos
            productoId={i.id}
            nombre={i.nombre}
            onClose={() => setViendoCostos(false)}
          />
        )}

        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca text-white">
            <Icon name="sack" size={26} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{i.nombre}</h3>
            <p className="text-[13px] text-texto-3">
              {i.codigo ? `Código ${i.codigo}` : "Sin código"}
            </p>
            {!sinStock && (
              <Badge
                tono={estado === "sin" ? "rojo" : estado === "bajo" ? "amarillo" : "verde"}
                className="mt-1.5"
              >
                {estado === "sin" ? "Sin stock" : estado === "bajo" ? "Reponer" : "Con stock"}
              </Badge>
            )}
          </div>
        </div>

        {sinStock && invertido && <CompradoEsteMes compra={invertido.get(i.id)} unidad={unidad} />}

        <dl className="grid grid-cols-2 gap-3">
          {/* El restaurante no ve ni el stock ni lo que vale: es la suma de
              todas las compras desde siempre, porque vender no lo descuenta. */}
          {!sinStock && <Dato label="Stock actual" valor={`${fmtCantidad(i.stock)} ${unidad}`} />}
          {/* Con la unidad, como el stock de al lado: un "10" suelto no dice si son kilos o bolsas. */}
          {!sinStock && <Dato label="Punto de reorden" valor={`${fmtCantidad(i.puntoReorden)} ${unidad}`} />}
          <Dato label="Costo de compra" valor={fmtMoney(i.costoCompra)} />
          {!sinStock && <Dato label="Valor en stock" valor={fmtMoney(i.stock * i.costoCompra)} />}
          <Dato label="Categoría" valor={i.categoria?.nombre ?? "—"} />
          <Dato label="Unidad" valor={i.unidad?.nombre ?? "—"} />
          <Dato label="Proveedor" valor={i.proveedor || "—"} />
          <Dato label="Almacén" valor={i.almacen?.nombre ?? "—"} />
          <Dato
            label="Vencimiento"
            valor={i.vencimiento ? fmtFecha(i.vencimiento) : "Sin vencimiento"}
          />
          <Dato label="Estado" valor={i.habilitado ? "Habilitado" : "Inactivo"} />
        </dl>
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

/**
 * Lo comprado de este insumo en el mes (restaurante), en el lugar del stock:
 * cuánta plata se fue, cuánto entró y cada cuánto se compra. `undefined` es
 * que en el mes no se compró (el backend sólo manda los que tuvieron compras).
 */
function CompradoEsteMes({ compra, unidad }: { compra: CompraDeInsumo | undefined; unidad: string }) {
  return (
    <section aria-label="Comprado este mes" className="rounded-xl border border-borde px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Comprado este mes</p>
      {compra ? (
        <>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-texto">{fmtMoney(compra.total)}</p>
          <p className="text-[13px] text-texto-3">
            {fmtCantidad(compra.cantidad)}
            {unidad ? ` ${unidad}` : ""} en {compra.compras} {compra.compras === 1 ? "compra" : "compras"} · la última el{" "}
            {fmtFecha(compra.ultimaFecha)}
          </p>
        </>
      ) : (
        <p className="mt-0.5 text-sm font-semibold text-texto-3">Sin compras este mes</p>
      )}
    </section>
  );
}

function FormInsumo({
  abierto,
  insumo,
  sinStock,
  categorias,
  unidades,
  almacenes,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  insumo: Insumo | null;
  /** Restaurante: sin punto de reorden y con las notas de compras y descartables. */
  sinStock: boolean;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  almacenes: Almacen[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  // La clave remonta el formulario al cambiar de insumo: así los estados
  // internos arrancan siempre desde el que se está editando.
  if (!abierto) return null;
  return (
    <FormInsumoCuerpo
      key={insumo?.id ?? "nuevo"}
      insumo={insumo}
      sinStock={sinStock}
      categorias={categorias}
      unidades={unidades}
      almacenes={almacenes}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormInsumoCuerpo({
  insumo,
  sinStock,
  categorias,
  unidades,
  almacenes,
  onClose,
  onGuardado,
}: {
  insumo: Insumo | null;
  sinStock: boolean;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  almacenes: Almacen[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = !!insumo;
  const [nombre, setNombre] = useState(insumo?.nombre ?? "");
  const [unidadId, setUnidadId] = useState(String(insumo?.unidadMedidaId ?? ""));
  const [costoCompra, setCostoCompra] = useState(String(insumo?.costoCompra ?? ""));
  const [categoriaId, setCategoriaId] = useState(String(insumo?.categoriaId ?? ""));
  // En el restaurante el campo no se muestra (avisaría de un stock que no baja
  // nunca), pero el valor viaja igual: al editar se guarda el que ya tenía, y
  // un alta nace en 0. Mandarlo vacío lo pisaría con cero sin que nadie lo
  // haya tocado, y el día que vuelva a mostrarse habría perdido el dato.
  const [puntoReorden, setPuntoReorden] = useState(String(insumo?.puntoReorden ?? ""));
  const [proveedor, setProveedor] = useState(insumo?.proveedor ?? "");
  // El input date sólo entiende yyyy-MM-dd; el API ya devuelve ese formato,
  // pero recortamos por si algún día llega con hora.
  const [vencimiento, setVencimiento] = useState((insumo?.vencimiento ?? "").slice(0, 10));
  const [almacenId, setAlmacenId] = useState(String(insumo?.almacen?.id ?? ""));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");

    if (!nombre.trim()) return setError("Poné un nombre.");
    if (!unidadId) return setError("Elegí una unidad de medida.");
    // Obligatoria, igual que en la app: un insumo sin categoría desaparece de
    // los reportes de compras agrupados y nadie entiende dónde se fue la plata.
    if (!categoriaId) return setError("Elegí una categoría para el insumo.");
    const costoNum = costoCompra === "" ? 0 : parsearMonto(costoCompra);
    if (costoNum === null || costoNum < 0)
      return setError("El costo de compra tiene que ser un número válido.");

    const input: InsumoInput = {
      nombre: nombre.trim(),
      unidadMedidaId: Number(unidadId),
      costoCompra: costoNum,
      puntoReorden: puntoReorden === "" ? 0 : (parsearMonto(puntoReorden) ?? 0),
      proveedor: proveedor.trim(),
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(vencimiento ? { vencimiento } : {}),
      ...(almacenId ? { almacenId: Number(almacenId) } : {}),
    };

    setGuardando(true);
    try {
      if (insumo) await api.actualizarInsumo(insumo.id, input);
      else await api.crearInsumo(input);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  const campoCategoria = (
    <Campo label="Categoría">
      <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
        <option value="">Elegí una categoría</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
    </Campo>
  );

  return (
    <Modal
      abierto
      titulo={esEdicion ? "Editar insumo" : "Nuevo insumo"}
      subtitulo={esEdicion ? insumo.nombre : "Materia prima que se compra, no se vende"}
      onClose={onClose}
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
        {/* Antes del nombre, que es cuando se decide qué se carga: un vaso
            descartable cargado como insumo no resta nunca de la ganancia (no
            está en el costo de ningún plato), y en Gastos operativos sí. */}
        {sinStock && (
          <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
            <Icon name="info" size={17} />
            <span>{DESCARTABLES_A_GASTOS}</span>
          </div>
        )}

        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Unidad de medida">
            <Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
              <option value="">Elegí una</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo label="Costo de compra">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={costoCompra}
              onChange={(e) => setCostoCompra(e.target.value)}
            />
          </Campo>
        </div>

        {sinStock ? (
          campoCategoria
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {campoCategoria}
            <Campo label="Punto de reorden" hint="Avisa cuando baje de acá">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={puntoReorden}
                onChange={(e) => setPuntoReorden(e.target.value)}
              />
            </Campo>
          </div>
        )}

        <Campo label="Proveedor">
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Vencimiento" hint="Opcional">
            <Input
              type="date"
              value={vencimiento}
              onChange={(e) => setVencimiento(e.target.value)}
            />
          </Campo>
          <Campo label="Almacén">
            <Select value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
              <option value="">Sin almacén</option>
              {almacenes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
          <Icon name="info" size={17} />
          {sinStock ? (
            <span>
              Esta ficha no registra compras: cada vez que comprás, cargá la compra en Movimientos como una entrada, y
              así suma a lo invertido del mes.
            </span>
          ) : (
            <span>
              El insumo nace sin stock: la existencia entra por movimientos de entrada, no
              desde esta ficha.
            </span>
          )}
        </div>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
