import type { CSSProperties, ReactNode } from "react";
import { iconoDe } from "../../lib/pagina/aspecto";
import { estiloLetra, type Letra } from "../../lib/pagina/estilos";
import type { ClaveEstilo, TonosPagina } from "../../lib/pagina/estilosPagina";
import type { EnlacePublico, PaginaPublica, SucursalPublica } from "../../lib/pagina/tipos";
import { SemanaSucursal } from "./HorarioSucursal";

/**
 * Las piezas de la página del negocio que comparten los estilos (09-oct):
 * los íconos, el logo, las redes, el título de sección, la tarjeta de la
 * sucursal y el pie. Cada una lee los tonos del estilo (`estilosPagina.ts`);
 * el Clásico sigue armado como siempre en `VistaPagina`.
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

/**
 * Logo de BamarDev en chico, para el pie: el robot, el mismo de la app y de
 * la pestaña del navegador. Decorativo: al lado siempre va el texto.
 */
export function MarcaBamarDev({ size = 18 }: { size?: number }) {
  return (
    <img
      src="/logo-marca-48.png"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size, flex: "none", objectFit: "contain" }}
    />
  );
}

export function Enlace({
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

/** Fuera de la vista y presente para el lector de pantalla (los títulos que el diseño no muestra). */
export const soloLector: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export const ICONO_PIN = "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21ZM12 7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z";
export const ICONO_RELOJ = "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2";

/** El logo del negocio, o sus iniciales sobre el color si no subió uno. */
export function LogoNegocio({
  logo,
  p,
  lado,
  radio,
  fondoIniciales,
  letra,
  estilo,
}: {
  logo: string | null;
  p: PaginaPublica;
  lado: number;
  radio: CSSProperties["borderRadius"];
  fondoIniciales: string;
  letra: Letra;
  /** El aro, el marco o la sombra de cada estilo. */
  estilo?: CSSProperties;
}) {
  const caja: CSSProperties = {
    width: lado,
    height: lado,
    flex: "none",
    borderRadius: radio,
    overflow: "hidden",
    boxSizing: "border-box",
    ...estilo,
  };
  if (logo) {
    return (
      <div style={caja}>
        <img
          src={logo}
          alt={`Logo de ${p.nombre}`}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", borderRadius: radio }}
        />
      </div>
    );
  }
  const tamano = Math.round(lado * 0.36);
  return (
    <div
      aria-hidden="true"
      style={{
        ...caja,
        background: fondoIniciales,
        color: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...estiloLetra(letra, tamano),
        // Sin el ajuste de tamaño ni las mayúsculas del nombre: las iniciales tienen que entrar.
        fontSize: tamano,
      }}
    >
      {p.iniciales}
    </div>
  );
}

export type VarianteRedes = "circulo" | "plano" | "cuadrado";

/**
 * Los íconos de las redes. "circulo": en un círculo (Vivo, el encabezado de
 * color); "plano": el trazo solo (Vitrina, Boutique); "cuadrado": un cuadro
 * con borde fino (Noche). Siempre 44 px para tocarlos.
 */
export function RedesPagina({
  redes,
  variante,
  fondo,
  trazo,
  borde,
  centradas = true,
  clic,
}: {
  redes: EnlacePublico[];
  variante: VarianteRedes;
  fondo?: string | null;
  trazo: string;
  borde?: string;
  centradas?: boolean;
  clic: (e: EnlacePublico) => () => void;
}) {
  if (redes.length === 0) return null;
  return (
    <nav
      aria-label="Redes sociales"
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: centradas ? "center" : "flex-start",
        gap: variante === "plano" ? 6 : 10,
        // Sin círculo el ícono se ve chico: se corre para que el primero quede al ras del texto.
        marginLeft: variante === "plano" && !centradas ? -10 : undefined,
      }}
    >
      {redes.map((r) => (
        <Enlace
          key={r.id}
          href={r.url}
          onClick={clic(r)}
          etiqueta={r.etiqueta}
          style={{
            width: 44,
            height: 44,
            boxSizing: "border-box",
            borderRadius: variante === "cuadrado" ? 6 : 999,
            background: variante === "circulo" ? (fondo ?? undefined) : undefined,
            border: variante === "cuadrado" ? `1px solid ${borde}` : undefined,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Trazo d={iconoDe(r.tipo, r.icono)} color={trazo} size={variante === "plano" ? 23 : 20} ancho={variante === "plano" ? 1.6 : 1.8} />
        </Enlace>
      ))}
    </nav>
  );
}

/**
 * El título de una sección ("Nuestro catálogo", "Dónde estamos") como lo
 * pide cada estilo: con la letra del nombre (Vitrina, Noche, Carta, Dulce),
 * en mayúsculas espaciadas (Vivo), en versalitas entre dos líneas finas
 * (Boutique), con la letra del texto (Postal) o sólo para el lector de
 * pantalla (Mosaico: los bloques se explican solos y un título partiría la
 * grilla).
 */
export function TituloSeccion({
  id,
  estilo,
  t,
  letra,
  escritorio,
  children,
}: {
  id?: string;
  estilo: ClaveEstilo;
  t: TonosPagina;
  letra: Letra;
  escritorio: boolean;
  children: ReactNode;
}) {
  let s: CSSProperties;
  switch (estilo) {
    case "VIVO":
      s = { fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", textAlign: "center", margin: "14px 0 0" };
      break;
    case "NOCHE":
      s = { ...estiloLetra(letra, escritorio ? 30 : 26), textTransform: "uppercase", letterSpacing: "0.06em", margin: "12px 0 0", lineHeight: 1.1 };
      break;
    case "POSTAL":
      s = { fontSize: 17, fontWeight: 700, margin: "8px 0 0", lineHeight: 1.25 };
      break;
    case "CARTA":
      s = { ...estiloLetra(letra, escritorio ? 24 : 22), margin: "10px 0 0", lineHeight: 1.15 };
      break;
    case "DULCE":
      s = { ...estiloLetra(letra, 21), margin: "10px 0 0", lineHeight: 1.2 };
      break;
    case "MOSAICO":
      return (
        <h2 id={id} style={soloLector}>
          {children}
        </h2>
      );
    case "BOUTIQUE":
      return (
        <h2
          id={id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "18px 0 0",
            fontSize: 12,
            fontWeight: 500,
            letterSpacing: "0.24em",
            textTransform: "uppercase",
            textAlign: "center",
            color: t.titulo,
          }}
        >
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: t.linea }} />
          {children}
          <span aria-hidden="true" style={{ flex: 1, height: 1, background: t.linea }} />
        </h2>
      );
    default:
      // Vitrina: la letra del nombre, a la izquierda.
      s = { ...estiloLetra(letra, 20), margin: "12px 0 0", lineHeight: 1.2 };
  }
  return (
    <h2 id={id} style={{ ...s, color: t.titulo }}>
      {children}
    </h2>
  );
}

export interface AccionSucursal {
  texto: string;
  href: string;
  destacado: boolean;
}

/**
 * Una sucursal: en tarjeta (Vitrina, Vivo, Noche) o como texto entre
 * separadores (Boutique). `estado` es el cartel "Abierto ahora · cierra
 * 21:00" (`EstadoSucursal`), al lado del nombre; debajo del horario en texto
 * va "Ver horario" con la semana. Los dos, sólo si hay horario por día.
 */
export function TarjetaSucursal({
  s,
  acciones,
  estiloAccion,
  t,
  letra,
  presentacion,
  radio,
  primera,
  estado,
}: {
  s: SucursalPublica;
  acciones: AccionSucursal[];
  estiloAccion: (destacado: boolean) => CSSProperties;
  t: TonosPagina;
  letra: Letra;
  presentacion: "tarjeta" | "texto";
  radio: CSSProperties["borderRadius"];
  primera: boolean;
  estado?: ReactNode;
}) {
  const botones = acciones.length > 0 && (
    <div
      style={
        presentacion === "texto"
          ? { display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, marginTop: 8 }
          : {
              display: "grid",
              gridTemplateColumns: `repeat(${acciones.length}, minmax(0, 1fr))`,
              gap: 8,
              // En dos columnas las tarjetas se estiran a la misma altura: los
              // botones van abajo de todo, alineados entre tarjetas.
              marginTop: "auto",
              paddingTop: 6,
            }
      }
    >
      {acciones.map((a) => (
        <a
          key={a.texto}
          href={a.href}
          rel="noopener noreferrer"
          style={{ ...estiloAccion(a.destacado), ...(presentacion === "texto" ? { minWidth: 120, padding: "0 14px" } : {}) }}
        >
          {a.texto}
        </a>
      ))}
    </div>
  );

  if (presentacion === "texto") {
    return (
      <article
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          textAlign: "center",
          padding: "16px 0",
          borderTop: primera ? undefined : `1px solid ${t.linea}`,
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <strong style={{ ...estiloLetra(letra, 21), color: t.textoTarjeta, lineHeight: 1.2 }}>{s.nombre}</strong>
          {estado}
        </div>
        {s.direccion && <span style={{ fontSize: 14.5, color: t.texto2Tarjeta, lineHeight: 1.45 }}>{s.direccion}</span>}
        {s.horario && <span style={{ fontSize: 14, color: t.texto3Tarjeta, fontStyle: "italic" }}>{s.horario}</span>}
        <SemanaSucursal tramos={s.horarioSemanal} t={t} centrada />
        {botones}
      </article>
    );
  }

  const linea = (d: string, texto: string, color: string, tamano: number) => (
    <span style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: tamano, color, lineHeight: 1.4 }}>
      <span style={{ display: "flex", paddingTop: 1 }}>
        <Trazo d={d} color={t.icono} size={16} />
      </span>
      {texto}
    </span>
  );
  return (
    <article
      style={{
        background: t.tarjeta,
        border: t.borde ? `1px solid ${t.borde}` : "none",
        boxShadow: t.sombra ?? undefined,
        borderRadius: radio,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        color: t.textoTarjeta,
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 16 }}>{s.nombre}</strong>
        {estado}
      </div>
      {s.direccion && linea(ICONO_PIN, s.direccion, t.texto2Tarjeta, 14)}
      {s.horario && linea(ICONO_RELOJ, s.horario, t.texto3Tarjeta, 13)}
      <SemanaSucursal tramos={s.horarioSemanal} t={t} />
      {botones}
    </article>
  );
}

/** "Powered by BamarDev" y los enlaces legales, del color del texto tenue de la página. */
export function PiePagina({
  p,
  urlPrivacidad,
  color,
  marginTop = 14,
}: {
  p: PaginaPublica;
  urlPrivacidad?: string;
  color: string;
  marginTop?: number;
}) {
  return (
    <footer
      style={{
        marginTop,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
        color,
      }}
    >
      <a
        href={p.pie.atribucionUrl}
        rel="noopener"
        style={{ display: "flex", alignItems: "center", gap: 6, color, textDecoration: "none" }}
      >
        <MarcaBamarDev />
        Powered by BamarDev
      </a>
      <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 12px" }}>
        {urlPrivacidad && (
          <a href={urlPrivacidad} style={{ color }}>
            Privacidad
          </a>
        )}
        <a href="https://bamardev.com/terminos" rel="noopener" style={{ color }}>
          Términos de BamarDev
        </a>
        <a href="https://bamardev.com/privacidad" rel="noopener" style={{ color }}>
          Privacidad de BamarDev
        </a>
      </span>
    </footer>
  );
}
