import { useState } from "react";
import { Badge, Boton, Cargando, ErrorMsg, Modal, Vacio } from "../../../components/ui";
import { apiComisiones } from "../../../lib/agenda/apiComisiones";
import type { PeriodoElegido } from "../../../lib/agenda/periodos";
import type { LineaComision, ProduccionProfesional } from "../../../lib/agenda/tiposComisiones";
import { fmtFecha, fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { Chips } from "../../../components/filtros";
import { PuntoColor } from "../config/comun";
import { useNombreProfesional } from "../config/utilConfig";

/**
 * Producción y comisión de cada profesional en el período: lo cobrado (neto
 * de anulaciones), lo que falta liquidar y los adelantos que se van a
 * descontar. Tocar una fila muestra sus ventas.
 *
 * Con 2+ locales (PLAN-SUCURSAL-TOTAL §1) la organización elige «Todas» o uno:
 * el resumen y el detalle cuentan lo cobrado en ese local y sólo los
 * profesionales que atienden ahí. Quien está atado a uno ve el suyo, con su
 * nombre arriba.
 */
export default function TabProduccion({
  periodo,
  onLiquidar,
}: {
  periodo: PeriodoElegido;
  onLiquidar?: (recursoId: number) => void;
}) {
  const suc = useSucursales();
  // Sin elegir no se manda nada (todas); el atado va con su sede, que el backend se la fuerza.
  const sucursalId = suc.sucursalId;
  const resumen = useApi(
    () => apiComisiones.resumen({ desde: periodo.desde, hasta: periodo.hasta, ...(sucursalId != null ? { sucursalId } : {}) }),
    [periodo.desde, periodo.hasta, sucursalId],
  );
  const [detalle, setDetalle] = useState<ProduccionProfesional | null>(null);
  // La columna con la palabra del rubro (QA DIA-17b: "PROFESIONAL" en uñas).
  const nombres = useNombreProfesional();

  // El selector va siempre (también con error o vacío): sin él, un local sin
  // profesionales dejaría al dueño sin forma de volver a «Todas».
  const selector = suc.elegir ? (
    <Chips titulo="Sucursal" valor={suc.valorChip} opciones={suc.opciones} onChange={suc.alElegir} />
  ) : suc.miSede ? (
    <p className="text-[13px] text-texto-3">Lo cobrado en {suc.miSede}.</p>
  ) : null;

  if (resumen.error)
    return (
      <div className="space-y-3">
        {selector}
        <ErrorMsg onReintentar={resumen.recargar}>{resumen.error}</ErrorMsg>
      </div>
    );
  if (!resumen.datos) return <Cargando />;
  const { profesionales, totales } = resumen.datos;
  if (!profesionales.length) {
    return (
      <div className="space-y-3">
        {selector}
        <div className="card">
          <Vacio
            icono="users"
            titulo="Sin profesionales"
            texto={sucursalId != null ? "Nadie atiende en esa sucursal." : "Cargalos en Configuración de agenda."}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selector}
      <section className="card overflow-hidden" aria-label="Producción por profesional">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted text-left text-[12px] uppercase tracking-wide text-texto-4">
              <tr>
                <th className="px-4 py-2.5">{nombres.singular}</th>
                <th className="px-3 py-2.5 text-right">Producción</th>
                <th className="px-3 py-2.5 text-right">Servicios</th>
                <th className="px-3 py-2.5 text-right">Comisión</th>
                <th className="px-3 py-2.5 text-right">Por liquidar</th>
                <th className="px-3 py-2.5 text-right">Adelantos</th>
                {onLiquidar && <th className="px-3 py-2.5" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde-soft">
              {profesionales.map((p) => (
                <tr key={p.recursoId} className="hover:bg-muted/60">
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={() => setDetalle(p)}
                      className="flex items-center gap-2 font-semibold text-texto hover:underline"
                    >
                      <PuntoColor color={p.color} />
                      {p.nombre}
                      {!p.activo && <Badge>Inactivo</Badge>}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-right">{fmtMoney(p.produccion)}</td>
                  <td className="px-3 py-2.5 text-right">{p.servicios}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{fmtMoney(p.comision)}</td>
                  <td className="px-3 py-2.5 text-right">{fmtMoney(p.porLiquidar)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {p.adelantosPendientes ? fmtMoney(p.adelantosPendientes) : "—"}
                  </td>
                  {onLiquidar && (
                    <td className="px-3 py-2 text-right">
                      <Boton variante="soft" onClick={() => onLiquidar(p.recursoId)} aria-label={`Liquidar a ${p.nombre}`}>
                        Liquidar
                      </Boton>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-borde font-bold text-texto">
              <tr>
                <td className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(totales.produccion)}</td>
                <td />
                <td className="px-3 py-2.5 text-right">{fmtMoney(totales.comision)}</td>
                <td className="px-3 py-2.5 text-right">{fmtMoney(totales.porLiquidar)}</td>
                <td />
                {onLiquidar && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
        {detalle && <DetalleProduccion fila={detalle} periodo={periodo} sucursalId={sucursalId} onClose={() => setDetalle(null)} />}
      </section>
    </div>
  );
}

function DetalleProduccion({
  fila,
  periodo,
  sucursalId,
  onClose,
}: {
  fila: ProduccionProfesional;
  periodo: PeriodoElegido;
  /** El local elegido arriba: el detalle suma lo mismo que la fila que se tocó. */
  sucursalId: number | null;
  onClose: () => void;
}) {
  const detalle = useApi(
    () =>
      apiComisiones.detalle(fila.recursoId, {
        desde: periodo.desde,
        hasta: periodo.hasta,
        ...(sucursalId != null ? { sucursalId } : {}),
      }),
    [fila.recursoId, periodo.desde, periodo.hasta, sucursalId],
  );
  return (
    <Modal abierto titulo={fila.nombre} subtitulo="Ventas del período" onClose={onClose} ancho="max-w-2xl">
      {detalle.error ? (
        <ErrorMsg onReintentar={detalle.recargar}>{detalle.error}</ErrorMsg>
      ) : !detalle.datos ? (
        <Cargando />
      ) : (
        <div className="space-y-3">
          <TablaLineas lineas={detalle.datos.lineas} />
          {detalle.datos.anuladas.length > 0 && (
            <p className="text-[12px] text-texto-3">
              {detalle.datos.anuladas.length === 1
                ? "1 venta anulada no comisiona."
                : `${detalle.datos.anuladas.length} líneas de ventas anuladas no comisionan.`}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Las líneas de venta con su %: la usan el detalle y la liquidación. */
export function TablaLineas({ lineas, vacio = "Sin ventas en el período." }: { lineas: LineaComision[]; vacio?: string }) {
  if (!lineas.length) return <p className="py-4 text-center text-sm text-texto-3">{vacio}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-[13px]">
        <thead className="text-left text-[11px] uppercase tracking-wide text-texto-4">
          <tr>
            <th className="py-1.5 pr-2">Fecha</th>
            <th className="py-1.5 pr-2">Detalle</th>
            <th className="py-1.5 pr-2 text-right">Importe</th>
            <th className="py-1.5 pr-2 text-right">%</th>
            <th className="py-1.5 text-right">Comisión</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde-soft">
          {lineas.map((l) => (
            <tr key={`${l.ventaDetalleId}-${l.subtotal < 0 ? "a" : "c"}`}>
              <td className="py-1.5 pr-2 text-texto-3">{fmtFecha(l.fecha)}</td>
              <td className="py-1.5 pr-2">
                {l.descripcion}
                {!l.esServicio && <span className="ml-1 text-texto-4">(producto)</span>}
                {l.comprobante && <span className="ml-1 text-texto-4">· {l.comprobante}</span>}
              </td>
              <td className="py-1.5 pr-2 text-right">
                {fmtMoney(l.subtotal)}
                {(l.descuento ?? 0) > 0 && l.bruto != null && (
                  <span className="block text-[11px] text-texto-4">
                    {fmtMoney(l.bruto)} − {fmtMoney(l.descuento ?? 0)}
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-2 text-right" title={l.congelada ? "Congelado al cobrar" : "% vigente: se cobró sin % configurado"}>
                {l.comisionPct == null ? "—" : `${l.comisionPct}%`}
                {!l.congelada && l.comisionPct != null ? "*" : ""}
              </td>
              <td className="py-1.5 text-right font-semibold">{fmtMoney(l.comision)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
