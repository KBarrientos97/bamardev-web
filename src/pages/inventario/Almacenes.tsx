import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Buscador, EncabezadoPagina } from "../../components/filtros";
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
import { fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Almacen, AlmacenInput } from "../../types";

export default function Almacenes() {
  const almacenes = useApi(() => api.getAlmacenes(), []);

  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<Almacen | null>(null);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Almacen | null>(null);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = almacenes.datos ?? [];

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return lista;
    return lista.filter(
      (a) =>
        a.nombre.toLowerCase().includes(texto) ||
        (a.grupo ?? "").toLowerCase().includes(texto),
    );
  }, [lista, q]);

  const valorTotal = lista.reduce((acc, a) => acc + (a.valorTotal ?? 0), 0);

  async function borrar() {
    if (!aBorrar) return;
    setErrorAccion("");
    try {
      await api.eliminarAlmacen(aBorrar.id);
      setABorrar(null);
      setDetalle(null);
      almacenes.recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar");
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Almacenes"
        subtitulo={`${lista.length} ${lista.length === 1 ? "ubicación" : "ubicaciones"} · ${fmtMoney(valorTotal)} en stock`}
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo
          </Boton>
        }
      />

      <div className="flex gap-2">
        <Buscador valor={q} onChange={setQ} placeholder="Buscar por nombre o grupo" />
      </div>

      <ErrorMsg>{errorAccion || almacenes.error}</ErrorMsg>

      {almacenes.cargando ? (
        <Cargando />
      ) : filtrados.length === 0 ? (
        <div className="card">
          <Vacio
            icono="warehouse"
            titulo={lista.length ? "Sin resultados" : "Todavía no hay almacenes"}
            texto={
              lista.length
                ? "Probá con otro texto."
                : "Creá la primera ubicación donde guardás el stock."
            }
            accion={
              !lista.length && (
                <Boton icono="plus" onClick={() => setCreando(true)}>
                  Nuevo almacén
                </Boton>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((a) => (
            <TarjetaAlmacen key={a.id} almacen={a} onClick={() => setDetalle(a)} />
          ))}
        </ul>
      )}

      <DetalleAlmacen
        almacen={detalle}
        onClose={() => setDetalle(null)}
        onEditar={(a) => {
          setDetalle(null);
          setEditando(a);
        }}
        onEliminar={(a) => setABorrar(a)}
      />

      <FormAlmacen
        abierto={creando || !!editando}
        almacen={editando}
        onClose={() => {
          setCreando(false);
          setEditando(null);
        }}
        onGuardado={() => {
          setCreando(false);
          setEditando(null);
          almacenes.recargar();
        }}
      />

      <Confirmar
        abierto={!!aBorrar}
        titulo="Eliminar almacén"
        texto={`¿Eliminar "${aBorrar?.nombre}"? Si todavía guarda stock o tiene movimientos, el backend no va a dejar.`}
        etiquetaOk="Eliminar"
        peligroso
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

function TarjetaAlmacen({ almacen: a, onClick }: { almacen: Almacen; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="card w-full p-4 text-left transition-shadow hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-marca text-white">
            <Icon name="warehouse" size={21} />
          </span>
          <div className="flex items-center gap-2">
            {!a.activo && <Badge tono="gris">Inactivo</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{a.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {a.grupo || "Sin grupo"}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-2.5">
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Artículos</p>
            <p className="text-sm font-bold text-texto">{fmtNum(a.totalArticulos ?? 0)}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase text-texto-4">Unidades</p>
            <p className="text-sm font-bold text-texto">{fmtNum(a.totalUnidades ?? 0)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-texto-4">Valor en stock</span>
          <span className="text-sm font-bold text-texto">{fmtMoney(a.valorTotal ?? 0)}</span>
        </div>
      </button>
    </li>
  );
}

function DetalleAlmacen({
  almacen: a,
  onClose,
  onEditar,
  onEliminar,
}: {
  almacen: Almacen | null;
  onClose: () => void;
  onEditar: (a: Almacen) => void;
  onEliminar: (a: Almacen) => void;
}) {
  if (!a) return null;
  const articulos = a.articulos ?? [];

  return (
    <Modal
      abierto
      titulo="Detalle del almacén"
      subtitulo={a.nombre}
      onClose={onClose}
      acciones={
        <>
          <Boton variante="danger" icono="trash" onClick={() => onEliminar(a)}>
            Eliminar
          </Boton>
          <Boton icono="edit" onClick={() => onEditar(a)}>
            Editar
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-primary-50 p-4">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca text-white">
            <Icon name="warehouse" size={26} />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold text-texto">{a.nombre}</h3>
            <p className="text-[13px] text-texto-3">{a.grupo || "Sin grupo"}</p>
            <Badge tono={a.activo ? "verde" : "gris"} className="mt-1.5">
              {a.activo ? "Activo" : "Inactivo"}
            </Badge>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-3">
          <Dato label="Artículos" valor={fmtNum(a.totalArticulos ?? 0)} />
          <Dato label="Unidades" valor={fmtNum(a.totalUnidades ?? 0)} />
          <Dato label="Valor" valor={fmtMoney(a.valorTotal ?? 0)} />
        </dl>

        <div>
          <h4 className="mb-2 text-[13px] font-bold text-texto">
            Artículos guardados acá
            <span className="ml-1.5 font-normal text-texto-3">
              — productos e insumos con stock
            </span>
          </h4>

          {articulos.length === 0 ? (
            <Vacio
              icono="archive"
              titulo="Almacén vacío"
              texto="Todavía no entró stock a esta ubicación."
            />
          ) : (
            <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
              {articulos.map((art) => (
                <li key={art.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-texto">
                      {art.nombre}
                    </span>
                    <span className="text-xs text-texto-4">
                      {fmtMoney(art.costo)} c/u
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-bold text-texto">
                      {fmtNum(art.stock, 2)} {art.unidad}
                    </span>
                    <span className="text-xs text-texto-4">
                      {fmtMoney(art.stock * art.costo)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
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

function FormAlmacen({
  abierto,
  almacen,
  onClose,
  onGuardado,
}: {
  abierto: boolean;
  almacen: Almacen | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  // La clave remonta el formulario al cambiar de almacén: así los estados
  // internos arrancan siempre desde el que se está editando.
  if (!abierto) return null;
  return (
    <FormAlmacenCuerpo
      key={almacen?.id ?? "nuevo"}
      almacen={almacen}
      onClose={onClose}
      onGuardado={onGuardado}
    />
  );
}

function FormAlmacenCuerpo({
  almacen,
  onClose,
  onGuardado,
}: {
  almacen: Almacen | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const esEdicion = !!almacen;
  const [nombre, setNombre] = useState(almacen?.nombre ?? "");
  const [grupo, setGrupo] = useState(almacen?.grupo ?? "");
  const [activo, setActivo] = useState(almacen?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné un nombre.");

    const input: AlmacenInput = {
      nombre: nombre.trim(),
      grupo: grupo.trim(),
      activo,
    };

    setGuardando(true);
    try {
      if (almacen) await api.actualizarAlmacen(almacen.id, input);
      else await api.crearAlmacen(input);
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
      titulo={esEdicion ? "Editar almacén" : "Nuevo almacén"}
      subtitulo={esEdicion ? almacen.nombre : "Dónde se guarda el stock"}
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

        <Campo label="Grupo" hint="Opcional: para juntar sucursales o depósitos">
          <Input value={grupo} onChange={(e) => setGrupo(e.target.value)} />
        </Campo>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 rounded border-borde accent-primary"
          />
          <span className="text-sm text-texto-2">
            Activo
            <span className="ml-1 text-texto-4">
              — si no, no se puede elegir en movimientos ni ventas
            </span>
          </span>
        </label>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
