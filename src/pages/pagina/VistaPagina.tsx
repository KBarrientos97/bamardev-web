import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { urlDeImagen } from "../../lib/pagina/apiPagina";
import {
  fuenteTitulo,
  ICONO_ANUNCIO,
  ICONO_RESERVAR,
  iconoDe,
  paleta,
  radioBoton,
} from "../../lib/pagina/aspecto";
import type { EnlacePublico, PaginaPublica } from "../../lib/pagina/tipos";
import { urlTelefono } from "../../lib/pagina/vista";

/**
 * La página del negocio tal como la ve su cliente (lienzo BioPublica / B4).
 *
 * Es presentacional a propósito: la usan la página pública (`/p/:subdominio`)
 * y la vista previa del editor, que le pasa lo que se está editando. Tiene dos
 * armados: celular (una columna) y computadora (dos columnas), según el ancho.
 * Estilos en línea y no clases del tema de la app: la página no lee la paleta
 * de la app (§1.5), sólo su muestra de color.
 */
export function Trazo({
  d,
  color,
  size = 20,
  ancho = 1.8,
}: {
  d: string;
  color: string;
  size?: number;
  ancho?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={ancho}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const GRIS = { fondo: "#F6F7F9", borde: "#E5E7EB", texto: "#1F2937", texto2: "#374151", texto3: "#6B7280" };

/**
 * Logo de BamarDev en chico, para el pie: el robot, el mismo de la app y de
 * la pestaña del navegador. Decorativo: al lado siempre va el texto.
 */
export function MarcaBamarDev({ size = 18 }: { size?: number }) {
  return (
    <img
      src="/logo-marca.png"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, flex: "none", objectFit: "contain" }}
    />
  );
}

function Enlace({
  href,
  style,
  children,
  onClick,
  etiqueta,
}: {
  href: string;
  style: CSSProperties;
  children: ReactNode;
  onClick?: () => void;
  etiqueta?: string;
}) {
  return (
    <a href={href} style={style} onClick={onClick} rel="noopener noreferrer" aria-label={etiqueta}>
      {children}
    </a>
  );
}

/** Desde este ancho la página se arma en dos columnas (computadora). */
export const ANCHO_ESCRITORIO = 900;

export type ModoVista = "auto" | "movil" | "escritorio";

/**
 * En "auto" mide el ancho real de la página (no el de la ventana): así la
 * misma vista sirve en el navegador y adentro de un marco del editor. Sin
 * ResizeObserver (jsdom) cae a los cambios de tamaño de la ventana.
 */
function useEsEscritorio(modo: ModoVista, ref: RefObject<HTMLDivElement | null>): boolean {
  const [ancho, setAncho] = useState(0);
  useLayoutEffect(() => {
    if (modo !== "auto") return;
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", medir);
      return () => window.removeEventListener("resize", medir);
    }
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [modo, ref]);
  return modo === "escritorio" || (modo === "auto" && ancho >= ANCHO_ESCRITORIO);
}

export interface PropsVista {
  pagina: PaginaPublica;
  /** A dónde lleva "Reservar turno" (la reserva online vive en `/r/...`). */
  urlReservar: string;
  /** La política de privacidad para el cliente del negocio. */
  urlPrivacidad?: string;
  alClic?: (enlace: EnlacePublico) => void;
  /** Dentro de un marco del editor: sin alto mínimo de pantalla ni otro main/h1. */
  enMarco?: boolean;
  /**
   * "auto" (la página de verdad): celular o computadora según el ancho.
   * El editor fuerza uno u otro para la vista previa.
   */
  modo?: ModoVista;
}

export default function VistaPagina({
  pagina: p,
  urlReservar,
  urlPrivacidad,
  alClic,
  enMarco,
  modo = "auto",
}: PropsVista) {
  const raiz = useRef<HTMLDivElement>(null);
  const escritorio = useEsEscritorio(modo, raiz);
  // El marco del celular del editor achica la portada y el logo; el de la
  // computadora no (es la página a tamaño real, escalada).
  const chico = !!enMarco && !escritorio;
  const c = paleta(p.color.hex);
  const radio = radioBoton(p.formaBotones);
  const fuente = fuenteTitulo(p.tipografia);
  const fuerte = p.tipografia === "FUERTE";
  const logo = urlDeImagen(p.logoUrl);
  const portada = urlDeImagen(p.portadaUrl);
  const clic = (e: EnlacePublico) => () => alClic?.(e);

  const botonPrincipal: CSSProperties = {
    minHeight: 56,
    boxSizing: "border-box",
    width: "100%",
    borderRadius: radio,
    background: c.acento,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: 700,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: "0 16px",
    textDecoration: "none",
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
    textAlign: "center",
  };
  const botonSecundario: CSSProperties = {
    minHeight: 52,
    boxSizing: "border-box",
    borderRadius: radio,
    background: "#ffffff",
    border: `1px solid ${GRIS.borde}`,
    color: GRIS.texto,
    fontSize: 15,
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "0 16px",
    textDecoration: "none",
  };
  const botonChico = (destacado = false): CSSProperties => ({
    minHeight: 44,
    borderRadius: radio === "999px" ? 999 : radio === "4px" ? 4 : 12,
    border: destacado ? "none" : `1px solid ${GRIS.borde}`,
    background: destacado ? c.tinte : "#ffffff",
    color: destacado ? c.oscuro : GRIS.texto2,
    fontSize: 13,
    fontWeight: destacado ? 500 : 400,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    padding: "0 6px",
  });

  const unaSucursal = p.sucursales.length === 1;
  // Dentro del editor la vista previa vive adentro del <main> de la app: ahí
  // no puede abrir otro <main> ni otro <h1> (B24, doble landmark y doble h1).
  const Principal = enMarco ? "section" : "main";
  const Titulo = enMarco ? "h2" : "h1";

  const fondoPortada: CSSProperties = {
    width: "100%",
    position: "relative",
    backgroundColor: portada ? "#1F2937" : c.barra,
    backgroundImage: portada
      ? `url("${portada}")`
      : "repeating-linear-gradient(135deg,rgba(255,255,255,0.06) 0 14px,rgba(255,255,255,0) 14px 28px)",
    backgroundSize: portada ? "cover" : undefined,
    backgroundPosition: "center",
  };
  // Capa oscura automática: el texto blanco siempre se lee (§1.5).
  const capaPortada = (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.45))",
      }}
    />
  );

  const ladoLogo = chico ? 80 : 104;
  const circuloLogo = (
    <div
      style={{
        marginTop: chico ? -40 : -52,
        width: ladoLogo,
        height: ladoLogo,
        flex: "none",
        borderRadius: 999,
        background: "#ffffff",
        padding: 4,
        boxSizing: "border-box",
        boxShadow: "0 6px 20px rgba(0,0,0,0.18)",
        position: "relative",
      }}
    >
      {logo ? (
        <img
          src={logo}
          alt={`Logo de ${p.nombre}`}
          style={{ width: "100%", height: "100%", borderRadius: 999, objectFit: "cover", display: "block" }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 999,
            background: c.acento,
            color: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: chico ? 26 : 34,
            fontWeight: 700,
            fontFamily: fuente,
          }}
        >
          {p.iniciales}
        </div>
      )}
    </div>
  );

  const identidad = (
    <>
      <Titulo
        style={{
          margin: "12px 20px 0",
          fontSize: (fuerte ? 28 : 26) + (escritorio ? 2 : 0),
          lineHeight: 1.15,
          fontFamily: fuente,
          textAlign: "center",
          textTransform: fuerte ? "uppercase" : undefined,
          letterSpacing: fuerte ? "0.01em" : undefined,
          fontWeight: 700,
        }}
      >
        {p.nombre}
      </Titulo>
      {p.rubro && <span style={{ fontSize: 13, color: GRIS.texto3, marginTop: 2 }}>{p.rubro}</span>}
      {p.descripcion && (
        <p style={{ margin: "8px 24px 0", fontSize: 14, color: GRIS.texto2, textAlign: "center", lineHeight: 1.45 }}>
          {p.descripcion}
        </p>
      )}
      {p.redes.length > 0 && (
        <nav
          aria-label="Redes sociales"
          style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, margin: "14px 16px 0" }}
        >
          {p.redes.map((r) => (
            <Enlace
              key={r.id}
              href={r.url}
              onClick={clic(r)}
              etiqueta={r.etiqueta}
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                background: c.tinte,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Trazo d={iconoDe(r.tipo, r.icono)} color={c.oscuro} />
            </Enlace>
          ))}
        </nav>
      )}
    </>
  );

  const anuncio = p.anuncio && (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "#FFFBEB",
        border: "1px solid #FDE68A",
        borderRadius: 14,
        padding: "10px 14px",
      }}
    >
      <Trazo d={ICONO_ANUNCIO} color="#B45309" />
      {p.anuncio.url ? (
        <a href={p.anuncio.url} rel="noopener noreferrer" style={{ fontSize: 14, color: "#78350F" }}>
          {p.anuncio.texto}
        </a>
      ) : (
        <span style={{ fontSize: 14, color: "#78350F" }}>{p.anuncio.texto}</span>
      )}
    </div>
  );

  // El botón grande es opcional: reservar, el enlace que eligió el dueño
  // (su WhatsApp, su menú, el que sea) o ninguno.
  const principal = p.reservar ? (
    <a href={urlReservar} style={botonPrincipal}>
      <Trazo d={ICONO_RESERVAR} color="#ffffff" ancho={2} />
      Reservar turno
    </a>
  ) : p.destacado ? (
    <Enlace href={p.destacado.url} onClick={clic(p.destacado)} style={botonPrincipal}>
      <Trazo d={iconoDe(p.destacado.tipo, p.destacado.icono)} color="#ffffff" />
      {p.destacado.etiqueta}
    </Enlace>
  ) : null;

  const botones = p.botones.map((b) => (
    <Enlace key={b.id} href={b.url} onClick={clic(b)} style={botonSecundario}>
      <Trazo d={iconoDe(b.tipo, b.icono)} color={c.oscuro} size={18} />
      <span style={{ flex: 1 }}>{b.etiqueta}</span>
      <Trazo d="m9 6 6 6-6 6" color="#9CA3AF" size={16} ancho={2} />
    </Enlace>
  ));

  const tituloSucursales = p.sucursales.length > 0 && (
    <h2 style={{ margin: "10px 0 0", fontSize: 13, letterSpacing: "0.06em", color: GRIS.texto3, fontWeight: 700 }}>
      {unaSucursal ? "DÓNDE ESTAMOS" : "NUESTRAS SUCURSALES"}
    </h2>
  );
  const sucursales = p.sucursales.map((s, i) => {
    const acciones = [
      s.mapaUrl && { texto: "Cómo llegar", href: s.mapaUrl, destacado: false },
      s.telefono && { texto: "Llamar", href: urlTelefono(s.telefono), destacado: false },
      // La reserva de ESA sucursal, por su slug (B07): `?sucursal=<id>`
      // no lo leía nadie y exponía el id del almacén.
      p.reservar &&
        s.reservaSlug && {
          texto: "Reservar",
          href: `${urlReservar}/${encodeURIComponent(s.reservaSlug)}`,
          destacado: true,
        },
    ].filter(Boolean) as { texto: string; href: string; destacado: boolean }[];
    return (
      <article
        key={`${s.nombre}-${i}`}
        style={{
          background: "#ffffff",
          border: `1px solid ${GRIS.borde}`,
          borderRadius: 16,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <strong style={{ fontSize: 16 }}>{s.nombre}</strong>
        {s.direccion && <span style={{ fontSize: 14, color: "#4B5563" }}>{s.direccion}</span>}
        {s.horario && <span style={{ fontSize: 13, color: GRIS.texto3 }}>{s.horario}</span>}
        {acciones.length > 0 && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))`,
              gap: 8,
              // En dos columnas las tarjetas se estiran a la misma altura: los
              // botones van abajo de todo, alineados entre tarjetas.
              marginTop: "auto",
              paddingTop: 6,
            }}
          >
            {acciones.map((a) => (
              <a key={a.texto} href={a.href} rel="noopener noreferrer" style={botonChico(a.destacado)}>
                {a.texto}
              </a>
            ))}
          </div>
        )}
      </article>
    );
  });

  const pie = (
    <footer
      style={{
        marginTop: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color: GRIS.texto3,
      }}
    >
      <a
        href={p.pie.atribucionUrl}
        rel="noopener"
        style={{ display: "flex", alignItems: "center", gap: 6, color: GRIS.texto3, textDecoration: "none" }}
      >
        <MarcaBamarDev />
        Hecho con BamarDev
      </a>
      <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
        {urlPrivacidad && (
          <a href={urlPrivacidad} style={{ color: GRIS.texto3 }}>
            Privacidad
          </a>
        )}
        <a href="https://bamardev.com/terminos" rel="noopener" style={{ color: GRIS.texto3 }}>
          Términos de BamarDev
        </a>
        <a href="https://bamardev.com/privacidad" rel="noopener" style={{ color: GRIS.texto3 }}>
          Privacidad de BamarDev
        </a>
      </span>
    </footer>
  );

  const etiquetaPrincipal = enMarco ? "Vista previa de la página" : undefined;
  const raizEstilo: CSSProperties = {
    background: GRIS.fondo,
    color: GRIS.texto,
    fontFamily: "Roboto, system-ui, sans-serif",
    // En el marco de la computadora llena la "pantalla" aunque sea corta.
    minHeight: enMarco ? (escritorio ? "100%" : undefined) : "100dvh",
  };

  if (escritorio) {
    // Computadora: la portada a todo el ancho; a la izquierda la tarjeta del
    // negocio (logo, nombre, redes y el botón grande) y a la derecha el resto,
    // con los botones y las sucursales en dos columnas. Si no hay nada para la
    // derecha, la tarjeta va sola y centrada: media pantalla vacía parece rota.
    const hayDerecha = !!anuncio || botones.length > 0 || sucursales.length > 0;
    return (
      <div ref={raiz} data-testid="vista-pagina" data-modo="escritorio" style={raizEstilo}>
        <div style={{ ...fondoPortada, height: 300 }}>{capaPortada}</div>
        <Principal
          aria-label={etiquetaPrincipal}
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            padding: "0 32px",
            display: "grid",
            gridTemplateColumns: hayDerecha ? "340px minmax(0, 1fr)" : "minmax(0, 400px)",
            justifyContent: "center",
            gap: 32,
            alignItems: "start",
          }}
        >
          <header
            style={{
              marginTop: -110,
              position: "relative",
              background: "#ffffff",
              border: `1px solid ${GRIS.borde}`,
              borderRadius: 20,
              boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
              padding: "0 4px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            {circuloLogo}
            {identidad}
            {principal && (
              <div style={{ width: "100%", boxSizing: "border-box", padding: "20px 20px 0" }}>{principal}</div>
            )}
          </header>
          {hayDerecha && (
            <div style={{ paddingTop: 28, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
              {anuncio}
              {botones.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {botones}
                </div>
              )}
              {tituloSucursales}
              {sucursales.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                  {sucursales}
                </div>
              )}
            </div>
          )}
        </Principal>
        <div style={{ padding: "24px 32px 40px" }}>{pie}</div>
      </div>
    );
  }

  return (
    <div ref={raiz} data-testid="vista-pagina" data-modo="movil" style={raizEstilo}>
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ ...fondoPortada, height: chico ? 130 : 200 }}>{capaPortada}</div>
          {circuloLogo}
          {identidad}
        </header>

        <Principal
          aria-label={etiquetaPrincipal}
          style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {anuncio}
          {principal}
          {botones}
          {tituloSucursales}
          {sucursales}
          {pie}
        </Principal>
      </div>
    </div>
  );
}
