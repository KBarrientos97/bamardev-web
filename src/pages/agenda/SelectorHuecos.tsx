import { useState } from "react";
import { horaNegocio } from "../../lib/agenda/horaAgenda";
import type { Propuesta } from "../../lib/agenda/tiposAgenda";

/** Cuántos horarios se ven antes de "Ver más": un día entero son 40 chips. */
const VISIBLES = 12;

/**
 * Los horarios que propone el backend para la secuencia pedida. El primero es
 * "el primer hueco" (§5.2) y viene elegido; se puede tocar otro. La pantalla
 * no calcula nada: sólo muestra inicios que el backend ya validó.
 */
export function SelectorHuecos({
  huecos,
  elegida,
  onElegir,
  cargando,
  nombreServicio,
  nombreRecurso,
}: {
  huecos: Propuesta[] | null;
  elegida: number;
  onElegir: (i: number) => void;
  cargando: boolean;
  nombreServicio: (id: number) => string;
  nombreRecurso: (id: number) => string;
}) {
  const [todos, setTodos] = useState(false);

  if (cargando) {
    return <p className="text-[13px] text-texto-3">Buscando horarios libres…</p>;
  }
  if (huecos === null) {
    return (
      <p className="text-[13px] text-texto-3">
        Elegí los servicios y te proponemos el primer horario libre.
      </p>
    );
  }
  if (huecos.length === 0) {
    return (
      <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
        No hay horarios libres ese día para esos servicios. Probá otra fecha u otro profesional.
      </p>
    );
  }

  const lista = todos ? huecos : huecos.slice(0, VISIBLES);
  const p = huecos[elegida] ?? huecos[0];

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Horarios libres" className="flex flex-wrap gap-2">
        {lista.map((h, i) => (
          <button
            key={`${h.inicio}-${i}`}
            type="button"
            role="radio"
            aria-checked={i === elegida}
            onClick={() => onElegir(i)}
            className={`min-w-[68px] rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
              i === elegida
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {horaNegocio(h.inicio)}
          </button>
        ))}
        {!todos && huecos.length > VISIBLES && (
          <button
            type="button"
            onClick={() => setTodos(true)}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50"
          >
            Ver {huecos.length - VISIBLES} más
          </button>
        )}
      </div>
      <ul className="space-y-1 rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-2">
        {elegida === 0 && <li className="text-[12px] font-bold text-primary-700">Primer horario libre</li>}
        {p.lineas.map((l, i) => (
          <li key={i}>
            <span className="font-semibold text-texto">{nombreServicio(l.servicioId)}</span> ·{" "}
            {horaNegocio(l.inicio)}–{horaNegocio(l.fin)} · con {nombreRecurso(l.recursoId)}
            {/* QA S2-08: en qué cabina, si el servicio ocupa una. */}
            {l.espacioId != null && l.espacioId !== l.recursoId ? ` · en ${nombreRecurso(l.espacioId)}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
