import { useEffect, type CSSProperties, type ReactNode } from "react";
import { resolverTema } from "../lib/temas";
import { useEscritorio } from "./useEscritorio";
import type { NegocioPublico } from "./apiReserva";

/**
 * Piezas de la página pública de reservas (lienzo aprobado: ReservaServicios,
 * ReservaHorario, ReservaConfirmada y ReservaGestion). Mobile-first: se diseñó
 * a 390 px. En una computadora (desde `lg`, 1024 px) se arma en dos columnas:
 * a la izquierda el negocio y el resumen, a la derecha el paso actual con más
 * aire. El celular no cambia.
 *
 * El color es el del NEGOCIO: la paleta que eligió en el panel, aplicada con
 * las mismas variables CSS que usa la app (`bg-primary`, `bg-barra`…) pero
 * sobre el contenedor y no sobre `:root`, así la página no le cambia el color
 * a nada fuera de ella.
 */

/**
 * El marco con la paleta del negocio.
 *
 * `cabecera` y `lateral` son lo que en la computadora va a la columna de la
 * izquierda (la tarjeta del negocio y el resumen). En el celular la cabecera
 * queda arriba, como siempre, y `lateral` no se muestra: cada pantalla ya
 * tiene su resumen en la barra de abajo o en la cabecera.
 */
export function Marco({
  datos,
  titulo,
  children,
  fondo = "bg-white",
  cabecera,
  lateral,
  etiquetaLateral = "Resumen",
  estirar = true,
}: {
  datos: NegocioPublico | null;
  titulo?: string;
  children: ReactNode;
  fondo?: string;
  cabecera?: ReactNode;
  lateral?: ReactNode;
  etiquetaLateral?: string;
  /**
   * En la computadora, la tarjeta de la derecha llega hasta abajo (para la
   * barra pegada de los pasos). Con poco contenido, mejor que mida lo suyo.
   */
  estirar?: boolean;
}) {
  const tema = resolverTema({ tipoNegocio: datos?.negocio.rubro, tema: datos?.negocio.tema ?? null });
  const variables = {
    "--color-primary": tema.primary,
    "--color-primary-600": tema.primary600,
    "--color-primary-700": tema.primary700,
    "--color-primary-50": tema.primary50,
    "--color-primary-100": tema.primary100,
    "--color-primary-200": tema.primary200,
    "--color-primary-boton": tema.boton,
    "--color-primary-boton-hover": tema.botonHover,
    "--color-primary-boton-activo": tema.botonActivo,
    "--color-barra": tema.barra,
    "--color-barra-texto-2": tema.barraTexto2,
  } as CSSProperties;

  useEffect(() => {
    const nombre = datos?.negocio.nombre;
    document.title = [titulo, nombre].filter(Boolean).join(" · ") || "Reservas";
  }, [titulo, datos?.negocio.nombre]);
  useMetaReserva(datos?.negocio.nombre ?? null);
  const escritorio = useEscritorio();

  // Computadora: dos tarjetas sobre gris. La de la izquierda queda fija al
  // bajar (el resumen siempre a la vista) y, si no entra, se desplaza sola.
  // Sin nada para la izquierda (un error, el 404), una sola tarjeta centrada:
  // media pantalla vacía parece rota.
  //
  // Los dos armados tienen el mismo árbol (contenedor > [aside?, main >
  // contenido]) y sólo cambian las clases: si no, al girar una tablet o
  // achicar la ventana React volvería a montar el paso y se perderían el día
  // a la vista, la verificación anti-robots o el horario a medio cambiar.
  const conLateral = escritorio && !!(cabecera || lateral);
  return (
    <div
      style={variables}
      data-modo={escritorio ? "escritorio" : "movil"}
      className={`min-h-dvh font-sans text-[#1F2937] ${escritorio ? "bg-[#F6F7F9]" : fondo}`}
    >
      <div
        className={
          !escritorio
            ? "mx-auto flex min-h-dvh w-full max-w-md flex-col"
            : `mx-auto grid w-full items-start gap-8 px-8 py-10 ${
                conLateral ? "max-w-6xl grid-cols-[minmax(0,360px)_minmax(0,1fr)]" : "max-w-xl"
              }`
        }
      >
        {conLateral && (
          <aside
            aria-label={etiquetaLateral}
            className="sticky top-10 flex max-h-[calc(100dvh-5rem)] flex-col overflow-y-auto rounded-2xl border border-[#E5E7EB] bg-white shadow-sm"
          >
            {cabecera}
            {lateral && <div className="flex flex-col gap-4 p-6">{lateral}</div>}
          </aside>
        )}
        {/* `overflow-clip` y no `hidden`: recorta las esquinas sin volverse
            contenedor de scroll, así la barra de abajo sigue pegada a la ventana. */}
        <main
          className={
            !escritorio
              ? "flex flex-1 flex-col"
              : `flex min-w-0 flex-col overflow-clip rounded-2xl border border-[#E5E7EB] bg-white shadow-sm ${
                  estirar ? "min-h-[min(640px,calc(100dvh-5rem))]" : ""
                }`
          }
        >
          {!escritorio && cabecera}
          {children}
        </main>
      </div>
    </div>
  );
}

/** Una fila del resumen de la columna izquierda (computadora). */
export function FilaResumen({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-[#6B7280]">{etiqueta}</span>
      <span className="text-sm text-[#1F2937]">{children}</span>
    </div>
  );
}

/**
 * Descripción y `robots` de la página de reservas. WhatsApp y Facebook no
 * ejecutan JavaScript, así que su vista previa NO sale de acá: llega con la
 * Pages Function de `link-qa` (B06, pendiente) o, mientras tanto, con el
 * enlace corto a la página del negocio. Esto sirve a la pestaña y a los
 * lectores que sí ejecutan JavaScript; `noindex` va igual en `_headers`.
 */
function useMetaReserva(nombre: string | null) {
  useEffect(() => {
    const metas: HTMLMetaElement[] = [];
    const poner = (atributo: "name" | "property", clave: string, valor: string) => {
      const m = document.createElement("meta");
      m.setAttribute(atributo, clave);
      m.content = valor;
      document.head.appendChild(m);
      metas.push(m);
    };
    poner("name", "robots", "noindex, nofollow");
    if (nombre) {
      const texto = `Reservá tu cita en ${nombre}: elegí el servicio, el día y la hora, sin registrarte.`;
      poner("name", "description", texto);
      poner("property", "og:title", `Reservar en ${nombre}`);
      poner("property", "og:description", texto);
    }
    return () => metas.forEach((m) => m.remove());
  }, [nombre]);
}

/**
 * La barra de arriba con el nombre del negocio (P2, P7). `principal` lo hace
 * el `<h1>` de la página (la portada no tenía ninguno, B27); donde la
 * pantalla ya tiene su propio h1 queda como texto.
 */
export function Cabecera({
  arriba,
  titulo,
  abajo,
  principal,
}: {
  arriba?: ReactNode;
  titulo: ReactNode;
  abajo?: ReactNode;
  principal?: boolean;
}) {
  const Titulo = principal ? "h1" : "strong";
  return (
    <header className="flex flex-col gap-1.5 bg-barra px-5 pb-[18px] pt-5 text-white lg:px-6 lg:pb-6 lg:pt-7">
      {arriba && <span className="text-xs opacity-85">{arriba}</span>}
      <Titulo className="text-[22px] font-bold leading-tight">{titulo}</Titulo>
      {abajo && <span className="text-[13px] opacity-90">{abajo}</span>}
    </header>
  );
}

/**
 * Los trazos de avance. Tantos como pasos tiene de verdad el formulario
 * (servicios, y día con tus datos): antes eran cuatro y saltaba de "1 de 4"
 * a "3 de 4" (B16).
 */
export function Pasos({ hechos, total = 2 }: { hechos: number; total?: number }) {
  return (
    <nav aria-label={`Paso ${hechos} de ${total}`} className="flex gap-1.5 px-5 pb-1.5 pt-3.5 lg:px-8 lg:pt-6">
      {Array.from({ length: total }, (_, k) => k + 1).map((i) => (
        <span key={i} className={`h-1 flex-1 rounded ${i <= hechos ? "bg-primary-boton" : "bg-[#E5E7EB]"}`} />
      ))}
    </nav>
  );
}

const BASE_BOTON =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] transition-colors disabled:cursor-not-allowed disabled:opacity-60";

export function BotonPrincipal({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${BASE_BOTON} bg-primary-boton font-bold text-white hover:bg-primary-boton-hover active:bg-primary-boton-activo ${className}`}
    >
      {children}
    </button>
  );
}

export function BotonSecundario({
  children,
  className = "",
  peligro,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { peligro?: boolean }) {
  return (
    <button
      {...props}
      className={`${BASE_BOTON} border bg-white ${peligro ? "border-[#FECACA] text-[#B91C1C] hover:bg-red-50" : "border-[#E5E7EB] text-[#374151] hover:bg-[#F9FAFB]"} ${className}`}
    >
      {children}
    </button>
  );
}

/** Un aviso dentro de la página: error (rojo) o información (del color del negocio). */
export function Aviso({ tono = "error", children }: { tono?: "error" | "info"; children: ReactNode }) {
  if (!children) return null;
  return (
    <p
      role={tono === "error" ? "alert" : "status"}
      className={`rounded-xl px-3.5 py-2.5 text-[13px] ${tono === "error" ? "bg-red-50 text-[#B91C1C]" : "bg-primary-50 text-primary-700"}`}
    >
      {children}
    </p>
  );
}

export function CargandoPublico() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-white text-sm text-[#6B7280]" role="status">
      Cargando…
    </div>
  );
}

/** P8: el negocio no recibe reservas online. Igual para todos los motivos. */
export function NoDisponible({ telefono, nombre }: { telefono?: string | null; nombre?: string | null }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <Circulo>
        <IconoReloj />
      </Circulo>
      <h1 className="text-xl font-bold">No disponible por internet</h1>
      <p className="max-w-xs text-sm text-[#4B5563]">
        {nombre ? `${nombre} no` : "Este negocio no"} recibe reservas por internet en este momento.
        {telefono ? " Llamalo para agendar." : " Comunicate con el negocio para agendar."}
      </p>
      {telefono && (
        <a href={`tel:${telefono}`} className="text-[15px] font-bold text-primary-700 underline">
          {telefono}
        </a>
      )}
    </div>
  );
}

export function Circulo({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-700">
      {children}
    </div>
  );
}

// ── Íconos del lienzo (trazos de 24×24) ────────────────────────────────────

const svg = (children: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);
export const IconoReloj = () => svg(<><path d="M12 7v5l3 2" /><circle cx="12" cy="12" r="9" /></>, 30);
export const IconoCheck = ({ size = 18 }: { size?: number }) => svg(<path d="m5 12 5 5L20 7" />, size);
export const IconoEnlace = () =>
  svg(<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />);
export const IconoCalendario = () =>
  svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 14v4M10 16h4" /></>);
export const IconoMapa = () =>
  svg(<><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>);
export const IconoVolver = () => svg(<path d="m15 6-6 6 6 6" />, 20);
export const IconoX = () => svg(<path d="M18 6 6 18M6 6l12 12" />, 30);
