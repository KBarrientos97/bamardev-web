import { useState } from "react";
import { EncabezadoPagina } from "../../components/filtros";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, Kpi, Modal, useAviso, Vacio } from "../../components/ui";
import { apiExtras, type FilaPropinas } from "../../lib/belleza/apiExtras";
import { pagaPropinas } from "../../lib/belleza/capacidades";
import { useExtras } from "../../lib/belleza/useExtras";
import { fmtFechaHora, fmtMoney } from "../../lib/format";
import { useApi } from "../../lib/useApi";

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo completar");

/**
 * Propinas por profesional (feature `propinas`). No son ingreso del negocio:
 * no suman a las ventas. La que se dejó en efectivo está en el cajón hasta que
 * se le entrega al profesional ("Entregar", que sale de la caja del turno).
 *
 * El profesional entra a la misma pantalla y ve sólo las suyas (lo filtra el
 * backend, alcance PROPIO): sin el botón de entregar.
 */
export default function Propinas() {
  const ctx = useExtras();
  const puedePagar = !!ctx && pagaPropinas(ctx);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const rep = useApi(
    () => apiExtras.propinas({ desde: desde || undefined, hasta: hasta || undefined }),
    [desde, hasta],
  );
  const [aPagar, setAPagar] = useState<FilaPropinas | null>(null);
  const [desdeCaja, setDesdeCaja] = useState(true);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const pagar = async () => {
    if (!aPagar) return;
    setError("");
    setPagando(true);
    try {
      const r = await apiExtras.pagarPropinas(aPagar.recursoId, desdeCaja);
      setAviso(
        `Entregaste ${fmtMoney(r.total)} a ${r.recurso}${r.desdeCaja ? " (salió de tu caja)" : ""}.`,
      );
      rep.recargar();
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setPagando(false);
      setAPagar(null);
    }
  };

  const d = rep.datos;
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Propinas"
        subtitulo="Lo que los clientes dejaron para cada profesional. No suma a las ventas del negocio."
      />
      <div className="flex flex-wrap gap-3">
        <div className="w-40">
          <Campo label="Desde">
            <Input aria-label="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </Campo>
        </div>
        <div className="w-40">
          <Campo label="Hasta">
            <Input aria-label="Hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </Campo>
        </div>
      </div>
      <ErrorMsg>{error}</ErrorMsg>
      <AvisoOk>{aviso}</AvisoOk>

      {rep.cargando && !d ? (
        <Cargando />
      ) : rep.error ? (
        <ErrorMsg onReintentar={rep.recargar}>{rep.error}</ErrorMsg>
      ) : !d || d.profesionales.length === 0 ? (
        <div className="card">
          <Vacio icono="dollar" titulo="Sin propinas en estos días" texto="Se anotan al cobrar la cita." />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Kpi etiqueta={`Del ${d.desde.split("-").reverse().join("/")} al ${d.hasta.split("-").reverse().join("/")}`} valor={fmtMoney(d.total)} icono="dollar" />
            <Kpi etiqueta="Por entregar" valor={fmtMoney(d.pendiente)} icono="clock" tono="amarillo" />
          </div>
          <ul className="space-y-2" aria-label="Propinas por profesional">
            {d.profesionales.map((p) => (
              <li key={p.recursoId} className="card flex flex-wrap items-center gap-3 p-3.5">
                <div className="min-w-0 flex-[1_1_200px]">
                  <p className="text-sm font-bold text-texto">{p.nombre}</p>
                  <p className="text-[12px] text-texto-3">
                    {p.cantidad} {p.cantidad === 1 ? "propina" : "propinas"} · efectivo {fmtMoney(p.efectivo)} · otras{" "}
                    {fmtMoney(p.otras)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-texto">{fmtMoney(p.total)}</p>
                  <p className={p.pendiente > 0 ? "text-[12px] font-semibold text-warning-text" : "text-[12px] text-texto-3"}>
                    {p.pendiente > 0 ? `${fmtMoney(p.pendiente)} por entregar` : "Al día"}
                  </p>
                </div>
                {puedePagar && p.pendiente > 0 && (
                  <Boton variante="soft" onClick={() => setAPagar(p)}>
                    Entregar
                  </Boton>
                )}
              </li>
            ))}
          </ul>
          <details className="card p-3.5">
            <summary className="cursor-pointer text-sm font-semibold text-texto-2">Detalle</summary>
            <ul className="mt-2 divide-y divide-borde-soft text-[13px]">
              {d.detalle.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="text-texto-2">
                    {x.recurso} · {x.comprobante ?? `venta ${x.ventaId}`} · {x.formaPago}
                    <span className="block text-[11px] text-texto-4">{fmtFechaHora(x.fecha)}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold text-texto">{fmtMoney(x.monto)}</span>
                    <span className="block text-[11px] text-texto-4">{x.pagadaEn ? "entregada" : "por entregar"}</span>
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}

      <Modal
        abierto={!!aPagar}
        titulo={aPagar ? `Entregar a ${aPagar.nombre}` : "Entregar"}
        onClose={() => setAPagar(null)}
        ancho="max-w-sm"
        acciones={
          <>
            <Boton variante="ghost" onClick={() => setAPagar(null)} disabled={pagando}>
              Cancelar
            </Boton>
            <Boton onClick={pagar} disabled={pagando}>
              {pagando ? "Entregando…" : "Entregar"}
            </Boton>
          </>
        }
      >
        {aPagar && (
          <div className="space-y-3 text-sm text-texto-2">
            <p>
              <strong className="text-texto">{fmtMoney(aPagar.pendiente)}</strong>{" "}
              {desdeCaja
                ? "salen en efectivo de tu caja del turno."
                : "se marcan como pagados por fuera de la caja."}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!desdeCaja}
                onChange={(e) => setDesdeCaja(!e.target.checked)}
              />
              Se la pagué por fuera de la caja (transferencia)
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
