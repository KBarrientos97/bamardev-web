import { useMemo, useState } from "react";
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
import { fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
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
  COMPUESTO: { label: "Combo", tono: "morado", conStock: false },
};

type FiltroStock = "todos" | "activos" | "bajo" | "sin";
type FiltroTipo = "todos" | TipoProducto;

const OPC_STOCK = [
  ["todos", "Todos"],
  ["activos", "Activos"],
  ["bajo", "Bajo stock"],
  ["sin", "Sin stock"],
] as const satisfies readonly (readonly [FiltroStock, string])[];

const OPC_TIPO = [
  ["todos", "Todos los tipos"],
  ["ALMACENABLE", "Producto"],
  ["SERVICIO", "Elaborado"],
  ["COMPUESTO", "Combo"],
] as const satisfies readonly (readonly [FiltroTipo, string])[];

export default function Productos() {
  const productos = useApi(() => api.getProductos(), []);
  const categorias = useApi(() => api.getCategorias(false), []);
  const unidades = useApi(() => api.getUnidades(), []);

  const [q, setQ] = useState("");
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>("todos");
  const [detalle, setDetalle] = useState<Producto | null>(null);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Producto | null>(null);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = productos.datos ?? [];

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
      return true;
    });
  }, [lista, q, filtroStock, filtroTipo]);

  async function borrar() {
    if (!aBorrar) return;
    setErrorAccion("");
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
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Artículos"
        subtitulo={`${lista.length} en el catálogo`}
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
            placeholder="Buscar por nombre, descripción o código"
          />
        </div>
        <Chips valor={filtroStock} opciones={OPC_STOCK} onChange={setFiltroStock} />
        <Chips valor={filtroTipo} opciones={OPC_TIPO} onChange={setFiltroTipo} />
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
        onClose={() => setDetalle(null)}
        onEditar={(p) => {
          setDetalle(null);
          setEditando(p);
        }}
        onEliminar={(p) => setABorrar(p)}
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
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca text-white">
            <Icon name={p.tipoProducto === "COMPUESTO" ? "package" : "archive"} size={21} />
          </span>
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
  onClose,
  onEditar,
  onEliminar,
}: {
  producto: Producto | null;
  onClose: () => void;
  onEditar: (p: Producto) => void;
  onEliminar: (p: Producto) => void;
}) {
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
        <>
          <Boton variante="danger" icono="trash" onClick={() => onEliminar(p)}>
            Eliminar
          </Boton>
          <Boton icono="edit" onClick={() => onEditar(p)}>
            Editar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca text-white">
            <Icon name={p.tipoProducto === "COMPUESTO" ? "package" : "archive"} size={26} />
          </span>
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
  const [stockInicial, setStockInicial] = useState("");
  const [categoriaId, setCategoriaId] = useState(String(producto?.categoria?.id ?? ""));
  const [unidadId, setUnidadId] = useState(String(producto?.unidadMedida?.id ?? ""));
  const [habilitado, setHabilitado] = useState(producto?.habilitado ?? true);
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

    const input: ProductoInput = {
      nombre: nombre.trim(),
      precio: precioNum,
      unidadMedidaId: Number(unidadId),
      tipoProducto: tipo,
      costo: costo === "" ? 0 : Number(costo),
      stockMinimo: stockMinimo === "" ? 0 : Number(stockMinimo),
      descripcion: descripcion.trim(),
      codBarra: codBarra.trim(),
      habilitado,
      ...(categoriaId ? { categoriaId: Number(categoriaId) } : {}),
      ...(esCombo
        ? {
            componentes: componentes.map((c) => ({
              ingredienteId: c.ingredienteId,
              cantidad: c.cantidad,
            })),
          }
        : {}),
      // El stock inicial sólo tiene sentido al crear: después se mueve con
      // entradas y salidas, no editando el artículo.
      ...(!esEdicion && conStock && stockInicial !== ""
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
            {(Object.keys(TIPOS) as TipoProducto[]).map((t) => (
              <option key={t} value={t}>
                {TIPOS[t].label}
              </option>
            ))}
          </Select>
        </Campo>

        <div className="grid grid-cols-2 gap-3">
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

        <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Stock mínimo" hint="Avisa cuando baje de acá">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
            </Campo>
            {!esEdicion && (
              <Campo label="Stock inicial" hint="Se carga como entrada">
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
