import { useState } from "react";
import { Badge, Cargando, ErrorMsg, Modal, Vacio } from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import { textoPeriodo } from "../../../lib/agenda/periodos";
import type { Liquidacion } from "../../../lib/agenda/tiposComisiones";
import { fmtFecha, fmtFechaHora, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { TablaLineas } from "./TabProduccion";

const NOMBRE_PERIODO: Record<string, string> = {
  SEMANA: "Semana",
  QUINCENA: "Quincena",
  MES: "Mes",
  OTRO: "Período",
};

/** Las liquidaciones cerradas: inmutables, con lo que se pagó y quién la cerró. */
export default function TabLiquidaciones() {
  const lista = useApi(() => apiComisiones.liquidaciones(), []);
  const [abierta, setAbierta] = useState<Liquidacion | null>(null);

  if (lista.error) return <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>;
  if (!lista.datos) return <Cargando />;
  if (!lista.datos.length) {
    return (
      <div className="card">
        <Vacio icono="fileText" titulo="Todavía no hay liquidaciones" texto="Se cierran desde la pestaña Liquidar." />
      </div>
    );
  }
  return (
    <>
      <ul className="card divide-y divide-borde-soft" aria-label="Liquidaciones">
        {lista.datos.map((l) => (
          <li key={l.id}>
            <button
              type="button"
              onClick={() => setAbierta(l)}
              className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-texto">
                  {l.recurso} · {NOMBRE_PERIODO[l.periodo] ?? "Período"} {textoPeriodo(l.desde, l.hasta)}
                </p>
                <p className="text-[12px] text-texto-3">
                  Cerrada el {fmtFecha(l.cerradaEn)}
                  {l.cerradaPor ? ` por ${l.cerradaPor}` : ""}
                  {l.gastoId ? " · en Gastos" : ""}
                </p>
              </div>
              <span className={`font-bold ${l.neto < 0 ? "text-danger-text" : "text-texto"}`}>{fmtMoney(l.neto)}</span>
            </button>
          </li>
        ))}
      </ul>
      {abierta && <DetalleLiquidacion id={abierta.id} onClose={() => setAbierta(null)} />}
    </>
  );
}

function DetalleLiquidacion({ id, onClose }: { id: number; onClose: () => void }) {
  const l = useApi(() => apiComisiones.liquidacion(id), [id]);
  const d = l.datos;
  return (
    <Modal
      abierto
      titulo={d ? `${d.recurso} · ${textoPeriodo(d.desde, d.hasta)}` : "Liquidación"}
      subtitulo={d ? `Cerrada el ${fmtFechaHora(d.cerradaEn)}${d.cerradaPor ? ` por ${d.cerradaPor}` : ""}` : undefined}
      onClose={onClose}
      ancho="max-w-2xl"
    >
      {l.error ? (
        <ErrorMsg onReintentar={l.recargar}>{l.error}</ErrorMsg>
      ) : !d ? (
        <Cargando />
      ) : (
        <div className="space-y-3">
          <Badge tono="gris">Cerrada · no se edita</Badge>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            <Par etiqueta="Producción" valor={d.produccion} />
            <Par etiqueta="Comisión" valor={d.comision} />
            {d.ajustes !== 0 && <Par etiqueta="Anuladas ya pagadas" valor={d.ajustes} />}
            <Par etiqueta="Adelantos" valor={-d.adelantos} />
            {d.saldoAnterior !== 0 && <Par etiqueta="Saldo anterior" valor={d.saldoAnterior} />}
            <Par etiqueta="Pagado" valor={d.neto} fuerte />
          </dl>
          {d.nota && <p className="text-[13px] text-texto-2">“{d.nota}”</p>}
          <TablaLineas
            lineas={d.lineas.map((x) => ({ ...x, cantidad: 1, congelada: true, liquidacionId: d.id }))}
            vacio="Sin ventas: sólo adelantos o ajustes."
          />
        </div>
      )}
    </Modal>
  );
}

function Par({ etiqueta, valor, fuerte }: { etiqueta: string; valor: number; fuerte?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-texto-4">{etiqueta}</dt>
      <dd className={fuerte ? "text-base font-bold text-texto" : "text-texto-2"}>{fmtMoney(valor)}</dd>
    </div>
  );
}
