import { useMemo, useRef, type ReactNode } from "react";
import { Icon } from "../../components/Icon";
import IconoProducto from "../../components/IconoProducto";
import { QUEDA_POCO, type ConteoDeCategoria } from "../../lib/conteo";
import { fmtCantidad, fmtMoney, fmtNum } from "../../lib/format";
import { useAncho } from "../../lib/agenda/useEsCelular";
import type { Categoria, Producto } from "../../types";
import { agruparPorCategoria, columnasQueEntran, repartirEnColumnas, type BloqueCategoria } from "./columnasPos";
import RotuloConteo from "./RotuloConteo";
import { controlaStock, topeStock } from "./useCarrito";
import type { Arrastre } from "./useArrastreGrilla";

/**
 * «Columnas por categoría» (Configuración › Punto de venta, 16-nov): en vez
 * de la grilla de tarjetas, un bloque por categoría con sus productos en
 * lista —nombre y precio—, para ver la comida a un lado, las bebidas al otro
 * y los extras al otro. Entra más a la vista que en tarjetas.
 *
 * Es para pantalla grande: en el celular `PantallaVenta` dibuja las tarjetas
 * de siempre aunque el ajuste diga columnas.
 *
 * Cada fila hace lo mismo que la tarjeta: tocarla agrega (con la pregunta del
 * pausado y la hoja de toppings, que decide quien la usa), en el carrito se
 * resalta y muestra la cantidad con su «−» (sin cambiar de alto), y dice
 * «Agotado», «Pausado» o cuánto queda cuando queda poco o ya no suma.
 *
 * Con el conteo por categoría (vasos por tamaño, 18-nov), la cabecera de cada
 * tamaño contado dice cuántos vasos se pueden cargar todavía: una vez por
 * categoría y no en cada fila, porque todos sus productos gastan el mismo vaso.
 *
 * Y se acomoda arrastrando, como la tarjeta (17-nov): con el dedo, mantener
 * presionado; con el mouse, apretar y mover (`useArrastreGrilla`). Cada fila
 * sólo dentro de la lista de su categoría: las alitas bajan al tercer lugar o
 * al último de los pollos, pero no se van a las bebidas. Se guarda en el mismo
 * orden del cajero que usan las tarjetas, así lo que acomoda acá se ve igual
 * allá y al revés. El orden de las columnas no se toca: lo elige el dueño en
 * Configuración.
 */

/** El ancho mínimo de una columna: menos, y el nombre no entra en dos renglones al lado del precio. */
const ANCHO_COLUMNA = 240;
/** `gap-3`. */
const SEPARACION = 12;

/**
 * El filete de color de cada categoría: una paleta corta, con los colores del
 * tema (en belleza siguen la paleta del negocio). Va por el lugar de la
 * categoría en el orden del dueño, así no cambia de color al buscar.
 */
const FILETES = [
  "var(--color-primary)",
  "var(--color-info-text)",
  "var(--color-warning)",
  "var(--color-danger-borde)",
  "var(--color-primary-200)",
];
const FILETE_OTROS = "var(--color-texto-4)";

const filete = (b: BloqueCategoria) => (b.lugar < 0 ? FILETE_OTROS : FILETES[b.lugar % FILETES.length]);

/** Sin el arrastre ningún click es el final de uno. */
const nunca = () => false;

/**
 * La fila levantada: resaltada con un contorno y con sombra debajo. Se mete 4 px
 * de cada lado (`mx-1`) y pierde 4 px de relleno (`px-1` en vez de `px-2`), así
 * lo de adentro no se mueve ni la fila cambia de alto. El contorno va por
 * dentro (`-outline-offset-2`) y no es un anillo de afuera: la última fila de
 * una categoría toca el borde redondeado de abajo, que lo cortaba. Mientras
 * está levantada, el botón de la fila no se pinta de gris con el mouse encima
 * (ver `FilaProducto`): ese gris tapaba el contorno de arriba y de abajo. La
 * sombra se encoge de los costados (el `-4px`) para caber en esos 4 px; debajo
 * de la última fila no se ve, pero tampoco se corta a la vista.
 */
const FILA_LEVANTADA =
  "relative mx-1 rounded-lg border-transparent px-1 outline-2 -outline-offset-2 outline-primary shadow-[0_6px_14px_-4px_rgba(15,23,42,0.3)]";

/**
 * El estilo del arrastre para una fila. Sin el `scale` de la tarjeta: la fila
 * ocupa todo el ancho de su columna y agrandada se cortaba contra el borde (lo
 * de levantada lo dice `FILA_LEVANTADA`). Las demás se apagan como en la
 * grilla, pero sobre lo apagado que ya estaban: la opacidad de la fila iba a
 * pisar la de una agotada, que se encendía mientras se arrastraba otra.
 */
function estiloDeFila(s: React.CSSProperties, apagada: number): React.CSSProperties {
  return {
    ...s,
    transform: undefined,
    opacity: s.opacity === undefined ? undefined : Number(s.opacity) * apagada,
  };
}

/** Si el puntero cae sobre `el`. Sin medida (todavía no se dibujó), no. */
function sobre(el: HTMLElement | null, e: React.PointerEvent): boolean {
  const r = el?.getBoundingClientRect();
  if (!r || r.width === 0) return false;
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

export default function VistaColumnas({
  productos,
  categorias,
  enCarrito,
  conIcono,
  agotadosHoy,
  pausados,
  incluyeDe,
  conteoDe,
  onAgregar,
  onQuitar,
  onMenu,
  arrastre,
}: {
  /** Lo que se ve (ya filtrado), en el orden del cajero (durante el arrastre, el orden en vuelo). */
  productos: Producto[];
  /** En el orden del dueño. */
  categorias: Categoria[];
  enCarrito: Map<number, number>;
  conIcono: boolean;
  agotadosHoy: Set<number>;
  pausados: Set<number>;
  incluyeDe: (productoId: number) => string | undefined;
  /**
   * El conteo por categoría (vasos por tamaño, 18-nov): lo que dice de una
   * categoría. Sin esto —conteo apagado— la lista es la de siempre.
   */
  conteoDe?: (categoria: Producto["categoria"]) => ConteoDeCategoria | null;
  onAgregar: (p: Producto) => void;
  onQuitar: (p: Producto) => void;
  /** El «⋯» de pausar o reactivar; sólo con `productos.pausar`. */
  onMenu?: (p: Producto) => void;
  /**
   * El arrastre de la pantalla de venta, el mismo de las tarjetas, ya armado
   * para que cada fila no salga de su categoría. Sin esto, la lista no se
   * acomoda.
   */
  arrastre?: Pick<Arrastre, "props" | "ignorarClic">;
}) {
  const bloques = useMemo(() => agruparPorCategoria(productos, categorias), [productos, categorias]);
  const [medir, ancho] = useAncho();
  const columnas = columnasQueEntran(ancho, ANCHO_COLUMNA, SEPARACION);
  /**
   * Una sola categoría a la vista (la elegida en los chips, una búsqueda que
   * cae en una sola, o un negocio con una): ocupa todo el ancho y sus filas se
   * reparten en columnas, en vez de una lista larga y finita al costado de
   * columnas vacías. Con varias, una columna por categoría: buscando «nutella»
   * salían cinco bloques a todo el ancho con una fila cada uno (QA 16-nov).
   */
  const repartir = bloques.length === 1;
  // El encabezado pesa más o menos lo que una fila.
  const pilas = useMemo(
    () => repartirEnColumnas(bloques, repartir ? 1 : columnas, (b) => b.productos.length + 1),
    [bloques, columnas, repartir],
  );

  const fila = (p: Producto) => (
    <FilaProducto
      key={p.id}
      producto={p}
      cantidad={enCarrito.get(p.id) ?? 0}
      conIcono={conIcono}
      incluye={incluyeDe(p.id)}
      agotadoHoy={agotadosHoy.has(p.id)}
      pausado={pausados.has(p.id)}
      conteo={conteoDe?.(p.categoria) ?? null}
      onAgregar={() => onAgregar(p)}
      onQuitar={() => onQuitar(p)}
      onMenu={onMenu ? () => onMenu(p) : undefined}
      arrastre={arrastre?.props(p.id)}
      ignorarClic={arrastre?.ignorarClic ?? nunca}
    />
  );

  return (
    <div ref={medir} className="flex items-start gap-3">
      {pilas.map((pila, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-3">
          {pila.map((b) => {
            // Las filas son de alto fijo a propósito (ver `FilaProducto`): el
            // número de vasos de una categoría contada va UNA vez, acá arriba,
            // junto a cuántos productos tiene (18-nov). Todos sus productos
            // gastan el mismo vaso, así que es el mismo número para todas.
            const conteoBloque = conteoDe?.(b.productos[0]?.categoria) ?? null;
            const cuenta = (
              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-texto-4">
                {fmtNum(b.productos.length)}
              </span>
            );
            return (
            <section
              key={b.clave}
              aria-label={b.nombre}
              className="overflow-hidden rounded-2xl border border-borde bg-white"
              style={{ borderLeftWidth: 4, borderLeftColor: filete(b) }}
            >
              <header className="flex items-baseline justify-between gap-2 border-b border-borde-soft px-3 py-2">
                <h3 className="min-w-0 break-words text-[12px] font-bold uppercase tracking-[0.08em] text-texto-2">
                  {b.nombre}
                </h3>
                {conteoBloque ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <RotuloConteo conteo={conteoBloque} />
                    {cuenta}
                  </span>
                ) : (
                  cuenta
                )}
              </header>
              {/* Sola, la categoría usa el ancho: sus filas se reparten en
                  columnas, y cada fila entera en la suya. */}
              <ul className={repartir ? "columns-[15rem] gap-x-3" : undefined}>{b.productos.map(fila)}</ul>
            </section>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FilaProducto({
  producto: p,
  cantidad,
  conIcono,
  incluye,
  agotadoHoy,
  pausado,
  conteo,
  onAgregar,
  onQuitar,
  onMenu,
  arrastre,
  ignorarClic,
}: {
  producto: Producto;
  cantidad: number;
  conIcono: boolean;
  incluye?: string;
  agotadoHoy: boolean;
  pausado: boolean;
  /** Lo que el conteo por categoría dice de su tamaño (18-nov); null = la fila de siempre. */
  conteo?: ConteoDeCategoria | null;
  onAgregar: () => void;
  onQuitar: () => void;
  onMenu?: () => void;
  /** Handlers y estilo del reordenamiento (ver `useArrastreGrilla`). */
  arrastre?: ReturnType<Arrastre["props"]>;
  /** El click es el final de un arrastre: no suma, no quita, no abre el «⋯». */
  ignorarClic: () => boolean;
}) {
  /** La cantidad con su «−»: tocarla no levanta la fila (ver `alApretar`). */
  const cantidadRef = useRef<HTMLSpanElement>(null);
  // Las mismas reglas que la tarjeta (ver TarjetaVenta en PantallaVenta).
  const controla = controlaStock(p);
  const agotado = (controla && p.stockTotal <= 0) || agotadoHoy || !!conteo?.agotado;
  const enCarrito = cantidad > 0;
  // Ya está en el carrito todo lo que hay: tocar la fila no suma más.
  const alTopeStock = !agotado && cantidad >= topeStock(p);
  // O el carrito ya lleva todos los vasos que quedan de su tamaño, de
  // cualquier producto (conteo por categoría, 18-nov).
  const llenoConteo = !agotado && !!conteo?.lleno;
  const alTope = alTopeStock || llenoConteo;
  // En la lista el número sólo sale cuando queda poco (al lado de cada nombre
  // sería ruido; lo que el cajero necesita es el aviso antes de que se acabe),
  // o cuando ya no suma: así se entiende por qué tocarla no hace nada.
  const quedaPoco = !agotado && controla && (p.stockTotal <= p.stockMinimo || alTopeStock);
  /**
   * Lo mismo para el conteo: el número de siempre va en la cabecera de la
   * categoría, y en la fila sólo el aviso, cuando quedan pocos o ya no suma.
   * «Pocos» mira lo que queda en el LOCAL y no lo libre: si mirara lo libre,
   * cargar el décimo vaso le sumaría un renglón a todas las filas de ese
   * tamaño en medio del pedido, y el toque siguiente caería en otra fila (por
   * eso son de alto fijo). Así el aviso ya está al abrir la lista y no aparece
   * por tocar; su número sí baja con el carrito.
   */
  const avisoConteo = !agotado && conteo && (conteo.lleno || conteo.quedan <= QUEDA_POCO) ? conteo : null;
  // El nombre entero para el mouse, o por qué ya no suma.
  const titulo = conteo?.agotado
    ? conteo.aviso
    : alTopeStock
      ? "No hay más disponibles"
      : llenoConteo
        ? conteo?.aviso
        : p.nombre;
  const levantada = !!arrastre?.["data-arrastrando"];
  /**
   * Apretar la fila la puede levantar, salvo sobre la cantidad: el número deja
   * pasar el toque a la fila (suma, ver abajo) y así no la levanta, como el «−»
   * y el «⋯», que cortan el gesto con su propio `onPointerDown`.
   */
  const alApretar = (e: React.PointerEvent) => {
    if (!sobre(cantidadRef.current, e)) arrastre?.onPointerDown(e);
  };

  return (
    <li
      onPointerDown={arrastre ? alApretar : undefined}
      onContextMenu={arrastre?.onContextMenu}
      onDragStart={arrastre?.onDragStart}
      style={arrastre ? estiloDeFila(arrastre.style, agotado ? 0.5 : pausado ? 0.6 : 1) : undefined}
      data-arrastre-id={arrastre?.["data-arrastre-id"]}
      className={[
        "break-inside-avoid border-b last:border-b-0",
        levantada ? FILA_LEVANTADA : "border-borde-soft px-2",
        enCarrito ? "bg-primary-50" : pausado ? "bg-slate-100" : "",
        agotado ? "opacity-50" : "",
        pausado && !agotado ? "opacity-60 grayscale" : "",
      ].join(" ")}
    >
      {/* Una fila de alto fijo: estar en el carrito no le suma un renglón. En
          una lista apretada, una fila que crece al tocarla corre las de abajo y
          el toque siguiente cae en otro producto. Por eso la cantidad va en la
          misma fila y sin «+»: sumar es tocar la fila, que ya lo hace.

          Toda la fila es el botón que suma (la capa de abajo, a todo el ancho);
          el «−» y el «⋯» van encima, con su propio toque. Soltar una fila
          arrastrada no suma ni quita nada (`ignorarClic`). */}
      <div className="relative flex min-h-11 items-center gap-2 py-1">
        <button
          type="button"
          onClick={() => {
            if (!ignorarClic()) onAgregar();
          }}
          disabled={agotado || alTope}
          aria-label={p.nombre}
          title={titulo}
          // Levantada, sin el gris del mouse: taparía el contorno (FILA_LEVANTADA).
          className={`absolute inset-0 rounded-lg transition-colors${levantada ? "" : " enabled:hover:bg-muted/70"}`}
        />
        {/* Chico, para no robarle ancho al nombre: es para reconocerlo de un vistazo. */}
        {conIcono && (
          <span className="pointer-events-none relative">
            <IconoProducto nombre={p.nombre} icono={p.icono} categoria={p.categoria?.nombre} size={24} />
          </span>
        )}
        <span className="pointer-events-none relative min-w-0 flex-1">
          {/* Hasta tres renglones, como la tarjeta, y repartidos parejo: «Arroz
              con leche con dulce de leche – Mediano» entra entero, sin «…». */}
          <span
            className={`line-clamp-3 text-balance text-[13px] leading-snug text-texto ${
              enCarrito ? "font-bold" : "font-semibold"
            }`}
          >
            {p.nombre}
          </span>
          {incluye && <span className="block text-[11px] font-bold leading-snug text-primary-700">{incluye}</span>}
          {(agotado || pausado || quedaPoco || !!avisoConteo) && (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {agotado ? (
                <EstadoFila tono="rojo">Agotado</EstadoFila>
              ) : pausado ? (
                <EstadoFila tono="gris">Pausado</EstadoFila>
              ) : null}
              {quedaPoco && <EstadoFila tono="aviso">{fmtCantidad(p.stockTotal)} disp.</EstadoFila>}
              {avisoConteo && (
                <EstadoFila tono="aviso" etiqueta={avisoConteo.etiqueta}>
                  {fmtCantidad(avisoConteo.libre)} u.
                </EstadoFila>
              )}
            </span>
          )}
        </span>
        {enCarrito && (
          // La cantidad y el «−»: 36 px de alto, menos que la fila, así entrar
          // al carrito no la agranda. El borde es un anillo, que no ocupa lugar.
          // Tocar el número es tocar la fila (suma); sólo el «−» tiene su toque.
          <span
            ref={cantidadRef}
            className="pointer-events-none relative flex h-9 shrink-0 items-center rounded-full bg-white ring-1 ring-primary"
          >
            <button
              type="button"
              onClick={() => {
                if (!ignorarClic()) onQuitar();
              }}
              // Sin esto, apretar el «−» empezaría el arrastre de la fila.
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={cantidad === 1 ? `Quitar ${p.nombre} del pedido` : `Uno menos de ${p.nombre}`}
              // En la última unidad el «−» es tacho, como en la tarjeta.
              className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full ${
                cantidad === 1 ? "text-[#DC2626] hover:bg-[#FEF2F2]" : "text-texto-2 hover:bg-muted"
              }`}
            >
              <Icon name={cantidad === 1 ? "trash" : "minus"} size={15} />
            </button>
            <span className="min-w-5 pr-3 text-center text-sm font-bold tabular-nums text-texto">{fmtNum(cantidad)}</span>
          </span>
        )}
        <span className="pointer-events-none relative shrink-0 whitespace-nowrap text-[13px] font-extrabold tabular-nums text-primary-700">
          {fmtMoney(p.precio)}
        </span>
        {onMenu && (
          <button
            type="button"
            onClick={() => {
              if (!ignorarClic()) onMenu();
            }}
            // Sin esto, apretar el «⋯» empezaría el arrastre de la fila.
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={pausado ? `Reactivar ${p.nombre}` : `Pausar ${p.nombre}`}
            title={pausado ? "Reactivar" : "Pausar en esta sucursal"}
            className="relative -ml-1 flex h-10 w-8 shrink-0 items-center justify-center rounded-lg text-texto-3 hover:bg-muted hover:text-texto"
          >
            <Icon name="more" size={18} />
          </button>
        )}
      </div>
    </li>
  );
}

/** «Agotado», «Pausado», «3 disp.»: el mismo tamaño que el de la tarjeta, sin mayúsculas forzadas. */
function EstadoFila({
  tono,
  etiqueta,
  children,
}: {
  tono: "rojo" | "gris" | "aviso";
  /** Lo que dice entero, para el mouse y el lector de pantalla («Quedan 4 vasos L»). */
  etiqueta?: string;
  children: ReactNode;
}) {
  const colores =
    tono === "rojo" ? "bg-danger-bg text-danger-text" : tono === "aviso" ? "bg-warning-bg text-warning-text" : "bg-slate-200 text-texto-3";
  return (
    <span
      title={etiqueta}
      aria-label={etiqueta}
      className={`inline-flex items-center rounded-md px-1.5 py-px text-[11px] font-bold ${colores}`}
    >
      {children}
    </span>
  );
}
