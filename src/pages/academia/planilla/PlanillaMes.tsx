import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import { Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import type { PlanillaMes as TPlanillaMes } from "../../../lib/academia/tipos";
import { useFiltroSede } from "../../../lib/academia/useFiltroSede";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { TEXTO_ESTADO_PLANILLA as TEXTO_ESTADO, textoRetencion } from "../../../lib/academia/vista";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";

/**
 * E14 · Planilla de docentes del mes (ronda 2, D2): cada docente con su %,
 * cuántos estudiantes cuentan (pagaron el módulo completo) de cuántos tiene,
 * el bruto, la retención (por confirmar, D9) y el líquido. Tocar uno abre su
 * planilla (N8), donde se cierra y se paga. Lo calcula todo el backend.
 */
export default function PlanillaMes() {
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const hoy = mesDe(new Date());
  const [mes, setMes] = useState(hoy);
  const datos = useApi(() => apiAcademia.planilla(mes, sede.sucursalId), [mes, sede.sucursalId]);
  const d = datos.datos;

  const acciones: AccionMenu[] = [
    { clave: "excel", etiqueta: "Exportar Excel con el formato del instituto", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
    { clave: "pct", etiqueta: `Cambiar el % de un ${p.carrera}`, icono: "percent", separar: true, onClick: () => navigate("/configuracion/carreras") },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-texto">Planilla {p.docente}s · {tituloMes(mes)}</h1>
          {d && <p className="mt-0.5 text-[13px] text-texto-3">{subtitulo(d, mes === hoy, sede.nombre)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Mes" className="flex items-center gap-1 rounded-xl border border-borde bg-white px-1">
            <button type="button" aria-label="Mes anterior" onClick={() => setMes(sumarMeses(mes, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted">
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="min-w-[7.5rem] text-center text-[13px] text-texto-2">{tituloMes(mes)}</span>
            <button
              type="button"
              aria-label="Mes siguiente"
              disabled={mes >= hoy}
              onClick={() => setMes(sumarMeses(mes, 1))}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
          <MenuMas etiqueta="Más acciones de la planilla" acciones={acciones} />
        </div>
      </header>

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : d.docentes.length === 0 ? (
        <Vacio icono="fileText" titulo={`Ningún ${p.docente} tiene ${p.materias} este mes`} />
      ) : (
        <>
          <section aria-label="Resumen del mes" className="grid gap-4 border-y border-borde-soft py-4 sm:grid-cols-4">
            <Cifra etiqueta="Bruto del mes" valor={fmtMoney(d.totales.bruto)} nota={`${d.docentes.length} ${d.docentes.length === 1 ? p.docente : `${p.docente}s`}`} />
            <Cifra
              etiqueta="Retención"
              valor={d.retencionActiva ? fmtMoney(d.docentes.reduce((s, x) => s + (x.retencion ?? 0), 0)) : "—"}
              nota={d.retencionActiva ? undefined : "Por confirmar con el cliente"}
            />
            <Cifra etiqueta={mes === hoy ? "Líquido provisorio" : "Líquido"} valor={fmtMoney(d.totales.liquido)} nota={d.retencionActiva ? undefined : "sin retención ni atrasos"} />
            <Cifra
              etiqueta="Estado"
              valor={`${d.docentes.filter((x) => x.estado !== "EN_CURSO").length} de ${d.docentes.length} cerradas`}
              nota={mes === hoy ? "se cierran a fin de mes" : `${d.docentes.filter((x) => x.estado === "PAGADA").length} pagadas`}
            />
          </section>

          <div className="hidden grid-cols-[minmax(200px,2fr)_120px_110px_110px_110px_100px_20px] gap-3 px-3 text-[12px] text-texto-3 md:grid">
            <span>{p.Docente}</span>
            <span>Cuentan / {p.alumnos}</span>
            <span className="text-right">Bruto</span>
            <span className="text-right">Retención</span>
            <span className="text-right">Líquido</span>
            <span>Estado</span>
            <span />
          </div>
          <ul className="divide-y divide-borde-soft border-b border-borde-soft">
            {d.docentes.map((x) => (
              <li key={x.personalId}>
                <Link
                  to={`/academia/planilla/${x.personalId}?mes=${mes}`}
                  aria-label={`Ver la planilla de ${x.nombre}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded-xl px-3 py-3 hover:bg-muted md:grid-cols-[minmax(200px,2fr)_120px_110px_110px_110px_100px_20px] md:items-center"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-texto">Prof. {x.nombre}</span>
                    <span className="block text-[12px] text-texto-3">
                      {x.grupos} {x.grupos === 1 ? "grupo" : "grupos"}
                    </span>
                  </span>
                  <span className="min-w-0 text-sm tabular-nums text-texto-2">
                    {x.cuentan} de {x.total}
                    {extraDocente(x) && <span className="block truncate text-[12px] text-texto-3">{extraDocente(x)}</span>}
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums text-texto">{fmtMoney(x.bruto)}</span>
                  <span className="hidden text-right text-[13px] text-texto-3 md:block">{textoRetencion(d.retencionActiva, x.retencion)}</span>
                  <span className="hidden text-right text-sm tabular-nums text-texto-2 md:block">{fmtMoney(x.liquido)}</span>
                  <span className={`text-[13px] ${x.estado === "EN_CURSO" ? "text-texto-3" : "text-texto-2"}`}>{TEXTO_ESTADO[x.estado]}</span>
                  <Icon name="chevronRight" size={16} className="hidden text-texto-4 md:block" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden grid-cols-[minmax(200px,2fr)_120px_110px_110px_110px_100px_20px] gap-3 px-3 text-sm font-bold text-texto md:grid">
            <span>Total</span>
            <span className="tabular-nums">
              {d.docentes.reduce((s, x) => s + x.cuentan, 0)} de {d.docentes.reduce((s, x) => s + x.total, 0)}
            </span>
            <span className="text-right tabular-nums">{fmtMoney(d.totales.bruto)}</span>
            <span className="text-right text-[13px] font-normal text-texto-3">{d.retencionActiva ? "" : "por confirmar"}</span>
            <span className="text-right tabular-nums">{fmtMoney(d.totales.liquido)}</span>
            <span />
            <span />
          </div>
        </>
      )}
    </div>
  );
}

/** "+ 2 de meses anteriores", "3 postergados", "todos pagaron". */
function extraDocente(x: TPlanillaMes["docentes"][number]): string {
  if (x.atrasados) return `+ ${x.atrasados} de meses anteriores`;
  if (x.postergados) return `${x.postergados} ${x.postergados === 1 ? "postergado" : "postergados"}`;
  if (x.total && x.cuentan === x.total) return "todos pagaron";
  return "";
}

function subtitulo(d: TPlanillaMes, enCurso: boolean, sede: string): string {
  const n = d.docentes.length;
  return [`${n} ${n === 1 ? "docente" : "docentes"}`, sede || null, enCurso ? "en curso, se cierra a fin de mes" : null].filter(Boolean).join(" · ");
}

export function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div>
      <span className="block text-[12px] text-texto-3">{etiqueta}</span>
      <span className="block text-lg font-bold tabular-nums text-texto">{valor}</span>
      {nota && <span className="block text-[12px] text-texto-3">{nota}</span>}
    </div>
  );
}
