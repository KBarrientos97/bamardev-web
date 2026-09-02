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
import { fmtFecha, fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Almacen, Categoria, Insumo, InsumoInput, UnidadMedida } from "../../types";

type FiltroStock = "todos" | "bajo" | "sin";

const OPC_STOCK = [
  ["todos", "Todos"],
  ["bajo", "Bajo stock"],
  ["sin", "Sin stock"],
] as const satisfies readonly (readonly [FiltroStock, string])[];

/** Bajo el punto de reorden hay que reponer; en cero ya no se puede producir. */
function estadoStock(i: Insumo): "sin" | "bajo" | "ok" {
  if (i.stock <= 0) return "sin";
  if (i.puntoReorden > 0 && i.stock <= i.puntoReorden) return "bajo";
  return "ok";
}

export default function Insumos() {
  const insumos = useApi(() => api.getInsumos(), []);
  // `true` trae sólo las categorías de insumo: las de venta no aplican acá.
  const categorias = useApi(() => api.getCategorias(true), []);
  const unidades = useApi(() => api.getUnidades(), []);
  const almacenes = useApi(() => api.getAlmacenes(), []);

  const [q, setQ] = useState("");
  const [filtroStock, setFiltroStock] = useState<FiltroStock>("todos");
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
        !i.nombre.toLowerCase().includes(texto) &&
        !(i.codigo ?? "").toLowerCase().includes(texto) &&
        !(i.proveedor ?? "").toLowerCase().includes(texto)
      )
        return false;

      const estado = estadoStock(i);
      if (filtroStock === "bajo") return estado === "bajo";
      if (filtroStock === "sin") return estado === "sin";
      return true;
    });
  }, [lista, q, filtroStock]);

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
            placeholder="Buscar por nombre, código o proveedor"
          />
        </div>
        <Chips valor={filtroStock} opciones={OPC_STOCK} onChange={setFiltroStock} />
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
            <TarjetaInsumo key={i.id} insumo={i} onClick={() => setDetalle(i)} />
          ))}
        </ul>
      )}

      <DetalleInsumo
        insumo={detalle}
        onClose={() => setDetalle(null)}
        onEditar={(i) => {
          setDetalle(null);
          setEditando(i);
        }}
        onEliminar={(i) => setABorrar(i)}
      />

      <FormInsumo
        abierto={creando || !!editando}
        insumo={editando}
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

function TarjetaInsumo({ insumo: i, onClick }: { insumo: Insumo; onClick: () => void }) {
  const estado = estadoStock(i);
  const unidad = i.unidad?.abreviatura ?? i.unidad?.nombre ?? "";

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

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Stock</p>
            <p className="text-sm font-bold text-texto">
              {fmtNum(i.stock, 2)} {unidad}
            </p>
          </div>
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
  onClose,
  onEditar,
  onEliminar,
}: {
  insumo: Insumo | null;
  onClose: () => void;
  onEditar: (i: Insumo) => void;
  onEliminar: (i: Insumo) => void;
}) {
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
        <>
          <Boton variante="danger" icono="trash" onClick={() => onEliminar(i)}>
            Eliminar
          </Boton>
          <Boton icono="edit" onClick={() => onEditar(i)}>
            Editar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca text-white">
            <Icon name="sack" size={26} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{i.nombre}</h3>
            <p className="text-[13px] text-texto-3">
              {i.codigo ? `Código ${i.codigo}` : "Sin código"}
            </p>
            <Badge
              tono={estado === "sin" ? "rojo" : estado === "bajo" ? "amarillo" : "verde"}
              className="mt-1.5"
            >
              {estado === "sin" ? "Sin stock" : estado === "bajo" ? "Reponer" : "Con stock"}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <Dato label="Stock actual" valor={`${fmtNum(i.stock, 2)} ${unidad}`} />
          <Dato label="Punto de reorden" valor={fmtNum(i.puntoReorden, 2)} />
          <Dato label="Costo de compra" valor={fmtMoney(i.costoCompra)} />
          <Dato label="Valor en stock" valor={fmtMoney(i.stock * i.costoCompra)} />
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

function FormInsumo({
  abierto,
  insumo,
  categorias,
  unidades,
  almacenes,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  insumo: Insumo | null;
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
  categorias,
  unidades,
  almacenes,
  onClose,
  onGuardado,
}: {
  insumo: Insumo | null;
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
    const costoNum = Number(costoCompra);
    if (!Number.isFinite(costoNum) || costoNum < 0)
      return setError("El costo de compra tiene que ser un número válido.");

    const input: InsumoInput = {
      nombre: nombre.trim(),
      unidadMedidaId: Number(unidadId),
      costoCompra: costoNum,
      puntoReorden: puntoReorden === "" ? 0 : Number(puntoReorden),
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

        <div className="flex items-start gap-2 rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
          <Icon name="info" size={17} />
          <span>
            El insumo nace sin stock: la existencia entra por movimientos de entrada, no
            desde esta ficha.
          </span>
        </div>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
