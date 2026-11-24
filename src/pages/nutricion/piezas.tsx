import { forwardRef, type InputHTMLAttributes, type ReactNode, type Ref, type TextareaHTMLAttributes } from "react";
import { Icon } from "../../components/Icon";
import { TONO } from "../../lib/nutricion/tonos";
import type { Rango } from "../../lib/nutricion/tipos";

/**
 * El buscador grande de pacientes (Evaluación y Seguimiento): con el foco
 * puesto al entrar, la lupa a la izquierda y, a la derecha, la tecla «/» o la
 * ✕ para limpiar (que devuelve el foco al campo).
 */
export const BuscadorPacientes = forwardRef<
  HTMLInputElement,
  { valor: string; onCambiar: (v: string) => void; placeholder?: string; etiqueta?: string }
>(function BuscadorPacientes({ valor, onCambiar, placeholder = "Buscar por carnet o nombre…", etiqueta = "Buscar por carnet o nombre" }, ref) {
  return (
    <label className="relative block">
      <span className="sr-only">{etiqueta}</span>
      <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-texto-4">
        <Icon name="search" size={20} />
      </span>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder={placeholder}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        className="h-14 w-full rounded-2xl border border-borde bg-white pl-12 pr-12 text-base text-texto shadow-sm outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-4 focus:ring-primary-100"
      />
      {valor ? (
        <button
          type="button"
          onClick={(e) => {
            onCambiar("");
            (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement | null)?.focus();
          }}
          aria-label="Limpiar búsqueda"
          className="absolute inset-y-0 right-2 my-auto flex h-10 w-10 items-center justify-center rounded-xl text-texto-4 hover:bg-muted hover:text-texto-2"
        >
          <Icon name="close" size={17} />
        </button>
      ) : (
        <Tecla className="pointer-events-none absolute inset-y-0 right-4 my-auto">/</Tecla>
      )}
    </label>
  );
});

/**
 * Las piezas chicas de la evaluación de pacientes: los colores de los grados,
 * el chip del grado, los campos de número y de texto y la tecla de un atajo.
 * El marco de las pantallas (tarjetas, encabezados, tablas) es el de la
 * Academia (`pages/academia/piezas.tsx`), para que se vean iguales.
 */

/** El grado con su color: «Obesidad grado I». Sin grado, nada. */
export function ChipGrado({ rango, className = "" }: { rango: Pick<Rango, "nombre" | "tono"> | null | undefined; className?: string }) {
  if (!rango) return null;
  const t = TONO[rango.tono];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${t.suave} ${t.texto} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.barra}`} />
      {rango.nombre}
    </span>
  );
}

/** Una tecla de atajo, chica y gris. Se esconde en el celular, donde no hay teclado. */
export function Tecla({ children, sobreColor = false, className = "" }: { children: ReactNode; sobreColor?: boolean; className?: string }) {
  return (
    <kbd
      className={`hidden h-5 items-center rounded border px-1.5 font-sans text-[11px] font-medium leading-none md:inline-flex ${
        sobreColor ? "border-white/40 text-white/85" : "border-borde bg-white text-texto-4"
      } ${className}`}
    >
      {children}
    </kbd>
  );
}

const CLASE_CAMPO =
  "w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none transition-colors placeholder:text-texto-4 focus:border-primary focus:ring-2 focus:ring-primary-100 disabled:bg-muted disabled:text-texto-3 aria-[invalid=true]:border-danger";

/** El rótulo de un campo y lo que va debajo (el error en rojo o la ayuda en gris). */
export function Rotulo({
  htmlFor,
  label,
  extra,
  error,
  ayuda,
  children,
  className = "",
}: {
  htmlFor: string;
  label: ReactNode;
  /** Al lado del rótulo, a la derecha: «anterior: 82,4 · −1,2». */
  extra?: ReactNode;
  error?: string | null;
  ayuda?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-texto-2">
          {label}
        </label>
        {extra && <span className="text-[12px] tabular-nums text-texto-4">{extra}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      ) : ayuda ? (
        <p className="mt-1 text-xs text-texto-3">{ayuda}</p>
      ) : null}
    </div>
  );
}

/**
 * Un campo de número: acepta coma o punto («72,5») y deja lo escrito tal cual
 * mientras se escribe; la unidad va adentro, a la derecha. Es texto con el
 * teclado numérico: un campo `number` del navegador decide la coma según su
 * idioma (ver `Input` en ui.tsx).
 */
export const CampoNumero = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "type"> & {
    value: string;
    onChange: (v: string) => void;
    unidad?: string;
    invalido?: boolean;
  }
>(function CampoNumero({ value, onChange, unidad, invalido, className = "", id, ...props }, ref) {
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={invalido || undefined}
        aria-describedby={invalido && id ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`${CLASE_CAMPO} tabular-nums ${unidad ? "pr-12" : ""} ${className}`}
      />
      {unidad && (
        <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-[13px] text-texto-4">{unidad}</span>
      )}
    </div>
  );
});

/** Un campo de texto de una línea, con el trazo de los demás. */
export const CampoTexto = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean }>(function CampoTexto(
  { className = "", invalido, ...props },
  ref,
) {
  return <input {...props} ref={ref} aria-invalid={invalido || undefined} className={`${CLASE_CAMPO} ${className}`} />;
});

/** Un texto de varias líneas que se estira a mano. */
export function AreaTexto({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  return <textarea {...props} className={`${CLASE_CAMPO} resize-y leading-relaxed ${className}`} />;
}

/**
 * Mujer u Hombre: dos botones grandes, ninguno marcado al abrir. Es un grupo
 * de opciones (se recorre con las flechas como cualquier radio).
 */
export function BotonesSexo({
  valor,
  onElegir,
  apilados = false,
  disabled = false,
  etiqueta = "Sexo",
}: {
  valor: "F" | "M" | "";
  onElegir: (s: "F" | "M") => void;
  apilados?: boolean;
  disabled?: boolean;
  etiqueta?: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className={`grid gap-2 ${apilados ? "grid-cols-1" : "grid-cols-2"}`}>
      {(
        [
          ["F", "Mujer"],
          ["M", "Hombre"],
        ] as const
      ).map(([s, texto]) => {
        const marcado = valor === s;
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={marcado}
            disabled={disabled}
            onClick={() => onElegir(s)}
            className={`min-h-12 rounded-xl border-2 px-4 text-[15px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              marcado
                ? "border-primary bg-primary-50 text-primary-700"
                : "border-borde bg-white text-texto-2 hover:border-primary-200 hover:bg-muted"
            }`}
          >
            {texto}
          </button>
        );
      })}
    </div>
  );
}

/** Un bloque de una hoja (control, semana): título chico en mayúsculas, con una línea arriba. */
export function SeccionHoja({ titulo, children, className = "" }: { titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`space-y-3 border-t border-borde-soft pt-4 ${className}`}>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{titulo}</h3>
      {children}
    </section>
  );
}

/** El indicador «Guardado» / «Sin guardar» / «Guardando…». */
export function EstadoGuardado({ estado }: { estado: "guardado" | "sinGuardar" | "guardando" | "nuevo" }) {
  if (estado === "nuevo") return <span className="text-[13px] text-texto-4">Sin guardar todavía</span>;
  if (estado === "guardando") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-texto-3" role="status">
        <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-primary-200 border-t-primary" />
        Guardando…
      </span>
    );
  }
  if (estado === "guardado") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-700" role="status">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />
        Guardado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-warning-text" role="status">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
      Sin guardar
    </span>
  );
}
