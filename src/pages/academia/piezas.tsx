import type { ReactNode } from "react";
import type { Cuota, EstadoPagoMateria, EstadoPagoModulo } from "../../lib/academia/tipos";
import { nombreCuota, textoCuota, textoEstadoPago } from "../../lib/academia/vista";

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
              {o.n != null && " "}
              {o.n != null && (
                <span className={`ml-1 tabular-nums ${o.urgente && o.n > 0 ? "text-danger-text" : "text-texto-4"}`}>
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

/**
 * Un interruptor de sí o no, con su texto al lado. `bloqueado` lo deja a la
 * vista pero sin tocar: lo que el instituto todavía tiene que confirmar
 * (la retención, los atrasos) o lo que es regla fija (las 3 fotos).
 */
export function Interruptor({
  activo,
  onCambiar,
  etiqueta,
  detalle,
  bloqueado = false,
}: {
  activo: boolean;
  onCambiar?: (v: boolean) => void;
  etiqueta: string;
  detalle?: ReactNode;
  bloqueado?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm text-texto">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block text-[13px] text-texto-3">{detalle}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={etiqueta}
        disabled={bloqueado}
        onClick={() => onCambiar?.(!activo)}
        className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        style={{ background: activo ? "var(--color-primary-boton)" : "#CBD5E1" }}
      >
        <span
          aria-hidden="true"
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150"
          style={{ left: activo ? 18 : 2 }}
        />
      </button>
    </div>
  );
}

/**
 * Una sección de los ajustes: el título y para qué sirve a la izquierda, lo
 * que se toca a la derecha. En el celular, uno debajo del otro.
 */
export function SeccionAjuste({ id, titulo, bajada, children }: { id: string; titulo: string; bajada?: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-3 border-t border-borde-soft py-6 md:grid-cols-[minmax(200px,260px)_minmax(0,1fr)] md:gap-8"
    >
      <div>
        <h2 id={id} className="text-base font-bold text-texto">
          {titulo}
        </h2>
        {bajada && <p className="mt-1 text-[13px] text-texto-3">{bajada}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
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

const TONO_PAGO = {
  normal: "text-texto-2",
  ambar: "font-semibold text-warning-text",
  rojo: "font-semibold text-danger-text",
  gris: "text-texto-4",
} as const;

/** "Pagado · Abonó · Sin pagar": el estado del módulo actual, en texto (D6). */
export function EstadoPagoTexto({ estado }: { estado: EstadoPagoModulo | null | undefined }) {
  const t = textoEstadoPago(estado);
  return <span className={`text-sm ${TONO_PAGO[t.tono]}`}>{t.texto}</span>;
}
