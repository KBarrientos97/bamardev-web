import { useState } from "react";
import { FILA_DESLIZABLE } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Boton, Input, Modal } from "../../components/ui";
import { horaDeCorte } from "../../lib/jornada";
import { correrDia } from "../../lib/topeReportes";
import {
  diasDe,
  excedeTope,
  MAX_DIAS_REPORTE,
  MENSAJE_TOPE,
  NOMBRE_PRESET,
  periodoDe,
  rangoElegido,
  textoJornada,
  textoRango,
  type Periodo,
  type Preset,
} from "./periodo";

/**
 * La barra del período de los reportes: los chips (Hoy, Ayer, Semana, Mes,
 * 3 meses), "Personalizado" con su diálogo y las fechas que se miran.
 *
 * Vivía dentro de `Reportes.tsx`; salió a su archivo el 28-oct (L5) para que
 * los reportes del instituto elijan el período igual que Reportes de ventas,
 * con los mismos nombres y el mismo tope de 3 meses.
 */

const CHIPS: Exclude<Preset, "rango" | "mesPasado" | "dias30">[] = ["hoy", "ayer", "semana", "mes", "dias90"];

export function BarraPeriodo({
  periodo,
  onCambio,
  contra,
  corteMin,
}: {
  periodo: Periodo;
  onCambio: (p: Periodo) => void;
  /** Contra qué comparan las flechas. Sin él (un reporte sin flechas) no se dice. */
  contra?: string;
  corteMin: number;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const otro = !(CHIPS as Preset[]).includes(periodo.preset);
  // En un billar, qué horas mira de verdad el período: "13/10" a secas no
  // dice si la 1 a. m. de esa noche está adentro.
  const jornada = textoJornada(periodo, corteMin);
  const chip = (activo: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
      activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
    }`;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3 sm:px-6">
      {/* En el celular, una sola fila que se desliza (ver FILA_DESLIZABLE). */}
      <div className={`flex flex-wrap items-center gap-2 max-md:w-full ${FILA_DESLIZABLE}`}>
        <span className="hidden items-center gap-1.5 text-[13px] font-semibold text-texto-3 sm:flex">
          <Icon name="calendar" size={15} />
          Período
        </span>
        {CHIPS.map((p) => (
          <button key={p} type="button" onClick={() => onCambio(periodoDe(p, new Date(), corteMin))} className={chip(periodo.preset === p)}>
            {NOMBRE_PRESET[p]}
          </button>
        ))}
        <button type="button" onClick={() => setEligiendo(true)} className={chip(otro)}>
          <Icon name="calendar" size={14} />
          {otro ? (periodo.preset === "rango" ? textoRango(periodo.desde, periodo.hasta) : NOMBRE_PRESET[periodo.preset]) : "Personalizado"}
        </button>
      </div>
      <p className="ml-auto text-[12px] text-texto-3">
        <span className="font-semibold text-texto-2">{textoRango(periodo.desde, periodo.hasta)}</span>
        {jornada && (
          <span title={`Lo que se cobra antes de las ${horaDeCorte(corteMin)} cuenta para el día anterior.`}>
            {" "}
            · jornada <span className="font-semibold text-texto-2">{jornada}</span>
          </span>
        )}
        {contra && <> · flechas comparadas con {contra}</>}
      </p>
      {eligiendo && (
        <DialogoPeriodo
          corteMin={corteMin}
          periodo={periodo}
          onElegir={(p) => {
            onCambio(p);
            setEligiendo(false);
          }}
          onCerrar={() => setEligiendo(false)}
        />
      )}
    </div>
  );
}

const PRESETS_DIALOGO: [Exclude<Preset, "rango">, string][] = [
  ["hoy", "Hoy"],
  ["ayer", "Ayer"],
  ["semana", "Semana"],
  ["mes", "Este mes"],
  ["mesPasado", "Mes pasado"],
  ["dias30", "Últimos 30 días"],
  ["dias90", "Últimos 3 meses"],
];

function DialogoPeriodo({
  periodo,
  corteMin,
  onElegir,
  onCerrar,
}: {
  periodo: Periodo;
  corteMin: number;
  onElegir: (p: Periodo) => void;
  onCerrar: () => void;
}) {
  const [desde, setDesde] = useState(periodo.preset === "rango" ? periodo.desde : "");
  const [hasta, setHasta] = useState(periodo.preset === "rango" ? periodo.hasta : "");
  const completo = /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta);
  // El tope de 3 meses: el calendario no deja elegir más allá (min/max), pero
  // una fecha escrita a mano o un navegador que ignora el min/max puede pasar,
  // y ahí se avisa en vez de mandar un pedido que el backend rechaza.
  const largo = completo && excedeTope(desde, hasta);
  const valido = completo && !largo;
  return (
    <Modal
      abierto
      titulo="Elegir período"
      subtitulo="Filtrá todos los reportes por fecha"
      onClose={onCerrar}
      ancho="max-w-lg"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cancelar
          </Boton>
          <Boton icono="check" disabled={!valido} onClick={() => onElegir(rangoElegido(desde, hasta))}>
            Aplicar rango
          </Boton>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        {PRESETS_DIALOGO.map(([p, nombre]) => (
          <button
            key={p}
            type="button"
            onClick={() => onElegir(periodoDe(p, new Date(), corteMin))}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              periodo.preset === p ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {nombre}
          </button>
        ))}
      </div>
      <div className="mt-5 border-t border-borde-soft pt-4">
        <p className="mb-2 text-[13px] font-bold text-texto">Rango personalizado</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Desde</span>
            <Input
              type="date"
              value={desde}
              min={hasta ? correrDia(hasta, -(MAX_DIAS_REPORTE - 1)) : undefined}
              max={hasta || undefined}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-texto-2">Hasta</span>
            <Input
              type="date"
              value={hasta}
              min={desde || undefined}
              max={desde ? correrDia(desde, MAX_DIAS_REPORTE - 1) : undefined}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
        </div>
        {largo ? (
          <p role="alert" className="mt-2 text-[12px] font-semibold text-red-600">
            {MENSAJE_TOPE} Elegiste {diasDe(desde, hasta)} días.
          </p>
        ) : (
          <p className="mt-2 text-[12px] text-texto-3">Hasta 3 meses por reporte.</p>
        )}
      </div>
    </Modal>
  );
}
