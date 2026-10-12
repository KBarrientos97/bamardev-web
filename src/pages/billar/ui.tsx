import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type NombreIcono } from "../../components/Icon";
import { fmtMoney } from "../../lib/format";
import { useAuth } from "../../store/AuthContext";
import { horaDe } from "./calculo";
import { ESTADOS } from "./estilos";
import { useBillar } from "./store";
import type { EstadoVisual } from "./tipos";

/** Piezas visuales del billar (los colores por estado viven en `estilos.ts`). */

export function EstadoBadge({ estado, className = "" }: { estado: EstadoVisual; className?: string }) {
  const e = ESTADOS[estado];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${e.badge} ${className}`}
    >
      {e.icono ? (
        <Icon name={e.icono} size={12} strokeWidth={2.5} />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      )}
      {e.etiqueta}
    </span>
  );
}

type VarianteB = "verde" | "menta" | "blanco" | "ambar" | "rosa" | "azul";

const VARIANTES_B: Record<VarianteB, string> = {
  verde: "bg-primary-boton text-white hover:bg-primary-boton-hover active:bg-primary-boton-activo disabled:bg-primary-200",
  menta: "bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-200 hover:bg-primary-100",
  blanco: "bg-white text-texto ring-1 ring-inset ring-borde hover:bg-muted",
  ambar: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-300 hover:bg-amber-200/70",
  rosa: "bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50",
  azul: "bg-white text-blue-800 ring-1 ring-inset ring-blue-200 hover:bg-blue-50",
};

/** El botón redondeado de la maqueta. Mínimo 40 px de alto: se toca en tablet. */
export function BotonB({
  variante = "blanco",
  icono,
  grande = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: VarianteB; icono?: NombreIcono; grande?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        grande ? "min-h-12 px-5 text-[15px]" : "min-h-10 px-4 text-sm",
        VARIANTES_B[variante],
        className,
      ].join(" ")}
    >
      {icono && <Icon name={icono} size={grande ? 18 : 16} />}
      {children}
    </button>
  );
}

/** Una fila etiqueta / valor, como las de las tarjetas y el panel. */
export function Fila({
  etiqueta,
  valor,
  fuerte = false,
  className = "",
}: {
  etiqueta: ReactNode;
  valor: ReactNode;
  fuerte?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${className}`}>
      <span className="text-texto-3">{etiqueta}</span>
      <span className={`text-right tabular-nums ${fuerte ? "font-bold text-texto" : "font-semibold text-texto"}`}>
        {valor}
      </span>
    </div>
  );
}

/** Ícono en un círculo de color, el de los encabezados de modales y KPIs. */
export function Circulo({
  icono,
  tono = "verde",
  size = 40,
}: {
  icono: NombreIcono;
  tono?: "verde" | "ambar" | "rosa" | "azul" | "gris";
  size?: number;
}) {
  const color = {
    verde: "bg-primary-50 text-primary-700",
    ambar: "bg-amber-100 text-amber-700",
    rosa: "bg-rose-100 text-rose-700",
    azul: "bg-blue-100 text-blue-700",
    gris: "bg-slate-100 text-slate-500",
  }[tono];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${color}`}
      style={{ width: size, height: size }}
    >
      <Icon name={icono} size={Math.round(size * 0.45)} />
    </span>
  );
}

/**
 * El encabezado de las pantallas del billar: título, la sucursal y la caja del
 * turno abajo, y las acciones a la derecha (bajan de renglón si no entran).
 */
export function Encabezado({
  titulo,
  children,
}: {
  titulo: ReactNode;
  children?: ReactNode;
}) {
  const { usuario } = useAuth();
  const { caja } = useBillar();
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-borde bg-white px-4 py-3 sm:px-6">
      {/* Con un ancho mínimo, si las acciones no entran bajan de renglón en vez de aplastar el título. */}
      <div className="min-w-[14rem] flex-1">
        <h1 className="flex items-center gap-2 text-xl font-bold leading-tight text-texto">
          <span className="truncate">{titulo}</span>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            {usuario?.sucursal ?? "Principal"}
          </span>
        </h1>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-texto-3">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${caja.abierta ? "bg-primary" : "bg-slate-300"}`}
            aria-hidden
          />
          {caja.abierta
            ? `Caja abierta ${horaDe(caja.desde)} · ${fmtMoney(caja.inicial)}`
            : "Caja cerrada"}
        </p>
      </div>
      {children}
    </header>
  );
}

/** Un chip de filtro con su contador. */
export function ChipFiltro({
  activo,
  etiqueta,
  cuenta,
  onClick,
}: {
  activo: boolean;
  etiqueta: string;
  cuenta?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className={[
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
        activo
          ? "bg-primary-boton text-white"
          : "bg-white text-texto-2 ring-1 ring-inset ring-borde hover:bg-muted",
      ].join(" ")}
    >
      {etiqueta}
      {cuenta !== undefined && (
        <span
          className={`rounded-full px-1.5 text-[11px] font-bold leading-[18px] tabular-nums ${
            activo ? "bg-white/25 text-white" : "bg-slate-100 text-texto-3"
          }`}
        >
          {cuenta}
        </span>
      )}
    </button>
  );
}

/** Elegir una opción entre pocas (Ninguna / Carnet / Otro). */
export function Segmentado<T extends string>({
  opciones,
  valor,
  onCambiar,
  etiqueta,
}: {
  opciones: { valor: T; texto: string }[];
  valor: T;
  onCambiar: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="flex rounded-full bg-slate-100 p-1">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onCambiar(o.valor)}
          className={`min-h-9 flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors ${
            valor === o.valor ? "bg-white text-texto shadow-sm" : "text-texto-3 hover:text-texto"
          }`}
        >
          {o.texto}
        </button>
      ))}
    </div>
  );
}

/** Un aviso dentro de un panel o modal (verde, gris, ámbar, azul). */
/**
 * El "no" del servidor dentro del diálogo (caja cerrada, la mesa cambió, PIN
 * incorrecto…), con rol alert para que el lector de pantalla lo diga.
 */
export function ErrorAccion({ texto }: { texto: string }) {
  if (!texto) return null;
  return (
    <div role="alert" className="mt-3">
      <Nota tono="rosa" icono="alert">
        {texto}
      </Nota>
    </div>
  );
}

export function Nota({
  tono = "verde",
  icono = "info",
  children,
}: {
  tono?: "verde" | "gris" | "ambar" | "azul" | "rosa";
  icono?: NombreIcono;
  children: ReactNode;
}) {
  const color = {
    verde: "border-primary-200 bg-primary-50 text-primary-700",
    gris: "border-slate-200 bg-slate-50 text-texto-2",
    ambar: "border-amber-200 bg-amber-50 text-amber-800",
    azul: "border-blue-200 bg-blue-50 text-blue-800",
    rosa: "border-rose-200 bg-rose-50 text-rose-700",
  }[tono];
  return (
    <div className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] ${color}`}>
      <span className="mt-px shrink-0">
        <Icon name={icono} size={16} />
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** El rótulo chiquito en mayúsculas de las secciones ("CONSUMOS"). */
export function Rotulo({ icono, children, extra }: { icono?: NombreIcono; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-texto-3">
        {icono && <Icon name={icono} size={14} />}
        {children}
      </span>
      {extra && <span className="text-[11px] font-bold uppercase tabular-nums text-texto-3">{extra}</span>}
    </div>
  );
}

/** Una tarjeta con encabezado (ícono, título y un dato a la derecha): la del cierre, la del admin y la de reportes. */
export function Tarjeta({
  icono,
  titulo,
  extra,
  children,
  className = "",
  cuerpo = "px-4 py-4 sm:px-5",
}: {
  icono?: NombreIcono;
  titulo: ReactNode;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Clases del cuerpo: una tabla va sin relleno. */
  cuerpo?: string;
}) {
  return (
    <section className={`card overflow-hidden ${className}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-borde-soft px-4 py-3.5 sm:px-5">
        {icono && <Circulo icono={icono} size={36} />}
        <h2 className="min-w-0 flex-1 text-[15px] font-bold text-texto">{titulo}</h2>
        {extra && <span className="text-[12px] text-texto-3">{extra}</span>}
      </header>
      <div className={cuerpo}>{children}</div>
    </section>
  );
}
