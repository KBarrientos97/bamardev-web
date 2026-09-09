import { useState } from "react";
import { aCentavos } from "../lib/dinero";
import { fmtMoney } from "../lib/format";
import { Icon } from "./Icon";

/** Billetes que circulan en Bolivia. */
const BILLETES = [200, 100, 50, 20, 10];
/** Monedas. Las de 0,10 y 0,20 entran igual: el arqueo tiene que cuadrar al centavo. */
const MONEDAS = [5, 2, 1, 0.5, 0.2, 0.1];

/**
 * Conteo por denominación, para no sumar la caja de cabeza.
 *
 * Es lo que hace un cajero al abrir y al cerrar: apila billetes, cuenta cuántos
 * hay de cada uno y anota el total. Tecleando el total directo es donde se
 * cuelan los errores que después aparecen como un faltante que nadie cometió.
 *
 * El resultado se copia al campo de monto. Si después el cajero corrige el
 * monto a mano, quien lo usa descarta el conteo (`onCambio` deja de mandarse):
 * un conteo que dice 340 y un monto que dice 350 se contradicen, y guardar los
 * dos sería guardar una mentira. Port de la sección de corte de
 * `AperturaCajaFragment`.
 */
export default function CorteDeCaja({
  onTotal,
  titulo = "Contar por denominación",
}: {
  /** Se llama con el total cada vez que cambia el conteo. */
  onTotal: (total: number) => void;
  titulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [conteo, setConteo] = useState<Record<number, number>>({});

  const total = aCentavos(
    Object.entries(conteo).reduce((acc, [valor, n]) => acc + Number(valor) * n, 0),
  );

  function fijar(valor: number, cantidad: number) {
    const limpio = Math.max(0, Math.floor(cantidad) || 0);
    const nuevo = { ...conteo, [valor]: limpio };
    setConteo(nuevo);
    onTotal(
      aCentavos(Object.entries(nuevo).reduce((acc, [v, n]) => acc + Number(v) * n, 0)),
    );
  }

  function limpiar() {
    setConteo({});
    onTotal(0);
  }

  return (
    <div className="rounded-xl border border-borde">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <Icon name="dollar" size={17} />
        <span className="flex-1 text-[13px] font-bold text-texto">{titulo}</span>
        {total > 0 && (
          <span className="text-[13px] font-bold text-primary-700">{fmtMoney(total)}</span>
        )}
        <Icon name={abierto ? "chevronDown" : "chevronRight"} size={16} />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde-soft p-3.5">
          <Grupo etiqueta="Billetes" valores={BILLETES} conteo={conteo} onFijar={fijar} />
          <Grupo etiqueta="Monedas" valores={MONEDAS} conteo={conteo} onFijar={fijar} />

          <div className="flex items-center justify-between border-t border-borde pt-2.5">
            <button
              type="button"
              onClick={limpiar}
              className="text-xs font-semibold text-texto-3 hover:text-texto"
            >
              Limpiar conteo
            </button>
            <p className="text-sm font-bold text-texto">Total: {fmtMoney(total)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo({
  etiqueta,
  valores,
  conteo,
  onFijar,
}: {
  etiqueta: string;
  valores: number[];
  conteo: Record<number, number>;
  onFijar: (valor: number, cantidad: number) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-texto-4">
        {etiqueta}
      </p>
      <ul className="space-y-1.5">
        {valores.map((v) => {
          const n = conteo[v] ?? 0;
          return (
            <li key={v} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-[13px] font-semibold text-texto-2">
                {fmtMoney(v)}
              </span>
              <button
                type="button"
                onClick={() => onFijar(v, n - 1)}
                disabled={n === 0}
                aria-label={`Quitar un ${fmtMoney(v)}`}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-borde text-texto-2 disabled:opacity-40"
              >
                −
              </button>
              {/* También se teclea: 20 monedas de Bs 0,50 son 20 toques. */}
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={n === 0 ? "" : n}
                onChange={(e) => onFijar(v, Number(e.target.value))}
                placeholder="0"
                aria-label={`Cantidad de ${fmtMoney(v)}`}
                className="w-14 rounded-lg border border-borde px-2 py-1 text-center text-[13px] outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => onFijar(v, n + 1)}
                aria-label={`Agregar un ${fmtMoney(v)}`}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-borde text-texto-2"
              >
                +
              </button>
              <span className="flex-1 text-right text-[13px] text-texto-3">
                {n > 0 ? fmtMoney(v * n) : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
