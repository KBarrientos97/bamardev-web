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
 * Lo que se entrega con las opciones elegidas: el efectivo siempre; lo de QR
 * o tarjeta sólo si se marca (o si se paga todo por fuera, por transferencia).
 */
function aEntregar(f: FilaPropinas, porFuera: boolean, conOtras: boolean): number {
  const efectivo = f.pendienteEfectivo ?? f.pendiente;
  const otras = f.pendienteOtras ?? 0;
  return Math.round((efectivo + (porFuera || conOtras ? otras : 0)) * 100) / 100;
}

/**
 * Propinas por profesional (feature `propinas`). No son ingreso del negocio:
 * no suman a las ventas. La que se dejó en efectivo está en el cajón donde se
 * cobró hasta que se le entrega al profesional: "Entregar" la saca de ESA
 * caja (o de la tuya, si aquella ya se cerró). La de QR o tarjeta nunca pasó
 * por un cajón: sólo sale en efectivo si se marca (QA N2-01, S2SEG-06).
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
  const [conOtras, setConOtras] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const pagar = async () => {
    if (!aPagar) return;
    setError("");
    setPagando(true);
    try {
      const r = await apiExtras.pagarPropinas(aPagar.recursoId, desdeCaja, !desdeCaja || conOtras);
      // Lo de QR sin caja abierta queda entregado por fuera (QA DIA-13): se
      // dice cuánto, para que nadie lo busque en el arqueo.
      const porFuera = r.desdeCaja && (r.fueraDeCaja ?? 0) > 0 ? r.fueraDeCaja! : 0;
      const donde = !r.desdeCaja
        ? " (por fuera de la caja)"
        : porFuera >= r.total
          ? " (por fuera de la caja: no tenías caja abierta)"
          : porFuera > 0
            ? ` (${fmtMoney(porFuera)} de QR por fuera de la caja; el resto salió de la caja)`
            : " (salió de la caja)";
      setAviso(`Entregaste ${fmtMoney(r.total)} a ${r.recurso}${donde}.`);
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
                  <Boton
                    variante="soft"
                    onClick={() => {
                      setDesdeCaja(true);
                      setConOtras(false);
                      setAPagar(p);
                    }}
                  >
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
                    {/* El comprobante se repite entre turnos (QA DIA-12): con la
                        caja (y la fecha abajo) cada venta se distingue. */}
                    {x.recurso} · {x.comprobante ?? `venta ${x.ventaId}`}
                    {x.cajaId != null ? ` (caja #${x.cajaId})` : ""} · {x.formaPago}
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
            <Boton onClick={pagar} disabled={pagando || !aPagar || aEntregar(aPagar, !desdeCaja, conOtras) <= 0}>
              {pagando ? "Entregando…" : "Entregar"}
            </Boton>
          </>
        }
      >
        {aPagar && (
          <div className="space-y-3 text-sm text-texto-2">
            {desdeCaja && aEntregar(aPagar, false, conOtras) <= 0 ? (
              // Sólo le quedan propinas de QR: "Bs 0,00 salen de la caja" no
              // decía qué hacer (QA DIA-13).
              <p>Sólo le quedan propinas que dejaron por QR o tarjeta: marcá abajo para entregarlas.</p>
            ) : (
              <p>
                <strong className="text-texto">{fmtMoney(aEntregar(aPagar, !desdeCaja, conOtras))}</strong>{" "}
                {desdeCaja
                  ? "salen en efectivo de la caja donde se cobraron (si ya se cerró, de la tuya)."
                  : "se marcan como pagados por fuera de la caja."}
              </p>
            )}
            {desdeCaja && (aPagar.pendienteOtras ?? 0) > 0 && (
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={conOtras}
                  onChange={(e) => setConOtras(e.target.checked)}
                />
                <span>
                  Entregar también {fmtMoney(aPagar.pendienteOtras ?? 0)} que dejaron por QR o tarjeta (salen en
                  efectivo de tu caja; si no tenés una abierta, quedan entregadas por fuera)
                </span>
              </label>
            )}
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
