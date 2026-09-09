import { Icon } from "../../components/Icon";
import { Cargando, ErrorMsg } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtMoney, fmtNum } from "../../lib/format";
import { useApi } from "../../lib/useApi";
import type { Mesa } from "../../types/salon";
import { consumoDeMesa, hace } from "../salon/logicaSalon";

/**
 * Las mesas que el salón mandó a caja.
 *
 * El mesero pide la cuenta y la mesa aparece acá: el cobro es de la caja, él
 * no cobra nunca. Tocar una lleva al cobro con el total ya armado, así que la
 * cajera no retipea nada de lo que el cliente comió.
 */
export default function MesasPorCobrar({
  onAtras,
  onCobrar,
}: {
  onAtras: () => void;
  onCobrar: (mesa: Mesa) => void;
}) {
  const mesas = useApi(() => api.mesasPorCobrar(), []);
  const lista = mesas.datos ?? [];

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-lg flex-col">
      <div className="flex items-center gap-2 border-b border-borde bg-white px-4 py-3">
        <button
          onClick={onAtras}
          aria-label="Volver"
          className="rounded-lg p-1.5 text-texto-2 hover:bg-muted"
        >
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-[15px] font-bold text-texto">Mesas por cobrar</h1>
          <p className="text-xs text-texto-3">
            {lista.length === 0
              ? "Ninguna mesa pidió la cuenta."
              : `${lista.length} ${lista.length === 1 ? "cuenta esperando" : "cuentas esperando"}`}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {mesas.error && <ErrorMsg>{mesas.error}</ErrorMsg>}
        {mesas.cargando && !mesas.datos ? (
          <Cargando />
        ) : lista.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-texto-3">
            Ninguna mesa pidió la cuenta todavía.
          </p>
        ) : (
          lista.map((m) => (
            <button
              key={m.id}
              onClick={() => onCobrar(m)}
              className="card mb-2 flex w-full items-center gap-3 p-3.5 text-left transition-shadow hover:shadow-md"
            >
              {/* El código de la mesa, grande: es lo que la cajera busca cuando
                  el cliente le dice "vengo de la 4". */}
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-base font-extrabold text-[#DC2626]">
                {m.codigo}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-texto">
                  {m.zonaNombre} · {fmtNum(m.comensales)}{" "}
                  {m.comensales === 1 ? "persona" : "personas"}
                </p>
                <p className="truncate text-xs text-texto-3">
                  {m.meseroNombre ? `${m.meseroNombre} · ` : ""}
                  abierta hace {hace(m.abiertaEn)}
                </p>
              </div>
              <span className="shrink-0 text-base font-extrabold text-texto">
                {fmtMoney(consumoDeMesa(m))}
              </span>
              <Icon name="chevronRight" size={16} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
