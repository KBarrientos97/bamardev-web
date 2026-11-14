import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { categoriasDe, coincideBusqueda, partirCarta, TOPE_PORTADA } from "../../lib/pagina/carta";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { estiloLetra, type Letra } from "../../lib/pagina/estilos";
import type { TonosSitio } from "../../lib/pagina/sitio";
import type { ItemCatalogoPublico } from "../../lib/pagina/tipos";
import { SinFoto, VisorCatalogo, detalleItem, type AccionCatalogo } from "./CatalogoPagina";

/**
 * La carta del sitio del Profesional, como en el lienzo «Sitio Pro por rubro»
 * (08-nov), rehecha el 09-nov a pedido del dueño:
 *
 *  · Gastronomía: en el celular, filas con foto chica y un «+» cuadrado; en la
 *    computadora, tarjetas de a tres con la foto arriba y «Agregar».
 *  · Comercio: las categorías en cuadros con su inicial y «Lo más pedido» en
 *    tarjetas de a dos (de a cuatro en la computadora) con «Agregar».
 *  · Belleza: los servicios sin foto, con su duración y «Reservar» (un corte
 *    no se pide por cantidad); los productos, como filas con «+».
 *
 * Con el ítem en el pedido, el botón pasa a «− n +». En la portada salen los
 * primeros seis y «Ver toda la carta» lleva a la tienda (`/tienda`), que
 * tiene todo con buscador y categorías. Tocar la foto o el nombre abre el
 * visor de siempre.
 */

export interface PedidoCarta {
  cantidadDe: (id: number) => number;
  /** Null en la vista previa del editor: el botón se ve pero no suma. */
  agregar: ((item: ItemCatalogoPublico) => void) | null;
  cambiar: ((id: number, delta: number) => void) | null;
  /** Ese local no lo puede servir hoy (agotado): se ve «Agotado» y no se suma (pedidos al sistema). */
  agotado?: (id: number) => boolean;
}

const ICONO_MAS = "M12 5v14M5 12h14";
const ICONO_MENOS = "M5 12h14";
const ICONO_TACHO = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";
const ICONO_LUPA = "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4";
const ICONO_LISTO = "M5 12l5 5L20 7";

function Trazo({ d, color, size = 18, grosor = 2.4 }: { d: string; color: string; size?: number; grosor?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const oculto: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };

/** Lo que comparten todas las piezas de la carta. */
interface Base {
  t: TonosSitio;
  c: Paleta;
  letra: Letra;
  escritorio: boolean;
  radio: CSSProperties["borderRadius"];
  pedido: PedidoCarta | null;
  /** El botón lleno de la página (su forma y su color). */
  lleno: CSSProperties;
  colorIconoLleno: string;
  urlReservar: string | null;
}

export default function CartaSitio({
  items,
  titulo,
  selector,
  plantilla,
  enMarco,
  accionVisor,
  estiloBoton,
  colorIconoBoton,
  colorVacio,
  sucursal = "sucursal",
  modo = "portada",
  urlTienda = null,
  categoriaInicial = null,
  ...base
}: Base & {
  items: ItemCatalogoPublico[];
  /** El título ya dibujado; recibe el id para `aria-labelledby`. */
  titulo: (id: string) => ReactNode;
  selector?: ReactNode;
  plantilla: string;
  enMarco: boolean;
  /** El botón del visor (sumar, reservar o consultar), como en el catálogo de siempre. */
  accionVisor: AccionCatalogo | null;
  estiloBoton: CSSProperties;
  colorIconoBoton: string;
  colorVacio?: string;
  sucursal?: string;
  /** La portada muestra los primeros seis; la tienda, todo con buscador. */
  modo?: "portada" | "tienda";
  /** A dónde lleva «Ver toda la carta» (la portada con más de seis). */
  urlTienda?: string | null;
  /** La tienda abierta desde una categoría de la portada (`?categoria=`). */
  categoriaInicial?: string | null;
}) {
  const { t, escritorio } = base;
  const idTitulo = useId();
  const tienda = modo === "tienda";
  const [filtro, setFiltro] = useState<string | null>(categoriaInicial);
  const [busqueda, setBusqueda] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);
  const categorias = useMemo(() => categoriasDe(items), [items]);
  // En la portada, con más de seis las categorías llevan a la tienda ya
  // filtrada; con pocos, filtran ahí mismo (si hay más de una).
  const hayTienda = !tienda && !!urlTienda && items.length > TOPE_PORTADA;
  const elegida = filtro && categorias.includes(filtro) ? filtro : null;
  const enVista = tienda
    ? items.filter((it) => (!elegida || it.categoria?.trim() === elegida) && coincideBusqueda(it, busqueda))
    : hayTienda
      ? items.slice(0, TOPE_PORTADA)
      : items.filter((it) => !elegida || it.categoria?.trim() === elegida);
  const { servicios, productos } = partirCarta(enVista);
  // El visor recorre lo que se ve, en el orden en que se ve.
  const recorrido = [...servicios, ...productos];
  const indice = abierto != null && abierto < recorrido.length ? abierto : null;
  const abrir = (it: ItemCatalogoPublico) => setAbierto(recorrido.indexOf(it));
  const comercio = plantilla === "COMERCIO";
  const belleza = plantilla === "BELLEZA";

  const conCategorias = categorias.length > 1 && (tienda || hayTienda || !belleza);
  const hrefCategoria = (cat: string) => `${urlTienda}?categoria=${encodeURIComponent(cat)}`;
  const controlesCategoria =
    conCategorias && !(tienda && escritorio) ? (
      comercio && !tienda ? (
        <CuadrosCategoria categorias={categorias} elegida={elegida} onElegir={setFiltro} href={hayTienda ? hrefCategoria : null} {...base} />
      ) : (
        <ChipsCategoria categorias={categorias} elegida={elegida} onElegir={setFiltro} href={hayTienda ? hrefCategoria : null} todo={!hayTienda} {...base} />
      )
    ) : null;

  const listaServicios = servicios.length > 0 && (
    <ul style={grilla(escritorio ? 2 : 1, escritorio ? 14 : 10)}>
      {servicios.map((it) => (
        <FilaServicio key={it.id} it={it} onAbrir={() => abrir(it)} {...base} />
      ))}
    </ul>
  );
  const listaProductos =
    productos.length > 0 &&
    (comercio ? (
      <ul style={grilla(tienda && escritorio ? 3 : escritorio ? 4 : 2, escritorio ? 16 : 10)}>
        {productos.map((it) => (
          <TarjetaComercio key={it.id} it={it} onAbrir={() => abrir(it)} {...base} />
        ))}
      </ul>
    ) : plantilla === "GASTRONOMIA" && escritorio ? (
      <ul style={grilla(tienda ? 2 : 3, 18)}>
        {productos.map((it) => (
          <TarjetaFoto key={it.id} it={it} onAbrir={() => abrir(it)} {...base} />
        ))}
      </ul>
    ) : (
      <ul style={grilla(escritorio ? 2 : 1, 10)}>
        {productos.map((it) => (
          <FilaProducto key={it.id} it={it} onAbrir={() => abrir(it)} {...base} />
        ))}
      </ul>
    ));
  const subtitulo = (texto: string) => (
    <h3 style={{ ...estiloLetra(base.letra, escritorio ? 30 : 24), color: t.titulo, margin: "8px 0 0", lineHeight: 1.1 }}>{texto}</h3>
  );

  const vacio = recorrido.length === 0;
  const contenido = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, flex: 1 }}>
      {tienda && <Buscador valor={busqueda} onCambiar={setBusqueda} {...base} />}
      {vacio ? (
        <p style={{ margin: 0, fontSize: 15, color: colorVacio ?? t.texto3 }}>
          {busqueda.trim() ? `No encontramos «${busqueda.trim()}».` : `No hay productos disponibles en esta ${sucursal}.`}
        </p>
      ) : (
        <>
          {listaServicios}
          {servicios.length > 0 && productos.length > 0 && subtitulo("Productos")}
          {listaProductos}
        </>
      )}
      {hayTienda && (
        <a
          href={urlTienda!}
          style={{
            ...base.lleno,
            alignSelf: escritorio ? "center" : "stretch",
            minHeight: 50,
            padding: "0 28px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            fontSize: 16,
            fontWeight: 800,
            textDecoration: "none",
            boxSizing: "border-box",
            marginTop: 6,
          }}
        >
          {textoVerTodo(plantilla, items.length)}
        </a>
      )}
    </div>
  );

  return (
    <section aria-labelledby={idTitulo} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      {comercio && !tienda && controlesCategoria && (
        <>
          {subtitulo("Categorías")}
          {controlesCategoria}
        </>
      )}
      {escritorio && !comercio && !tienda && controlesCategoria ? (
        // Computadora: el título a la izquierda y las categorías a la derecha (lienzo, Gastronomía).
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
          {titulo(idTitulo)}
          {controlesCategoria}
        </div>
      ) : (
        <>
          {titulo(idTitulo)}
          {selector}
          {(!comercio || tienda) && controlesCategoria}
        </>
      )}
      {escritorio && !comercio && !tienda && controlesCategoria && selector}
      {tienda && escritorio && conCategorias ? (
        <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
          <MenuCategorias categorias={categorias} elegida={elegida} onElegir={setFiltro} {...base} />
          {contenido}
        </div>
      ) : (
        contenido
      )}
      {indice != null && (
        <VisorCatalogo
          items={recorrido}
          indice={indice}
          onIndice={setAbierto}
          onCerrar={() => setAbierto(null)}
          c={base.c}
          familia={t.familia}
          escritorio={escritorio}
          enMarco={enMarco}
          accion={accionVisor}
          estiloBoton={estiloBoton}
          colorIconoBoton={colorIconoBoton}
        />
      )}
    </section>
  );
}

function textoVerTodo(plantilla: string, n: number): string {
  if (plantilla === "GASTRONOMIA") return `Ver toda la carta (${n})`;
  if (plantilla === "BELLEZA") return `Ver todos los servicios (${n})`;
  return `Ver todos los productos (${n})`;
}

function grilla(columnas: number, espacio: number): CSSProperties {
  return {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "grid",
    gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
    gap: espacio,
  };
}

// ── Categorías ────────────────────────────────────────────────────────────

interface Categorias {
  categorias: string[];
  elegida: string | null;
  onElegir: (c: string | null) => void;
}

/** Pastillas (Gastronomía, Belleza y la tienda en el celular). Con `href`, llevan a la tienda. */
function ChipsCategoria({
  categorias,
  elegida,
  onElegir,
  href,
  todo,
  t,
  escritorio,
}: Categorias & Base & { href: ((c: string) => string) | null; todo: boolean }) {
  const chip = (activo: boolean): CSSProperties => ({
    flex: "none",
    height: escritorio ? 44 : 40,
    padding: escritorio ? "0 18px" : "0 16px",
    borderRadius: 999,
    border: activo ? "none" : `1px solid ${t.borde ?? t.linea}`,
    background: activo ? t.texto : t.tarjeta,
    color: activo ? t.fondo : t.textoTarjeta,
    fontWeight: 700,
    fontSize: escritorio ? 15 : 14,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    textDecoration: "none",
    boxSizing: "border-box",
  });
  return (
    <div
      role={href ? undefined : "group"}
      aria-label="Categorías"
      data-testid="categorias-carta"
      style={{
        display: "flex",
        gap: 8,
        flexWrap: escritorio ? "wrap" : "nowrap",
        overflowX: escritorio ? undefined : "auto",
        scrollbarWidth: "none",
        minWidth: 0,
      }}
    >
      {href ? (
        categorias.map((cat) => (
          <a key={cat} href={href(cat)} style={chip(false)}>
            {cat}
          </a>
        ))
      ) : (
        <>
          {todo && (
            <button type="button" aria-pressed={!elegida} onClick={() => onElegir(null)} style={chip(!elegida)}>
              Todo
            </button>
          )}
          {categorias.map((cat) => (
            <button key={cat} type="button" aria-pressed={elegida === cat} onClick={() => onElegir(cat)} style={chip(elegida === cat)}>
              {cat}
            </button>
          ))}
        </>
      )}
    </div>
  );
}

/** Los cuadros de Comercio: la inicial en su recuadro y el nombre abajo. */
function CuadrosCategoria({ categorias, elegida, onElegir, href, t, c, escritorio }: Categorias & Base & { href: ((c: string) => string) | null }) {
  const cuadro = (activo: boolean): CSSProperties => ({
    height: escritorio ? 96 : 78,
    borderRadius: escritorio ? 16 : 14,
    border: `${activo ? 2 : 1}px solid ${activo ? c.acento : (t.borde ?? t.linea)}`,
    background: t.tarjeta,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: escritorio ? 8 : 6,
    fontFamily: "inherit",
    fontSize: escritorio ? 14 : 12,
    fontWeight: 700,
    color: t.textoTarjeta,
    cursor: "pointer",
    textDecoration: "none",
    padding: "0 4px",
    boxSizing: "border-box",
    textAlign: "center",
    minWidth: 0,
  });
  const inicial = (cat: string) => (
    <span
      aria-hidden="true"
      style={{
        width: escritorio ? 36 : 30,
        height: escritorio ? 36 : 30,
        borderRadius: escritorio ? 12 : 10,
        background: c.tinte,
        color: c.oscuro,
        fontWeight: 800,
        fontSize: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {cat.charAt(0).toUpperCase()}
    </span>
  );
  const nombre = (cat: string) => (
    <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
  );
  return (
    <div
      role={href ? undefined : "group"}
      aria-label="Categorías"
      data-testid="categorias-carta"
      style={grilla(escritorio ? Math.min(8, categorias.length) : 4, escritorio ? 10 : 8)}
    >
      {categorias.map((cat) =>
        href ? (
          <a key={cat} href={href(cat)} style={cuadro(false)}>
            {inicial(cat)}
            {nombre(cat)}
          </a>
        ) : (
          <button key={cat} type="button" aria-pressed={elegida === cat} onClick={() => onElegir(elegida === cat ? null : cat)} style={cuadro(elegida === cat)}>
            {inicial(cat)}
            {nombre(cat)}
          </button>
        ),
      )}
    </div>
  );
}

/** La tienda en la computadora: las categorías en una columna fija a la izquierda. */
function MenuCategorias({ categorias, elegida, onElegir, t, c }: Categorias & Base) {
  const opcion = (activo: boolean): CSSProperties => ({
    textAlign: "left",
    border: "none",
    borderRadius: 12,
    padding: "11px 14px",
    minHeight: 44,
    background: activo ? c.tinte : "transparent",
    color: activo ? c.oscuro : t.texto,
    fontWeight: activo ? 800 : 600,
    fontSize: 15,
    fontFamily: "inherit",
    cursor: "pointer",
  });
  return (
    <nav aria-label="Categorías" data-testid="menu-categorias" style={{ position: "sticky", top: 88, width: 220, flex: "none", display: "flex", flexDirection: "column", gap: 2 }}>
      <button type="button" aria-pressed={!elegida} onClick={() => onElegir(null)} style={opcion(!elegida)}>
        Todo
      </button>
      {categorias.map((cat) => (
        <button key={cat} type="button" aria-pressed={elegida === cat} onClick={() => onElegir(cat)} style={opcion(elegida === cat)}>
          {cat}
        </button>
      ))}
    </nav>
  );
}

function Buscador({ valor, onCambiar, t }: { valor: string; onCambiar: (v: string) => void } & Base) {
  return (
    <label style={{ position: "relative", display: "block" }}>
      <span style={oculto}>Buscar</span>
      <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
        <Trazo d={ICONO_LUPA} color={t.texto3} size={20} grosor={2} />
      </span>
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Buscar"
        aria-label="Buscar en la tienda"
        style={{
          width: "100%",
          boxSizing: "border-box",
          height: 50,
          borderRadius: 14,
          border: `1px solid ${t.borde ?? t.linea}`,
          background: t.tarjeta,
          color: t.textoTarjeta,
          padding: "0 14px 0 44px",
          // 16 px: con menos, el iPhone agranda la página al enfocar.
          fontSize: 16,
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

// ── Las piezas de cada ítem ───────────────────────────────────────────────

/** Foto y nombre que abren el visor: un botón aparte del de sumar. */
function AbrirItem({ it, onAbrir, children, style }: { it: ItemCatalogoPublico; onAbrir: () => void; children: ReactNode; style?: CSSProperties }) {
  const precio = formatoPrecio(it.precio, it.precioDesde);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={`${it.titulo}${precio ? `, ${precio}` : ""}: ver detalle`}
      onClick={onAbrir}
      style={{ padding: 0, margin: 0, border: "none", background: "transparent", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", minWidth: 0, ...style }}
    >
      {children}
    </button>
  );
}

function Foto({ it, t, alto, ancho, radio }: { it: ItemCatalogoPublico; t: TonosSitio; alto: number | string; ancho: number | string; radio: number }) {
  const foto = urlDeImagen(it.fotoUrl);
  return (
    <span style={{ position: "relative", display: "block", flex: "none", width: ancho, height: alto, borderRadius: radio, overflow: "hidden", background: t.sinFotoFondo }}>
      {foto ? (
        <img
          src={foto}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <SinFoto item={it} fondo={t.sinFotoFondo} color={t.sinFotoTexto} tamano={typeof alto === "number" && alto < 100 ? 26 : 44} />
      )}
    </span>
  );
}

/** Gastronomía (celular) y los productos de Belleza: foto chica, nombre, precio y el «+». */
function FilaProducto({ it, onAbrir, ...b }: Base & { it: ItemCatalogoPublico; onAbrir: () => void }) {
  const { t } = b;
  const detalle = detalleItem(it);
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const cantidad = b.pedido?.cantidadDe(it.id) ?? 0;
  return (
    <li
      data-testid="fila-carta"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        background: t.tarjeta,
        border: `1px solid ${cantidad ? b.c.acento : (t.borde ?? t.linea)}`,
        boxShadow: t.sombra ?? undefined,
        borderRadius: 16,
        minWidth: 0,
      }}
    >
      <AbrirItem it={it} onAbrir={onAbrir} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, color: t.textoTarjeta }}>
        <Foto it={it} t={t} alto={72} ancho={72} radio={12} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3, ...dosLineas }}>{it.titulo}</span>
          {detalle && <span style={{ fontSize: 13, color: t.texto3Tarjeta, ...unaLinea }}>{detalle}</span>}
          <span style={{ fontWeight: 800, fontSize: 16, color: t.precio }}>{precio ?? "Precio a consultar"}</span>
        </span>
      </AbrirItem>
      {b.pedido && <Sumar it={it} cantidad={cantidad} forma="cuadrado" {...b} />}
    </li>
  );
}

/** Gastronomía en la computadora: la foto arriba, el precio grande con la letra del nombre y «Agregar». */
function TarjetaFoto({ it, onAbrir, ...b }: Base & { it: ItemCatalogoPublico; onAbrir: () => void }) {
  const { t } = b;
  const detalle = detalleItem(it);
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const cantidad = b.pedido?.cantidadDe(it.id) ?? 0;
  return (
    <li
      data-testid="fila-carta"
      style={{
        background: t.tarjeta,
        border: `1px solid ${cantidad ? b.c.acento : (t.borde ?? t.linea)}`,
        boxShadow: t.sombra ?? undefined,
        borderRadius: 20,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <AbrirItem it={it} onAbrir={onAbrir} style={{ display: "flex", flexDirection: "column", color: t.textoTarjeta }}>
        <Foto it={it} t={t} alto={180} ancho="100%" radio={0} />
        <span style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.25 }}>{it.titulo}</span>
          {detalle && <span style={{ fontSize: 14, color: t.texto3Tarjeta }}>{detalle}</span>}
        </span>
      </AbrirItem>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 16px 16px", marginTop: "auto" }}>
        <span style={{ ...estiloLetra(b.letra, 30), color: t.precio, lineHeight: 1.1 }}>{precio ?? "A consultar"}</span>
        {b.pedido && <Sumar it={it} cantidad={cantidad} forma="texto" {...b} />}
      </div>
    </li>
  );
}

/** Comercio: tarjeta con la foto arriba, nombre, precio y «Agregar» a todo el ancho. */
function TarjetaComercio({ it, onAbrir, ...b }: Base & { it: ItemCatalogoPublico; onAbrir: () => void }) {
  const { t, escritorio } = b;
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const cantidad = b.pedido?.cantidadDe(it.id) ?? 0;
  return (
    <li
      data-testid="fila-carta"
      style={{
        background: t.tarjeta,
        border: `1px solid ${cantidad ? b.c.acento : (t.borde ?? t.linea)}`,
        boxShadow: t.sombra ?? undefined,
        borderRadius: escritorio ? 18 : 16,
        padding: escritorio ? 14 : 10,
        display: "flex",
        flexDirection: "column",
        gap: escritorio ? 8 : 6,
        minWidth: 0,
      }}
    >
      <AbrirItem it={it} onAbrir={onAbrir} style={{ display: "flex", flexDirection: "column", gap: escritorio ? 8 : 6, color: t.textoTarjeta }}>
        <Foto it={it} t={t} alto={escritorio ? 150 : 104} ancho="100%" radio={escritorio ? 14 : 12} />
        <span style={{ fontWeight: 700, fontSize: escritorio ? 15 : 14, lineHeight: 1.25, minHeight: escritorio ? 40 : 36, ...dosLineas }}>{it.titulo}</span>
        <span style={{ ...estiloLetra(b.letra, escritorio ? 20 : 17), color: t.precio }}>{precio ?? "A consultar"}</span>
      </AbrirItem>
      <div style={{ marginTop: "auto" }}>{b.pedido && <Sumar it={it} cantidad={cantidad} forma="ancho" {...b} />}</div>
    </li>
  );
}

/** Un servicio de agenda: sin foto, con su duración y «Reservar». */
function FilaServicio({ it, onAbrir, ...b }: Base & { it: ItemCatalogoPublico; onAbrir: () => void }) {
  const { t, escritorio } = b;
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const cantidad = b.pedido?.cantidadDe(it.id) ?? 0;
  const reservar = b.urlReservar && it.servicioId != null ? `${b.urlReservar}?servicio=${it.servicioId}` : null;
  return (
    <li
      data-testid="fila-servicio"
      style={{
        display: "flex",
        alignItems: "center",
        gap: escritorio ? 16 : 12,
        background: t.tarjeta,
        border: `1px solid ${t.borde ?? t.linea}`,
        boxShadow: t.sombra ?? undefined,
        borderRadius: escritorio ? 18 : 16,
        padding: escritorio ? "18px 20px" : 14,
        minWidth: 0,
      }}
    >
      <AbrirItem it={it} onAbrir={onAbrir} style={{ flex: 1, display: "flex", flexDirection: "column", gap: escritorio ? 4 : 3, color: t.textoTarjeta }}>
        <span style={{ fontWeight: 700, fontSize: escritorio ? 17 : 15 }}>{it.titulo}</span>
        {it.duracionMin ? <span style={{ fontSize: escritorio ? 14 : 13, color: t.texto3Tarjeta }}>{duracion(it.duracionMin)}</span> : null}
      </AbrirItem>
      {precio && <span style={{ ...estiloLetra(b.letra, escritorio ? 24 : 20), color: t.precio, whiteSpace: "nowrap" }}>{precio}</span>}
      {reservar ? (
        <a
          href={reservar}
          aria-label={`Reservar ${it.titulo}`}
          style={{
            height: 44,
            padding: escritorio ? "0 16px" : "0 14px",
            borderRadius: 10,
            border: `1px solid ${t.precio}`,
            color: t.precio,
            display: "flex",
            alignItems: "center",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
            flex: "none",
          }}
        >
          Reservar
        </a>
      ) : b.pedido ? (
        <AgregarUnaVez it={it} agregado={cantidad > 0} {...b} />
      ) : null}
    </li>
  );
}

/** Sin reserva online, el servicio se suma una vez a la consulta por WhatsApp. */
function AgregarUnaVez({ it, agregado, ...b }: Base & { it: ItemCatalogoPublico; agregado: boolean }) {
  const { t, pedido } = b;
  if (!pedido) return null;
  return agregado ? (
    <button
      type="button"
      aria-label={`Quitar ${it.titulo} del pedido`}
      onClick={() => pedido.cambiar?.(it.id, -1)}
      style={{
        height: 44,
        padding: "0 14px",
        borderRadius: 10,
        border: `1px solid ${t.precio}`,
        background: "transparent",
        color: t.precio,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontWeight: 700,
        fontSize: 14,
        fontFamily: "inherit",
        cursor: "pointer",
        flex: "none",
      }}
    >
      <Trazo d={ICONO_LISTO} color={t.precio} size={16} />
      Agregado
    </button>
  ) : (
    <button
      type="button"
      aria-label={`Agregar ${it.titulo} al pedido`}
      onClick={() => pedido.agregar?.(it)}
      style={{ ...b.lleno, height: 44, padding: "0 14px", borderRadius: 10, fontWeight: 700, fontSize: 14, fontFamily: "inherit", cursor: "pointer", flex: "none", border: "none" }}
    >
      Agregar
    </button>
  );
}

function duracion(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `${h} h ${resto} min` : `${h} h`;
}

/**
 * El botón de sumar: el «+» cuadrado (filas), «Agregar» (tarjetas) o
 * «Agregar» a todo el ancho (Comercio). Con el ítem en el pedido, «− n +».
 */
function Sumar({ it, cantidad, forma, ...b }: Base & { it: ItemCatalogoPublico; cantidad: number; forma: "cuadrado" | "texto" | "ancho" }) {
  const { pedido, c } = b;
  if (!pedido) return null;
  const puede = !!pedido.agregar;
  if (!cantidad && pedido.agotado?.(it.id)) {
    return (
      <span
        aria-label={`${it.titulo}: agotado`}
        style={{ flex: "none", height: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0 12px", borderRadius: 12, background: "#F3F4F6", color: "#6B7280", fontWeight: 700, fontSize: 13, boxSizing: "border-box", width: forma === "ancho" ? "100%" : undefined }}
      >
        Agotado
      </span>
    );
  }
  if (!cantidad) {
    const comun: CSSProperties = {
      ...b.lleno,
      height: 44,
      border: "none",
      borderRadius: 12,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      fontWeight: 800,
      fontFamily: "inherit",
      cursor: puede ? "pointer" : "default",
      flex: "none",
      boxSizing: "border-box",
    };
    return (
      <button
        type="button"
        aria-label={`Agregar ${it.titulo} al pedido`}
        onClick={() => pedido.agregar?.(it)}
        style={
          forma === "cuadrado"
            ? { ...comun, width: 44, padding: 0 }
            : forma === "ancho"
              ? { ...comun, width: "100%", padding: "0 12px", fontSize: 14 }
              : { ...comun, padding: "0 16px", fontSize: 15 }
        }
      >
        {forma === "cuadrado" ? <Trazo d={ICONO_MAS} color={b.colorIconoLleno} size={20} grosor={2.5} /> : "Agregar"}
      </button>
    );
  }
  const redondo: CSSProperties = {
    width: 36,
    height: 36,
    flex: "none",
    borderRadius: 10,
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: puede ? "pointer" : "default",
  };
  return (
    <div
      role="group"
      aria-label={`${it.titulo}: ${cantidad} en el pedido`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 4,
        flex: "none",
        background: c.tinte,
        borderRadius: 12,
        padding: 4,
        height: 44,
        boxSizing: "border-box",
        width: forma === "ancho" ? "100%" : undefined,
      }}
    >
      <button
        type="button"
        aria-label={cantidad === 1 ? `Quitar ${it.titulo} del pedido` : `Quitar uno de ${it.titulo}`}
        onClick={() => pedido.cambiar?.(it.id, -1)}
        style={{ ...redondo, background: "#ffffff" }}
      >
        <Trazo d={cantidad === 1 ? ICONO_TACHO : ICONO_MENOS} color={c.oscuro} size={16} />
      </button>
      <span aria-hidden="true" style={{ minWidth: 22, textAlign: "center", fontWeight: 800, fontSize: 16, color: c.oscuro }}>
        {cantidad}
      </span>
      <button type="button" aria-label={`Sumar uno de ${it.titulo}`} onClick={() => pedido.agregar?.(it)} style={{ ...redondo, background: c.oscuro }}>
        <Trazo d={ICONO_MAS} color="#ffffff" size={16} />
      </button>
      {/* Para el lector de pantalla: el número cambia sin mover el foco. */}
      <span aria-live="polite" style={oculto}>
        {cantidad} en el pedido
      </span>
    </div>
  );
}

const dosLineas: CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };
const unaLinea: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
