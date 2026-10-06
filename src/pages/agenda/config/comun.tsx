import type { ReactNode } from "react";

/**
 * Piezas chicas que comparten las pestañas de la configuración de agenda y la
 * de reglas del negocio. Viven acá y no en `components/ui.tsx` para no tocar
 * el archivo de UI de toda la app mientras la agenda se arma en paralelo.
 */

/** Casilla con su texto, del tamaño de un dedo en el celular. */
export function Casilla({
  checked,
  onChange,
  children,
  ayuda,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  ayuda?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl py-1.5 text-sm text-texto-2 ${disabled ? "opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">
        <span className="block">{children}</span>
        {ayuda && <span className="mt-0.5 block text-xs text-texto-4">{ayuda}</span>}
      </span>
    </label>
  );
}

/**
 * Elegir varios de una lista (sucursales, servicios, profesionales) con
 * botones que se prenden. Es más fácil de tocar en el celular que una lista
 * de casillas, y se lee de un vistazo qué quedó elegido.
 */
export function SelectorVarios<T extends number>({
  opciones,
  elegidos,
  onChange,
  vacio,
  etiqueta,
}: {
  opciones: { id: T; nombre: string; color?: string }[];
  elegidos: T[];
  onChange: (ids: T[]) => void;
  vacio?: string;
  /** Para el lector de pantalla: qué se está eligiendo. */
  etiqueta: string;
}) {
  if (!opciones.length) {
    return <p className="text-xs text-texto-4">{vacio ?? "No hay opciones."}</p>;
  }
  return (
    <div role="group" aria-label={etiqueta} className="flex flex-wrap gap-2">
      {opciones.map((o) => {
        const activo = elegidos.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={activo}
            onClick={() =>
              onChange(activo ? elegidos.filter((x) => x !== o.id) : [...elegidos, o.id])
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
              activo
                ? "bg-primary-50 text-primary-700 ring-2 ring-primary"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {o.color && <PuntoColor color={o.color} />}
            {o.nombre}
          </button>
        );
      })}
    </div>
  );
}

/** El color de un profesional: es un dato del negocio, no del tema. */
export function PuntoColor({ color, grande }: { color: string; grande?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full border border-black/10 ${grande ? "h-4 w-4" : "h-2.5 w-2.5"}`}
      style={{ backgroundColor: color }}
    />
  );
}

/** Tarjeta con título para agrupar un formulario largo. */
export function Bloque({
  titulo,
  subtitulo,
  insignia,
  children,
  accion,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  insignia?: ReactNode;
  children: ReactNode;
  accion?: ReactNode;
}) {
  return (
    <section className="card space-y-3 p-4 sm:p-5" aria-label={titulo}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-texto">
            {titulo}
            {insignia}
          </h2>
          {subtitulo && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo}</p>}
        </div>
        {accion}
      </header>
      {children}
    </section>
  );
}

