import { Cargando, ErrorMsg, Vacio } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { mesDe, nombreMes, tituloMes } from "../../../lib/academia/calendario";
import type { PlanillaDocente } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fechaCorta } from "../../../lib/academia/formato";
import { fmtMoney, isoDia } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import NavDocente from "./NavDocente";

const ESTADO_MES: Record<PlanillaDocente["estado"], string> = {
  EN_CURSO: "en curso",
  CERRADA: "cerrada",
  PAGADA: "pagada",
};

/** El último día del mes, para "se cierra el 31-oct". */
function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return isoDia(new Date(a, m, 0));
}

/**
 * E16 · Mi planilla (ronda 2, D2): lo que el docente va ganando en el mes,
 * en el celular. Sólo cantidades y el total: nunca cuánto pagó cada
 * estudiante (el backend le manda las listas vacías). Lo que le da el
 * incentivo de recordar el pago en clase: cuántos cuentan, cuántos abonaron a
 * medias (se suman cuando completen) y cuántos no pagaron. La retención y
 * los atrasos, por confirmar (D9).
 */
export default function MiPlanilla() {
  const p = usePalabras();
  const mes = mesDe(new Date());
  // El docente recibe sólo su fila: de ahí sale su id para pedir el detalle.
  const datos = useApi(async () => {
    const mia = (await apiAcademia.planilla(mes)).docentes[0];
    return mia ? apiAcademia.planillaDocente(mia.personalId, mes) : null;
  }, [mes]);
  const d = datos.datos;

  return (
    <div className="mx-auto max-w-xl space-y-5 p-4 pb-24 sm:p-6">
      {datos.error && !d ? (
        <ErrorMsg onReintentar={datos.recargar}>{datos.error}</ErrorMsg>
      ) : datos.cargando && !d ? (
        <Cargando />
      ) : !d ? (
        <Vacio icono="billetera" titulo="Todavía no tenés planilla este mes" texto={`Aparece cuando tengas ${p.materias} asignados.`} />
      ) : (
        <Detalle d={d} />
      )}
      <NavDocente />
    </div>
  );
}

function Detalle({ d }: { d: PlanillaDocente }) {
  const p = usePalabras();
  const r = d.resumen;
  const enCurso = d.estado === "EN_CURSO";
  const pcts = [...new Set([d.pct.defecto, ...d.pct.porCurso.map((x) => x.pct)])];
  // Sólo cantidades y totales: el backend no le manda al docente quién pagó cuánto.
  const forma = r.cuentanPorForma;
  const porForma = forma
    ? [forma.MES_A_MES ? `${forma.MES_A_MES} mes a mes` : null, forma.COMPLETO ? `${forma.COMPLETO} con el curso completo` : null, forma.OTRO ? `${forma.OTRO} con otro plan` : null]
        .filter(Boolean)
        .join(" y ")
    : "";
  const lineas = [
    {
      titulo: `Cuentan ${r.cuentan} ${r.cuentan === 1 ? p.alumno : p.alumnos}`,
      detalle: `Pagaron el ${p.materia} completo${porForma ? `: ${porForma}` : ""}`,
      monto: r.brutoCuentan != null ? fmtMoney(r.brutoCuentan) : "",
      apagado: false,
    },
    ...(r.atrasados
      ? [
          {
            titulo: `${r.atrasados} ${r.atrasados === 1 ? "completado" : "completados"} de meses anteriores`,
            detalle: "Terminaron de pagar un módulo que ya pasó",
            monto: r.brutoAtrasados != null ? fmtMoney(r.brutoAtrasados) : "",
            apagado: false,
          },
        ]
      : []),
    ...(r.postergados
      ? [
          {
            titulo: `${r.postergados} ${r.postergados === 1 ? "postergado" : "postergados"}`,
            detalle: `Abonaron una parte del ${p.materia}. Se suman cuando completen`,
            monto: r.postergadoHasta ? `hasta ${fmtMoney(r.postergadoHasta)}` : "",
            apagado: true,
          },
        ]
      : []),
    ...(r.sinPagar ? [{ titulo: `${r.sinPagar} sin pagar`, detalle: "Recordáselo en clase; recepción le manda el QR", monto: "—", apagado: true }] : []),
  ];

  return (
    <>
      <header className="space-y-1">
        <p className="text-[13px] text-texto-3">
          Mi planilla · {nombreMes(d.mes)}, {ESTADO_MES[d.estado]}
        </p>
        <p className="text-sm text-texto-2">{enCurso ? `Vas ganando al ${fechaCorta(isoDia(new Date()))}` : "Total del mes"}</p>
        <p className="text-3xl font-bold tabular-nums text-texto">{fmtMoney(r.bruto)}</p>
        {enCurso && (
          <p className="text-[13px] text-texto-3">
            Bruto. Sube a medida que tus {p.alumnos} completan el pago. Se cierra el {fechaCorta(finDeMes(d.mes))}.
          </p>
        )}
      </header>

      <section aria-labelledby="t-lineas" className="space-y-2">
        <h2 id="t-lineas" className="text-sm font-bold text-texto">
          {d.grupos?.length ? d.grupos.map((g) => `${g.carrera.nombre} · ${g.nombre}`).join(" · ") : tituloMes(d.mes)}
        </h2>
        <p className="text-[13px] text-texto-3">
          {d.grupos?.length
            ? `${d.grupos.map((g) => `M${g.materia.orden} ${g.materia.nombre} · ${g.sede.nombre} · ${g.estudiantes} ${g.estudiantes === 1 ? p.alumno : p.alumnos}`).join(" · ")} · `
            : ""}
          cobrás el {pcts.join(" o ")} %
        </p>
        <ul className="divide-y divide-borde-soft border-y border-borde-soft">
          {lineas.map((l) => (
            <li key={l.titulo} className="flex items-start justify-between gap-3 py-2.5">
              <span>
                <span className={`block text-sm font-semibold ${l.apagado ? "text-texto-3" : "text-texto"}`}>{l.titulo}</span>
                <span className="block text-[13px] text-texto-3">{l.detalle}</span>
              </span>
              {l.monto && <span className={`shrink-0 text-sm font-semibold tabular-nums ${l.apagado ? "text-texto-4" : "text-texto"}`}>{l.monto}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-cuenta" className="space-y-1.5 text-sm">
        <h2 id="t-cuenta" className="text-sm font-bold text-texto">
          Cuenta del mes
        </h2>
        <div className="flex justify-between text-texto-2">
          <span>Bruto</span>
          <span className="tabular-nums">{fmtMoney(r.bruto)}</span>
        </div>
        <div className="flex justify-between text-texto-2">
          <span>Retención</span>
          <span className={r.retencionActiva && r.retencion != null ? "tabular-nums" : "text-texto-3"}>
            {r.retencionActiva && r.retencion != null ? `− ${fmtMoney(r.retencion)}` : "Por confirmar con el instituto"}
          </span>
        </div>
        <div className="flex justify-between text-texto-2">
          <span>Atrasos</span>
          <span className="text-texto-3">{r.atrasos != null ? `− ${fmtMoney(r.atrasos)}` : "Por confirmar con el instituto"}</span>
        </div>
        <div className="flex justify-between border-t border-borde-soft pt-1.5 font-bold text-texto">
          <span>{enCurso ? "Líquido provisorio" : "Líquido"}</span>
          <span className="tabular-nums">{fmtMoney(r.liquido)}</span>
        </div>
      </section>

      <p className="text-[13px] text-texto-3">
        Cobrás el {d.pct.defecto} % de lo cobrado de cada {p.materia}, mes a mes. Si alguien pagó el curso completo, lo pagado se
        divide entre los {p.materias}. Si alguien paga después, entra en el mes en que completa.
      </p>

      {d.meses.length > 0 && (
        <section aria-labelledby="t-ant" className="space-y-2">
          <h2 id="t-ant" className="text-sm font-bold text-texto">
            Meses anteriores
          </h2>
          <ul className="divide-y divide-borde-soft border-y border-borde-soft">
            {d.meses.map((m) => (
              <li key={m.mes} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block text-sm font-semibold text-texto">{tituloMes(m.mes)}</span>
                  <span className="block text-[13px] text-texto-3">{ESTADO_MES[m.estado]}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-texto">{fmtMoney(m.liquido)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
