import { lazy, Suspense } from "react";
import { Modal } from "../../components/ui";
import type { Venta } from "../../types";
import { direccionParaMostrar } from "./direccionEntrega";
import { AvisoPosicionPropia } from "./ComoLlegar";
import { colorDelNegocio, usePosicionPropia } from "./posicionPropia";
import { puntosDelDia } from "./puntosDelDia";

const MapaEntregas = lazy(() => import("./MapaEntregas"));

/**
 * Las entregas por hacer, de un vistazo (20-nov): en el mapa las que tienen
 * ubicación, numeradas en el orden de la lista; abajo, aparte, las que no
 * tienen pin, con su dirección. Tocar cualquiera abre su detalle.
 */
export default function MapaDelDia({
  pendientes,
  onElegir,
  onClose,
}: {
  pendientes: Venta[];
  onElegir: (v: Venta) => void;
  onClose: () => void;
}) {
  const { conPin, sinPin } = puntosDelDia(pendientes);
  const propia = usePosicionPropia();
  const elegir = (id: number) => {
    const v = pendientes.find((p) => p.id === id);
    if (v) onElegir(v);
  };
  return (
    <Modal abierto titulo="Mapa del día" subtitulo={`${pendientes.length} por entregar`} onClose={onClose}>
      <div className="space-y-3">
        {conPin.length > 0 ? (
          <Suspense fallback={<div className="h-[360px] w-full animate-pulse rounded-2xl bg-borde-soft motion-reduce:animate-none" />}>
            <MapaEntregas puntos={conPin} propia={propia.posicion} color={colorDelNegocio()} onElegir={elegir} />
          </Suspense>
        ) : (
          <p className="rounded-lg bg-warning-suave px-3 py-2 text-[13px] text-warning-text">
            Ninguna entrega tiene ubicación marcada: están todas abajo, con su dirección.
          </p>
        )}
        {conPin.length > 0 && <AvisoPosicionPropia propia={propia} />}
        {conPin.length > 0 && (
          <ol className="space-y-1" aria-label="En el mapa">
            {conPin.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => elegir(p.id)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-texto hover:bg-muted"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-boton text-xs font-extrabold text-white">
                    {p.numero}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.etiqueta}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        {sinPin.length > 0 && (
          <section aria-label="Sin ubicación en el mapa">
            <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-texto-4">
              {sinPin.length === 1 ? "1 sin ubicación en el mapa" : `${sinPin.length} sin ubicación en el mapa`}
            </h3>
            <ul className="divide-y divide-borde-soft">
              {sinPin.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => onElegir(v)}
                    className="flex min-h-11 w-full flex-col items-start justify-center px-1 py-2 text-left hover:bg-muted"
                  >
                    <span className="text-[13px] font-semibold text-texto">{v.clienteNombre ?? "Sin nombre"}</span>
                    <span className="text-xs text-texto-3">{direccionParaMostrar(v)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
