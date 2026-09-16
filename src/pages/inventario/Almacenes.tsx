import { useMemo, useState } from "react";
import { contiene } from "../../lib/texto";
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
  Select,
} from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Almacen, AlmacenInput, Producto, TipoAlmacen } from "../../types";

export default function Almacenes() {
  const almacenes = useApi(() => api.getAlmacenes(), []);

  const [q, setQ] = useState("");
  const [detalle, setDetalle] = useState<Almacen | null>(null);
  const [editando, setEditando] = useState<Almacen | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<Almacen | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [errorAccion, setErrorAccion] = useState("");

  const lista = almacenes.datos ?? [];
  /**
   * El botón se ofrece siempre: el tope ya no es "un almacén" sino el cupo de
   * sucursales del PLAN, y eso lo sabe el backend (que responde 409 con el
   * número contratado). Esconder el botón acá haría que un negocio con cupo de
   * sobra no pudiera crear su segunda sucursal, y que el mensaje del plan nunca
   * se leyera.
   */
  const sucursales = lista.filter((a) => a.tipo !== "DEPOSITO");
  const depositos = lista.filter((a) => a.tipo === "DEPOSITO");

  const filtrados = useMemo(() => {
    const texto = q.trim().toLowerCase();
    if (!texto) return lista;
    return lista.filter(
      (a) =>
        contiene(a.nombre, texto) || contiene(a.grupo, texto),
    );
  }, [lista, q]);

  const valorTotal = lista.reduce((acc, a) => acc + (a.valorTotal ?? 0), 0);

  /**
   * La sucursal principal es la que el backend usa cuando una operación no dice
   * de cuál se trata (una venta de una app vieja que no manda el almacén).
   */
  async function hacerPrincipal(a: Almacen) {
    setErrorAccion("");
    try {
      await api.marcarAlmacenPrincipal(a.id);
      setDetalle(null);
      almacenes.recargar();
    } catch (err) {
      setErrorAccion(
        err instanceof Error ? err.message : "No se pudo cambiar la principal",
      );
    }
  }

  async function borrar() {
    if (!aBorrar || borrando) return;
    setErrorAccion("");
    setBorrando(true);
    try {
      await api.eliminarAlmacen(aBorrar.id);
      setABorrar(null);
      setDetalle(null);
      almacenes.recargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : "No se pudo eliminar");
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <EncabezadoPagina
        titulo="Almacenes"
        subtitulo={
          // Se nombran por separado: un depósito no vende y no cuenta para el
          // cupo del plan, así que contarlo junto con las sucursales daría un
          // número que no coincide con lo que el negocio paga.
          `${sucursales.length} ${sucursales.length === 1 ? "sucursal" : "sucursales"}` +
          (depositos.length
            ? ` · ${depositos.length} ${depositos.length === 1 ? "depósito" : "depósitos"}`
            : "") +
          ` · ${fmtMoney(valorTotal)} en stock`
        }
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
        onHacerPrincipal={hacerPrincipal}
        onCambiado={() => almacenes.recargar()}
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
        procesando={borrando}
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
            {/* El depósito se marca siempre: es lo que explica por qué no
                aparece en el POS ni tiene caja. */}
            {a.tipo === "DEPOSITO" && <Badge tono="azul">Depósito</Badge>}
            {a.esPrincipal && <Badge tono="verde">Principal</Badge>}
            {!a.activo && <Badge tono="gris">Inactivo</Badge>}
            <Icon name="chevronRight" size={17} color="#94A3B8" />
          </div>
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{a.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {a.direccion || a.grupo || "Sin dirección"}
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
  onHacerPrincipal,
  onCambiado,
}: {
  almacen: Almacen | null;
  onClose: () => void;
  onEditar: (a: Almacen) => void;
  onEliminar: (a: Almacen) => void;
  onHacerPrincipal: (a: Almacen) => void;
  /** Refresca la lista: los precios cambian el valor del inventario. */
  onCambiado: () => void;
}) {
  if (!a) return null;
  const articulos = a.articulos ?? [];
  /**
   * Sólo se ofrece cuando cambia algo: un depósito no puede ser principal
   * (no vende) y el que ya lo es no tiene a dónde ir.
   */
  const puedeSerPrincipal =
    !a.esPrincipal && a.tipo !== "DEPOSITO" && a.activo;

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
          {puedeSerPrincipal && (
            <Boton variante="ghost" icono="pin" onClick={() => onHacerPrincipal(a)}>
              Hacer principal
            </Boton>
          )}
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
            <p className="text-[13px] text-texto-3">
              {a.direccion || a.grupo || "Sin dirección"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {/* El tipo primero: es lo que explica por qué un depósito no
                  aparece en el punto de venta ni tiene caja. */}
              <Badge tono={a.tipo === "DEPOSITO" ? "azul" : "verde"}>
                {a.tipo === "DEPOSITO" ? "Depósito" : "Sucursal"}
              </Badge>
              {a.esPrincipal && <Badge tono="verde">Principal</Badge>}
              {!a.activo && <Badge tono="gris">Inactivo</Badge>}
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Dato label="Artículos" valor={fmtNum(a.totalArticulos ?? 0)} />
          <Dato label="Unidades" valor={fmtNum(a.totalUnidades ?? 0)} />
          <Dato label="Valor" valor={fmtMoney(a.valorTotal ?? 0)} />
        </dl>

        <PreciosDeLaSucursal almacen={a} onCambio={onCambiado} />

        <BitacoraDelAlmacen almacenId={a.id} />

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

/**
 * Los precios propios de esta sucursal.
 *
 * Muestra SÓLO las excepciones, que es como está modelado: si un producto no
 * está en esta lista, vale lo que dice el catálogo. Un negocio de un solo local
 * nunca ve nada acá, y eso es correcto — no es una pantalla vacía por error.
 *
 * Va dentro del detalle del almacén porque "cuánto vale esto en este local" es
 * una pregunta sobre el local, no sobre el catálogo: en la ficha del producto
 * habría que elegir sucursal primero.
 */
function PreciosDeLaSucursal({
  almacen,
  onCambio,
}: {
  almacen: Almacen;
  onCambio: () => void;
}) {
  const precios = useApi(() => api.getPreciosSucursal(almacen.id), [almacen.id]);
  const productos = useApi(() => api.getProductos(), []);
  const [agregando, setAgregando] = useState(false);
  const [error, setError] = useState("");

  // Un depósito no vende, así que un precio ahí no significaría nada. El
  // backend lo rechaza; acá directamente no se ofrece.
  if (almacen.tipo === "DEPOSITO") return null;

  const lista = precios.datos ?? [];

  async function quitar(productoId: number) {
    setError("");
    try {
      await api.quitarPrecioSucursal(almacen.id, productoId);
      precios.recargar();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-[13px] font-bold text-texto">
          Precios propios de esta sucursal
          <span className="ml-1.5 font-normal text-texto-3">
            — lo que no esté acá vale lo del catálogo
          </span>
        </h4>
        <button
          type="button"
          onClick={() => setAgregando(true)}
          className="shrink-0 text-[13px] font-semibold text-primary-700 hover:text-primary"
        >
          + Agregar
        </button>
      </div>

      <ErrorMsg>{error || precios.error}</ErrorMsg>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-borde px-3 py-2.5 text-[13px] text-texto-3">
          Todos los productos valen lo del catálogo en esta sucursal.
        </p>
      ) : (
        <ul className="divide-y divide-borde rounded-xl border border-borde">
          {lista.map((p) => (
            <li key={p.productoId} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-texto">
                  {p.producto ?? `#${p.productoId}`}
                </p>
                {!p.disponible && (
                  <p className="text-[12px] text-danger-text">
                    No se vende en esta sucursal
                  </p>
                )}
              </div>
              {p.precio != null && (
                <p className="shrink-0 text-[13px]">
                  {/* El de lista tachado al lado: el cambio se lee de un vistazo
                      sin tener que abrir el catálogo. */}
                  {p.precioLista != null && (
                    <span className="text-texto-4 line-through">
                      {fmtMoney(p.precioLista)}
                    </span>
                  )}{" "}
                  <span className="font-bold text-texto">{fmtMoney(p.precio)}</span>
                </p>
              )}
              <button
                type="button"
                onClick={() => quitar(p.productoId)}
                title="Volver al precio del catálogo"
                className="shrink-0 rounded-lg p-1.5 text-texto-3 hover:bg-muted hover:text-danger-text"
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {agregando && (
        <FormPrecioSucursal
          almacen={almacen}
          productos={productos.datos ?? []}
          yaConPrecio={lista.map((p) => p.productoId)}
          onClose={() => setAgregando(false)}
          onGuardado={() => {
            setAgregando(false);
            precios.recargar();
            onCambio();
          }}
        />
      )}
    </div>
  );
}

/** Alta de una excepción de precio para un producto en esta sucursal. */
function FormPrecioSucursal({
  almacen,
  productos,
  yaConPrecio,
  onClose,
  onGuardado,
}: {
  almacen: Almacen;
  productos: Producto[];
  yaConPrecio: number[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [productoId, setProductoId] = useState(0);
  const [precio, setPrecio] = useState("");
  const [disponible, setDisponible] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Los que ya tienen precio propio no se ofrecen de nuevo: para cambiarlos se
  // quita el que está y se vuelve a poner, que deja el historial más claro que
  // una edición silenciosa.
  const disponibles = productos.filter((p) => !yaConPrecio.includes(p.id));
  const elegido = productos.find((p) => p.id === productoId);

  async function guardar() {
    setError("");
    if (!productoId) return setError("Elegí un producto.");
    const valor = precio.trim() === "" ? null : Number(precio);
    if (valor != null && (Number.isNaN(valor) || valor < 0)) {
      return setError("El precio tiene que ser un número válido.");
    }
    setGuardando(true);
    try {
      await api.fijarPrecioSucursal(almacen.id, {
        productoId,
        precio: valor,
        disponible,
      });
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo="Precio para esta sucursal"
      subtitulo={almacen.nombre}
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
        <ErrorMsg>{error}</ErrorMsg>

        <Campo label="Producto">
          {/* El Select de la casa y no un <select> crudo: desde 8908ab1 la flecha
              de TODOS los desplegables es la nuestra, y este era el único que
              seguía con la del navegador. */}
          <Select
            value={productoId}
            onChange={(e) => setProductoId(Number(e.target.value))}
          >
            <option value={0}>Elegí un producto…</option>
            {disponibles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} — {fmtMoney(p.precio)}
              </option>
            ))}
          </Select>
        </Campo>

        <Campo
          label="Precio en esta sucursal"
          hint={
            elegido
              ? `En el catálogo vale ${fmtMoney(elegido.precio)}. Dejalo vacío para usar ese.`
              : "Dejalo vacío para usar el del catálogo"
          }
        >
          <Input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            inputMode="decimal"
            placeholder={elegido ? String(elegido.precio) : ""}
          />
        </Campo>

        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            checked={disponible}
            onChange={(e) => setDisponible(e.target.checked)}
            className="h-4 w-4 rounded border-borde accent-primary"
          />
          <span className="text-[14px] text-texto-2">
            Se vende en esta sucursal
            <span className="ml-1 text-texto-3">
              — destildalo para esconderlo del punto de venta de este local
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

/**
 * Los últimos movimientos de stock de este almacén.
 *
 * Va dentro del detalle y no en una pantalla aparte porque la pregunta que
 * contesta —*"¿por qué este producto tiene 7 y no 10?"*— se hace justo cuando se
 * está mirando el stock de un almacén, no navegando un menú.
 *
 * Se carga recién al abrir el detalle (el `useApi` depende del id): la bitácora
 * es la tabla más grande del sistema y no tiene sentido traerla para la lista.
 */
function BitacoraDelAlmacen({ almacenId }: { almacenId: number }) {
  const bitacora = useApi(
    () => api.getBitacoraStock({ almacenId, limite: 15 }),
    [almacenId],
  );
  const apuntes = bitacora.datos ?? [];

  // Mientras carga no se muestra nada: un esqueleto acá competiría con el
  // contenido principal del detalle, que ya está en pantalla.
  if (bitacora.cargando && apuntes.length === 0) return null;
  // La bitácora arranca vacía y sólo registra desde que se desplegó, así que un
  // almacén sin movimientos nuevos es lo normal y no un error que avisar.
  if (apuntes.length === 0) return null;

  return (
    <div>
      <h4 className="mb-2 text-[13px] font-bold text-texto">
        Últimos movimientos
        <span className="ml-1.5 font-normal text-texto-3">
          — qué entró y salió, y quién lo hizo
        </span>
      </h4>
      <ul className="divide-y divide-borde rounded-xl border border-borde">
        {apuntes.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-texto">
                {m.producto?.nombre ?? "—"}
              </p>
              <p className="truncate text-[12px] text-texto-3">
                {MOTIVO_LEGIBLE[m.motivo] ?? m.motivo}
                {/* Sin autor = lo movió un proceso automático (el armado de un
                    combo, por ejemplo). Es un hecho, no un dato faltante. */}
                {m.usuario ? ` · ${m.usuario.nombre || m.usuario.username}` : ""}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p
                className={
                  "text-[13px] font-bold " +
                  (m.cantidad > 0 ? "text-primary-700" : "text-danger-text")
                }
              >
                {m.cantidad > 0 ? "+" : ""}
                {fmtNum(m.cantidad)}
              </p>
              <p className="text-[11px] text-texto-4">
                queda {fmtNum(m.saldoDespues)}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Cómo se lee cada motivo.
 *
 * Las transferencias se nombran por su dirección: "TRANSFERENCIA_SALIDA" no le
 * dice nada a nadie en una pantalla. Un motivo que no esté acá se muestra tal
 * cual — feo, pero esconderlo sería ocultar un movimiento de stock.
 */
const MOTIVO_LEGIBLE: Record<string, string> = {
  VENTA: "Venta",
  ANULACION: "Anulación",
  ENTRADA: "Entrada",
  SALIDA: "Salida",
  AJUSTE: "Ajuste",
  TRANSFERENCIA_SALIDA: "Transferencia (salida)",
  TRANSFERENCIA_ENTRADA: "Transferencia (entrada)",
  COMBO: "Armado de combo",
};

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
  const [tipo, setTipo] = useState<TipoAlmacen>(almacen?.tipo ?? "SUCURSAL");
  const [direccion, setDireccion] = useState(almacen?.direccion ?? "");
  const [telefono, setTelefono] = useState(almacen?.telefono ?? "");
  const [activo, setActivo] = useState(almacen?.activo ?? true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné un nombre.");

    const input: AlmacenInput = {
      nombre: nombre.trim(),
      grupo: grupo.trim(),
      tipo,
      direccion: direccion.trim(),
      telefono: telefono.trim(),
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

        {/* El tipo va arriba porque cambia el significado de todo lo demás: un
            depósito no vende, no tiene caja y no cuenta para el cupo del plan.
            En edición se puede cambiar, pero el backend lo frena si ya hubo
            ventas — esos documentos quedarían colgados de un almacén que "no
            vende". */}
        <Campo
          label="Tipo"
          hint={
            tipo === "DEPOSITO"
              ? "No vende ni tiene caja: recibe mercadería y la manda a las sucursales."
              : "Vende: aparece en el punto de venta y tiene su propia caja."
          }
        >
          <div className="flex gap-2">
            {(["SUCURSAL", "DEPOSITO"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={`flex-1 rounded-xl border px-3 py-2 text-[13px] font-semibold transition-colors ${
                  tipo === t
                    ? "border-primary-boton bg-primary-boton text-white"
                    : "border-borde bg-white text-texto-2 hover:bg-muted"
                }`}
              >
                {t === "SUCURSAL" ? "Sucursal" : "Depósito"}
              </button>
            ))}
          </div>
        </Campo>

        <Campo label="Dirección" hint="Opcional: dónde queda">
          <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </Campo>

        <Campo label="Teléfono" hint="Opcional">
          <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
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
