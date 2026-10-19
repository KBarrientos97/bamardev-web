import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import MenuMas, { type AccionMenu } from "../../../components/MenuMas";
import PanelLateral from "../../../components/PanelLateral";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Select, Vacio, useAviso } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { mesDe, sumarMeses, tituloMes } from "../../../lib/academia/calendario";
import { nombreDe } from "../../../lib/academia/formato";
import type { LineaPlanilla } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { TEXTO_ESTADO_PLANILLA as TEXTO_ESTADO, textoFormaPago } from "../../../lib/academia/vista";
import { ApiError } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import { Cifra } from "./PlanillaMes";

type Lista = "cuentan" | "postergados" | "atrasados" | "sinPagar";

/** Cada grupo muestra hasta acá; más, con "Ver los N restantes" (PLAN-ACADEMIAS §5). */
const LIMITE = 20;

/**
 * N8 · Planilla de un docente (ronda 2, D2): el mes de un docente, con lo que
 * cuenta (estudiantes que pagaron el módulo completo: lo cobrado del módulo ×
 * su %), lo postergado (abonaron a medias: se paga el mes en que completen),
 * lo atrasado de meses anteriores y lo sin pagar. Cada línea dice de dónde
 * sale el monto ("Pagó Bs 1.350 · 1.350 ÷ 3 = 450 · 20 % = Bs 90").
 *
 * "Cerrar planilla" la deja inmutable (un mes en curso pide confirmar) y
 * "Registrar pago" la vuelve un gasto de sueldos. La retención y los atrasos
 * quedan por confirmar (D9).
 */
export default function PlanillaDocente() {
  const p = usePalabras();
  const { id } = useParams();
  const personalId = Number(id);
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const hoy = mesDe(new Date());
  const mes = params.get("mes") ?? hoy;
  const liquida = tienePermiso(usuario, "planilla.liquidar");
  const carga = useApi(() => apiAcademia.planillaDocente(personalId, mes), [personalId, mes]);
  const [lista, setLista] = useState<Lista>("cuentan");
  const [elegida, setElegida] = useState<LineaPlanilla | null>(null);
  const [verTodos, setVerTodos] = useState<Record<string, boolean>>({});
  const [ocupado, setOcupado] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(6000);

  const d = carga.datos;
  if (carga.error && !d) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Link to="/academia/planilla" className="text-[13px] text-texto-3 hover:underline">
          ← Planilla {p.docente}s
        </Link>
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </div>
    );
  }
  if (!d) return <Cargando />;

  async function cerrar(conForzar = false) {
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.cerrarPlanilla(personalId, mes, conForzar);
      setAviso("Planilla cerrada: ya no cambia.");
      carga.recargar();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.MES_EN_CURSO) setForzar(true);
      else if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.PLANILLA_CERRADA) {
        setAviso("La planilla ya estaba cerrada.");
        carga.recargar();
      } else setError(e instanceof Error ? e.message : "No se pudo cerrar la planilla");
    } finally {
      setOcupado(false);
    }
  }

  async function pagar() {
    setOcupado(true);
    setError("");
    try {
      await apiAcademia.pagarPlanilla(personalId, mes);
      setAviso("Pago registrado como gasto de sueldos.");
      carga.recargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago");
    } finally {
      setOcupado(false);
    }
  }

  const r = d.resumen;
  const listas: Record<Lista, LineaPlanilla[]> = { cuentan: d.cuentan, postergados: d.postergados, atrasados: d.atrasados, sinPagar: d.sinPagar };
  const elegidas = listas[lista];
  const porGrupo = agrupar(elegidas);
  const meses = [...new Set([hoy, mes, ...d.meses.map((x) => x.mes), ...Array.from({ length: 5 }, (_, i) => sumarMeses(hoy, -(i + 1)))])].sort().reverse();
  const pcts = d.pct.porCurso.length
    ? `${d.pct.defecto} % (${d.pct.porCurso.map((x) => `${nombreDe(x.carrera)} ${x.pct} %`).join(", ")})`
    : `${d.pct.defecto} %`;
  const columnaCobrado = lista === "postergados" ? "Abonó" : lista === "sinPagar" ? "Precio" : "Cobrado del módulo";

  const acciones: AccionMenu[] = [
    { clave: "excel", etiqueta: "Exportar Excel con el formato del instituto", icono: "download", detalle: "Pronto", deshabilitada: true, onClick: () => {} },
  ];

  return (
    <div className={`mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8 ${elegida ? "md:mr-[380px]" : ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Link to="/academia/planilla" className="text-[13px] text-texto-3 hover:underline">
            ← Planilla {p.docente}s
          </Link>
          <h1 className="text-xl font-bold text-texto">
            Prof. {d.docente.nombre} · {tituloMes(d.mes)}
          </h1>
          <p className="text-[13px] text-texto-3">
            {d.grupos?.length
              ? `${[...new Set(d.grupos.map((g) => g.carrera.nombre))].join(", ")} · ${d.grupos.length} ${d.grupos.length === 1 ? "grupo" : "grupos"} · `
              : ""}
            Cobra el {pcts} de lo cobrado · {TEXTO_ESTADO[d.estado]}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block text-[12px] text-texto-3">
            Mes
            <Select value={mes} onChange={(e) => setParams({ mes: e.target.value })}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {tituloMes(m)}
                </option>
              ))}
            </Select>
          </label>
          {liquida && d.estado === "EN_CURSO" && (
            <Boton disabled={ocupado} onClick={() => void cerrar()}>
              Cerrar planilla
            </Boton>
          )}
          {liquida && d.estado === "CERRADA" && (
            <Boton disabled={ocupado} onClick={() => void pagar()}>
              Registrar pago {fmtMoney(r.liquido)}
            </Boton>
          )}
          <MenuMas etiqueta="Más acciones de la planilla" acciones={acciones} />
        </div>
      </header>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      {d.estado !== "EN_CURSO" && (
        <p role="status" className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-texto-2">
          Planilla {TEXTO_ESTADO[d.estado]} · líquido {fmtMoney(r.liquido)}
          {!r.retencionActiva ? " · retención y atrasos siguen por confirmar" : ""}
        </p>
      )}

      <section aria-label="Resumen de la planilla" className="grid gap-4 border-y border-borde-soft py-4 sm:grid-cols-5">
        <Cifra
          etiqueta="Cuentan"
          valor={`${r.cuentan} ${r.cuentan === 1 ? p.alumno : p.alumnos}`}
          nota={r.atrasados ? `+ ${r.atrasados} de meses anteriores` : undefined}
        />
        <Cifra
          etiqueta="Bruto"
          valor={fmtMoney(r.bruto)}
          nota={r.brutoAtrasados ? `${fmtMoney(r.brutoCuentan ?? 0)} del mes + ${fmtMoney(r.brutoAtrasados)} atrasados` : undefined}
        />
        <Cifra
          etiqueta="Retención"
          valor={r.retencionActiva && r.retencion != null ? `− ${fmtMoney(r.retencion)}` : "—"}
          nota={r.retencionActiva ? undefined : "Por confirmar con el cliente"}
        />
        <Cifra etiqueta="Atrasos" valor={r.atrasos != null ? `− ${fmtMoney(r.atrasos)}` : "—"} nota={r.atrasos != null ? undefined : "Por confirmar con el cliente"} />
        <Cifra etiqueta={d.estado === "EN_CURSO" ? "Líquido provisorio" : "Líquido"} valor={fmtMoney(r.liquido)} />
      </section>

      <div role="tablist" aria-label="Secciones de la planilla" className="flex gap-5 overflow-x-auto border-b border-borde-soft [scrollbar-width:none]">
        {(
          [
            ["cuentan", "Cuentan", r.cuentan],
            ["postergados", "Postergados", r.postergados],
            ["atrasados", "Atrasados", r.atrasados],
            ["sinPagar", "Sin pagar", r.sinPagar],
          ] as const
        ).map(([k, label, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={lista === k}
            onClick={() => {
              setLista(k);
              setElegida(null);
            }}
            className={`-mb-px shrink-0 border-b-2 pb-2.5 pt-1 text-sm ${lista === k ? "border-primary font-semibold text-texto" : "border-transparent text-texto-3"}`}
          >
            {label} <span className="tabular-nums text-texto-4">{n}</span>
          </button>
        ))}
      </div>

      {elegidas.length === 0 ? (
        <Vacio icono="fileText" titulo="Nada en esta lista" />
      ) : (
        porGrupo.map(([grupo, lineas]) => {
          const todos = verTodos[grupo] ?? false;
          const visibles = todos ? lineas : lineas.slice(0, LIMITE);
          const cuenta = lista === "cuentan" || lista === "atrasados";
          const total = lineas.reduce((s, l) => s + (cuenta ? l.monto : (l.montoPotencial ?? l.monto)), 0);
          return (
            <section key={grupo} aria-label={grupo} className="space-y-2">
              <h2 className="text-sm font-bold text-texto">{grupo}</h2>
              <div className="hidden grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_110px_120px_60px_100px] gap-3 px-3 text-[12px] text-texto-3 md:grid">
                <span>{p.Alumno}</span>
                <span>{p.Materia}</span>
                <span>Forma de pago</span>
                <span className="text-right">{columnaCobrado}</span>
                <span className="text-right">%</span>
                <span className="text-right">{lista === "cuentan" || lista === "atrasados" ? "Para el docente" : "Quedaría"}</span>
              </div>
              <ul className="divide-y divide-borde-soft border-y border-borde-soft">
                {visibles.map((l) => (
                  <li key={`${l.inscripcionId}-${l.materia.orden}`}>
                    <button
                      type="button"
                      onClick={() => setElegida(l)}
                      aria-label={`Ver el detalle de ${l.alumno.nombre}`}
                      className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-3 py-2.5 text-left md:grid-cols-[minmax(180px,2fr)_minmax(120px,1fr)_110px_120px_60px_100px] md:items-center ${
                        elegida === l ? "bg-primary-50" : "hover:bg-muted"
                      }`}
                    >
                      <span className="truncate text-sm text-texto">{l.alumno.nombre}</span>
                      <span className="hidden truncate text-sm text-texto-2 md:block">
                        M{l.materia.orden} {l.materia.nombre}
                      </span>
                      <span className="hidden text-sm text-texto-2 md:block">{textoFormaPago(l.formaPago)}</span>
                      <span className="hidden text-right text-sm tabular-nums text-texto-2 md:block">
                        {fmtMoney(lista === "postergados" ? l.abonado : lista === "sinPagar" ? l.montoModulo : l.cobradoModulo)}
                      </span>
                      <span className="hidden text-right text-sm tabular-nums text-texto-3 md:block">{l.pct} %</span>
                      <span className={`text-right text-sm font-semibold tabular-nums ${lista === "cuentan" || lista === "atrasados" ? "text-texto" : "text-texto-3"}`}>
                        {fmtMoney(lista === "cuentan" || lista === "atrasados" ? l.monto : (l.montoPotencial ?? l.monto))}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 text-[13px]">
                {lineas.length > LIMITE ? (
                  <button type="button" onClick={() => setVerTodos({ ...verTodos, [grupo]: !todos })} className="font-semibold text-primary-700 hover:underline">
                    {todos ? "Ver menos" : `Ver los ${lineas.length - LIMITE} ${p.alumnos} restantes`}
                  </button>
                ) : (
                  <span />
                )}
                <span className="font-semibold text-texto">
                  {lineas.length} {lineas.length === 1 ? p.alumno : p.alumnos} · {fmtMoney(total)}
                </span>
              </div>
            </section>
          );
        })
      )}

      {elegida && (
        <PanelLateral
          abierto
          titulo={elegida.alumno.nombre}
          subtitulo={`${elegida.grupo.nombre} · M${elegida.materia.orden} ${elegida.materia.nombre} · ${textoFormaPago(elegida.formaPago)}`}
          onClose={() => setElegida(null)}
          acciones={
            <Link
              to={`/academia/alumnos/${elegida.alumno.id}`}
              className="inline-flex w-full items-center justify-center rounded-xl border border-borde bg-white px-4 py-2.5 text-sm font-semibold text-texto-2 hover:bg-muted"
            >
              Ficha del {p.alumno}
            </Link>
          }
        >
          <div className="space-y-5">
            <div>
              <span className="block text-[12px] text-texto-3">Para el {p.docente} este mes</span>
              <span className="block text-2xl font-bold tabular-nums text-texto">{fmtMoney(lista === "cuentan" || lista === "atrasados" ? elegida.monto : 0)}</span>
              <span className="text-[13px] text-texto-3">
                {lista === "cuentan"
                  ? "Pagó el módulo completo"
                  : lista === "atrasados"
                    ? "Completó un módulo de un mes anterior"
                    : lista === "postergados"
                      ? `Abonó ${fmtMoney(elegida.abonado)} de ${fmtMoney(elegida.montoModulo)}: suma ${fmtMoney(elegida.montoPotencial ?? 0)} cuando complete`
                      : "No pagó el módulo: no suma"}
              </span>
            </div>
            <div className="space-y-1">
              <span className="block text-[12px] text-texto-3">De dónde sale el monto</span>
              <p className="rounded-xl bg-muted p-3 text-[13px] text-texto-2">{elegida.explicacion}</p>
            </div>
          </div>
        </PanelLateral>
      )}

      <Confirmar
        abierto={forzar}
        titulo="El mes no terminó"
        texto="Si la cerrás ahora, lo que se pague después entra en la planilla del mes siguiente. ¿Cerrarla igual?"
        etiquetaOk="Cerrar igual"
        onCancel={() => setForzar(false)}
        onOk={() => {
          setForzar(false);
          void cerrar(true);
        }}
      />
    </div>
  );
}

/** Las líneas por grupo, en el orden en que llegan. */
function agrupar(lineas: LineaPlanilla[]): [string, LineaPlanilla[]][] {
  const m = new Map<string, LineaPlanilla[]>();
  for (const l of lineas) m.set(l.grupo.nombre, [...(m.get(l.grupo.nombre) ?? []), l]);
  return [...m.entries()];
}

