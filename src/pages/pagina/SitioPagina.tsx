import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import { ICONO_RED, ICONO_RESERVAR, iconoDe, mezcla, type Paleta } from "../../lib/pagina/aspecto";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import { estiloLetra, type Letra } from "../../lib/pagina/estilos";
import { anclaDe, destacadoVigente, textoMenu, textoRestante, videoDe, type TonosSitio } from "../../lib/pagina/sitio";
import type { BloquePublico, DestacadoDia, EnlacePublico, FotoPublica, PaginaPublica, SitioPublico } from "../../lib/pagina/tipos";
import { useCoincideMedia } from "../../lib/useCoincideMedia";
import { EstadoSucursal } from "./HorarioSucursal";
import { Enlace, LogoNegocio, Trazo } from "./piezasPagina";

/**
 * El sitio del plan Profesional (PLAN-PAGINA-PRO M1): la misma página del
 * negocio armada por bloques, con la plantilla de su rubro (diseños del
 * lienzo «Sitio Pro por rubro», 08-nov). Sólo cuando la página trae `sitio`;
 * sin él, VistaPagina sigue con su armado de siempre.
 *
 * Reusa lo que la página ya tiene (catálogo con su pedido, mapa y tarjetas de
 * sucursal, anuncio, botones, pie) y suma los bloques nuevos. Los celulares de
 * los clientes son baratos: sólo se anima opacidad, nada se mueve con
 * "reducir movimiento", y las fotos bajan perezosas salvo la primera.
 */

export interface PiezasSitio {
  p: PaginaPublica;
  sitio: SitioPublico;
  c: Paleta;
  t: TonosSitio;
  letra: Letra;
  escritorio: boolean;
  /** En el marco del editor: la portada más baja, sin `main` ni `h1` propios. */
  enCaja: boolean;
  chico: boolean;
  logo: string | null;
  /** La portada de siempre: va si la portada del sitio no tiene fotos. */
  portada: string | null;
  prioridad: boolean;
  Titulo: "h1" | "h2";
  Principal: "main" | "section";
  etiquetaPrincipal?: string;
  raiz: RefObject<HTMLDivElement | null>;
  testId: string;
  anuncio: ReactNode;
  /** Los botones del dueño (y "Regalá una gift card"), ya dibujados. */
  botones: ReactNode[];
  /** El catálogo (y los cursos) con el título que le da el bloque. */
  catalogo: (titulo: string | null) => ReactNode;
  mapa: ReactNode;
  tarjetasSucursal: ReactNode[];
  tituloSucursales: string;
  pie: ReactNode;
  urlReservar: string;
  /** El botón lleno de la página (forma y color de Mi página). */
  botonLleno: CSSProperties;
  colorIconoLleno: string;
  whatsapp: EnlacePublico | null;
  clic: (e: EnlacePublico) => (ev?: { preventDefault?: () => void }) => void;
  /** Hay carrito («Pedí por WhatsApp»): su barra va abajo, a todo el ancho. */
  conPedido: boolean;
  /** El pedido ya tiene algo: la barra está a la vista y el WhatsApp flotante se esconde. */
  hayPedido?: boolean;
}

const ICONO_PLAY = "M8 5v14l11-7z";
const ICONO_ESTRELLA = "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";
const ICONO_MENU = "M4 7h16M4 12h16M4 17h16";
const ICONO_CERRAR = "M6 6l12 12M18 6 6 18";

/** "con reducir movimiento" del sistema: el carrusel queda quieto. */
function useMenosMovimiento(): boolean {
  return useCoincideMedia("(prefers-reduced-motion: reduce)");
}

/** El ancho de la columna de contenido: el de los diseños. */
const ANCHO = 1180;

function Contenedor({ escritorio, children, style }: { escritorio: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        maxWidth: escritorio ? ANCHO : 560,
        margin: "0 auto",
        padding: escritorio ? "0 24px" : "0 16px",
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function TituloBloque({ x, id, children }: { x: PiezasSitio; id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        ...estiloLetra(x.letra, x.escritorio ? 44 : 30),
        color: x.t.titulo,
        margin: "0 0 14px",
        lineHeight: 1.05,
      }}
    >
      {children}
    </h2>
  );
}

/** Una franja del sitio: el fondo a todo el ancho y el contenido centrado. */
function Franja({
  x,
  id,
  alterna,
  etiqueta,
  children,
}: {
  x: PiezasSitio;
  id?: string;
  alterna?: boolean;
  etiqueta?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id || undefined}
      aria-labelledby={etiqueta}
      style={{
        background: alterna ? x.t.alterno : undefined,
        padding: x.escritorio ? "48px 0" : "24px 0",
        // El menú fijo de arriba no tapa el título al saltar con un ancla.
        scrollMarginTop: 72,
      }}
    >
      <Contenedor escritorio={x.escritorio}>{children}</Contenedor>
    </section>
  );
}

// ── Encabezado y menú ─────────────────────────────────────────────────────

function Encabezado({ x, accion }: { x: PiezasSitio; accion: ReactNode }) {
  const { p, t, sitio } = x;
  const [abierto, setAbierto] = useState(false);
  const idMenu = useId();
  const secciones = sitio.bloques
    .map((b) => ({ ancla: anclaDe(b.tipo), texto: textoMenu(b.tipo, sitio.plantilla), b }))
    .filter((s) => s.ancla && seDibuja(x, s.b));
  const principal = p.sucursales[0];
  const nombre = (
    <x.Titulo
      style={{
        ...estiloLetra(x.letra, x.escritorio ? 26 : 21),
        margin: 0,
        lineHeight: 1.05,
        color: t.texto,
        overflowWrap: "anywhere",
      }}
    >
      {p.nombre}
    </x.Titulo>
  );
  const enlaces = secciones.map((s) => (
    <a
      key={s.ancla}
      href={`#${s.ancla}`}
      onClick={() => setAbierto(false)}
      style={{
        color: t.texto,
        textDecoration: "none",
        fontWeight: 700,
        fontSize: 15,
        minHeight: 44,
        display: "flex",
        alignItems: "center",
      }}
    >
      {s.texto}
    </a>
  ));
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 20,
        background: t.fondo,
        borderBottom: `1px solid ${t.borde ?? t.linea}`,
      }}
    >
      <Contenedor
        escritorio={x.escritorio}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, minHeight: 68 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <LogoNegocio
            logo={x.logo}
            p={p}
            lado={x.escritorio ? 44 : 40}
            radio={x.sitio.plantilla === "COMERCIO" ? 12 : 999}
            fondoIniciales={x.c.acento}
            letra={x.letra}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            {nombre}
            {principal?.horarioSemanal?.length ? <EstadoSucursal tramos={principal.horarioSemanal} t={t} testId="estado-sitio" /> : null}
          </div>
        </div>
        {x.escritorio ? (
          <nav aria-label="Secciones" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 22 }}>
            {enlaces}
            {accion}
          </nav>
        ) : secciones.length > 0 ? (
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idMenu}
            aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setAbierto((v) => !v)}
            style={{
              width: 44,
              height: 44,
              flex: "none",
              borderRadius: 12,
              border: `1px solid ${t.borde ?? t.linea}`,
              background: t.tarjeta,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Trazo d={abierto ? ICONO_CERRAR : ICONO_MENU} color={t.textoTarjeta} ancho={2} />
          </button>
        ) : null}
      </Contenedor>
      {!x.escritorio && abierto && (
        <nav id={idMenu} aria-label="Secciones" style={{ borderTop: `1px solid ${t.borde ?? t.linea}` }}>
          <Contenedor escritorio={false} style={{ display: "flex", flexDirection: "column", padding: "6px 16px 10px" }}>
            {enlaces}
          </Contenedor>
        </nav>
      )}
    </header>
  );
}

// ── Portada ───────────────────────────────────────────────────────────────

/** Cada cuánto pasa la foto del carrusel. Lento: es ambiente, no una vidriera. */
export const PASO_PORTADA_MS = 5000;

/**
 * Hasta 5 fotos que se funden una en otra. Sólo cambia la opacidad (lo barato
 * en un celular viejo). Con "reducir movimiento", o pausado, queda la primera.
 */
function Carrusel({ x, fotos, radio }: { x: PiezasSitio; fotos: FotoPublica[]; radio: number }) {
  const quieto = useMenosMovimiento();
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const varias = fotos.length > 1;
  useEffect(() => {
    if (!varias || quieto || pausa) return;
    const id = setInterval(() => setI((v) => (v + 1) % fotos.length), PASO_PORTADA_MS);
    return () => clearInterval(id);
  }, [varias, quieto, pausa, fotos.length]);
  const actual = i < fotos.length ? i : 0;
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: radio, overflow: "hidden" }}>
      {fotos.map((f, n) => (
        <img
          key={f.url}
          src={urlDeImagen(f.url) ?? undefined}
          alt={n === 0 ? (f.leyenda ?? `Foto de ${x.p.nombre}`) : (f.leyenda ?? "")}
          aria-hidden={n !== actual || undefined}
          loading={n === 0 ? "eager" : "lazy"}
          fetchPriority={n === 0 && x.prioridad ? "high" : undefined}
          decoding="async"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: n === actual ? 1 : 0,
            transition: quieto ? undefined : "opacity 900ms ease",
          }}
        />
      ))}
      {varias && (
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 6, zIndex: 2 }}>
          <span aria-hidden="true" style={{ display: "flex", gap: 5 }}>
            {fotos.map((f, n) => (
              <span
                key={f.url}
                style={{
                  width: n === actual ? 18 : 8,
                  height: 4,
                  borderRadius: 2,
                  background: n === actual ? "#ffffff" : "rgba(255,255,255,0.55)",
                }}
              />
            ))}
          </span>
          {!quieto && (
            <button
              type="button"
              onClick={() => setPausa((v) => !v)}
              aria-label={pausa ? "Seguir pasando las fotos" : "Pausar las fotos"}
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                border: "none",
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Trazo d={pausa ? ICONO_PLAY : "M9 6v12M15 6v12"} color="#ffffff" size={14} ancho={2.4} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Portada({
  x,
  b,
  acciones,
}: {
  x: PiezasSitio;
  b: Extract<BloquePublico, { tipo: "PORTADA" }>;
  acciones: ReactNode;
}) {
  const { p, c, escritorio } = x;
  const fotos: FotoPublica[] = b.fotos.length ? b.fotos : x.portada ? [{ url: x.portada, leyenda: null }] : [];
  const titulo = b.titulo || p.nombre;
  const subtitulo = b.subtitulo || p.descripcion;
  const fondoSinFoto = `linear-gradient(135deg, ${c.oscuro}, ${c.acento})`;
  const letraTitulo: CSSProperties = { ...estiloLetra(x.letra, escritorio ? 64 : x.chico ? 34 : 42), lineHeight: 1.02, margin: 0 };

  if (escritorio) {
    return (
      <section aria-label="Portada" style={{ padding: "40px 0" }}>
        <Contenedor escritorio style={{ display: "flex", flexWrap: "wrap", gap: 40, alignItems: "center" }}>
          <div style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>
            {p.rubro && (
              <span style={{ fontWeight: 700, color: x.t.precio, letterSpacing: "0.12em", fontSize: 13, textTransform: "uppercase" }}>
                {p.rubro}
              </span>
            )}
            <p style={{ ...letraTitulo, color: x.t.texto }}>{titulo}</p>
            {subtitulo && <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: x.t.texto2, maxWidth: 500 }}>{subtitulo}</p>}
            {acciones}
          </div>
          <div
            style={{
              flex: "1 1 440px",
              minWidth: 0,
              height: 440,
              position: "relative",
              borderRadius: 28,
              background: fotos.length ? x.t.alterno : fondoSinFoto,
            }}
          >
            {fotos.length > 0 && <Carrusel x={x} fotos={fotos} radio={28} />}
          </div>
        </Contenedor>
      </section>
    );
  }
  return (
    <section
      aria-label="Portada"
      style={{
        position: "relative",
        minHeight: x.chico ? 300 : 400,
        background: fotos.length ? "#1F2937" : fondoSinFoto,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      {fotos.length > 0 && <Carrusel x={x} fotos={fotos} radio={0} />}
      {/* La capa oscura de abajo: el texto blanco siempre se lee sobre la foto. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.7))" }}
      />
      <Contenedor escritorio={false} style={{ position: "relative", padding: "24px 16px", width: "100%" }}>
        <p style={{ ...letraTitulo, color: "#ffffff" }}>{titulo}</p>
        {subtitulo && <p style={{ margin: "10px 0 18px", color: "#F3F4F6", fontSize: 15, lineHeight: 1.45 }}>{subtitulo}</p>}
        {acciones}
      </Contenedor>
    </section>
  );
}

// ── Destacado del día ─────────────────────────────────────────────────────

/** "11:02", la hora de Bolivia en que se publicó. */
function hora(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/La_Paz" });
}

function Destacado({ x, d }: { x: PiezasSitio; d: DestacadoDia }) {
  const { t, c } = x;
  const publicado = hora(d.publicadoEn);
  const restante = textoRestante(d.restante);
  const precioGrande: CSSProperties = { ...estiloLetra(x.letra, 26), color: t.precio, lineHeight: 1 };
  return (
    <Franja x={x} etiqueta="titulo-destacado">
      <div
        style={{
          borderRadius: 18,
          background: t.tarjeta,
          border: `2px solid ${c.acento}`,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          color: t.textoTarjeta,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h2
            id="titulo-destacado"
            style={{
              margin: 0,
              background: c.acento,
              color: "#ffffff",
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "5px 10px",
              borderRadius: 999,
            }}
          >
            {d.etiqueta}
          </h2>
          {publicado && <span style={{ fontSize: 12, color: t.texto3Tarjeta }}>Publicado a las {publicado}</span>}
        </div>
        {d.items.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 12, gridTemplateColumns: x.escritorio ? "repeat(2, minmax(0, 1fr))" : "1fr" }}>
            {d.items.map((it, n) => {
              const precio = formatoPrecio(it.precio);
              const foto = urlDeImagen(it.fotoUrl);
              return (
                <li key={`${it.titulo}-${n}`} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {foto ? (
                    <img
                      src={foto}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ width: 76, height: 76, borderRadius: 14, objectFit: "cover", flex: "none" }}
                    />
                  ) : null}
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                    <strong style={{ fontSize: 17, overflowWrap: "anywhere" }}>{it.titulo}</strong>
                    {precio && <span style={precioGrande}>{precio}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {d.turnos && d.turnos.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {d.turnos.map((tu, n) => (
              <a
                key={`${tu.hora}-${n}`}
                href={x.p.reservar ? x.urlReservar : undefined}
                style={{
                  minHeight: 44,
                  padding: "0 14px",
                  borderRadius: 12,
                  border: `1px solid ${t.borde ?? t.linea}`,
                  color: t.textoTarjeta,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {tu.hora}
                {tu.profesional && <span style={{ fontWeight: 500, color: t.texto2Tarjeta }}>· {tu.profesional}</span>}
              </a>
            ))}
          </div>
        )}
        {(d.texto || restante || d.descuentoPct) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 14 }}>
            {d.texto && <span style={{ color: t.texto2Tarjeta, flex: "1 1 200px" }}>{d.texto}</span>}
            {d.descuentoPct ? (
              <span style={{ fontWeight: 800, color: t.precio }}>{d.descuentoPct} % de descuento</span>
            ) : null}
            {restante && <span style={{ fontWeight: 800, color: t.precio }}>{restante}</span>}
          </div>
        )}
      </div>
    </Franja>
  );
}

// ── Quiénes somos ─────────────────────────────────────────────────────────

function Quienes({ x, b }: { x: PiezasSitio; b: Extract<BloquePublico, { tipo: "QUIENES" }> }) {
  const { t, c } = x;
  const parrafos = (b.texto ?? "").split(/\n+/).filter((l) => l.trim());
  const foto = b.foto ? urlDeImagen(b.foto.url) : null;
  const texto = (
    <div style={{ flex: "1 1 360px", minWidth: 0 }}>
      {b.desde && (
        <span style={{ display: "block", fontSize: 13, fontWeight: 700, letterSpacing: "0.12em", color: t.precio, marginBottom: 6 }}>
          DESDE {b.desde}
        </span>
      )}
      <TituloBloque x={x} id="titulo-nosotros">
        {b.titulo || "Quiénes somos"}
      </TituloBloque>
      {parrafos.map((l, n) => (
        <p key={n} style={{ margin: "0 0 12px", fontSize: x.escritorio ? 17 : 15, lineHeight: 1.6, color: t.texto2 }}>
          {l}
        </p>
      ))}
      {b.datos.length > 0 && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${b.datos.length}, minmax(0, 1fr))`,
            gap: 8,
            margin: "16px 0 0",
          }}
        >
          {b.datos.map((d, n) => (
            <div
              key={n}
              style={{
                background: x.sitio.plantilla === "BELLEZA" ? t.tarjeta : c.tinte,
                borderRadius: 14,
                padding: "12px 8px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column-reverse",
              }}
            >
              <dt style={{ fontSize: 12.5, color: x.sitio.plantilla === "BELLEZA" ? t.texto2Tarjeta : "#374151" }}>{d.etiqueta}</dt>
              <dd style={{ margin: 0, ...estiloLetra(x.letra, 26), color: x.sitio.plantilla === "BELLEZA" ? t.precio : c.oscuro, lineHeight: 1.1, overflowWrap: "anywhere" }}>
                {d.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
  return (
    <Franja x={x} id="nosotros" alterna etiqueta="titulo-nosotros">
      <div style={{ display: "flex", flexWrap: "wrap", gap: x.escritorio ? 40 : 18, alignItems: "center" }}>
        {texto}
        {foto && (
          <img
            src={foto}
            alt={b.foto?.leyenda ?? ""}
            loading="lazy"
            decoding="async"
            style={{
              flex: "1 1 320px",
              minWidth: 0,
              width: "100%",
              maxWidth: x.escritorio ? 520 : undefined,
              aspectRatio: "4 / 3",
              objectFit: "cover",
              borderRadius: 20,
            }}
          />
        )}
      </div>
    </Franja>
  );
}

// ── Galería ───────────────────────────────────────────────────────────────

function VisorGaleria({
  fotos,
  inicio,
  onCerrar,
}: {
  fotos: FotoPublica[];
  inicio: number;
  onCerrar: () => void;
}) {
  const [i, setI] = useState(inicio);
  const cerrar = useRef<HTMLButtonElement>(null);
  const n = fotos.length;
  const f = fotos[i] ?? fotos[0];
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    cerrar.current?.focus();
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCerrar();
      if (ev.key === "ArrowRight") setI((v) => (v + 1) % n);
      if (ev.key === "ArrowLeft") setI((v) => (v - 1 + n) % n);
    };
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("keydown", tecla);
      anterior?.focus?.();
    };
  }, [n, onCerrar]);
  const flecha = (d: string, etiqueta: string, alClic: () => void, lado: "left" | "right"): ReactNode => (
    <button
      type="button"
      aria-label={etiqueta}
      onClick={alClic}
      style={{
        position: "absolute",
        top: "50%",
        [lado]: 8,
        transform: "translateY(-50%)",
        width: 44,
        height: 44,
        borderRadius: 999,
        border: "none",
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
      }}
    >
      <Trazo d={d} color="#ffffff" ancho={2.2} />
    </button>
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${i + 1} de ${n}`}
      onClick={(ev) => ev.target === ev.currentTarget && onCerrar()}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(0,0,0,0.88)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <button
        ref={cerrar}
        type="button"
        aria-label="Cerrar"
        onClick={onCerrar}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          width: 44,
          height: 44,
          borderRadius: 999,
          border: "none",
          background: "rgba(255,255,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <Trazo d={ICONO_CERRAR} color="#ffffff" ancho={2.2} />
      </button>
      <div style={{ position: "relative", maxWidth: 960, width: "100%", display: "flex", justifyContent: "center" }}>
        <img
          src={urlDeImagen(f.url) ?? undefined}
          alt={f.leyenda ?? `Foto ${i + 1}`}
          style={{ maxWidth: "100%", maxHeight: "78dvh", objectFit: "contain", borderRadius: 12 }}
        />
        {n > 1 && flecha("m15 6-6 6 6 6", "Foto anterior", () => setI((v) => (v - 1 + n) % n), "left")}
        {n > 1 && flecha("m9 6 6 6-6 6", "Foto siguiente", () => setI((v) => (v + 1) % n), "right")}
      </div>
      <p style={{ color: "#F3F4F6", fontSize: 14, margin: "12px 0 0", textAlign: "center" }}>
        {f.leyenda ? `${f.leyenda} · ` : ""}
        {i + 1} / {n}
      </p>
    </div>
  );
}

function Galeria({ x, b }: { x: PiezasSitio; b: Extract<BloquePublico, { tipo: "GALERIA" }> }) {
  const [abierta, setAbierta] = useState<number | null>(null);
  const columnas = x.escritorio ? 4 : 2;
  return (
    <Franja x={x} id="galeria" etiqueta="titulo-galeria">
      <TituloBloque x={x} id="titulo-galeria">
        {b.titulo || "Galería"}
      </TituloBloque>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {b.fotos.map((f, n) => (
          <li key={f.url}>
            <button
              type="button"
              onClick={() => setAbierta(n)}
              aria-label={f.leyenda ? `Ver foto: ${f.leyenda}` : `Ver foto ${n + 1}`}
              style={{
                display: "block",
                width: "100%",
                padding: 0,
                border: "none",
                background: x.t.sinFotoFondo,
                borderRadius: 14,
                overflow: "hidden",
                cursor: "zoom-in",
                position: "relative",
                aspectRatio: "1 / 1",
              }}
            >
              <img
                src={urlDeImagen(f.url) ?? undefined}
                alt=""
                loading="lazy"
                decoding="async"
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              {f.leyenda && (
                <span
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: "18px 8px 6px",
                    fontSize: 12,
                    color: "#ffffff",
                    textAlign: "left",
                    background: "linear-gradient(to bottom, rgba(0,0,0,0), rgba(0,0,0,0.6))",
                  }}
                >
                  {f.leyenda}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {abierta !== null && <VisorGaleria fotos={b.fotos} inicio={abierta} onCerrar={() => setAbierta(null)} />}
    </Franja>
  );
}

// ── Preguntas ─────────────────────────────────────────────────────────────

function Pregunta({ x, pregunta, respuesta }: { x: PiezasSitio; pregunta: string; respuesta: string }) {
  const [abierta, setAbierta] = useState(false);
  const id = useId();
  const { t } = x;
  return (
    <div style={{ background: t.tarjeta, border: `1px solid ${t.borde ?? t.linea}`, borderRadius: 14 }}>
      <h3 style={{ margin: 0 }}>
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={`${id}-r`}
          id={`${id}-p`}
          onClick={() => setAbierta((v) => !v)}
          style={{
            width: "100%",
            minHeight: 52,
            textAlign: "left",
            padding: "12px 14px",
            border: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 700,
            color: t.textoTarjeta,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            cursor: "pointer",
          }}
        >
          {pregunta}
          <span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, color: t.precio, flex: "none" }}>
            {abierta ? "−" : "+"}
          </span>
        </button>
      </h3>
      <div
        id={`${id}-r`}
        role="region"
        aria-labelledby={`${id}-p`}
        hidden={!abierta}
        style={{ padding: "0 14px 14px", fontSize: 14.5, lineHeight: 1.5, color: t.texto2Tarjeta, whiteSpace: "pre-line" }}
      >
        {respuesta}
      </div>
    </div>
  );
}

function Preguntas({ x, b }: { x: PiezasSitio; b: Extract<BloquePublico, { tipo: "PREGUNTAS" }> }) {
  return (
    <Franja x={x} id="preguntas" etiqueta="titulo-preguntas">
      <TituloBloque x={x} id="titulo-preguntas">
        {b.titulo || "Preguntas frecuentes"}
      </TituloBloque>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 820 }}>
        {b.items.map((it, n) => (
          <Pregunta key={n} x={x} pregunta={it.pregunta} respuesta={it.respuesta} />
        ))}
      </div>
    </Franja>
  );
}

// ── Reseñas y video ───────────────────────────────────────────────────────

function Resenas({ x, url }: { x: PiezasSitio; url: string }) {
  return (
    <Franja x={x} etiqueta="titulo-resenas">
      <div
        style={{
          borderRadius: 18,
          background: x.t.pie,
          color: "#ffffff",
          padding: 18,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ flex: "1 1 220px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span aria-hidden="true" style={{ display: "flex", gap: 2 }}>
            {[0, 1, 2, 3, 4].map((n) => (
              <svg key={n} width={18} height={18} viewBox="0 0 24 24" fill="#F2B544" aria-hidden="true">
                <path d={ICONO_ESTRELLA} />
              </svg>
            ))}
          </span>
          <h2 id="titulo-resenas" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>
            ¿Te gustó? Contalo en Google
          </h2>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 46,
            padding: "0 18px",
            borderRadius: 12,
            background: "#ffffff",
            color: "#1F2937",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 800,
            textDecoration: "none",
            flex: x.escritorio ? "none" : "1 1 100%",
          }}
        >
          Dejá tu reseña en Google
        </a>
      </div>
    </Franja>
  );
}

/**
 * El video con "fachada": una imagen con el botón de play, y recién al tocar
 * se carga el reproductor (pesa cientos de KB y pone cookies). Sin miniatura
 * (TikTok, Facebook), un botón que abre el video en su red.
 */
function Video({ x, b }: { x: PiezasSitio; b: Extract<BloquePublico, { tipo: "VIDEO" }> }) {
  const [reproduciendo, setReproduciendo] = useState(false);
  const v = videoDe(b.url);
  const { t, c } = x;
  if (!v) return null;
  const titulo = b.titulo || "Video";
  return (
    <Franja x={x} id="video" alterna etiqueta="titulo-video">
      <TituloBloque x={x} id="titulo-video">
        {titulo}
      </TituloBloque>
      {v.embebido && v.miniatura ? (
        <div style={{ position: "relative", aspectRatio: "16 / 9", borderRadius: 18, overflow: "hidden", background: "#000", maxWidth: 880 }}>
          {reproduciendo ? (
            <iframe
              src={v.embebido}
              title={titulo}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReproduciendo(true)}
              aria-label={`Ver el video: ${titulo}`}
              style={{ position: "absolute", inset: 0, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
            >
              <img src={v.miniatura} alt="" loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 68,
                  height: 68,
                  borderRadius: 999,
                  background: c.acento,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
                }}
              >
                <svg width={30} height={30} viewBox="0 0 24 24" fill="#ffffff" aria-hidden="true">
                  <path d={ICONO_PLAY} />
                </svg>
              </span>
            </button>
          )}
        </div>
      ) : (
        <a
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            minHeight: 52,
            padding: "0 20px",
            borderRadius: 14,
            background: t.tarjeta,
            border: `1px solid ${t.borde ?? t.linea}`,
            color: t.textoTarjeta,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill={t.precio} aria-hidden="true">
            <path d={ICONO_PLAY} />
          </svg>
          Ver el video en {v.red}
        </a>
      )}
    </Franja>
  );
}

// ── Armado ────────────────────────────────────────────────────────────────

/** ¿El bloque dibuja algo? (el menú no ofrece un ancla a un bloque que no está). */
function seDibuja(x: PiezasSitio, b: BloquePublico): boolean {
  switch (b.tipo) {
    case "CATALOGO":
      return !!x.catalogo(null);
    case "UBICACION":
      return x.p.sucursales.length > 0;
    case "DESTACADO":
      return destacadoVigente(x.p.destacadoDia);
    case "VIDEO":
      return !!videoDe(b.url);
    default:
      return true;
  }
}

export default function SitioPagina(x: PiezasSitio) {
  const { p, t, c, sitio, escritorio } = x;
  const plantilla = sitio.plantilla;
  const belleza = plantilla === "BELLEZA";
  const tieneUbicacion = sitio.bloques.some((b) => b.tipo === "UBICACION") && p.sucursales.length > 0;
  const tieneCatalogo = sitio.bloques.some((b) => b.tipo === "CATALOGO" && seDibuja(x, b));
  const lleno: CSSProperties = {
    ...x.botonLleno,
    minHeight: 50,
    padding: "0 22px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    fontSize: 16,
    fontWeight: 800,
    textDecoration: "none",
    boxSizing: "border-box",
  };
  const claro: CSSProperties = {
    ...lleno,
    background: "#ffffff",
    color: "#1F2937",
    border: `1px solid ${mezcla(c.acento, "#ffffff", 0.7)}`,
    boxShadow: "none",
  };

  // La acción principal de la plantilla: reservar en belleza (o si la página
  // reserva), ver la carta en los demás; si no hay, el WhatsApp.
  const reservar = p.reservar ? (
    <a href={x.urlReservar} style={lleno}>
      <Trazo d={ICONO_RESERVAR} color={x.colorIconoLleno} ancho={2} size={18} />
      {belleza ? "Reservá tu turno" : "Reservar"}
    </a>
  ) : null;
  const verCatalogo = tieneCatalogo ? (
    <a href="#catalogo" style={lleno}>
      {plantilla === "GASTRONOMIA" ? "Ver la carta" : belleza ? "Ver los servicios" : "Ver los productos"}
    </a>
  ) : null;
  const wa = x.whatsapp;
  const accionWhatsapp = (estilo: CSSProperties, texto = "WhatsApp") =>
    wa ? (
      <Enlace href={wa.url} onClick={x.clic(wa)} style={estilo}>
        <Trazo d={ICONO_RED.WHATSAPP} color={estilo === lleno ? x.colorIconoLleno : "#0C7A55"} size={18} />
        {texto}
      </Enlace>
    ) : null;
  const primera = reservar && (belleza || !verCatalogo) ? reservar : (verCatalogo ?? reservar ?? accionWhatsapp(lleno));
  const segunda = escritorio
    ? primera === reservar
      ? verCatalogo
      : accionWhatsapp(claro)
    : tieneUbicacion
      ? (
          <a href="#ubicacion" style={claro}>
            Cómo llegar
          </a>
        )
      : null;
  const accionesPortada = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
      {primera && <span style={{ display: "contents" }}>{primera}</span>}
      {segunda && <span style={{ display: "contents" }}>{segunda}</span>}
    </div>
  );
  const accionMenu = p.reservar ? (
    <a href={x.urlReservar} style={{ ...lleno, minHeight: 44, fontSize: 15 }}>
      Reservar
    </a>
  ) : tieneCatalogo && plantilla !== "BELLEZA" ? (
    <a href="#catalogo" style={{ ...lleno, minHeight: 44, fontSize: 15 }}>
      {x.conPedido ? "Pedir ahora" : plantilla === "GASTRONOMIA" ? "Ver la carta" : "Ver productos"}
    </a>
  ) : wa ? (
    accionWhatsapp({ ...lleno, minHeight: 44, fontSize: 15 })
  ) : null;

  const bloques: ReactNode[] = [];
  sitio.bloques.forEach((b, n) => {
    const clave = `${b.tipo}-${n}`;
    switch (b.tipo) {
      case "PORTADA":
        bloques.push(<Portada key={clave} x={x} b={b} acciones={accionesPortada} />);
        if (x.botones.length > 0) {
          // Los botones del dueño (su menú en PDF, la gift card) justo debajo:
          // en el sitio no hay otro lugar para ellos.
          bloques.push(
            <nav key={`${clave}-botones`} aria-label="Enlaces" style={{ padding: escritorio ? "8px 0 0" : "16px 0 0" }}>
              <Contenedor
                escritorio={escritorio}
                style={{
                  display: "grid",
                  gridTemplateColumns: escritorio ? "repeat(3, minmax(0, 1fr))" : "1fr",
                  gap: 10,
                }}
              >
                {x.botones}
              </Contenedor>
            </nav>,
          );
        }
        break;
      case "DESTACADO":
        if (destacadoVigente(p.destacadoDia)) bloques.push(<Destacado key={clave} x={x} d={p.destacadoDia} />);
        break;
      case "CATALOGO": {
        const cat = x.catalogo(b.titulo);
        if (cat) {
          bloques.push(
            <section key={clave} id="catalogo" style={{ padding: escritorio ? "48px 0" : "24px 0", scrollMarginTop: 72 }}>
              <Contenedor escritorio={escritorio} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {cat}
              </Contenedor>
            </section>,
          );
        }
        break;
      }
      case "QUIENES":
        bloques.push(<Quienes key={clave} x={x} b={b} />);
        break;
      case "GALERIA":
        bloques.push(<Galeria key={clave} x={x} b={b} />);
        break;
      case "UBICACION":
        if (p.sucursales.length) {
          bloques.push(
            <Franja key={clave} x={x} id="ubicacion" alterna etiqueta="titulo-ubicacion">
              <TituloBloque x={x} id="titulo-ubicacion">
                {b.titulo || x.tituloSucursales}
              </TituloBloque>
              <div
                style={
                  escritorio && x.mapa
                    ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16, alignItems: "start" }
                    : { display: "flex", flexDirection: "column", gap: 12 }
                }
              >
                {x.mapa}
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{x.tarjetasSucursal}</div>
              </div>
            </Franja>,
          );
        }
        break;
      case "PREGUNTAS":
        bloques.push(<Preguntas key={clave} x={x} b={b} />);
        break;
      case "RESENAS":
        bloques.push(<Resenas key={clave} x={x} url={b.googleUrl} />);
        break;
      case "VIDEO":
        bloques.push(<Video key={clave} x={x} b={b} />);
        break;
    }
  });

  // Belleza: la barra fija de abajo con "Reservar" (como en el diseño). Si
  // hay carrito, abajo va su barra: entonces va el botón redondo.
  const barraReservar = belleza && p.reservar && !x.conPedido;
  const principal = p.sucursales[0];
  const pie = (
    <footer style={{ background: t.pie, color: t.textoPie, padding: `28px 0 ${barraReservar || wa || x.conPedido ? 100 : 28}px` }}>
      <Contenedor escritorio={escritorio} style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
        <span style={{ ...estiloLetra(x.letra, 24), color: "#ffffff" }}>{p.nombre}</span>
        {principal?.direccion && <span>{principal.direccion}</span>}
        {principal?.telefono && <span>Teléfono {principal.telefono}</span>}
        {p.redes.length > 0 && (
          <nav aria-label="Redes sociales" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {p.redes.map((r) => (
              <Enlace
                key={r.id}
                href={r.url}
                onClick={x.clic(r)}
                etiqueta={r.etiqueta}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Trazo d={iconoDe(r.tipo, r.icono)} color="#ffffff" />
              </Enlace>
            ))}
          </nav>
        )}
        {x.pie}
      </Contenedor>
    </footer>
  );

  // El WhatsApp flotante: arriba del botón del asistente si lo hay. Con el
  // pedido armado se va: la barra del pedido ya lleva al WhatsApp, y dos
  // botones verdes abajo se pisan.
  const flotante =
    wa && !barraReservar && !x.hayPedido ? (
      <Enlace
        href={wa.url}
        onClick={x.clic(wa)}
        etiqueta="Escribinos por WhatsApp"
        style={{
          position: "fixed",
          right: 16,
          bottom: p.asistente ? 88 : 16,
          zIndex: 40,
          width: 60,
          height: 60,
          borderRadius: 999,
          background: "#0C7A55",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 16px rgba(0,0,0,0.25)",
        }}
      >
        <Trazo d={ICONO_RED.WHATSAPP} color="#ffffff" size={28} />
      </Enlace>
    ) : null;
  const barra = barraReservar ? (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        background: t.fondo,
        borderTop: `1px solid ${t.borde ?? t.linea}`,
        boxShadow: "0 -8px 20px rgba(0,0,0,0.3)",
      }}
    >
      <Contenedor
        escritorio={escritorio}
        style={{ display: "flex", gap: 10, padding: `12px ${p.asistente ? 88 : 16}px 12px 16px`, maxWidth: escritorio ? 560 : undefined }}
      >
        <a href={x.urlReservar} style={{ ...lleno, flex: 1 }}>
          Reservar
        </a>
        {wa && !p.asistente && (
          <Enlace
            href={wa.url}
            onClick={x.clic(wa)}
            etiqueta="Escribinos por WhatsApp"
            style={{
              width: 50,
              height: 50,
              flex: "none",
              borderRadius: 12,
              border: `1px solid ${t.borde ?? t.linea}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Trazo d={ICONO_RED.WHATSAPP} color={t.icono} size={24} />
          </Enlace>
        )}
      </Contenedor>
    </div>
  ) : null;

  return (
    <div
      ref={x.raiz}
      data-testid={x.testId}
      data-modo={escritorio ? "escritorio" : "movil"}
      data-sitio={plantilla}
      style={{
        background: t.fondo,
        color: t.texto,
        fontFamily: t.familia,
        minHeight: x.enCaja ? (escritorio ? "100%" : undefined) : "100dvh",
        // `clip` y no `hidden`: no corta lo fijo ni el menú pegado arriba.
        overflowX: "clip",
      }}
    >
      <Encabezado x={x} accion={accionMenu} />
      <x.Principal aria-label={x.etiquetaPrincipal}>
        {x.anuncio && (
          <Contenedor escritorio={escritorio} style={{ paddingTop: 12 }}>
            {x.anuncio}
          </Contenedor>
        )}
        {bloques}
      </x.Principal>
      {pie}
      {flotante}
      {barra}
    </div>
  );
}
