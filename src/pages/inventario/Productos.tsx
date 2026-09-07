import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import HistorialCostos from "../../components/HistorialCostos";
import IconoProducto from "../../components/IconoProducto";
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
import { fmtMoney, fmtNum } from "../../lib/format";
import { ICONOS_ARTICULO, iconoPorLlave } from "../../lib/iconosArticulo";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { Categoria, Producto, ProductoInput, TipoProducto, UnidadMedida } from "../../types";

/**
 * Los tres tipos del backend, con la etiqueta que usa la app Android.
 * Sólo ALMACENABLE controla stock: un elaborado se prepara al vender y un
 * combo descuenta sus ingredientes, así que a ninguno se le lleva inventario
 * propio.
 */
const TIPOS: Record<TipoProducto, { label: string; tono: "gris" | "verde" | "morado"; conStock: boolean }> = {
  ALMACENABLE: { label: "Producto", tono: "gris", conStock: true },
  SERVICIO: { label: "Elaborado", tono: "verde", conStock: false },
  // El combo SÍ lleva stock: es el que el local decide ofrecer hoy, y no se
  // mueve por Movimientos como el resto. Editar el artículo es su única vía de
  // carga, así que el campo también aparece al editar (a diferencia de un
  // producto, donde el stock inicial sólo tiene sentido al crear).
  COMPUESTO: { label: "Combo", tono: "morado", conStock: true },
};

type FiltroStock = "todos" | "activos" | "bajo" | "sin" | "papelera";
type FiltroTipo = "todos" | TipoProducto;

const OPC_STOCK = [
  ["todos", "Todos"],
  ["activos", "Activos"],
  ["bajo", "Bajo stock"],
  ["sin", "Sin stock"],
  ["papelera", "Dados de baja"],
] as const satisfies readonly (readonly [FiltroStock, string])[];

const OPC_TIPO = [
  ["todos", "Todos los tipos"],
  ["ALMACENABLE", "Producto"],
  ["SERVICIO", "Elaborado"],
  ["COMPUESTO", "Combo"],
] as const satisfies readonly (readonly [FiltroTipo, string])[];

export default function Productos() {
  const { incluye } = useAuth();
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  // La papelera es otra lista del backend, no un filtro sobre la que ya está:
  // los dados de baja no vienen en el catálogo normal.
  const enPapelera = filtroStock === "papelera";
  const productos = useApi(() => api.getProductos(enPapelera), [enPapelera]);
  const categorias = useApi(() => api.getCategorias(false), []);
  const unidades = useApi(() => api.getUnidades(), []);

  const [q, setQ] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Producto | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = productos.datos ?? [];

  // El chip de Combo se ofrece si el plan los incluye o si ya hay alguno
  // cargado de antes: filtrar por un tipo que no existe no le sirve a nadie.
  const opcionesTipo = useMemo(
    () =>
      incluye("combos") || lista.some((p) => p.tipoProducto === "COMPUESTO")
        ? OPC_TIPO
        : OPC_TIPO.filter(([k]) => k !== "COMPUESTO"),
    [incluye, lista],
  );

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return lista.filter((p) => {
      if (
        texto &&
        !p.nombre.toLowerCase().includes(texto) &&
        !(p.descripcion ?? "").toLowerCase().includes(texto) &&
        !(p.codBarra ?? "").toLowerCase().includes(texto)
      )
        return false;
      if (filtroTipo !== "todos" && p.tipoProducto !== filtroTipo) return false;

      const conStock = TIPOS[p.tipoProducto].conStock;
      if (filtroStock === "activos") return p.habilitado;
      // Elaborados y combos no llevan stock: quedan fuera de esos filtros.
      if (filtroStock === "bajo")
        return conStock && p.stockTotal > 0 && p.stockTotal <= p.stockMinimo;
      if (filtroStock === "sin") return conStock && p.stockTotal <= 0;
      // En papelera no hay sub-filtro: la lista ya viene filtrada del backend.
      return true;
    });
  }, [lista, q, filtroStock, filtroTipo]);

  /** Devuelve al catálogo un artículo dado de baja. */
  async function restaurar(p: Producto) {
    setErrorAccion("");
    try {
      await api.restaurarProducto(p.id);
      setDetalle(null);
      productos.recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo restaurar");
    }
  }

  async function borrar() {
    if (!aBorrar || borrando) return;
    setErrorAccion("");
    setBorrando(true);
    try {
      const res = await api.eliminarProducto(aBorrar.id);
      setABorrar(null);
      setDetalle(null);
      productos.recargar();
      if (res.archivado) {
        setErrorAccion(
          "El artículo ya tenía ventas o movimientos, así que se archivó en vez de borrarse.",
        );
      }
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Artículos"
        subtitulo={
          enPapelera
            ? `${lista.length} dados de baja`
            : `${lista.length} en el catálogo`
        }
        // En la papelera no se ofrece "Nuevo": el alta cae en el catálogo y el
        // producto recién creado desaparecería de la lista que estás mirando.
        accion={
          !enPapelera && (
            <Boton icono="plus" onClick={() => setCreando(true)}>
              Nuevo
            </Boton>
          )
        }
      />

      <div className="space-y-3">
        <div className="flex gap-2">
          <Buscador
            valor={q}
            onChange={setQ}
            placeholder="Buscar por nombre, descripción o código"
          />
        </div>
        <Chips valor={filtroStock} opciones={OPC_STOCK} onChange={setFiltroStock} />
        <Chips valor={filtroTipo} opciones={opcionesTipo} onChange={setFiltroTipo} />
      </div>

      <ErrorMsg>{errorAccion || productos.error}</ErrorMsg>

      {productos.cargando ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <div className="card">
          <Vacio
            icono="archive"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay artículos"}
            texto={
              lista.length
                ? "Probá con otro texto o quitá los filtros."
                : "Cargá el primer producto de tu catálogo."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo artículo
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((p) => (
            <TarjetaProducto key={p.id} producto={p} onClick={() => setDetalle(p)} />
          ))}
        </ul>
      )}

      <DetalleProducto
        producto={detalle}
        enPapelera={enPapelera}
        onClose={() => setDetalle(null)}
        onEditar={(p) => {
          setDetalle(null);
          setEditando(p);
        }}
        onEliminar={(p) => setABorrar(p)}
        onRestaurar={restaurar}
      />

      <FormProducto
        abierto={creando || !!editando}
        producto={editando}
        categorias={categorias.datos ?? []}
        unidades={unidades.datos ?? []}
        productos={lista}
        onClose={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={() => {
          setCreando(false);
          setEditando(null);
          productos.recargar();
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo="Eliminar artículo"
        texto={`¿Eliminar "${aBorrar?.nombre}"? Si ya tiene ventas o movimientos se archivará en vez de borrarse.`}
        etiquetaOk="Eliminar"
        peligroso
        procesando={borrando}
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

function TarjetaProducto({ producto: p, onClick }: { producto: Producto; onClick: () => void }) {
  const tipo = TIPOS[p.tipoProducto];
  const sinStock = tipo.conStock && p.stockTotal <= 0;
  const bajoStock = tipo.conStock && p.stockTotal > 0 && p.stockTotal <= p.stockMinimo;

  return (
    <li>
      <button
        onClick={onClick}
        className="card w-full p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <IconoProducto
            nombre={p.nombre}
            icono={p.icono}
            categoria={p.categoria?.nombre}
            size={44}
          />
          <div className="flex items-center gap-2">
            {sinStock && <Badge tono="rojo">Sin stock</Badge>}
            {bajoStock && <Badge tono="amarillo">Bajo stock</Badge>}
            {!p.habilitado && <Badge tono="gris">Inactivo</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{p.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {p.descripcion || "Sin descripción"}
        </p>

        <div
          className={`mt-3 grid gap-2 rounded-xl bg-muted p-2.5 ${
            tipo.conStock ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {tipo.conStock && (
            <div>
              <p className="text-[11px] font-semibold uppercase text-texto-4">Stock</p>
              <p className="text-sm font-bold text-texto">
                {fmtNum(p.stockTotal)} {p.unidadMedida?.nombre ?? ""}
              </p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Precio</p>
            <p className="text-sm font-bold text-texto">{fmtMoney(p.precio)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <Badge tono={tipo.tono}>{tipo.label}</Badge>
          <span className="flex items-center gap-1 text-xs text-texto-4">
            {p.categoria?.nombre ?? "Sin categoría"}
          </span>
        </div>
      </button>
    </li>
  );
}

function DetalleProducto({
  producto: p,
  enPapelera,
  onClose,
  onEditar,
  onEliminar,
  onRestaurar,
}: {
  producto: Producto | null;
  /** En la papelera el artículo no se edita: se restaura o se deja. */
  enPapelera: boolean;
  onClose: () => void;
  onEditar: (p: Producto) => void;
  onEliminar: (p: Producto) => void;
  onRestaurar: (p: Producto) => void;
}) {
  const [viendoCostos, setViendoCostos] = useState(false);
  if (!p) return null;
  const tipo = TIPOS[p.tipoProducto];
  const margen = p.precio > 0 ? (p.precio - p.costo) / p.precio : 0;

  return (
    <Modal
      abierto
      titulo="Detalle del artículo"
      subtitulo={p.nombre}
      onClose={onClose}
      acciones={
        enPapelera ? (
          <Boton icono="check" onClick={() => onRestaurar(p)}>
            Restaurar
          </Boton>
        ) : (
          <>
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
            productoId={p.id}
            nombre={p.nombre}
            onClose={() => setViendoCostos(false)}
          />
        )}

        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <IconoProducto
            nombre={p.nombre}
            icono={p.icono}
            categoria={p.categoria?.nombre}
            size={56}
            className="rounded-2xl"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{p.nombre}</h3>
            <p className="text-[13px] text-texto-3">{p.descripcion || "Sin descripción"}</p>
            <Badge tono={tipo.tono} className="mt-1.5">
              {tipo.label}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Dato label="Precio de venta" valor={fmtMoney(p.precio)} />
          <Dato label="Costo" valor={fmtMoney(p.costo)} />
          <Dato label="Margen" valor={`${Math.round(margen * 100)}%`} />
          <Dato label="Categoría" valor={p.categoria?.nombre ?? "—"} />
          {tipo.conStock && (
            <>
              <Dato
                label="Stock actual"
                valor={`${fmtNum(p.stockTotal)} ${p.unidadMedida?.nombre ?? ""}`}
              />
              <Dato label="Stock mínimo" valor={fmtNum(p.stockMinimo)} />
            </>
          )}
          <Dato label="Unidad" valor={p.unidadMedida?.nombre ?? "—"} />
          <Dato label="Código de barras" valor={p.codBarra || "—"} />
        </dl>

        {p.tipoProducto === "COMPUESTO" && (
          <div>
            <h4 className="mb-2 text-[13px] font-bold text-texto">
              Receta del combo
              <span className="ml-1.5 font-normal text-texto-3">
                — se descuenta al vender
              </span>
            </h4>
            {p.componentes.length === 0 ? (
              <p className="text-[13px] text-texto-3">Sin ingredientes cargados.</p>
            ) : (
              <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
                {p.componentes.map((c) => (
                  <li
                    key={c.ingredienteId}
                    className="flex items-center justify-between px-3.5 py-2.5"
                  >
                    <span className="text-[13px] text-texto">{c.nombre ?? `#${c.ingredienteId}`}</span>
                    <span className="text-[13px] font-bold text-texto">
                      {fmtNum(c.cantidad, 3)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
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

interface LineaCombo {
  ingredienteId: number;
  nombre: string;
  cantidad: number;
}

function FormProducto({
  abierto,
  producto,
  categorias,
  unidades,
  productos,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  producto: Producto | null;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  productos: Producto[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  // La clave remonta el formulario al cambiar de artículo: así los estados
  // internos arrancan siempre desde el producto que se está editando.
  if (!abierto) return null;
  return (
    <FormProductoCuerpo
      key={producto?.id ?? "nuevo"}
      producto={producto}
      categorias={categorias}
      unidades={unidades}
      productos={productos}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormProductoCuerpo({
  producto,
  categorias,
  unidades,
  productos,
  onClose,
  onGuardado,
}: {
  producto: Producto | null;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  productos: Producto[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = !!producto;
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? "");
  const [codBarra, setCodBarra] = useState(producto?.codBarra ?? "");
  const [tipo, setTipo] = useState<TipoProducto>(producto?.tipoProducto ?? "ALMACENABLE");
  const [precio, setPrecio] = useState(String(producto?.precio ?? ""));
  const [costo, setCosto] = useState(String(producto?.costo ?? ""));
  const [stockMinimo, setStockMinimo] = useState(String(producto?.stockMinimo ?? ""));
  const [stockInicial, setStockInicial] = useState(
    // Sólo el combo trae su stock cargado: es un dato que se corrige, no que se
    // suma. Y sólo si es > 0, para que un 0 heredado no parezca ya completado.
    producto?.tipoProducto === "COMPUESTO" && producto.stockTotal > 0
      ? String(producto.stockTotal)
      : "",
  );
  const [categoriaId, setCategoriaId] = useState(String(producto?.categoria?.id ?? ""));
  const [unidadId, setUnidadId] = useState(String(producto?.unidadMedida?.id ?? ""));
  const [habilitado, setHabilitado] = useState(producto?.habilitado ?? true);
  // Se arrastra siempre, aunque el form no lo toque: si no viajara en el PATCH,
  // cambiar el precio desde la web le borraria el icono puesto en la app.
  const [icono, setIcono] = useState<string | null>(producto?.icono ?? null);
  const [eligiendoIcono, setEligiendoIcono] = useState(false);
  const [componentes, setComponentes] = useState<LineaCombo[]>(
    () =>
      producto?.componentes.map((c) => ({
        ingredienteId: c.ingredienteId,
        nombre: c.nombre ?? `#${c.ingredienteId}`,
        cantidad: c.cantidad,
      })) ?? [],
  );
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const { incluye } = useAuth();
  // Sin la capacidad el negocio no arma combos: el tipo ni se ofrece. Un
  // producto que YA es combo se sigue pudiendo editar (el dato existe y
  // esconderlo lo convertiría en otra cosa al guardar).
  const conCombos = incluye("combos");
  const tiposDisponibles = (Object.keys(TIPOS) as TipoProducto[]).filter(
    (t) => t !== "COMPUESTO" || conCombos || producto?.tipoProducto === "COMPUESTO",
  );

  const esCombo = tipo === "COMPUESTO";
  const conStock = TIPOS[tipo].conStock;

  // Un combo no puede llevarse a sí mismo ni repetir un ingrediente.
  const candidatos = productos.filter(
    (p) => p.id !== producto?.id && !componentes.some((c) => c.ingredienteId === p.id),
  );

  function agregarComponente(id: number) {
    const p = productos.find((x) => x.id === id);
    if (!p) return;
    setComponentes((cs) => [...cs, { ingredienteId: p.id, nombre: p.nombre, cantidad: 1 }]);
  }

  async function guardar() {
    setError("");

    if (!nombre.trim()) return setError("Poné un nombre.");
    const precioNum = Number(precio);
    if (!Number.isFinite(precioNum) || precioNum < 0)
      return setError("El precio tiene que ser un número válido.");
    if (!unidadId) return setError("Elegí una unidad de medida.");
    // El backend rechaza un combo sin receta: sin ingredientes no sabría qué
    // descontar al venderlo.
    if (esCombo && componentes.length === 0)
      return setError("Un combo necesita al menos un ingrediente en su receta.");
    const sinCantidad = componentes.find((c) => !(c.cantidad > 0));
    if (sinCantidad)
      return setError(`Poné cuánto lleva "${sinCantidad.nombre}" en la receta.`);

    const input: ProductoInput = {
      nombre: nombre.trim(),
      precio: precioNum,
      unidadMedidaId: Number(unidadId),
      tipoProducto: tipo,
      costo: costo === "" ? 0 : Number(costo),
      stockMinimo: stockMinimo === "" ? 0 : Number(stockMinimo),
      descripcion: descripcion.trim(),
      // Un código vacío se omite en vez de mandarse como "": el índice único
      // del backend considera "" un valor, así que el segundo producto sin
      // código chocaba con un 409 que no decía qué campo lo causaba.
      ...(codBarra.trim() ? { codBarra: codBarra.trim() } : {}),
      habilitado,
      // Viaja siempre, también vacío: es lo que permite QUITAR el ícono. Y va
      // aunque el usuario no lo haya tocado, con el valor que ya tenía, para
      // que editar el precio desde la web no borre lo elegido en la app.
      icono: icono ?? "",
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(esCombo
        ? {
            componentes: componentes.map((c) => ({
              ingredienteId: c.ingredienteId,
              cantidad: c.cantidad,
            })),
          }
        : {}),
      // En un producto el stock inicial sólo tiene sentido al crear: después se
      // mueve con entradas y salidas. En un COMBO es al revés — no pasa por
      // Movimientos, así que editar el artículo es la única forma de decir
      // cuántos hay hoy, y el campo tiene que viajar también al editar.
      ...((esCombo || !esEdicion) && conStock && stockInicial !== ""
        ? { stockInicial: Number(stockInicial) }
        : {}),
    };

    setGuardando(true);
    try {
      if (producto) await api.actualizarProducto(producto.id, input);
      else await api.crearProducto(input);
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
      titulo={esEdicion ? "Editar artículo" : "Nuevo artículo"}
      subtitulo={esEdicion ? producto.nombre : "Cargá los datos del producto"}
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
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </Campo>

        <Campo label="Descripción">
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>

        <Campo
          label="Tipo"
          hint={
            esCombo
              ? "El combo descuenta los ingredientes de su receta al venderse."
              : conStock
                ? "Se le lleva stock en los almacenes."
                : "Se prepara al vender: no lleva stock propio."
          }
        >
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoProducto)}>
            {tiposDisponibles.map((t) => (
              <option key={t} value={t}>
                {TIPOS[t].label}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Precio de venta">
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
            />
          </Campo>
          <Campo label="Costo">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Categoría">
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>
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
        </div>

        {conStock && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Stock mínimo" hint="Avisa cuando baje de acá">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
            </Campo>
            {(esCombo || !esEdicion) && (
              <Campo
                label={esCombo ? "Stock del combo" : "Stock inicial"}
                hint={
                  esCombo
                    ? "Cuántos hay para vender hoy"
                    : "Se carga como entrada"
                }
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={stockInicial}
                  onChange={(e) => setStockInicial(e.target.value)}
                />
              </Campo>
            )}
          </div>
        )}

        <Campo label="Código de barras">
          <Input value={codBarra} onChange={(e) => setCodBarra(e.target.value)} />
        </Campo>

        <Campo
          label="Ícono"
          hint="Es lo que ve el cajero en el punto de venta. Sin ícono se muestran las iniciales."
        >
          <button
            type="button"
            onClick={() => setEligiendoIcono(true)}
            className="flex w-full items-center gap-3 rounded-xl border border-borde bg-white p-2.5 text-left hover:bg-muted"
          >
            <IconoProducto
              nombre={nombre || "?"}
              icono={icono}
              categoria={categorias.find((c) => String(c.id) === categoriaId)?.nombre}
              size={44}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-texto">
                {iconoPorLlave(icono)?.etiqueta ?? "Sin ícono"}
              </span>
              <span className="block text-xs text-texto-3">Tocá para elegir</span>
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        </Campo>

        {eligiendoIcono && (
          <SelectorIcono
            actual={icono}
            onElegir={(llave) => {
              setIcono(llave);
              setEligiendoIcono(false);
            }}
            onCerrar={() => setEligiendoIcono(false)}
          />
        )}

        {esCombo && (
          <div className="rounded-xl border border-borde p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[13px] font-bold text-texto">Receta del combo</h4>
              <span className="text-xs text-texto-3">
                {componentes.length} {componentes.length === 1 ? "ingrediente" : "ingredientes"}
              </span>
            </div>

            {componentes.length === 0 ? (
              <p className="py-2 text-[13px] text-texto-3">
                Agregá los productos que consume este combo.
              </p>
            ) : (
              <ul className="mb-3 space-y-2">
                {componentes.map((c, i) => (
                  <li key={c.ingredienteId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-texto">
                      {c.nombre}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      min="0.001"
                      value={String(c.cantidad)}
                      onChange={(e) =>
                        setComponentes((cs) =>
                          cs.map((x, j) =>
                            j === i ? { ...x, cantidad: Number(e.target.value) } : x,
                          ),
                        )
                      }
                      className="w-24"
                    />
                    <button
                      onClick={() => setComponentes((cs) => cs.filter((_, j) => j !== i))}
                      aria-label={`Quitar ${c.nombre}`}
                      className="rounded-lg p-1.5 text-danger-text hover:bg-danger-bg"
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <Select
              value=""
              onChange={(e) => e.target.value && agregarComponente(Number(e.target.value))}
            >
              <option value="">+ Agregar ingrediente…</option>
              {candidatos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={habilitado}
            onChange={(e) => setHabilitado(e.target.checked)}
            className="h-4 w-4 rounded border-borde accent-primary"
          />
          <span className="text-sm text-texto-2">
            Habilitado
            <span className="ml-1 text-texto-4">— si no, no aparece en el punto de venta</span>
          </span>
        </label>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/**
 * Grilla para elegir el ícono del artículo. Port de `SeleccionarIconoDialog`
 * (Android): las mismas imágenes y las mismas llaves, para que el catálogo se
 * vea igual en la tablet y en la web.
 *
 * "Sin ícono" es una opción explícita y no un botón de borrar escondido: es la
 * forma de volver al monograma, y el cajero tiene que poder encontrarla.
 */
function SelectorIcono({
  actual,
  onElegir,
  onCerrar,
}: {
  actual: string | null;
  onElegir: (llave: string | null) => void;
  onCerrar: () => void;
}) {
  return (
    <Modal abierto titulo="Elegí un ícono" onClose={onCerrar} ancho="max-w-lg">
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => onElegir(null)}
          className={[
            "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
            actual === null
              ? "border-primary bg-primary-50"
              : "border-borde hover:bg-muted",
          ].join(" ")}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-texto-3">
            <Icon name="close" size={18} />
          </span>
          <span className="text-[13px] font-semibold text-texto">
            Sin ícono
            <span className="block text-xs font-normal text-texto-3">
              Se muestran las iniciales del nombre
            </span>
          </span>
        </button>

        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {ICONOS_ARTICULO.map((ic) => (
            <li key={ic.llave}>
              <button
                type="button"
                onClick={() => onElegir(ic.llave)}
                title={ic.etiqueta}
                className={[
                  "flex w-full flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-colors",
                  actual === ic.llave
                    ? "border-primary bg-primary-50"
                    : "border-borde hover:bg-muted",
                ].join(" ")}
              >
                <img
                  src={ic.src}
                  alt=""
                  width={52}
                  height={52}
                  loading="lazy"
                  className="h-[52px] w-[52px] object-contain"
                />
                <span className="line-clamp-2 text-center text-[11px] font-semibold leading-tight text-texto-2">
                  {ic.etiqueta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
