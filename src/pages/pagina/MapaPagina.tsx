import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import { preconnect } from "react-dom";
import { alDescansar, ORIGEN_MOSAICOS, precargarMapa } from "../../lib/mapa";
import type { SucursalPublica } from "../../lib/pagina/tipos";
import type { PuntoMapa } from "./MapaSucursales";

const pedazoMapa = () => import("./MapaSucursales");
const MapaSucursales = lazy(pedazoMapa);

/**
 * El lugar del mapa en la página (PLAN-PAGINA-WEB §3.1). Sólo si alguna
 * sucursal trae ubicación (la manda el backend si el dueño no ocultó el
 * mapa).
 *
 * Antes MapLibre se bajaba recién con el recuadro a 300 px de la pantalla, y
 * de ahí en serie el estilo, el TileJSON, los mosaicos y las letras: ~5 s con
 * 4G y un celular lento (03-nov). Ahora, apenas se pinta la página y el
 * navegador queda libre, se baja el código y arranca el worker (sin crear el
 * mapa); el mapa se dibuja (y pide los mosaicos) cuando el recuadro está a
 * dos pantallas o menos, así que al llegar ya está. Las dos cosas pasan
 * después de pintar (efectos y el observador), así que lo primero que se ve
 * no espera nada de esto. Sin IntersectionObserver (los tests) queda el
 * recuadro y no se baja nada.
 */
export function MapaPagina({
  sucursales,
  color,
  radio,
  borde,
  fondo,
  alto = 220,
  palabraSucursales = "sucursales",
}: {
  sucursales: SucursalPublica[];
  color: string;
  radio: CSSProperties["borderRadius"];
  borde?: string;
  fondo: string;
  alto?: number;
  /** Cómo llama el rubro a sus locales: «sedes» en el instituto (Lista 2 #9). */
  palabraSucursales?: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  // El recuadro está a dos pantallas o menos: se dibuja el mapa.
  const [cerca, setCerca] = useState(false);
  const puntos: PuntoMapa[] = sucursales.flatMap((s) => (s.ubicacion ? [{ nombre: s.nombre, ...s.ubicacion }] : []));
  const hay = puntos.length > 0;
  const conObservador = typeof IntersectionObserver !== "undefined";
  // La conexión con OpenFreeMap (DNS + TLS) se abre ya, en paralelo con todo:
  // es el mismo servidor de los mosaicos, los íconos y las letras.
  if (hay && conObservador) preconnect(ORIGEN_MOSAICOS, { crossOrigin: "anonymous" });

  useEffect(() => {
    if (!hay || !conObservador) return;
    return alDescansar(() => precargarMapa(pedazoMapa));
  }, [hay, conObservador]);

  useEffect(() => {
    if (!hay || cerca || !caja.current || !conObservador) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          // Si llega antes que la precarga, MapLibre se pide ya, en paralelo
          // con el pedazo del mapa (si no, iría uno detrás del otro).
          precargarMapa(pedazoMapa);
          setCerca(true);
          io.disconnect();
        }
      },
      // Dos pantallas para arriba y para abajo: los mosaicos (~200 KB en el
      // centro de una ciudad) los paga sólo quien se acerca al mapa.
      { rootMargin: "200% 0px" },
    );
    io.observe(caja.current);
    return () => io.disconnect();
  }, [hay, cerca, conObservador]);

  if (!hay) return null;
  return (
    <div
      ref={caja}
      role="region"
      aria-label={puntos.length === 1 ? `Mapa: ${puntos[0].nombre}` : `Mapa de las ${palabraSucursales}`}
      data-testid="mapa-pagina"
      style={{
        position: "relative",
        height: alto,
        borderRadius: radio,
        overflow: "hidden",
        border: borde ? `1px solid ${borde}` : undefined,
        background: fondo,
        isolation: "isolate",
      }}
    >
      {cerca && (
        <Suspense fallback={null}>
          <MapaSucursales puntos={puntos} color={color} />
        </Suspense>
      )}
    </div>
  );
}
