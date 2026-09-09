import { Icon } from "../../components/Icon";
import { fmtFecha, fmtMoney } from "../../lib/format";
import type { Credito } from "../../types";

/**
 * Lo que el negocio tiene fiado, dentro del historial del día.
 *
 * Va acá y no sólo en su sección porque es lo que la cajera mira antes de
 * cerrar: la plata que no está en el cajón y alguien tiene que salir a buscar.
 * El bloque de arriba dice cuánto es en total; la lista, a quién hay que
 * cobrarle **hoy**.
 */
export default function CuentasPorCobrar({
  creditos,
  fiadoDelTurno,
  onVerTodos,
}: {
  creditos: Credito[];
  /** Lo que fió este cajero en su turno: es lo que le toca explicar al cerrar. */
  fiadoDelTurno?: number;
  onVerTodos: () => void;
}) {
  const abiertos = creditos.filter((c) => c.saldo > 0);
  if (abiertos.length === 0) return null;

  const total = abiertos.reduce((a, c) => a + c.saldo, 0);
  const vencido = abiertos
    .filter((c) => c.vencido)
    .reduce((a, c) => a + c.saldo, 0);

  // Los que hay que cobrar hoy o ya se pasaron: es la lista sobre la que se
  // puede hacer algo ahora mismo.
  const urgentes = abiertos
    .filter((c) => c.vencido || (c.diasParaVencer ?? 99) <= 0)
    .sort((a, b) => (b.diasAtraso ?? 0) - (a.diasAtraso ?? 0));

  return (
    <section>
      <button
        onClick={onVerTodos}
        className="flex w-full items-center gap-3 rounded-2xl border border-[#FCD34D] bg-[#FFFBEB] px-4 py-3.5 text-left"
      >
        <span className="text-[#D97706]">
          <Icon name="clock" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#D97706]">
            Cuentas por cobrar
          </p>
          <p className="text-2xl font-extrabold text-[#D97706]">{fmtMoney(total)}</p>
          <p className="text-[11px] text-[#D97706]">
            {abiertos.length} {abiertos.length === 1 ? "crédito abierto" : "créditos abiertos"}
            {vencido > 0 ? ` · ${fmtMoney(vencido)} vencido` : ""}
            {fiadoDelTurno && fiadoDelTurno > 0
              ? ` · ${fmtMoney(fiadoDelTurno)} fiado en tu turno`
              : ""}
          </p>
        </div>
        <Icon name="chevronRight" size={18} />
      </button>

      {urgentes.length > 0 && (
        <>
          <div className="mb-2 mt-4 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wide text-[#DC2626]">
              <Icon name="alert" size={14} />
              Cobrar hoy o ya vencidos
            </h2>
            <button
              onClick={onVerTodos}
              className="shrink-0 text-[13px] font-semibold text-[#D97706]"
            >
              Ver todos
            </button>
          </div>
          <ul className="space-y-2">
            {urgentes.map((c) => (
              <li key={c.id}>
                <Tarjeta credito={c} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Tarjeta({ credito: c }: { credito: Credito }) {
  const pagado = c.montoTotal > 0 ? (c.montoTotal - c.saldo) / c.montoTotal : 0;
  const atraso = c.diasAtraso ?? 0;

  return (
    <div className="card p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
            c.vencido ? "bg-[#FEF2F2] text-[#DC2626]" : "bg-[#FFFBEB] text-[#D97706]"
          }`}
        >
          {iniciales(c.clienteNombre)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[15px] font-bold text-texto">{c.clienteNombre}</p>
            <span
              className={`shrink-0 text-[15px] font-extrabold ${
                c.vencido ? "text-[#DC2626]" : "text-[#D97706]"
              }`}
            >
              {fmtMoney(c.saldo)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs text-texto-3">{c.codigo}</p>
            <Badge estado={c.vencido ? "Vencido" : c.estado === "ABONADO" ? "Abonado" : "Pendiente"} />
          </div>
        </div>
      </div>

      {/* La barra dice de un vistazo cuánto falta: un cliente que ya abonó la
          mitad no se trata igual que uno que no pagó nada. */}
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${c.vencido ? "bg-[#DC2626]" : "bg-[#D97706]"}`}
          style={{ width: `${Math.min(100, Math.round(pagado * 100))}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs">
        <span className={c.vencido ? "text-[#DC2626]" : "text-texto-3"}>
          {c.vencido
            ? `Atrasado ${atraso} ${atraso === 1 ? "día" : "días"} · ${fmtFecha(c.fechaCompromiso)}`
            : `Vence ${fmtFecha(c.fechaCompromiso)}`}
        </span>
        <span className="shrink-0 text-texto-3">
          Abonado {fmtMoney(c.montoTotal - c.saldo)}
        </span>
      </div>
    </div>
  );
}

function Badge({ estado }: { estado: string }) {
  const clase =
    estado === "Vencido"
      ? "bg-[#FEF2F2] text-[#DC2626]"
      : estado === "Abonado"
        ? "bg-[#FFFBEB] text-[#D97706]"
        : "bg-[#EFF6FF] text-[#2563EB]";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${clase}`}>
      {estado}
    </span>
  );
}

function iniciales(nombre: string): string {
  const p = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return "?";
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[1][0]).toUpperCase();
}
