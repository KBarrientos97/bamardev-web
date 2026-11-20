import { useState } from "react";
import { Chips } from "../../components/filtros";
import { Boton, Cargando, ErrorMsg, Modal, Vacio } from "../../components/ui";
import { api } from "../../lib/api";
import { fmtPlata } from "../../lib/format";
import { normalizarHistorial, rangoSemana, textoDia, type HistorialReparto } from "../../lib/historialReparto";
import { horaSinCortes } from "../../lib/repartoRendicion";
import { useApi } from "../../lib/useApi";
import type { ReporteDelDia } from "./reporteDelDia";

type Periodo = "hoy" | "semana";

const PERIODOS = [
  ["hoy", "Hoy"],
  ["semana", "Semana"],
] as const satisfies readonly (readonly [Periodo, string])[];

/**
 * «Mi día»: el reporte corto del repartidor (20-nov). Se abre tocando la
 * tarjeta de los pedidos, así no le saca lugar a la lista de entregas.
 *
 * «Hoy» sale de «Mis entregas» (desde las 6:00), sin pedir nada más. «Semana»
 * pide `GET /reparto/historial` de los últimos 7 días de jornada, recién al
 * elegirla. Las dos dicen «Envío cobrado» a propósito: es la tarifa que pagó
 * el cliente; lo que el negocio le paga al repartidor por viaje el sistema no
 * lo sabe.
 */
export default function MiDia({ reporte, onClose }: { reporte: ReporteDelDia; onClose: () => void }) {
  const [periodo, setPeriodo] = useState<Periodo>("hoy");
  return (
    <Modal
      abierto
      titulo="Mi día"
      subtitulo={periodo === "hoy" ? "Hoy, desde las 6:00" : "Los últimos 7 días"}
      onClose={onClose}
      acciones={
        <Boton className="min-h-11 w-full sm:w-auto" onClick={onClose}>
          Listo
        </Boton>
      }
    >
      <div className="space-y-4">
        <Chips valor={periodo} opciones={PERIODOS} onChange={setPeriodo} />
        {periodo === "hoy" ? <Hoy reporte={reporte} /> : <Semana />}
      </div>
    </Modal>
  );
}

function Totales({ pedidos, envio, enCamino = 0 }: { pedidos: number; envio: number; enCamino?: number }) {
  return (
    <dl className="grid grid-cols-2 gap-2">
      <div className="rounded-xl bg-primary-50 px-3.5 py-3 text-primary-700">
        <dt className="text-xs font-semibold">Pedidos llevados</dt>
        <dd className="text-2xl font-extrabold">{pedidos}</dd>
        {enCamino > 0 && <dd className="text-xs">{enCamino === 1 ? "1 en camino" : `${enCamino} en camino`}</dd>}
      </div>
      <div className="rounded-xl bg-muted px-3.5 py-3">
        <dt className="text-xs font-semibold text-texto-3">Envío cobrado</dt>
        <dd className="text-2xl font-extrabold text-texto">{fmtPlata(envio)}</dd>
      </div>
    </dl>
  );
}

function Fila({ numero, cliente, hora, pago, envio }: { numero: string; cliente: string; hora: string; pago: string; envio: number }) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-texto">
          {numero} · {cliente}
        </p>
        <p className="text-xs text-texto-3">
          {hora ? `${horaSinCortes(hora)} · ` : ""}
          {pago}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13px] font-bold text-texto">{fmtPlata(envio)}</p>
        <p className="text-[11px] text-texto-4">envío</p>
      </div>
    </li>
  );
}

function Hoy({ reporte }: { reporte: ReporteDelDia }) {
  const { entregados, enCamino, envioCobrado, filas } = reporte;
  return (
    <>
      <Totales pedidos={entregados} envio={envioCobrado} enCamino={enCamino} />
      {filas.length === 0 ? (
        <Vacio icono="truck" titulo="Todavía no entregaste pedidos hoy" texto="Cada pedido que entregues aparece acá con su envío." />
      ) : (
        <section aria-label="Pedidos de hoy">
          <ul className="divide-y divide-borde-soft">
            {filas.map((f) => (
              <Fila key={f.id} numero={f.numero} cliente={f.cliente} hora={f.entregadoEn} pago={f.pago} envio={f.envio} />
            ))}
          </ul>
          <div className="mt-1 flex items-center justify-between border-t border-borde pt-2.5 text-sm font-extrabold text-texto">
            <span>Total de envíos cobrados</span>
            <span>{fmtPlata(envioCobrado)}</span>
          </div>
        </section>
      )}
    </>
  );
}

/** Pide la semana. Un backend que todavía no tiene el historial (404) da null: «no disponible», sin romper nada. */
function pedirSemana(): Promise<HistorialReparto | null> {
  return Promise.resolve()
    .then(() => api.historialReparto(rangoSemana()))
    .then(normalizarHistorial)
    .catch((e: unknown) => {
      // 404: el backend todavía no tiene la ruta. Otro error (sin señal) se muestra con «Reintentar».
      if ((e as { status?: number } | null)?.status === 404) return null;
      throw e;
    });
}

function Semana() {
  const h = useApi(pedirSemana, []);
  if (h.cargando && !h.datos) return <Cargando texto="Cargando la semana…" />;
  if (h.error) return <ErrorMsg onReintentar={h.recargar}>{h.error}</ErrorMsg>;
  if (!h.datos) return <p className="text-[13px] text-texto-3">El resumen de la semana todavía no está disponible.</p>;
  const { dias, cantidad, totalEnvios } = h.datos;
  return (
    <>
      <Totales pedidos={cantidad} envio={totalEnvios} />
      {dias.length === 0 ? (
        <Vacio icono="truck" titulo="Esta semana todavía no llevaste pedidos" />
      ) : (
        dias.map((d) => (
          <section key={d.dia} aria-label={textoDia(d.dia)}>
            <h3 className="flex items-baseline justify-between gap-2 border-b border-borde pb-1 text-[13px] font-bold text-texto">
              <span className="capitalize">{textoDia(d.dia)}</span>
              <span className="text-xs font-semibold text-texto-3">
                {d.cantidad === 1 ? "1 pedido" : `${d.cantidad} pedidos`} · {fmtPlata(d.totalEnvios)} de envío
              </span>
            </h3>
            <ul className="divide-y divide-borde-soft">
              {d.entregas.map((e) => (
                <Fila key={e.ventaId} numero={e.numero} cliente={e.cliente} hora={e.entregadoEn} pago={e.formaPago} envio={e.envio} />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
