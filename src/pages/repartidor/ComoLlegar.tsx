import { lazy, Suspense } from "react";
import { Icon } from "../../components/Icon";
import { urlRuta } from "../../lib/mapa";
import { urlWaze } from "../../lib/pedidosWeb/navegacion";
import { colorDelNegocio, usePosicionPropia } from "./posicionPropia";
import { pinImpreciso, urlBuscarEnMaps, urlWazeBuscar, type PinDeEntrega } from "../../lib/ubicacionEntrega";

// MapLibre (~1 MB) se baja recién con el detalle abierto: la lista no lo espera.
const MapaSeguimiento = lazy(() => import("../pagina/MapaSeguimiento"));

/**
 * «Cómo llegar» de una entrega (20-nov, AUDITORIA-REPARTIDOR-20NOV §2.2 A): el
 * mapa con el destino y, si el celular da la ubicación, dónde está él; abajo,
 * Google Maps y Waze para navegar. Es para toda entrega, no sólo las de la
 * página: antes los botones vivían en `AccionesPedidoWeb` y un delivery de la
 * caja no tenía ninguno.
 *
 * Sin pin no hay punto que dibujar: se busca la dirección escrita y se dice
 * claro que no hay ubicación marcada. Sin nada, queda pedirla por WhatsApp.
 */
export default function ComoLlegar({ pin, direccion }: { pin: PinDeEntrega | null; direccion: string | null }) {
  const boton =
    "flex min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-borde bg-white px-3 py-3 text-[13px] font-semibold text-texto-2 hover:bg-muted transition-[transform,background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] motion-reduce:active:scale-100";

  if (!pin) {
    return (
      <section aria-label="Cómo llegar" className="space-y-2">
        <p className="rounded-lg bg-warning-suave px-3 py-2 text-[13px] text-warning-text">
          {direccion
            ? "Sin ubicación marcada: buscá la dirección."
            : "Sin ubicación ni dirección: pedile la ubicación por WhatsApp."}
        </p>
        {direccion && (
          <div className="flex flex-wrap gap-2">
            <a href={urlBuscarEnMaps(direccion)} target="_blank" rel="noreferrer" className={boton}>
              <Icon name="pin" size={15} /> Buscar en Maps
            </a>
            <a href={urlWazeBuscar(direccion)} target="_blank" rel="noreferrer" className={boton}>
              <Icon name="pin" size={15} /> Buscar en Waze
            </a>
          </div>
        )}
      </section>
    );
  }

  return (
    <section aria-label="Cómo llegar" className="space-y-2">
      <MapaDelDestino pin={pin} />
      {pinImpreciso(pin) && (
        <p className="rounded-lg bg-warning-suave px-3 py-2 text-[13px] text-warning-text">
          El cliente marcó con poca precisión (unos {Math.round(pin.precisionM ?? 0)} m): confirmá por WhatsApp.
        </p>
      )}
      {/* Los textos son los de la app; si en una pantalla angosta no entran
          lado a lado, el segundo baja entero (QA 18-nov). */}
      <div className="flex flex-wrap gap-2">
        <a href={urlRuta(pin)} target="_blank" rel="noreferrer" className={boton}>
          <Icon name="pin" size={15} /> Ir con Google Maps
        </a>
        <a href={urlWaze(pin.lat, pin.lng)} target="_blank" rel="noreferrer" className={boton}>
          <Icon name="pin" size={15} /> Abrir en Waze
        </a>
      </div>
    </section>
  );
}

function MapaDelDestino({ pin }: { pin: PinDeEntrega }) {
  const propia = usePosicionPropia();
  return (
    <>
      <Suspense fallback={<div className="h-[220px] w-full animate-pulse rounded-2xl bg-borde-soft motion-reduce:animate-none" />}>
        <MapaSeguimiento
          destino={{ latitud: pin.lat, longitud: pin.lng }}
          local={null}
          moto={propia.posicion ? { latitud: propia.posicion.lat, longitud: propia.posicion.lng } : null}
          color={colorDelNegocio()}
          etiquetaDestino="El cliente"
          alto={220}
        />
      </Suspense>
      <AvisoPosicionPropia propia={propia} />
    </>
  );
}

/** Debajo del mapa: «Verme en el mapa» si todavía no se pidió, o cómo activarlo si se negó. */
export function AvisoPosicionPropia({ propia }: { propia: ReturnType<typeof usePosicionPropia> }) {
  if (propia.estado === "negada") {
    return <p className="text-xs text-texto-3">Activá la ubicación del navegador para verte en el mapa.</p>;
  }
  if (propia.estado !== "sin-pedir") return null;
  return (
    <button
      type="button"
      onClick={propia.pedir}
      className="flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[13px] font-semibold text-primary-700 hover:text-primary"
    >
      <Icon name="pin" size={15} /> Verme en el mapa
    </button>
  );
}
