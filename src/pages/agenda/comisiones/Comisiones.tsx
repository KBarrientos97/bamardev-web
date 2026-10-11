import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EncabezadoPagina } from "../../../components/filtros";
import { fechaNegocio } from "../../../lib/agenda/horaAgenda";
import {
  periodoActual,
  periodoCerrado,
  terminaDespues,
  type PeriodoElegido,
} from "../../../lib/agenda/periodos";
import { tienePermiso } from "../../../lib/permisos";
import { useAuth } from "../../../store/AuthContext";
import SelectorPeriodo from "./SelectorPeriodo";
import TabAdelantos from "./TabAdelantos";
import TabLiquidaciones from "./TabLiquidaciones";
import TabLiquidar from "./TabLiquidar";
import TabPorcentajes from "./TabPorcentajes";
import TabProduccion from "./TabProduccion";

type Pestana = "produccion" | "liquidar" | "adelantos" | "liquidaciones" | "porcentajes";

const ETIQUETAS: Record<Pestana, string> = {
  produccion: "Producción",
  liquidar: "Liquidar",
  adelantos: "Adelantos",
  liquidaciones: "Liquidaciones",
  porcentajes: "Porcentajes",
};

/**
 * Comisiones de los profesionales (PLAN-AGENDA-BELLEZA §2.5, fase 2): lo que
 * produjo cada uno, los adelantos y la liquidación por semana, quincena o mes.
 *
 * Mirar es `comisiones.ver` (dueño y encargado); liquidar, dar adelantos y
 * cambiar porcentajes es `comisiones.liquidar` (el dueño). El backend lo
 * exige igual: acá sólo no se ofrece lo que respondería 403.
 */
export default function Comisiones() {
  const { usuario } = useAuth();
  const liquida = tienePermiso(usuario, "comisiones.liquidar");
  const pestanas: Pestana[] = liquida
    ? ["produccion", "liquidar", "adelantos", "liquidaciones", "porcentajes"]
    : ["produccion", "adelantos", "liquidaciones"];

  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana") as Pestana | null;
  const pestana: Pestana = pedida && pestanas.includes(pedida) ? pedida : "produccion";

  // El período es uno solo para Producción y Liquidar: mirar la quincena y
  // pasar a liquidarla no obliga a elegirla de nuevo. Para liquidar, por
  // defecto el último período cerrado (QA N2-08): el de hoy todavía no
  // terminó y el backend no deja liquidar días que no pasaron.
  const [periodo, setPeriodo] = useState<PeriodoElegido>(() =>
    pestana === "liquidar" ? periodoCerrado("SEMANA", fechaNegocio()) : periodoActual("SEMANA", fechaNegocio()),
  );
  const elegir = (p: Pestana) => {
    const nuevos = new URLSearchParams(params);
    nuevos.set("pestana", p);
    setParams(nuevos, { replace: true });
    const hoy = fechaNegocio();
    if (p === "liquidar" && periodo.tipo !== "OTRO" && terminaDespues(periodo, hoy)) {
      setPeriodo(periodoCerrado(periodo.tipo, hoy));
    }
  };
  const [recursoLiquidar, setRecursoLiquidar] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Comisiones"
        subtitulo="Producción de cada profesional, adelantos y liquidación."
      />

      <div
        role="tablist"
        aria-label="Secciones de comisiones"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {pestanas.map((p) => (
          <button
            key={p}
            role="tab"
            id={`tab-${p}`}
            aria-selected={pestana === p}
            aria-controls={`panel-${p}`}
            onClick={() => elegir(p)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              pestana === p ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
            }`}
          >
            {ETIQUETAS[p]}
          </button>
        ))}
      </div>

      {(pestana === "produccion" || pestana === "liquidar") && (
        <SelectorPeriodo valor={periodo} onChange={setPeriodo} libre />
      )}

      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`tab-${pestana}`}>
        {pestana === "produccion" && (
          <TabProduccion
            periodo={periodo}
            onLiquidar={
              liquida
                ? (recursoId) => {
                    setRecursoLiquidar(recursoId);
                    elegir("liquidar");
                  }
                : undefined
            }
          />
        )}
        {pestana === "liquidar" && liquida && (
          <TabLiquidar
            periodo={periodo}
            onPeriodo={setPeriodo}
            recursoId={recursoLiquidar}
            onRecurso={setRecursoLiquidar}
          />
        )}
        {pestana === "adelantos" && <TabAdelantos puedeRegistrar={liquida} />}
        {pestana === "liquidaciones" && <TabLiquidaciones />}
        {pestana === "porcentajes" && liquida && <TabPorcentajes />}
      </div>
    </div>
  );
}
