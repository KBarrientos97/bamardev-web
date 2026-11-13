import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL, Marker } from "maplibre-gl";
import { estiloMapa } from "../../lib/estiloMapa";
import { cargarMaplibre, plegarAtribucion } from "../../lib/mapa";

/**
 * El mapa del seguimiento (pedidos web, 13-nov): la moto, la casa y el local.
 * Se baja aparte (`lazy` en quien lo usa) y recién cuando el pedido va EN
 * CAMINO: la página de seguimiento no carga MapLibre antes.
 *
 * La moto se mueve sola cuando llega una posición nueva (cada 10 s); la cámara
 * sólo se acomoda al principio y cuando la moto se sale del cuadro, para no
 * pelearse con el dedo del cliente.
 */

export interface PuntoSeguimiento {
  latitud: number;
  longitud: number;
}

/** Un círculo de color con una letra: se lee en cualquier mapa y no pesa nada. */
function ficha(letra: string, fondo: string, etiqueta: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", etiqueta);
  el.textContent = letra;
  el.style.cssText = `width:34px;height:34px;border-radius:999px;background:${fondo};color:#fff;font:800 15px Roboto,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)`;
  return el;
}

export default function MapaSeguimiento({
  destino,
  local,
  moto,
  color,
  etiquetaDestino = "Tu casa",
  etiquetaLocal = "El local",
  alto = 300,
}: {
  destino: PuntoSeguimiento | null;
  local: PuntoSeguimiento | null;
  moto: PuntoSeguimiento | null;
  color: string;
  /** Cómo lo dice quien mira: «Tu casa» para el cliente, «El cliente» en la bandeja. */
  etiquetaDestino?: string;
  etiquetaLocal?: string;
  alto?: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const marcas = useRef<{ moto: Marker | null; ml: typeof import("maplibre-gl") | null }>({ moto: null, ml: null });
  const [falla, setFalla] = useState("");
  const [listo, setListo] = useState(false);
  const inicial = useRef({ destino, local, moto, color, etiquetaDestino, etiquetaLocal });

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current) return;
        const { destino: d, local: l, moto: v, color: c, etiquetaDestino: ed, etiquetaLocal: el } = inicial.current;
        const centro = v ?? d ?? l;
        if (!centro) {
          setFalla("Todavía no tenemos la ubicación para mostrar el mapa.");
          return;
        }
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [centro.longitud, centro.latitud],
            zoom: 14,
            attributionControl: false,
          });
        } catch {
          setFalla("Este navegador no puede mostrar el mapa.");
          return;
        }
        m.addControl(new ml.AttributionControl({ compact: true }));
        plegarAtribucion(m);
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        if (d) new ml.Marker({ element: ficha("C", c, ed) }).setLngLat([d.longitud, d.latitud]).addTo(m);
        if (l) new ml.Marker({ element: ficha("L", "#374151", el) }).setLngLat([l.longitud, l.latitud]).addTo(m);
        if (v) marcas.current.moto = new ml.Marker({ element: ficha("M", "#DC2626", "El repartidor") }).setLngLat([v.longitud, v.latitud]).addTo(m);
        marcas.current.ml = ml;
        mapa.current = m;
        // Que entren todos los puntos de entrada.
        const puntos = [d, l, v].filter((p): p is PuntoSeguimiento => !!p);
        if (puntos.length > 1) {
          const caja2 = new ml.LngLatBounds();
          for (const p of puntos) caja2.extend([p.longitud, p.latitud]);
          m.fitBounds(caja2, { padding: 56, maxZoom: 16, duration: 0 });
        }
        setListo(true);
      })
      .catch(() => vivo && setFalla("No se pudo cargar el mapa. Revisá tu conexión."));
    return () => {
      vivo = false;
      m?.remove();
      mapa.current = null;
      marcas.current = { moto: null, ml: null };
    };
  }, []);

  // Llegó una posición nueva: la moto se mueve, y si se salió del cuadro, la cámara la sigue.
  useEffect(() => {
    const m = mapa.current;
    const ml = marcas.current.ml;
    if (!listo || !m || !ml || !moto) return;
    if (marcas.current.moto) marcas.current.moto.setLngLat([moto.longitud, moto.latitud]);
    else marcas.current.moto = new ml.Marker({ element: ficha("M", "#DC2626", "El repartidor") }).setLngLat([moto.longitud, moto.latitud]).addTo(m);
    if (!m.getBounds().contains([moto.longitud, moto.latitud])) m.easeTo({ center: [moto.longitud, moto.latitud], duration: 600 });
  }, [listo, moto]);

  return (
    <div>
      <div
        ref={caja}
        role="application"
        aria-label="Mapa con tu pedido"
        style={{ height: alto, width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid #E5E7EB", background: "#EEF0F3" }}
      />
      {/* Las letras del mapa no se explican solas: una línea las nombra. */}
      {!falla && (destino || local || moto) && (
        <ul aria-hidden="true" style={{ listStyle: "none", margin: "8px 0 0", padding: 0, display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12, color: "#4B5563" }}>
          {destino && <li><b style={{ color }}>C</b> {etiquetaDestino}</li>}
          {local && <li><b style={{ color: "#374151" }}>L</b> {etiquetaLocal}</li>}
          {moto && <li><b style={{ color: "#DC2626" }}>M</b> El repartidor</li>}
        </ul>
      )}
      {falla && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 13, color: "#B91C1C" }}>
          {falla}
        </p>
      )}
    </div>
  );
}
