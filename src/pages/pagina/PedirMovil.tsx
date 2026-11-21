import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Paleta } from "../../lib/pagina/aspecto";
import { coincideBusqueda } from "../../lib/pagina/carta";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import type { TonosSitio } from "../../lib/pagina/sitio";
import type { ItemCatalogoPublico } from "../../lib/pagina/tipos";
import type { PedidoCarta } from "./CartaSitio";
import { FotoItem, VisorCatalogo, detalleItem, type AccionCatalogo } from "./CatalogoPagina";
import { MarcaBamarDev } from "./VistaPagina";

/**
 * El modo pedir en el celular (20-nov, pedido del dueño: «la experiencia
 * mobile»). Se maneja como una app de delivery y no como una página:
 *
 *  · Arriba, fija, la barra del negocio con su color (y la del navegador del
 *    mismo color), el buscador y las categorías.
 *  · La carta entera en secciones, una por categoría. Tocar una categoría
 *    lleva a su sección; al deslizar, se marca la categoría que se está viendo.
 *  · Filas compactas: el nombre, el detalle y el precio a la izquierda; la foto
 *    a la derecha con el «+» encima (con el ítem en el pedido, «− n +»).
 *  · Los toques responden: se achican un poco al apretar, sin el destello azul.
 */

const ICONO_MAS = "M12 5v14M5 12h14";
const ICONO_MENOS = "M5 12h14";
const ICONO_TACHO = "M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12";
const ICONO_LUPA = "M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14Zm5-2 4 4";
const ICONO_INFO = "M12 11v6M12 7.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z";
const ICONO_CERRAR = "M6 6l12 12M18 6 6 18";

/** El grupo de los ítems sin categoría, al final, cuando los demás sí tienen. */
export const SIN_CATEGORIA = "Otros";

const CSS = `.pd-toque{-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-user-select:none;user-select:none;transition:transform .12s ease}
.pd-toque:active{transform:scale(.94)}
.pd-fila{-webkit-tap-highlight-color:transparent}
.pd-fila:active{background:rgba(0,0,0,.035)}
.pd-chips{scrollbar-width:none}.pd-chips::-webkit-scrollbar{display:none}
@media (prefers-reduced-motion:reduce){.pd-toque{transition:none}.pd-toque:active{transform:none}}`;

function Trazo({ d, color, size = 18, grosor = 2.4 }: { d: string; color: string; size?: number; grosor?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export interface Grupo {
  /** El nombre de la categoría (o «Otros»); null si la carta no tiene categorías. */
  titulo: string | null;
  items: ItemCatalogoPublico[];
}

/**
 * La carta en secciones, en el orden de las categorías. Lo que no tiene
 * categoría va al final en «Otros»; si ningún ítem tiene, una sola sección
 * sin título.
 */
export function agruparCarta(items: ItemCatalogoPublico[]): Grupo[] {
  const grupos = new Map<string, ItemCatalogoPublico[]>();
  const sueltos: ItemCatalogoPublico[] = [];
  for (const it of items) {
    const cat = it.categoria?.trim();
    if (!cat) sueltos.push(it);
    else grupos.set(cat, [...(grupos.get(cat) ?? []), it]);
  }
  if (!grupos.size) return sueltos.length ? [{ titulo: null, items: sueltos }] : [];
  const lista: Grupo[] = [...grupos].map(([titulo, its]) => ({ titulo, items: its }));
  if (sueltos.length) lista.push({ titulo: SIN_CATEGORIA, items: sueltos });
  return lista;
}

function sinMovimiento(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

export default function PedirMovil({
  nombre,
  logo,
  items,
  c,
  t,
  pedido,
  accionVisor,
  estiloBotonVisor,
  colorIconoVisor,
  urlPagina,
  franjas,
}: {
  nombre: string;
  logo: string | null;
  items: ItemCatalogoPublico[];
  c: Paleta;
  t: TonosSitio;
  pedido: PedidoCarta;
  accionVisor: AccionCatalogo;
  estiloBotonVisor: CSSProperties;
  colorIconoVisor: string;
  urlPagina: string;
  /** «Pedido en curso» y «no estamos recibiendo pedidos»: van dentro de la barra fija. */
  franjas?: ReactNode;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [activa, setActiva] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [conSombra, setConSombra] = useState(false);
  const [alto, setAlto] = useState(0);
  const barra = useRef<HTMLDivElement>(null);
  const filaChips = useRef<HTMLDivElement>(null);
  const secciones = useRef(new Map<string, HTMLElement>());
  const chips = useRef(new Map<string, HTMLButtonElement>());
  /** Mientras baja sola hasta una sección, el scroll no cambia la categoría marcada. */
  const saltando = useRef<number | null>(null);

  const grupos = useMemo(() => agruparCarta(items.filter((it) => coincideBusqueda(it, busqueda))), [items, busqueda]);
  const recorrido = useMemo(() => grupos.flatMap((g) => g.items), [grupos]);
  const conChips = grupos.length > 1 && grupos.every((g) => g.titulo);
  const marcada = activa && grupos.some((g) => g.titulo === activa) ? activa : (grupos[0]?.titulo ?? null);

  // El alto de la barra fija: a esa distancia del borde quedan las secciones al saltar.
  useLayoutEffect(() => {
    const el = barra.current;
    if (!el) return;
    const medir = () => setAlto(el.offsetHeight);
    medir();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Qué sección se está viendo: la última cuyo título ya pasó por debajo de la barra.
  useEffect(() => {
    let cuadro = 0;
    const leer = () => {
      cuadro = 0;
      setConSombra(window.scrollY > 4);
      if (saltando.current != null) return;
      let actual: string | null = grupos[0]?.titulo ?? null;
      for (const g of grupos) {
        const el = g.titulo ? secciones.current.get(g.titulo) : null;
        if (el && el.getBoundingClientRect().top - alto - 24 <= 0) actual = g.titulo;
      }
      // Al final de la carta la última sección no llega a subir hasta la barra: si se ve el fondo, es ella.
      const alFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (alFondo && window.scrollY > 0 && grupos.length) actual = grupos[grupos.length - 1].titulo;
      setActiva(actual);
    };
    const alScroll = () => {
      if (!cuadro) cuadro = window.requestAnimationFrame(leer);
    };
    window.addEventListener("scroll", alScroll, { passive: true });
    leer();
    return () => {
      window.removeEventListener("scroll", alScroll);
      if (cuadro) window.cancelAnimationFrame(cuadro);
    };
  }, [grupos, alto]);

  // La categoría marcada queda a la vista en la fila (que se desliza de costado).
  useEffect(() => {
    const ch = marcada ? chips.current.get(marcada) : null;
    const fila = filaChips.current;
    if (!ch || !fila) return;
    const izquierda = ch.offsetLeft - (fila.clientWidth - ch.offsetWidth) / 2;
    try {
      fila.scrollTo({ left: Math.max(0, izquierda), behavior: sinMovimiento() ? "auto" : "smooth" });
    } catch {
      fila.scrollLeft = Math.max(0, izquierda);
    }
  }, [marcada]);

  function irA(titulo: string) {
    const el = secciones.current.get(titulo);
    if (!el) return;
    setActiva(titulo);
    if (saltando.current != null) window.clearTimeout(saltando.current);
    saltando.current = window.setTimeout(() => (saltando.current = null), 700);
    const y = el.getBoundingClientRect().top + window.scrollY - alto + 1;
    try {
      window.scrollTo({ top: Math.max(0, y), behavior: sinMovimiento() ? "auto" : "smooth" });
    } catch {
      /* jsdom y navegadores sin scrollTo con opciones: se queda donde está */
    }
  }

  const indice = abierto != null && abierto < recorrido.length ? abierto : null;
  const chip = (activo: boolean): CSSProperties => ({
    flex: "none",
    height: 36,
    padding: "0 14px",
    borderRadius: 999,
    border: "none",
    background: activo ? c.oscuro : "#F1F2F4",
    color: activo ? "#ffffff" : "#374151",
    fontWeight: 700,
    fontSize: 14,
    fontFamily: "inherit",
    cursor: "pointer",
    whiteSpace: "nowrap",
  });

  return (
    <div data-testid="modo-pedir" data-armado="movil" style={{ minHeight: "100dvh", background: "#ffffff", color: "#1F2937", fontFamily: t.familia }}>
      <style>{CSS}</style>
      <div
        ref={barra}
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "#ffffff",
          boxShadow: conSombra ? "0 2px 10px rgba(0,0,0,0.08)" : "none",
          transition: "box-shadow .15s ease",
        }}
      >
        {franjas}
        <header style={{ background: c.oscuro, color: "#ffffff", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 16px", paddingTop: "calc(10px + env(safe-area-inset-top, 0px))", minHeight: 56 }}>
          {logo && <img src={logo} alt="" width={36} height={36} style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", flex: "none", background: "#ffffff" }} />}
          <h1 style={{ margin: 0, flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nombre}</h1>
          <Link
            to={urlPagina}
            aria-label={`Ver la página de ${nombre}`}
            className="pd-toque"
            style={{ width: 40, height: 40, flex: "none", borderRadius: 999, background: "rgba(255,255,255,0.16)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <Trazo d={ICONO_INFO} color="#ffffff" size={20} grosor={2.2} />
          </Link>
        </header>
        <div style={{ padding: "10px 16px 8px" }}>
          <label style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex" }}>
              <Trazo d={ICONO_LUPA} color="#6B7280" size={18} grosor={2} />
            </span>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={`Buscar en ${nombre}`}
              aria-label="Buscar en la carta"
              enterKeyHint="search"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 44,
                borderRadius: 12,
                border: "none",
                background: "#F1F2F4",
                color: "#1F2937",
                padding: busqueda ? "0 44px 0 40px" : "0 12px 0 40px",
                // 16 px: con menos, el iPhone agranda la página al enfocar.
                fontSize: 16,
                fontFamily: "inherit",
                outlineColor: c.oscuro,
              }}
            />
            {busqueda && (
              <button
                type="button"
                aria-label="Borrar la búsqueda"
                className="pd-toque"
                onClick={() => setBusqueda("")}
                style={{ position: "absolute", right: 4, top: 4, width: 36, height: 36, border: "none", borderRadius: 999, background: "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <Trazo d={ICONO_CERRAR} color="#6B7280" size={18} grosor={2.2} />
              </button>
            )}
          </label>
        </div>
        {conChips && (
          <div ref={filaChips} className="pd-chips" role="group" aria-label="Categorías" style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 16px 10px" }}>
            {grupos.map((g) => (
              <button
                key={g.titulo}
                ref={(el) => {
                  if (el) chips.current.set(g.titulo!, el);
                  else chips.current.delete(g.titulo!);
                }}
                type="button"
                className="pd-toque"
                aria-pressed={marcada === g.titulo}
                onClick={() => irA(g.titulo!)}
                style={chip(marcada === g.titulo)}
              >
                {g.titulo}
              </button>
            ))}
          </div>
        )}
      </div>

      <main style={{ paddingBottom: "calc(110px + env(safe-area-inset-bottom, 0px))" }}>
        {!grupos.length && (
          <p style={{ margin: 0, padding: "32px 16px", textAlign: "center", fontSize: 15, color: "#6B7280" }}>
            {busqueda.trim() ? `No encontramos «${busqueda.trim()}».` : "Todavía no hay productos para pedir."}
          </p>
        )}
        {grupos.map((g) => (
          <section
            key={g.titulo ?? "carta"}
            ref={(el) => {
              if (!g.titulo) return;
              if (el) secciones.current.set(g.titulo, el);
              else secciones.current.delete(g.titulo);
            }}
            aria-label={g.titulo ?? "La carta"}
          >
            {g.titulo && <h2 style={{ margin: 0, padding: "20px 16px 4px", fontSize: 19, fontWeight: 800, color: "#111827" }}>{g.titulo}</h2>}
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {g.items.map((it) => (
                <FilaMovil key={it.id} it={it} c={c} t={t} pedido={pedido} onAbrir={() => setAbierto(recorrido.indexOf(it))} />
              ))}
            </ul>
          </section>
        ))}
        <a
          href="https://bamardev.com/?utm_source=pagina&utm_medium=referral&utm_campaign=pedir"
          style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 6, marginTop: 28, fontSize: 12, color: "#9CA3AF", textDecoration: "none" }}
        >
          <MarcaBamarDev />
          Powered by BamarDev
        </a>
      </main>

      {indice != null && (
        <VisorCatalogo
          items={recorrido}
          indice={indice}
          onIndice={setAbierto}
          onCerrar={() => setAbierto(null)}
          c={c}
          familia={t.familia}
          escritorio={false}
          enMarco={false}
          accion={accionVisor}
          estiloBoton={estiloBotonVisor}
          colorIconoBoton={colorIconoVisor}
        />
      )}
    </div>
  );
}

const dosLineas: CSSProperties = { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" };

/** Una fila de la carta: el texto a la izquierda (abre el detalle) y la foto con el «+» a la derecha. */
function FilaMovil({ it, c, t, pedido, onAbrir }: { it: ItemCatalogoPublico; c: Paleta; t: TonosSitio; pedido: PedidoCarta; onAbrir: () => void }) {
  const detalle = detalleItem(it);
  const precio = formatoPrecio(it.precio, it.precioDesde);
  const cantidad = pedido.cantidadDe(it.id);
  const incluye = pedido.incluye?.(it.id) ?? null;
  const agotado = !cantidad && !!pedido.agotado?.(it.id);
  const conImagen = !!it.fotoUrl || !!it.icono;
  const control = <Control it={it} cantidad={cantidad} conToppings={!!incluye} agotado={agotado} c={c} pedido={pedido} sobreFoto={conImagen} />;
  return (
    <li
      data-testid="fila-pedir"
      className="pd-fila"
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 16px", borderBottom: "1px solid #F1F2F4", opacity: agotado ? 0.6 : 1 }}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${it.titulo}${precio ? `, ${precio}` : ""}: ver detalle`}
        onClick={onAbrir}
        style={{ flex: 1, minWidth: 0, padding: 0, margin: 0, border: "none", background: "transparent", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3 }}
      >
        <span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3, color: "#111827", ...dosLineas }}>{it.titulo}</span>
        {detalle && <span style={{ fontSize: 13.5, lineHeight: 1.35, color: "#6B7280", ...dosLineas }}>{detalle}</span>}
        {incluye && (
          <span style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 700, color: c.oscuro, background: c.tinte, borderRadius: 999, padding: "2px 8px", marginTop: 2 }}>{incluye}</span>
        )}
        <span style={{ fontWeight: 800, fontSize: 15.5, color: t.precio, marginTop: 3 }}>{precio ?? "Precio a consultar"}</span>
      </button>
      {conImagen ? (
        <div style={{ position: "relative", width: 96, height: 96, flex: "none" }}>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={onAbrir}
            style={{ position: "absolute", inset: 0, padding: 0, border: "none", borderRadius: 14, overflow: "hidden", background: t.sinFotoFondo, cursor: "pointer", filter: agotado ? "grayscale(1)" : undefined }}
          >
            <FotoItem item={it} fondo={t.sinFotoFondo} color={t.sinFotoTexto} tamano={28} />
          </button>
          <div style={{ position: "absolute", right: -6, bottom: -10 }}>{control}</div>
        </div>
      ) : (
        control
      )}
    </li>
  );
}

/** «+», «− n +» o «Agotado». Un vaso con toppings siempre «+» (cada uno abre la hoja), con cuántos lleva. */
function Control({
  it,
  cantidad,
  conToppings,
  agotado,
  c,
  pedido,
  sobreFoto,
}: {
  it: ItemCatalogoPublico;
  cantidad: number;
  conToppings: boolean;
  agotado: boolean;
  c: Paleta;
  pedido: PedidoCarta;
  sobreFoto: boolean;
}) {
  const sombra = sobreFoto ? "0 2px 8px rgba(0,0,0,0.22)" : "none";
  if (agotado) {
    return (
      <span
        aria-label={`${it.titulo}: agotado`}
        style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 10px", borderRadius: 999, background: "#ffffff", color: "#6B7280", fontWeight: 700, fontSize: 12.5, boxShadow: sobreFoto ? sombra : undefined, border: sobreFoto ? "none" : "1px solid #E5E7EB" }}
      >
        Agotado
      </span>
    );
  }
  if (!cantidad || conToppings) {
    return (
      <button
        type="button"
        className="pd-toque"
        aria-label={`Agregar ${it.titulo} al pedido`}
        onClick={() => pedido.agregar?.(it)}
        style={{ position: "relative", width: 40, height: 40, borderRadius: 999, border: "2px solid #ffffff", background: c.oscuro, boxShadow: sombra, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer", flex: "none" }}
      >
        <Trazo d={ICONO_MAS} color="#ffffff" size={20} grosor={2.6} />
        {conToppings && cantidad > 0 && (
          <span
            data-testid="en-pedido"
            aria-label={`${cantidad} en el pedido`}
            style={{ position: "absolute", top: -8, left: -8, minWidth: 20, height: 20, padding: "0 5px", boxSizing: "border-box", borderRadius: 999, background: "#ffffff", color: c.oscuro, border: `2px solid ${c.oscuro}`, fontSize: 11, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            {cantidad}
          </span>
        )}
      </button>
    );
  }
  const redondo: CSSProperties = { width: 32, height: 32, borderRadius: 999, border: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, cursor: "pointer" };
  return (
    <div
      role="group"
      aria-label={`${it.titulo}: ${cantidad} en el pedido`}
      style={{ display: "inline-flex", alignItems: "center", gap: 2, height: 40, padding: 4, boxSizing: "border-box", borderRadius: 999, background: "#ffffff", boxShadow: sobreFoto ? sombra : "0 0 0 1px #E5E7EB" }}
    >
      <button type="button" className="pd-toque" aria-label={cantidad === 1 ? `Quitar ${it.titulo} del pedido` : `Quitar uno de ${it.titulo}`} onClick={() => pedido.cambiar?.(it.id, -1)} style={{ ...redondo, background: c.tinte }}>
        <Trazo d={cantidad === 1 ? ICONO_TACHO : ICONO_MENOS} color={c.oscuro} size={15} />
      </button>
      <span aria-hidden="true" style={{ minWidth: 20, textAlign: "center", fontWeight: 800, fontSize: 15, color: c.oscuro }}>
        {cantidad}
      </span>
      <button type="button" className="pd-toque" aria-label={`Sumar uno de ${it.titulo}`} onClick={() => pedido.agregar?.(it)} style={{ ...redondo, background: c.oscuro }}>
        <Trazo d={ICONO_MAS} color="#ffffff" size={15} />
      </button>
      <span aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
        {cantidad} en el pedido
      </span>
    </div>
  );
}
