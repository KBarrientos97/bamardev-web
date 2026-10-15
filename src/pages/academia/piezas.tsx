import type { ReactNode } from "react";
import type { Cuota, EstadoPagoMateria } from "../../lib/academia/tipos";
import { nombreCuota, textoCuota } from "../../lib/academia/vista";

/**
 * Piezas de las pantallas del instituto, con las reglas de la versión limpia
 * (PLAN-ACADEMIAS §5): el color sólo para lo que pide atención (vencido,
 * debe), lo normal en gris y sin pastilla; los indicadores son filtros.
 */

/**
 * "Todos 28 · Deben 5 · Al día 22": los indicadores SON los filtros, con la
 * línea debajo del elegido. El número de lo urgente va en rojo suave.
 */
export function FiltrosConteo<T extends string>({
  etiqueta,
  opciones,
  valor,
  onChange,
  derecha,
}: {
  etiqueta: string;
  opciones: { clave: T; label: string; n?: number | null; urgente?: boolean }[];
  valor: T;
  onChange: (v: T) => void;
  /** Lo que va del otro lado de la línea (las pestañas de la pantalla). */
  derecha?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-borde-soft">
      {/* scroll-lateral-ok: pestañas de filtro, el patrón aceptado (PLAN-TABLAS-MOVIL §2.6). */}
      <div role="tablist" aria-label={etiqueta} className="-mb-px flex gap-5 overflow-x-auto [scrollbar-width:none]">
        {opciones.map((o) => {
          const activo = o.clave === valor;
          return (
            <button
              key={o.clave}
              type="button"
              role="tab"
              aria-selected={activo}
              onClick={() => onChange(o.clave)}
              className={`shrink-0 whitespace-nowrap border-b-2 pb-3 pt-2.5 text-sm transition-colors ${
                activo ? "border-primary font-semibold text-texto" : "border-transparent text-texto-3 hover:text-texto-2"
              }`}
            >
              {o.label}
              {o.n != null && (
                <span className={`ml-1.5 tabular-nums ${o.urgente && o.n > 0 ? "text-danger-text" : "text-texto-4"}`}>
                  {o.n}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {derecha}
    </div>
  );
}

const ESTILO_PAGO: Record<EstadoPagoMateria, string> = {
  PAGADA: "border-primary bg-primary",
  PARCIAL: "border-warning-text bg-[linear-gradient(90deg,var(--color-warning-text)_50%,#fff_50%)]",
  PENDIENTE: "border-slate-300 bg-white",
  VENCIDA: "border-danger bg-danger",
  NA: "border-slate-100 bg-slate-100",
};

const TEXTO_PAGO: Record<EstadoPagoMateria, string> = {
  PAGADA: "pagado",
  PARCIAL: "abono",
  PENDIENTE: "pendiente",
  VENCIDA: "vencido",
  NA: "no corresponde",
};

/**
 * El pago de cada materia en una barrita: ● pagado · ◐ abono · ○ pendiente ·
 * ! vencido. Sólo la plata: la nota va en su pestaña, nunca en la misma celda.
 */
export function PuntosPago({ pagos }: { pagos: { materiaOrden: number; estado: EstadoPagoMateria; detalle?: string }[] }) {
  const orden = [...pagos].sort((a, b) => a.materiaOrden - b.materiaOrden);
  const texto = orden.map((p) => `M${p.materiaOrden}: ${p.detalle || TEXTO_PAGO[p.estado]}`).join(", ");
  return (
    <span className="flex gap-1.5" role="img" aria-label={texto} title={texto}>
      {orden.map((p) => (
        <span key={p.materiaOrden} className={`h-2.5 w-5 rounded-[3px] border-[1.5px] ${ESTILO_PAGO[p.estado]}`} />
      ))}
    </span>
  );
}

/** Etiqueta chica arriba, valor abajo: la grilla de datos de la tarjeta móvil. */
export function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className="truncate text-sm text-texto-2">{children}</dd>
    </div>
  );
}

/** El estado de cuenta corto del panel: un renglón por cuota. */
export function EstadoDeCuenta({ cuotas }: { cuotas: Cuota[] }) {
  if (!cuotas.length) return <p className="text-sm text-texto-3">Sin cuotas.</p>;
  return (
    <ul className="space-y-2.5">
      {cuotas.map((c) => {
        const t = textoCuota(c);
        return (
          <li key={c.id} className="flex items-baseline justify-between gap-3 text-sm">
            <span className={c.estado === "ANULADA" ? "text-texto-4 line-through" : "text-texto"}>{nombreCuota(c)}</span>
            <span
              className={`text-right tabular-nums ${t.urgente ? "font-semibold text-danger-text" : t.apagado ? "text-texto-3" : "text-texto-2"}`}
            >
              {t.texto}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
