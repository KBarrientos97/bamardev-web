import { contar } from "../lib/gastos";
import { fmtMoney } from "../lib/format";
import type { GastosAtrasados } from "../types";
import { Icon } from "./Icon";

/**
 * Lo que se debe de meses anteriores, arriba de la lista de Gastos.
 *
 * El resumen es por mes a propósito: el estado de resultado suma cada gasto en
 * el mes en que se hizo. Pero una deuda no es del mes: la luz de septiembre sin
 * pagar se sigue debiendo en octubre. Hasta el 1-oct-2026 no aparecía en ningún
 * lado mirando octubre, y el dueño se olvidaba de ella.
 *
 * Lo usan las dos pantallas (restaurante y farmacia). No se dibuja si no hay
 * nada atrasado, ni mientras ya se están mirando.
 */
export function AvisoGastosAtrasados({
  atrasado,
  viendo,
  onVer,
}: {
  atrasado: GastosAtrasados | null | undefined;
  /** Si la lista ya está mostrando los atrasados: el aviso estaría de más. */
  viendo: boolean;
  onVer: () => void;
}) {
  if (!atrasado || atrasado.cantidad === 0 || viendo) return null;
  // Rojo si alguno ya venció (como un gasto vencido en la lista); si no, el
  // ámbar de "por pagar".
  const urgente = atrasado.vencidos > 0;
  return (
    <section
      aria-label="Gastos de meses anteriores"
      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
        urgente ? "border-danger/40 bg-danger-bg" : "border-warning/40 bg-warning-bg"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 shrink-0 ${urgente ? "text-danger-text" : "text-warning-text"}`}>
          <Icon name="alert" size={20} />
        </span>
        <div>
          <p className={`text-sm font-bold ${urgente ? "text-danger-text" : "text-warning-text"}`}>
            {contar(atrasado.cantidad, "gasto", "gastos")} de meses anteriores sin pagar ·{" "}
            {fmtMoney(atrasado.saldo)}
          </p>
          <p className="mt-0.5 text-[13px] text-texto-2">
            {urgente ? `${contar(atrasado.vencidos, "ya venció", "ya vencieron")}. ` : ""}
            No suman al mes que estás mirando, pero se siguen debiendo.
          </p>
        </div>
      </div>
      <button
        onClick={onVer}
        className="shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-texto ring-1 ring-borde transition-colors hover:bg-muted"
      >
        Ver cuáles
      </button>
    </section>
  );
}
