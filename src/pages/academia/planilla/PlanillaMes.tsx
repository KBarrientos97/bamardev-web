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
import { Chip, claseBotonFila, EncabezadoPagina, GrillaKpi, KpiTarjeta, LISTA, PaginaAcademia, TABLA, Tarjeta, type TonoChip } from "../piezas";

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

  // Las mismas columnas para el encabezado, las filas y el total (en escritorio).
  const columnas = "lg:grid-cols-[minmax(200px,2fr)_150px_110px_110px_110px_116px_72px]";

  return (
    <PaginaAcademia>
      <EncabezadoPagina
        titulo={`Planilla ${p.docente}s · ${tituloMes(mes)}`}
        bajada={d ? subtitulo(d, mes === hoy, sede.nombre) : undefined}
        acciones={
          <>
            <div role="group" aria-label="Mes" className="flex h-11 items-center gap-0.5 rounded-xl border border-borde bg-white px-1 sm:h-[42px]">
              <button
                type="button"
                aria-label="Mes anterior"
                onClick={() => setMes(sumarMeses(mes, -1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted"
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <span className="min-w-[7.5rem] text-center text-[13px] font-semibold text-texto">{tituloMes(mes)}</span>
              <button
                type="button"
                aria-label="Mes siguiente"
                // Hasta un mes después del actual (QA 23-oct): las líneas de los
                // módulos que empiezan el mes que viene ya se pueden mirar.
                disabled={mes >= sumarMeses(hoy, 1)}
                onClick={() => setMes(sumarMeses(mes, 1))}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-texto-2 hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
            <MenuMas etiqueta="Más acciones de la planilla" acciones={acciones} />
          </>
        }
      />

      {sede.selector}

      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : d.docentes.length === 0 ? (
        <Tarjeta etiqueta="Sin planilla">
          <Vacio icono="fileText" titulo={`Ningún ${p.docente} tiene ${p.materias} este mes`} />
        </Tarjeta>
      ) : (
        <>
          <section aria-label="Resumen del mes">
            <GrillaKpi>
              <KpiTarjeta
                icono="billetera"
                etiqueta="Bruto del mes"
                valor={fmtMoney(d.totales.bruto)}
                pie={`${d.docentes.length} ${d.docentes.length === 1 ? p.docente : `${p.docente}s`}`}
              />
              <KpiTarjeta
                icono="percent"
                etiqueta="Retención"
                valor={d.retencionActiva ? fmtMoney(d.docentes.reduce((s, x) => s + (x.retencion ?? 0), 0)) : "—"}
                pie={d.retencionActiva ? undefined : "Por confirmar con el instituto"}
              />
              <KpiTarjeta
                icono="coins"
                tono="ok"
                etiqueta={mes === hoy ? "Líquido provisorio" : "Líquido"}
                valor={fmtMoney(d.totales.liquido)}
                pie={d.retencionActiva ? undefined : "sin retención ni atrasos"}
              />
              <KpiTarjeta
                icono="check"
                etiqueta="Estado"
                valor={`${d.docentes.filter((x) => x.estado !== "EN_CURSO").length} de ${d.docentes.length} cerradas`}
                pie={mes === hoy ? "se cierran a fin de mes" : `${d.docentes.filter((x) => x.estado === "PAGADA").length} pagadas`}
              />
            </GrillaKpi>
          </section>

          <Tarjeta
            id="t-docentes"
            titulo={`${p.Docente}s`}
            contador={d.docentes.length}
            sinRelleno
            pie={
              <div className={`flex flex-wrap items-baseline gap-x-3 text-sm font-bold text-texto lg:grid lg:gap-3 ${columnas}`}>
                <span>Total</span>
                <span className="tabular-nums max-lg:font-normal max-lg:text-texto-3">
                  {d.docentes.reduce((s, x) => s + x.cuentan, 0)} de {d.docentes.reduce((s, x) => s + x.total, 0)}
                </span>
                <span className="text-right tabular-nums max-lg:ml-auto">{fmtMoney(d.totales.bruto)}</span>
                <span className="hidden text-right text-[13px] font-normal text-texto-3 lg:block">{d.retencionActiva ? "" : "por confirmar"}</span>
                <span className="hidden text-right tabular-nums lg:block">{fmtMoney(d.totales.liquido)}</span>
              </div>
            }
          >
            <div className={`hidden gap-3 px-4 py-2.5 sm:px-5 lg:grid ${TABLA.encabezado} ${columnas}`}>
              <span>{p.Docente}</span>
              <span>Cuentan / {p.alumnos}</span>
              <span className="text-right">Bruto</span>
              <span className="text-right">Retención</span>
              <span className="text-right">Líquido</span>
              <span className="lg:pl-4">Estado</span>
              <span />
            </div>
            <ul className={`${LISTA.lista} lg:border-t lg:border-borde-soft`}>
              {d.docentes.map((x) => (
                <li key={x.personalId}>
                  <Link
                    to={`/academia/planilla/${x.personalId}?mes=${mes}`}
                    aria-label={`Ver la planilla de ${x.nombre}`}
                    className={`group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 ${LISTA.itemHover} ${columnas}`}
                  >
                    <span className="min-w-0 max-lg:order-1">
                      <span className="block truncate text-sm font-semibold text-texto group-hover:text-primary-700">Prof. {x.nombre}</span>
                      <span className="block text-[12px] text-texto-3">
                        {x.grupos} {x.grupos === 1 ? "grupo" : "grupos"}
                      </span>
                    </span>
                    <span className="min-w-0 text-sm tabular-nums text-texto-2 max-lg:order-3">
                      {x.cuentan} de {x.total}
                      {extraDocente(x) && <span className="block truncate text-[12px] text-texto-3">{extraDocente(x)}</span>}
                    </span>
                    <span className="text-right text-sm font-semibold tabular-nums text-texto max-lg:order-2">{fmtMoney(x.bruto)}</span>
                    <span className="hidden text-right text-[13px] text-texto-3 lg:block">{textoRetencion(d.retencionActiva, x.retencion)}</span>
                    <span className="hidden text-right text-sm tabular-nums text-texto-2 lg:block">{fmtMoney(x.liquido)}</span>
                    <span className="max-lg:order-4 max-lg:justify-self-end lg:pl-4">
                      <Chip tono={CHIP_ESTADO[x.estado]}>{TEXTO_ESTADO[x.estado]}</Chip>
                    </span>
                    {/* La fila entera es el enlace: esto sólo dice que se toca. */}
                    <span aria-hidden="true" className={`${claseBotonFila("ghost")} justify-self-end group-hover:border-primary-200 max-lg:!hidden`}>
                      Ver
                      <Icon name="chevronRight" size={15} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Tarjeta>
        </>
      )}
    </PaginaAcademia>
  );
}

/** En curso en gris, cerrada (falta pagarla) en ámbar, pagada en verde. */
const CHIP_ESTADO: Record<TPlanillaMes["docentes"][number]["estado"], TonoChip> = {
  EN_CURSO: "gris",
  CERRADA: "ambar",
  PAGADA: "verde",
};

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
