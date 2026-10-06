import type { CSSProperties, ReactNode } from "react";
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
 * y la vista previa del editor, que le pasa lo que se está editando. Estilos
 * en línea y no clases del tema de la app: la página no lee la paleta de la
 * app (§1.5), sólo su muestra de color.
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

/** Logo de BamarDev en chico, para el pie. */
export function MarcaBamarDev({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "#0C875E",
        color: "#ffffff",
        fontSize: size * 0.56,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
      }}
    >
      B
    </span>
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

export interface PropsVista {
  pagina: PaginaPublica;
  /** A dónde lleva "Reservar turno" (la reserva online vive en `/r/...`). */
  urlReservar: string;
  /** La política de privacidad para el cliente del negocio. */
  urlPrivacidad?: string;
  alClic?: (enlace: EnlacePublico) => void;
  /** Dentro del marco del celular del editor: sin alto mínimo de pantalla. */
  enMarco?: boolean;
}

export default function VistaPagina({ pagina: p, urlReservar, urlPrivacidad, alClic, enMarco }: PropsVista) {
  const c = paleta(p.color.hex);
  const radio = radioBoton(p.formaBotones);
  const fuente = fuenteTitulo(p.tipografia);
  const fuerte = p.tipografia === "FUERTE";
  const logo = urlDeImagen(p.logoUrl);
  const portada = urlDeImagen(p.portadaUrl);
  const clic = (e: EnlacePublico) => () => alClic?.(e);

  const botonPrincipal: CSSProperties = {
    minHeight: 56,
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

  return (
    <div
      data-testid="vista-pagina"
      style={{
        background: GRIS.fondo,
        color: GRIS.texto,
        fontFamily: "Roboto, system-ui, sans-serif",
        minHeight: enMarco ? undefined : "100dvh",
      }}
    >
      <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" }}>
        <header style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div
            style={{
              width: "100%",
              height: enMarco ? 130 : 200,
              position: "relative",
              backgroundColor: portada ? "#1F2937" : c.barra,
              backgroundImage: portada
                ? `url("${portada}")`
                : "repeating-linear-gradient(135deg,rgba(255,255,255,0.06) 0 14px,rgba(255,255,255,0) 14px 28px)",
              backgroundSize: portada ? "cover" : undefined,
              backgroundPosition: "center",
            }}
          >
            {/* Capa oscura automática: el texto blanco siempre se lee (§1.5). */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.05), rgba(0,0,0,0.45))",
              }}
            />
          </div>
          <div
            style={{
              marginTop: enMarco ? -40 : -52,
              width: enMarco ? 80 : 104,
              height: enMarco ? 80 : 104,
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
                  fontSize: enMarco ? 26 : 34,
                  fontWeight: 700,
                  fontFamily: fuente,
                }}
              >
                {p.iniciales}
              </div>
            )}
          </div>
          <Titulo
            style={{
              margin: "12px 20px 0",
              fontSize: fuerte ? 28 : 26,
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
        </header>

        <Principal
          aria-label={enMarco ? "Vista previa de la página" : undefined}
          style={{ padding: "18px 20px 24px", display: "flex", flexDirection: "column", gap: 12 }}
        >
          {p.anuncio && (
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
          )}

          {p.reservar ? (
            <a href={urlReservar} style={botonPrincipal}>
              <Trazo d={ICONO_RESERVAR} color="#ffffff" ancho={2} />
              Reservar turno
            </a>
          ) : (
            p.destacado && (
              <Enlace href={p.destacado.url} onClick={clic(p.destacado)} style={botonPrincipal}>
                <Trazo d={iconoDe(p.destacado.tipo, p.destacado.icono)} color="#ffffff" />
                {p.destacado.etiqueta}
              </Enlace>
            )
          )}

          {p.botones.map((b) => (
            <Enlace key={b.id} href={b.url} onClick={clic(b)} style={botonSecundario}>
              <Trazo d={iconoDe(b.tipo, b.icono)} color={c.oscuro} size={18} />
              <span style={{ flex: 1 }}>{b.etiqueta}</span>
              <Trazo d="m9 6 6 6-6 6" color="#9CA3AF" size={16} ancho={2} />
            </Enlace>
          ))}

          {p.sucursales.length > 0 && (
            <h2 style={{ margin: "10px 0 0", fontSize: 13, letterSpacing: "0.06em", color: GRIS.texto3, fontWeight: 700 }}>
              {unaSucursal ? "DÓNDE ESTAMOS" : "NUESTRAS SUCURSALES"}
            </h2>
          )}
          {p.sucursales.map((s, i) => {
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
                      marginTop: 6,
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
          })}

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
        </Principal>
      </div>
    </div>
  );
}
