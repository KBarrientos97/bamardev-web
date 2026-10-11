import type { ReactNode } from "react";
import { iniciales } from "../../lib/format";
import { clasesBadge, ETIQUETA_ESTADO } from "../../lib/agenda/estadosCita";
import type { EstadoCita } from "../../lib/agenda/tiposAgenda";

/** Piezas chicas que comparten las pantallas de la agenda. */

export function BadgeEstado({ estado, className = "" }: { estado: EstadoCita; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${clasesBadge(estado)} ${className}`}
    >
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

/**
 * El avatar de un profesional con SU color. El color lo elige el negocio y
 * viene de la API, así que no sale del tema: se mezcla con blanco para el
 * fondo (un color fuerte de fondo dejaría ilegibles las iniciales) y se usa
 * entero en el borde.
 */
export function AvatarRecurso({
  nombre,
  color,
  tamano = 32,
}: {
  nombre: string;
  color?: string | null;
  tamano?: number;
}) {
  const c = color || "var(--color-primary)";
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold text-texto"
      style={{
        width: tamano,
        height: tamano,
        borderColor: c,
        backgroundColor: `color-mix(in srgb, ${c} 18%, white)`,
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Rótulo de sección del panel de la cita ("CLIENTE", "SERVICIOS"…). */
export function Rotulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[12px] font-bold uppercase tracking-wider text-texto-3">{children}</h2>
      {accion}
    </div>
  );
}

// ── Íconos que el set de la app no trae ─────────────────────────────────────
// Van acá y no en Icon.tsx para no tocar un archivo que usa toda la app.

const trazo = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconoCopiar({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...trazo}>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
    </svg>
  );
}

export function IconoCompartir({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...trazo}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

export function IconoWhatsApp({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...trazo}>
      <path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1Z" />
      <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1.2-1.4-2-1-1 .8a4 4 0 0 1-2.1-2.1l.8-1-1-2Z" />
    </svg>
  );
}
