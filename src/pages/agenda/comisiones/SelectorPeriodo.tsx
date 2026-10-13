import { useState } from "react";
import { Icon } from "../../../components/Icon";
import { Input } from "../../../components/ui";
import {
  correrPeriodo,
  periodoDe,
  textoPeriodo,
  type PeriodoElegido,
  type TipoPeriodo,
} from "../../../lib/agenda/periodos";
import type { Periodo } from "../../../lib/agenda/tiposComisiones";
import { correrDia, excedeTope, MAX_DIAS_REPORTE, MENSAJE_TOPE } from "../../../lib/topeReportes";

const TIPOS: [TipoPeriodo, string][] = [
  ["SEMANA", "Semana"],
  ["QUINCENA", "Quincena"],
  ["MES", "Mes"],
];
const OTRO: [Periodo, string] = ["OTRO", "Otro"];

/**
 * Semana, quincena o mes, con flechas para ir al anterior o al siguiente:
 * así se liquida en el negocio (semanal o quincenal). Lo usan la pantalla de
 * comisiones y "Mi producción".
 *
 * Con `libre`, además "Otro": un rango de fechas a mano. Hace falta para
 * liquidar lo que queda de una semana que ya se liquidó en parte (QA N2-08:
 * desde la web no había forma, aunque el backend lo acepta). Con el tope de 3
 * meses de todos los reportes: el calendario no ofrece más, y una fecha
 * escrita a mano que lo pase no se aplica (el backend la rechazaría).
 */
export default function SelectorPeriodo({
  valor,
  onChange,
  compacto,
  libre,
}: {
  valor: PeriodoElegido;
  onChange: (p: PeriodoElegido) => void;
  compacto?: boolean;
  libre?: boolean;
}) {
  const tipo = valor.tipo;
  const mover = (paso: -1 | 1) => {
    if (tipo === "OTRO") return;
    onChange({ tipo, ...correrPeriodo(tipo, valor, paso) });
  };
  const opciones: [Periodo, string][] = libre ? [...TIPOS, OTRO] : TIPOS;
  const [largo, setLargo] = useState(false);
  const elegir = (desde: string, hasta: string) => {
    const pasa = excedeTope(desde, hasta);
    setLargo(pasa);
    if (!pasa) onChange({ ...valor, desde, hasta });
  };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${compacto ? "" : "justify-between"}`}>
      <div role="group" aria-label="Tipo de período" className="flex gap-1.5">
        {opciones.map(([t, etiqueta]) => (
          <button
            key={t}
            type="button"
            aria-pressed={valor.tipo === t}
            onClick={() =>
              onChange(t === "OTRO" ? { ...valor, tipo: "OTRO" } : { tipo: t, ...periodoDe(t, valor.desde) })
            }
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
      {tipo === "OTRO" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Desde"
            type="date"
            value={valor.desde}
            min={correrDia(valor.hasta, -(MAX_DIAS_REPORTE - 1))}
            max={valor.hasta}
            onChange={(e) => e.target.value && elegir(e.target.value, valor.hasta)}
            className="w-40"
          />
          <span className="text-[13px] text-texto-3">al</span>
          <Input
            aria-label="Hasta"
            type="date"
            value={valor.hasta}
            min={valor.desde}
            max={correrDia(valor.desde, MAX_DIAS_REPORTE - 1)}
            onChange={(e) => e.target.value && elegir(valor.desde, e.target.value)}
            className="w-40"
          />
          {largo && (
            <p role="alert" className="w-full text-[12px] font-semibold text-red-600">
              {MENSAJE_TOPE}
            </p>
          )}
        </div>
      ) : (
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
      )}
    </div>
  );
}
