import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { Badge, Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiPagina } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio, MAX_TITULO_CATALOGO, moverA, TITULO_CATALOGO } from "../../lib/pagina/catalogo";
import type { ModoCatalogo, ProductoFijado, ProductoParaPagina } from "../../lib/pagina/tipos";
import Seccion from "./Seccion";

/**
 * El catálogo de la página en modo "Mis productos" (pedido del dueño, 13-oct):
 * en vez de armar la galería a mano, el dueño elige productos de su sistema y
 * la página los muestra con el nombre y el precio que tengan HOY (si cambia
 * el precio en el sistema, cambia en la página). Uno u otro: el modo se elige
 * arriba de la sección.
 *
 * Como la galería, cada cambio de la lista se guarda al toque (fijar, quitar,
 * ordenar); el modo y el título de la sección van al borrador de la página y
 * se guardan con "Guardar cambios".
 */

const mensaje = (e: unknown, defecto = "No se pudo guardar") => (e instanceof Error ? e.message : defecto);

/** El selector de modo: dos opciones grandes, una sola elegida. */
export function SelectorModoCatalogo({
  modo,
  onModo,
  hayProductos,
  c,
}: {
  modo: ModoCatalogo;
  onModo: (m: ModoCatalogo) => void;
  /** Sin productos a la venta "Mis productos" no se puede elegir. */
  hayProductos: boolean;
  c: Paleta;
}) {
  const opciones: { clave: ModoCatalogo; titulo: string; texto: string; deshabilitada: boolean }[] = [
    {
      clave: "MANUAL",
      titulo: "Armado a mano",
      texto: "Fotos, títulos y precios que cargás acá.",
      deshabilitada: false,
    },
    {
      clave: "PRODUCTOS",
      titulo: "Mis productos",
      texto: hayProductos
        ? "Elegís productos de tu sistema; el precio se actualiza solo."
        : "Todavía no tenés productos a la venta.",
      deshabilitada: !hayProductos && modo !== "PRODUCTOS",
    },
  ];
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-[13px] font-semibold text-texto-2">¿Qué muestra tu catálogo?</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {opciones.map((o) => {
          const elegida = modo === o.clave;
          return (
            <label
              key={o.clave}
              className={`flex min-w-0 items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm ${
                o.deshabilitada ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
              style={{ borderColor: elegida ? c.acento : undefined, background: elegida ? c.tinte : undefined }}
            >
              <input
                type="radio"
                name="modo-catalogo"
                className="mt-0.5 h-[18px] w-[18px] shrink-0"
                style={{ accentColor: c.acento }}
                checked={elegida}
                disabled={o.deshabilitada}
                onChange={() => onModo(o.clave)}
              />
              <span className="min-w-0">
                <span className="block font-semibold text-texto">{o.titulo}</span>
                <span className="block text-xs text-texto-3">{o.texto}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="text-xs text-texto-4">Se muestra uno u otro. El que no elegís no se borra: queda guardado para cuando vuelvas.</p>
    </fieldset>
  );
}

export interface PropsProductos {
  fijados: ProductoFijado[];
  tope: number;
  titulo: string;
  onTitulo: (t: string) => void;
  /** La lista guardada que devolvió el backend (o la de antes, si falló). */
  onFijados: (lista: ProductoFijado[]) => void;
  /** El selector de modo, arriba de todo. */
  selector: ReactNode;
  c: Paleta;
  onAviso: (t: string) => void;
}

export default function CatalogoProductosEditor({
  fijados,
  tope,
  titulo,
  onTitulo,
  onFijados,
  selector,
  c,
  onAviso,
}: PropsProductos) {
  const [elegir, setElegir] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const ultimo = useRef(0);
  const lista = [...fijados].sort((a, b) => a.orden - b.orden);
  const ids = lista.map((p) => p.id);
  const ocultos = lista.filter((p) => !p.vendible).length;

  /**
   * Optimista: la lista nueva se ve al instante y se guarda atrás. Si falla,
   * vuelve la de antes. Sólo la última respuesta manda.
   */
  const guardar = async (nuevos: number[], aviso?: string): Promise<boolean> => {
    const antes = fijados;
    const mio = ++ultimo.current;
    const porId = new Map(fijados.map((p) => [p.id, p]));
    onFijados(
      nuevos
        .map((id, i) => {
          const p = porId.get(id);
          return p ? { ...p, orden: i + 1 } : null;
        })
        .filter((p): p is ProductoFijado => !!p),
    );
    setError("");
    setGuardando(true);
    try {
      const guardados = await apiPagina.fijarProductosCatalogo(nuevos);
      if (mio === ultimo.current) onFijados(guardados);
      if (aviso) onAviso(aviso);
      return true;
    } catch (e) {
      if (mio === ultimo.current) onFijados(antes);
      setError(mensaje(e));
      return false;
    } finally {
      if (mio === ultimo.current) setGuardando(false);
    }
  };

  const elegirBoton = (
    <Boton icono="plus" onClick={() => setElegir(true)}>
      Elegir productos
    </Boton>
  );

  return (
    <Seccion
      titulo="Catálogo"
      extra={
        lista.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-texto-3" aria-label={`${lista.length} de ${tope} lugares usados`}>
              {lista.length} de {tope}
            </span>
            {elegirBoton}
          </div>
        )
      }
    >
      {selector}
      <ErrorMsg>{error}</ErrorMsg>
      {lista.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: c.tinte, color: c.oscuro }}>
            <Icon name="package" size={24} />
          </span>
          <p className="max-w-xs text-sm text-texto-2">Elegí qué productos de tu sistema se ven en tu página, con su precio de hoy.</p>
          {elegirBoton}
        </div>
      ) : (
        <>
          <Campo label="Título de la sección (opcional)">
            <Input
              aria-label="Título de la sección"
              value={titulo}
              onChange={(ev) => onTitulo(ev.target.value)}
              placeholder={`${TITULO_CATALOGO} · ej.: Nuestro menú, Productos`}
              maxLength={MAX_TITULO_CATALOGO}
            />
          </Campo>
          <ol className="divide-y divide-borde overflow-hidden rounded-xl border border-borde" aria-label="Productos en tu página">
            {lista.map((p, i) => (
              <li key={p.id} className={`flex items-center gap-3 px-3 py-2.5 ${p.vendible ? "" : "bg-muted"}`}>
                <span className={p.vendible ? "" : "opacity-50"}>
                  <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria} size={40} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-semibold ${p.vendible ? "text-texto" : "text-texto-3"}`}>{p.nombre}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-texto-3">
                    <span style={{ color: p.vendible ? c.oscuro : undefined }} className="font-semibold">
                      {formatoPrecio(p.precio) ?? "Sin precio"}
                    </span>
                    {p.categoria && <span className="truncate">{p.categoria}</span>}
                    {!p.vendible && <Badge tono="amarillo">No se muestra</Badge>}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Subir ${p.nombre}`}
                    title="Mover antes"
                    disabled={guardando || i === 0}
                    onClick={() => void guardar(moverA(ids, p.id, i - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
                  >
                    <Icon name="arrowUp" size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Bajar ${p.nombre}`}
                    title="Mover después"
                    disabled={guardando || i === lista.length - 1}
                    onClick={() => void guardar(moverA(ids, p.id, i + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
                  >
                    <Icon name="arrowDown" size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${p.nombre} de la página`}
                    title="Quitar de la página"
                    disabled={guardando}
                    onClick={() => void guardar(ids.filter((x) => x !== p.id), "Quitado de tu página")}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted hover:text-danger-text disabled:opacity-30"
                  >
                    <Icon name="x" size={17} />
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-texto-4">
            El nombre, el precio y el ícono salen de tu sistema: si los cambiás allá, cambian acá. Si una sucursal tiene
            su propio precio o no ofrece un producto, tu página lo respeta.
            {ocultos > 0 &&
              ` ${ocultos === 1 ? "Uno está inactivo o dado de baja" : `${ocultos} están inactivos o dados de baja`}: no se ve${ocultos === 1 ? "" : "n"} hasta que lo${ocultos === 1 ? "" : "s"} reactives.`}
          </p>
        </>
      )}

      {elegir && (
        <SelectorProductos
          fijados={ids}
          tope={tope}
          c={c}
          onCerrar={() => setElegir(false)}
          onGuardar={async (nuevos) => {
            const ok = await guardar(nuevos, "Productos guardados");
            if (ok) setElegir(false);
            return ok;
          }}
        />
      )}
    </Seccion>
  );
}

/** Cuánto espera el buscador después de la última tecla. */
const ESPERA_BUSQUEDA_MS = 250;

/**
 * El popup para elegir productos: buscador (en el backend, paginado: una
 * farmacia tiene miles) y una casilla por producto. Lo nuevo se suma al final
 * de la lista; lo que se destilda, se quita. Se guarda todo junto.
 */
function SelectorProductos({
  fijados,
  tope,
  c,
  onCerrar,
  onGuardar,
}: {
  fijados: number[];
  tope: number;
  c: Paleta;
  onCerrar: () => void;
  onGuardar: (ids: number[]) => Promise<boolean>;
}) {
  const [elegidos, setElegidos] = useState<number[]>(fijados);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoParaPagina[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pedido = useRef(0);

  const traer = async (texto: string, desde: number) => {
    const mio = ++pedido.current;
    setCargando(true);
    setError("");
    try {
      const r = await apiPagina.buscarProductosCatalogo(texto, desde);
      if (mio !== pedido.current) return;
      setResultados((antes) => (desde === 0 ? r.items : [...antes, ...r.items]));
      setTotal(r.total);
    } catch (e) {
      if (mio === pedido.current) setError(mensaje(e, "No se pudieron traer tus productos"));
    } finally {
      if (mio === pedido.current) setCargando(false);
    }
  };

  // Una búsqueda por pausa al teclear, no una por tecla.
  useEffect(() => {
    const t = setTimeout(() => void traer(q, 0), q ? ESPERA_BUSQUEDA_MS : 0);
    return () => clearTimeout(t);
  }, [q]);

  const lleno = elegidos.length >= tope;
  const alternar = (id: number) =>
    setElegidos((antes) => (antes.includes(id) ? antes.filter((x) => x !== id) : antes.length >= tope ? antes : [...antes, id]));
  const cambio = elegidos.length !== fijados.length || elegidos.some((id, i) => id !== fijados[i]);

  return (
    <Modal
      abierto
      titulo="Elegir productos"
      subtitulo={`${elegidos.length} de ${tope} elegidos`}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton
            disabled={guardando || !cambio}
            onClick={async () => {
              setGuardando(true);
              const ok = await onGuardar(elegidos);
              if (!ok) setGuardando(false);
            }}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-texto-4">
            <Icon name="search" size={17} />
          </span>
          <Input
            aria-label="Buscar productos"
            type="search"
            className="pl-10"
            placeholder="Buscar por nombre"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <ErrorMsg>{error}</ErrorMsg>
        {lleno && <p className="text-xs text-warning-text">Llegaste al máximo de {tope}. Quitá alguno para sumar otro.</p>}
        <ul className="max-h-[50vh] divide-y divide-borde overflow-y-auto rounded-xl border border-borde" aria-label="Tus productos">
          {resultados.map((p) => {
            const marcado = elegidos.includes(p.id);
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 px-3 py-2.5 ${!marcado && lleno ? "opacity-50" : "cursor-pointer hover:bg-muted"}`}>
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] shrink-0"
                    style={{ accentColor: c.acento }}
                    checked={marcado}
                    disabled={!marcado && lleno}
                    onChange={() => alternar(p.id)}
                    aria-label={p.nombre}
                  />
                  <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-texto">{p.nombre}</span>
                    {p.categoria && <span className="block truncate text-xs text-texto-3">{p.categoria}</span>}
                  </span>
                  <span className="shrink-0 text-sm font-semibold" style={{ color: c.oscuro }}>
                    {formatoPrecio(p.precio) ?? <span className="text-xs font-normal text-texto-4">Sin precio</span>}
                  </span>
                </label>
              </li>
            );
          })}
          {!cargando && resultados.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-texto-3">
              {q.trim() ? `No hay productos a la venta que se llamen «${q.trim()}».` : "No tenés productos a la venta."}
            </li>
          )}
          {cargando && <li className="px-3 py-4 text-center text-sm text-texto-3">Buscando…</li>}
        </ul>
        {!cargando && resultados.length < total && (
          <div className="flex justify-center">
            <Boton variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => void traer(q, resultados.length)}>
              Ver más ({total - resultados.length})
            </Boton>
          </div>
        )}
        <p className="text-xs text-texto-4">Sólo aparecen los productos a la venta: ni insumos ni los dados de baja.</p>
      </div>
    </Modal>
  );
}
