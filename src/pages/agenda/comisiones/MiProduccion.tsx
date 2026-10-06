import { useState } from "react";
import { ErrorMsg } from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import { fechaNegocio } from "../../../lib/agenda/horaAgenda";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { periodoActual, type PeriodoElegido } from "../../../lib/agenda/periodos";
import SelectorPeriodo from "./SelectorPeriodo";

/**
 * "Mi producción" (A10, fase 2): lo que el profesional facturó y su comisión
 * en la semana, quincena o mes, con lo que le adelantaron. El backend sólo le
 * devuelve lo suyo (`comisiones.ver` con alcance PROPIO).
 */
export default function MiProduccion() {
  const [periodo, setPeriodo] = useState<PeriodoElegido>(() => periodoActual("SEMANA", fechaNegocio()));
  const resumen = useApi(
    () => apiComisiones.resumen({ desde: periodo.desde, hasta: periodo.hasta }),
    [periodo.desde, periodo.hasta],
  );
  // Con varios recursos vinculados (raro), se suman.
  const filas = resumen.datos?.profesionales ?? [];
  const suma = (k: "produccion" | "comision" | "porLiquidar" | "adelantosPendientes" | "servicios") =>
    filas.reduce((s, f) => s + f[k], 0);
  // Lo que se le va a descontar por ventas anuladas después de pagadas (QA
  // N2-11): ya está restado en "Por liquidar"; acá se dice por qué.
  const ajustes = filas.reduce((s, f) => s + (f.ajustesPendientes ?? 0), 0);

  return (
    <section aria-label="Mi producción" className="card space-y-3 p-4">
      <h2 className="text-[15px] font-bold text-texto">Mi producción</h2>
      <SelectorPeriodo valor={periodo} onChange={setPeriodo} compacto />
      <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      {resumen.datos && (
        <dl className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Producción" valor={fmtMoney(suma("produccion"))} pie={`${suma("servicios")} servicios`} />
          <Dato etiqueta="Mi comisión" valor={fmtMoney(suma("comision"))} destacado />
          <Dato
            etiqueta="Por liquidar"
            valor={fmtMoney(suma("porLiquidar"))}
            pie={
              ajustes < 0 ? `Incluye ${fmtMoney(ajustes)} de ventas anuladas ya pagadas` : undefined
            }
          />
          <Dato etiqueta="Adelantos a descontar" valor={fmtMoney(suma("adelantosPendientes"))} />
        </dl>
      )}
    </section>
  );
}

function Dato({
  etiqueta,
  valor,
  pie,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  pie?: string;
  destacado?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 ${destacado ? "bg-primary-50" : "bg-muted"}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className={`mt-1 text-lg font-bold ${destacado ? "text-primary-700" : "text-texto"}`}>{valor}</dd>
      {pie && <dd className="text-[12px] text-texto-3">{pie}</dd>}
    </div>
  );
}
