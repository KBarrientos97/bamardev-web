import { fmtHora } from "../../lib/format";
import type { CajaDelLocal } from "../../types";

/**
 * ¿A qué caja va la cuenta de esta mesa?
 *
 * La pregunta sólo existe cuando el MESERO cobra y en el local hay VARIAS cajas
 * abiertas, de distintos usuarios: su cobro tiene que entrar al arqueo de una,
 * y el efectivo que junta se lo entrega a ese cajero. Con una sola caja abierta
 * no se pregunta nada y la cuenta va a ella, como siempre.
 *
 * Es una pantalla táctil de celular: renglones altos, de a uno, todos a la
 * vista (son pocas cajas) y ninguna elegida de antemano. Si se dejara una
 * marcada, el mesero confirmaría sin mirar y el efectivo le llegaría a quien no
 * lo está esperando. Por eso elige cada vez y sin elegir no se puede cobrar.
 */
export function ElegirCajaDeCuenta({
  cajas,
  elegida,
  onElegir,
}: {
  cajas: CajaDelLocal[];
  elegida: number | null;
  onElegir: (id: number) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Caja a la que va esta cuenta"
      className="rounded-2xl border border-borde bg-white p-4"
    >
      <p className="text-sm font-bold text-texto">¿A qué caja va esta cuenta?</p>
      <p className="mt-0.5 text-xs text-texto-3">
        Hay {cajas.length} cajas abiertas. Elegí la de quien te va a recibir el efectivo.
      </p>
      <div className="mt-3 space-y-2">
        {cajas.map((c) => {
          const activa = c.id === elegida;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => onElegir(c.id)}
              className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors ${
                activa
                  ? "border-marca bg-marca/10 ring-1 ring-marca"
                  : "border-borde bg-white hover:bg-muted"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  activa ? "border-marca" : "border-borde"
                }`}
              >
                {activa && <span className="h-2.5 w-2.5 rounded-full bg-marca" />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-texto">
                  Caja de {c.usuario.nombre}
                </span>
                <span className="block text-xs text-texto-3">
                  abierta desde {fmtHora(c.fechaApertura)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
