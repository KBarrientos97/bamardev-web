import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import type { Paleta } from "../../lib/pagina/aspecto";
import { categoriasDe } from "../../lib/pagina/carta";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import type { TonosSitio } from "../../lib/pagina/sitio";
import type { ItemCatalogoPublico } from "../../lib/pagina/tipos";
import { SinFoto, VisorCatalogo, detalleItem, type AccionCatalogo } from "./CatalogoPagina";

/**
 * La carta del sitio del Profesional (09-nov, pedido del dueño): en vez del
 * carrusel de a una tarjeta, una lista que se recorre de un vistazo, con las
 * categorías del POS como filtro y un «+» en cada fila para sumar al pedido
 * sin abrir nada. Con el ítem ya en el pedido, el «+» pasa a «− 2 +». Tocar
 * la fila (la foto o el nombre) abre el visor de siempre, con la descripción.
 *
 * Sin pedido (el interruptor apagado) la lista es la misma, sin los botones:
 * así la vista previa del editor y la página dicen lo mismo.
 */

export interface PedidoCarta {
  cantidadDe: (id: number) => number;
  /** Null en la vista previa del editor: el botón se ve pero no suma. */
  agregar: ((item: ItemCatalogoPublico) => void) | null;
  cambiar: ((id: number, delta: number) => void) | null;
}

const ICONO_MAS = "M12 5v14M5 12h14";
const ICONO_MENOS = "M5 12h14";
const ICONO_TACHO = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";

function Trazo({ d, color, size = 18 }: { d: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export default function CartaSitio({
  items,
  titulo,
  selector,
  t,
  c,
  escritorio,
  enMarco,
  radio,
  pedido,
  accionVisor,
  estiloBoton,
  colorIconoBoton,
  colorVacio,
  sucursal = "sucursal",
}: {
  items: ItemCatalogoPublico[];
  /** El título ya dibujado; recibe el id para `aria-labelledby`. */
  titulo: (id: string) => ReactNode;
  selector?: ReactNode;
  t: TonosSitio;
  c: Paleta;
  escritorio: boolean;
  enMarco: boolean;
  radio: CSSProperties["borderRadius"];
  pedido: PedidoCarta | null;
  /** El botón del visor (sumar, reservar o consultar), como en el catálogo de siempre. */
  accionVisor: AccionCatalogo | null;
  estiloBoton: CSSProperties;
  colorIconoBoton: string;
  colorVacio?: string;
  sucursal?: string;
}) {
  const idTitulo = useId();
  const [filtro, setFiltro] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const categorias = useMemo(() => categoriasDe(items), [items]);
  // Con una sola categoría (o ninguna) el filtro no ayuda en nada.
  const conFiltro = categorias.length > 1;
  const elegida = filtro && categorias.includes(filtro) ? filtro : null;
  const vistos = elegida ? items.filter((it) => it.categoria?.trim() === elegida) : items;
  // El visor recorre lo que se ve, no la carta entera.
  const indice = abierto != null && abierto < vistos.length ? abierto : null;

  // «Todo» con categorías: los grupos con su subtítulo, como una carta.
  const grupos: { nombre: string | null; items: ItemCatalogoPublico[] }[] =
    conFiltro && !elegida
      ? [
          ...categorias.map((nombre) => ({ nombre, items: vistos.filter((it) => it.categoria?.trim() === nombre) })),
          { nombre: null, items: vistos.filter((it) => !it.categoria?.trim()) },
        ].filter((g) => g.items.length > 0)
      : [{ nombre: null, items: vistos }];

  const chip = (activo: boolean): CSSProperties => ({
    flex: "none",
    border: `1px solid ${activo ? c.oscuro : (t.borde ?? t.linea)}`,
    background: activo ? c.oscuro : "transparent",
    color: activo ? "#ffffff" : t.texto,
    borderRadius: 999,
    padding: "8px 16px",
    fontSize: 14,
    fontWeight: activo ? 700 : 500,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
    scrollSnapAlign: "start",
  });

  return (
    <section aria-labelledby={idTitulo} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      {titulo(idTitulo)}
      {selector}
      {conFiltro && (
        <div
          role="group"
          aria-label="Categorías"
          data-testid="categorias-carta"
          style={{
            display: "flex",
            gap: 8,
            overflowX: "auto",
            scrollSnapType: "x proximity",
            // Que el último chip no quede pegado al borde al deslizar.
            paddingBottom: 2,
            scrollbarWidth: "none",
            minWidth: 0,
          }}
        >
          <button type="button" aria-pressed={!elegida} onClick={() => setFiltro(null)} style={chip(!elegida)}>
            Todo
          </button>
          {categorias.map((cat) => (
            <button key={cat} type="button" aria-pressed={elegida === cat} onClick={() => setFiltro(cat)} style={chip(elegida === cat)}>
              {cat}
            </button>
          ))}
        </div>
      )}
      {vistos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 14, color: colorVacio ?? t.texto3 }}>No hay productos disponibles en esta {sucursal}.</p>
      ) : (
        grupos.map((g) => (
          <div key={g.nombre ?? "-"} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {g.nombre && (
              <h3 style={{ margin: "6px 0 0", fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: t.texto3 }}>
                {g.nombre}
              </h3>
            )}
            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gridTemplateColumns: escritorio ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
                gap: 10,
              }}
            >
              {g.items.map((it) => (
                <FilaCarta
                  key={it.id}
                  it={it}
                  t={t}
                  c={c}
                  radio={radio}
                  escritorio={escritorio}
                  pedido={pedido}
                  onAbrir={() => setAbierto(vistos.indexOf(it))}
                />
              ))}
            </ul>
          </div>
        ))
      )}
      {indice != null && (
        <VisorCatalogo
          items={vistos}
          indice={indice}
          onIndice={setAbierto}
          onCerrar={() => setAbierto(null)}
          c={c}
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

function FilaCarta({
  it,
  t,
  c,
  radio,
  escritorio,
  pedido,
  onAbrir,
}: {
  it: ItemCatalogoPublico;
  t: TonosSitio;
  c: Paleta;
  radio: CSSProperties["borderRadius"];
  escritorio: boolean;
  pedido: PedidoCarta | null;
  onAbrir: () => void;
}) {
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const foto = urlDeImagen(it.fotoUrl);
  const detalle = detalleItem(it);
  const cantidad = pedido?.cantidadDe(it.id) ?? 0;
  const lado = escritorio ? 84 : 76;
  return (
    <li
      data-testid="fila-carta"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: 10,
        background: t.tarjeta,
        border: `${cantidad ? 2 : 1}px solid ${cantidad ? c.acento : (t.borde ?? t.linea)}`,
        // El borde más grueso del elegido no corre el contenido.
        margin: cantidad ? 0 : 1,
        boxShadow: t.sombra ?? undefined,
        borderRadius: radio,
        minWidth: 0,
      }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${it.titulo}${precio ? `, ${precio}` : ""}: ver detalle`}
        onClick={onAbrir}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          minWidth: 0,
          padding: 0,
          margin: 0,
          border: "none",
          background: "transparent",
          textAlign: "left",
          font: "inherit",
          color: t.textoTarjeta,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            position: "relative",
            flex: "none",
            width: lado,
            height: lado,
            borderRadius: 12,
            overflow: "hidden",
            background: t.sinFotoFondo,
          }}
        >
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
            <SinFoto item={it} fondo={t.sinFotoFondo} color={t.sinFotoTexto} tamano={28} />
          )}
        </span>
        <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 15,
              lineHeight: 1.3,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {it.titulo}
          </span>
          {detalle && (
            <span style={{ fontSize: 13, color: t.texto3Tarjeta, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{detalle}</span>
          )}
          <span style={{ fontSize: 15, fontWeight: 800, color: t.precio }}>{precio ?? "Precio a consultar"}</span>
        </span>
      </button>
      {pedido && <Cantidad it={it} cantidad={cantidad} pedido={pedido} c={c} />}
    </li>
  );
}

/** El «+» de la fila o, con el ítem ya en el pedido, «− n +». */
function Cantidad({ it, cantidad, pedido, c }: { it: ItemCatalogoPublico; cantidad: number; pedido: PedidoCarta; c: Paleta }) {
  const redondo: CSSProperties = {
    width: 40,
    height: 40,
    flex: "none",
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    cursor: pedido.agregar ? "pointer" : "default",
  };
  if (!cantidad) {
    return (
      <button
        type="button"
        aria-label={`Agregar ${it.titulo} al pedido`}
        onClick={() => pedido.agregar?.(it)}
        style={{ ...redondo, border: "none", background: c.oscuro, boxShadow: "0 2px 6px rgba(0,0,0,0.18)" }}
      >
        <Trazo d={ICONO_MAS} color="#ffffff" size={20} />
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={`${it.titulo}: ${cantidad} en el pedido`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, flex: "none", background: c.tinte, borderRadius: 999, padding: 3 }}
    >
      <button
        type="button"
        aria-label={cantidad === 1 ? `Quitar ${it.titulo} del pedido` : `Quitar uno de ${it.titulo}`}
        onClick={() => pedido.cambiar?.(it.id, -1)}
        style={{ ...redondo, width: 34, height: 34, border: "none", background: "#ffffff" }}
      >
        <Trazo d={cantidad === 1 ? ICONO_TACHO : ICONO_MENOS} color={c.oscuro} size={16} />
      </button>
      <span aria-hidden="true" style={{ minWidth: 20, textAlign: "center", fontWeight: 800, fontSize: 15, color: c.oscuro }}>
        {cantidad}
      </span>
      <button
        type="button"
        aria-label={`Sumar uno de ${it.titulo}`}
        onClick={() => pedido.agregar?.(it)}
        style={{ ...redondo, width: 34, height: 34, border: "none", background: c.oscuro }}
      >
        <Trazo d={ICONO_MAS} color="#ffffff" size={16} />
      </button>
      {/* Para el lector de pantalla: el número cambia sin mover el foco. */}
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {cantidad} en el pedido
      </span>
    </div>
  );
}
