import { useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { Buscador, EncabezadoPagina } from "../../components/filtros";
import { Badge, Boton, Campo, Cargando, Confirmar, ErrorMsg, Input, Modal, Select, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import type { GrupoAgregados, GuardarGrupoInput } from "../../lib/agregados/tipos";
import { fmtMoney } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import type { Categoria, Producto } from "../../types";

/**
 * Inventario → «Agregados» (PLAN-AGREGADOS §7.2): los grupos de toppings.
 *
 * Un grupo junta las opciones (productos que se agregan: Oreo, chispas…), cuántas
 * van incluidas en el precio del producto y cuánto cuesta cada extra, y se asigna
 * a categorías enteras o a productos sueltos —cada asignación puede pisar los
 * incluidos del grupo (el vaso chico trae 1 y el grande 2)—. El POS lo lee y
 * dice «Incluye 2 toppings» en la tarjeta del producto.
 *
 * Sólo existe con el ajuste de Configuración prendido (el guard de la ruta);
 * guardar un grupo marca sus opciones como «sólo agregado» y dejan de salir
 * sueltas en la grilla del POS.
 */
export default function Agregados() {
  const grupos = useApi(() => api.getGruposAgregados(), []);
  const [editando, setEditando] = useState<GrupoAgregados | null>(null);
  const [creando, setCreando] = useState(false);
  const [aBorrar, setABorrar] = useState<GrupoAgregados | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState("");

  const lista = grupos.datos ?? [];

  async function borrar() {
    if (!aBorrar || borrando) return;
    setError("");
    setBorrando(true);
    try {
      await api.eliminarGrupoAgregados(aBorrar.id);
      setABorrar(null);
      grupos.recargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar");
      setABorrar(null);
    } finally {
      setBorrando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-5 lg:p-6">
      <EncabezadoPagina
        titulo="Agregados"
        subtitulo="Toppings y extras: cuántos van incluidos en el precio y cuánto cuesta cada extra."
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nuevo grupo
          </Boton>
        }
      />

      <ErrorMsg>{error || grupos.error}</ErrorMsg>

      {grupos.cargando && !grupos.datos ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <div className="card">
          <Vacio
            icono="masCuadro"
            titulo="Todavía no hay grupos de agregados"
            texto="Armá un grupo «Toppings» con sus opciones y asignalo a los productos que lo llevan: el punto de venta los ofrece al tocar el producto."
            accion={
              <Boton icono="plus" onClick={() => setCreando(true)}>
                Nuevo grupo
              </Boton>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {lista.map((g) => (
            <TarjetaGrupo key={g.id} grupo={g} onEditar={() => setEditando(g)} onBorrar={() => setABorrar(g)} />
          ))}
        </ul>
      )}

      {(creando || editando) && (
        <FormGrupo
          key={editando?.id ?? "nuevo"}
          grupo={editando}
          onClose={() => {
            setCreando(false);
            setEditando(null);
          }}
          onGuardado={() => {
            setCreando(false);
            setEditando(null);
            grupos.recargar();
          }}
        />
      )}

      <Confirmar
        abierto={!!aBorrar}
        titulo="Eliminar grupo"
        texto={`¿Eliminar "${aBorrar?.nombre}"? Los productos asignados dejan de ofrecer estos agregados. Las ventas ya hechas no cambian.`}
        etiquetaOk="Eliminar"
        peligroso
        procesando={borrando}
        onCancel={() => setABorrar(null)}
        onOk={borrar}
      />
    </div>
  );
}

function TarjetaGrupo({ grupo: g, onEditar, onBorrar }: { grupo: GrupoAgregados; onEditar: () => void; onBorrar: () => void }) {
  const deCategoria = g.asignaciones.filter((a) => a.categoriaId != null);
  const deProducto = g.asignaciones.filter((a) => a.productoId != null);
  return (
    <li className="card p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          <Icon name="masCuadro" size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-bold text-texto">{g.nombre}</p>
            {!g.activo && <Badge tono="gris">Inactivo</Badge>}
          </div>
          <p className="mt-0.5 text-[13px] text-texto-3">
            {g.incluidos} {g.incluidos === 1 ? "incluido" : "incluidos"} ·{" "}
            {g.precioExtra != null ? `extra a ${fmtMoney(g.precioExtra)}` : "extra al precio de cada uno"}
            {g.maximo != null && ` · hasta ${g.maximo} por unidad`}
          </p>
        </div>
        <button
          onClick={onEditar}
          aria-label={`Editar ${g.nombre}`}
          className="rounded-lg p-2.5 text-texto-3 hover:bg-muted hover:text-texto"
        >
          <Icon name="edit" size={16} />
        </button>
        <button
          onClick={onBorrar}
          aria-label={`Eliminar ${g.nombre}`}
          className="rounded-lg p-2.5 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
        >
          <Icon name="trash" size={16} />
        </button>
      </div>

      <dl className="mt-3 space-y-2 text-[13px]">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-4">Opciones</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {g.opciones.length === 0 ? (
              <span className="text-texto-4">Ninguna todavía</span>
            ) : (
              g.opciones.map((o) => (
                <span key={o.productoId} className="rounded-lg bg-muted px-2 py-1 text-texto-2">
                  {o.nombre} · {fmtMoney(o.precio)}
                </span>
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wide text-texto-4">Lo llevan</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {g.asignaciones.length === 0 ? (
              <span className="text-texto-4">Ninguna categoría ni producto: nada ofrece este grupo todavía.</span>
            ) : (
              <>
                {deCategoria.map((a) => (
                  <span key={a.id} className="rounded-lg bg-primary-50 px-2 py-1 text-primary-700">
                    {a.categoria}
                    {a.incluidos != null && ` · ${a.incluidos} incl.`}
                  </span>
                ))}
                {deProducto.map((a) => (
                  <span key={a.id} className="rounded-lg bg-info-bg px-2 py-1 text-info-text">
                    {a.producto}
                    {a.incluidos != null && ` · ${a.incluidos} incl.`}
                  </span>
                ))}
              </>
            )}
          </dd>
        </div>
      </dl>
    </li>
  );
}

/** El texto de un número entero o vacío: `null` si está vacío, `NaN` si no es un entero ≥ `min`. */
function entero(texto: string, min: number): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= min ? n : Number.NaN;
}

function FormGrupo({ grupo, onClose, onGuardado }: { grupo: GrupoAgregados | null; onClose: () => void; onGuardado: () => void }) {
  const productos = useApi(() => api.getProductos(false), []);
  const categorias = useApi(() => api.getCategorias(false), []);

  const [nombre, setNombre] = useState(grupo?.nombre ?? "Toppings");
  const [incluidos, setIncluidos] = useState(String(grupo?.incluidos ?? 2));
  const [precioExtra, setPrecioExtra] = useState(grupo?.precioExtra != null ? String(grupo.precioExtra) : "");
  const [maximo, setMaximo] = useState(grupo?.maximo != null ? String(grupo.maximo) : "");
  const [activo, setActivo] = useState(grupo?.activo ?? true);
  /** Los productos opción, en orden. */
  const [opciones, setOpciones] = useState<number[]>(() => (grupo?.opciones ?? []).map((o) => o.productoId));
  /** categoriaId → incluidos propios ("" = los del grupo). */
  const [porCategoria, setPorCategoria] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (grupo?.asignaciones ?? [])
        .filter((a) => a.categoriaId != null)
        .map((a) => [a.categoriaId as number, a.incluidos != null ? String(a.incluidos) : ""]),
    ),
  );
  /** productoId → incluidos propios ("" = los del grupo). */
  const [porProducto, setPorProducto] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      (grupo?.asignaciones ?? [])
        .filter((a) => a.productoId != null)
        .map((a) => [a.productoId as number, a.incluidos != null ? String(a.incluidos) : ""]),
    ),
  );
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const todos = useMemo(() => productos.datos ?? [], [productos.datos]);
  const visibles = useMemo(() => {
    const t = busqueda.trim();
    return todos.filter((p) => p.habilitado && (!t || contiene(p.nombre, t) || contiene(p.categoria?.nombre, t)));
  }, [todos, busqueda]);
  const nombreDe = (id: number) => todos.find((p) => p.id === id)?.nombre ?? grupo?.asignaciones.find((a) => a.productoId === id)?.producto ?? `Artículo ${id}`;
  // Un producto suelto se elige entre los que NO son opciones del grupo: un
  // topping que se ofrece a sí mismo no tiene sentido.
  const paraAsignar = todos.filter((p) => p.habilitado && !opciones.includes(p.id) && !(p.id in porProducto));

  const alternarOpcion = (id: number) => setOpciones((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
  const alternarCategoria = (c: Categoria) =>
    setPorCategoria((m) => {
      const n = { ...m };
      if (c.id in n) delete n[c.id];
      else n[c.id] = "";
      return n;
    });

  async function guardar() {
    setError("");
    if (!nombre.trim()) return setError("Poné un nombre.");
    const inc = entero(incluidos, 0);
    if (inc == null || Number.isNaN(inc) || inc > 50) return setError("Los incluidos son un número entero de 0 a 50.");
    const max = entero(maximo, 1);
    if (Number.isNaN(max)) return setError("El máximo es un número entero de 1 en adelante, o dejalo vacío.");
    const extraTexto = precioExtra.trim().replace(",", ".");
    const extra = extraTexto === "" ? null : Number(extraTexto);
    if (extra !== null && (!Number.isFinite(extra) || extra < 0)) return setError("El precio del extra no es válido. Dejalo vacío para cobrar el precio de cada topping.");
    if (opciones.length === 0) return setError("Elegí al menos un producto como opción.");

    const asignaciones: NonNullable<GuardarGrupoInput["asignaciones"]> = [];
    for (const [id, texto] of Object.entries(porCategoria)) {
      const propios = entero(texto, 0);
      if (Number.isNaN(propios)) return setError("Los incluidos propios de una categoría son un entero (o vacío).");
      asignaciones.push({ categoriaId: Number(id), incluidos: propios });
    }
    for (const [id, texto] of Object.entries(porProducto)) {
      const propios = entero(texto, 0);
      if (Number.isNaN(propios)) return setError("Los incluidos propios de un producto son un entero (o vacío).");
      asignaciones.push({ productoId: Number(id), incluidos: propios });
    }

    const cuerpo: GuardarGrupoInput = {
      nombre: nombre.trim(),
      incluidos: inc,
      precioExtra: extra,
      maximo: max,
      activo,
      opciones: opciones.map((productoId) => ({ productoId })),
      asignaciones,
    };
    setGuardando(true);
    try {
      if (grupo) await api.actualizarGrupoAgregados(grupo.id, cuerpo);
      else await api.crearGrupoAgregados(cuerpo);
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
      titulo={grupo ? "Editar grupo de agregados" : "Nuevo grupo de agregados"}
      subtitulo="Toppings y extras de un producto"
      onClose={onClose}
      ancho="max-w-2xl"
      cerrarAlClicAfuera={false}
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
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Nombre del grupo" hint="Lo lee el cliente: «Incluye 2 toppings».">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Toppings" maxLength={60} autoFocus />
          </Campo>
          <Campo label="Incluidos" hint="Cuántos van gratis por cada unidad.">
            <Input type="number" value={incluidos} onChange={(e) => setIncluidos(e.target.value)} inputMode="numeric" />
          </Campo>
          <Campo label="Precio del extra (Bs)" hint="Vacío = se cobra el precio de cada topping.">
            <Input type="number" value={precioExtra} onChange={(e) => setPrecioExtra(e.target.value)} placeholder="Precio de cada uno" />
          </Campo>
          <Campo label="Máximo por unidad" hint="Vacío = sin tope.">
            <Input type="number" value={maximo} onChange={(e) => setMaximo(e.target.value)} inputMode="numeric" placeholder="Sin tope" />
          </Campo>
        </div>

        <label className="flex items-center gap-2.5">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 rounded border-borde accent-primary" />
          <span className="text-sm text-texto-2">
            Activo<span className="ml-1 text-texto-4">— si no, el punto de venta no lo ofrece</span>
          </span>
        </label>

        <section>
          <h3 className="text-[13px] font-bold text-texto">Opciones ({opciones.length})</h3>
          <p className="mb-2 text-xs text-texto-3">
            Los productos que se agregan. Al guardar quedan como «sólo agregado»: no salen sueltos en el punto de venta.
          </p>
          <Buscador valor={busqueda} onChange={setBusqueda} placeholder="Buscar producto" />
          <ul className="mt-2 max-h-52 divide-y divide-borde-soft overflow-y-auto rounded-xl border border-borde">
            {productos.cargando && !productos.datos ? (
              <li className="p-3">
                <Cargando />
              </li>
            ) : visibles.length === 0 ? (
              <li className="p-3 text-center text-[13px] text-texto-4">Sin resultados</li>
            ) : (
              visibles.map((p: Producto) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={opciones.includes(p.id)}
                      onChange={() => alternarOpcion(p.id)}
                      className="h-4 w-4 rounded border-borde accent-primary"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-texto">{p.nombre}</span>
                    <span className="shrink-0 text-xs text-texto-3">{p.categoria?.nombre}</span>
                    <span className="w-16 shrink-0 text-right text-xs font-semibold text-texto-2">{fmtMoney(p.precio)}</span>
                  </label>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h3 className="text-[13px] font-bold text-texto">Categorías que lo llevan</h3>
          <p className="mb-2 text-xs text-texto-3">
            Todos los productos de la categoría ofrecen el grupo. «Incluidos propios» pisa los del grupo (vacío = los del grupo).
          </p>
          <ul className="divide-y divide-borde-soft rounded-xl border border-borde">
            {(categorias.datos ?? []).map((c) => {
              const marcada = c.id in porCategoria;
              return (
                <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={marcada} onChange={() => alternarCategoria(c)} className="h-4 w-4 rounded border-borde accent-primary" />
                    <span className="truncate text-sm text-texto">{c.nombre}</span>
                  </label>
                  {marcada && (
                    <Input
                      type="number"
                      value={porCategoria[c.id]}
                      onChange={(e) => setPorCategoria((m) => ({ ...m, [c.id]: e.target.value }))}
                      aria-label={`Incluidos propios de ${c.nombre}`}
                      placeholder="Incl. propios"
                      className="!w-32 py-1.5"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="text-[13px] font-bold text-texto">Productos sueltos</h3>
          <p className="mb-2 text-xs text-texto-3">Para un producto que no está en una de esas categorías. Gana sobre la categoría.</p>
          {Object.keys(porProducto).length > 0 && (
            <ul className="mb-2 divide-y divide-borde-soft rounded-xl border border-borde">
              {Object.keys(porProducto).map((k) => {
                const id = Number(k);
                return (
                  <li key={id} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-texto">{nombreDe(id)}</span>
                    <Input
                      type="number"
                      value={porProducto[id]}
                      onChange={(e) => setPorProducto((m) => ({ ...m, [id]: e.target.value }))}
                      aria-label={`Incluidos propios de ${nombreDe(id)}`}
                      placeholder="Incl. propios"
                      className="!w-32 py-1.5"
                    />
                    <button
                      onClick={() =>
                        setPorProducto((m) => {
                          const n = { ...m };
                          delete n[id];
                          return n;
                        })
                      }
                      aria-label={`Quitar ${nombreDe(id)}`}
                      className="rounded-lg p-2 text-texto-3 hover:bg-danger-bg hover:text-danger-text"
                    >
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <Select
            aria-label="Agregar un producto suelto"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (id) setPorProducto((m) => ({ ...m, [id]: "" }));
            }}
          >
            <option value="">Agregar un producto…</option>
            {paraAsignar.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
        </section>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
