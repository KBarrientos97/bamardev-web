import { Icon } from "../../../components/Icon";
import {
  correrPeriodo,
  periodoDe,
  textoPeriodo,
  type PeriodoElegido,
  type TipoPeriodo,
} from "../../../lib/agenda/periodos";

const TIPOS: [TipoPeriodo, string][] = [
  ["SEMANA", "Semana"],
  ["QUINCENA", "Quincena"],
  ["MES", "Mes"],
];

/**
 * Semana, quincena o mes, con flechas para ir al anterior o al siguiente:
 * así se liquida en el negocio (semanal o quincenal). Lo usan la pantalla de
 * comisiones y "Mi producción".
 */
export default function SelectorPeriodo({
  valor,
  onChange,
  compacto,
}: {
  valor: PeriodoElegido;
  onChange: (p: PeriodoElegido) => void;
  compacto?: boolean;
}) {
  const mover = (paso: -1 | 1) => onChange({ tipo: valor.tipo, ...correrPeriodo(valor.tipo, valor, paso) });
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compacto ? "" : "justify-between"}`}>
      <div role="group" aria-label="Tipo de período" className="flex gap-1.5">
        {TIPOS.map(([t, etiqueta]) => (
          <button
            key={t}
            type="button"
            aria-pressed={valor.tipo === t}
            onClick={() => onChange({ tipo: t, ...periodoDe(t, valor.desde) })}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              valor.tipo === t
                ? "bg-primary-boton text-white"
                : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Período anterior"
          onClick={() => mover(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <span className="min-w-[9rem] text-center text-[13px] font-semibold text-texto-2">
          {textoPeriodo(valor.desde, valor.hasta)}
        </span>
        <button
          type="button"
          aria-label="Período siguiente"
          onClick={() => mover(1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
        >
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    </div>
  );
}
