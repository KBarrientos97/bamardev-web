import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL, Marker } from "maplibre-gl";
import { estiloMapa } from "../../lib/estiloMapa";
import { cargarMaplibre, plegarAtribucion, TEXTOS_MAPA, type Ubicacion } from "../../lib/mapa";

/**
 * El mapa del día del repartidor (20-nov, AUDITORIA-REPARTIDOR-20NOV §2.2 B):
 * un pin numerado por cada entrega pendiente con ubicación, en el orden de la
 * lista, y él mismo si el celular da la posición. Tocar un pin abre el mismo
 * detalle de siempre. Se carga aparte (`lazy`): MapLibre no viaja con la lista.
 *
 * Los mismos ladrillos que `MapaSeguimiento`: `cargarMaplibre`, `estiloMapa` y
 * una ficha redonda por punto, que se lee en cualquier mapa y no pesa nada.
 */
export interface PuntoDeEntrega extends Ubicacion {
  id: number;
  /** El número que se lee en el pin: 1, 2, 3… en el orden de la lista. */
  numero: number;
  etiqueta: string;
}

function ficha(texto: string, fondo: string, etiqueta: string, tocable: boolean): HTMLElement {
  const el = document.createElement(tocable ? "button" : "div");
  if (tocable) (el as HTMLButtonElement).type = "button";
  else el.setAttribute("role", "img");
  el.setAttribute("aria-label", etiqueta);
  el.textContent = texto;
  el.style.cssText = `width:36px;height:36px;border-radius:999px;background:${fondo};color:#fff;font:800 15px Roboto,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:${tocable ? "pointer" : "default"};padding:0;touch-action:manipulation`;
  return el;
}

export default function MapaEntregas({
  puntos,
  propia,
  color,
  onElegir,
  alto = 360,
}: {
  puntos: PuntoDeEntrega[];
  propia: Ubicacion | null;
  color: string;
  onElegir: (id: number) => void;
  alto?: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const yo = useRef<{ marca: Marker | null; ml: typeof import("maplibre-gl") | null }>({ marca: null, ml: null });
  const elegir = useRef(onElegir);
  elegir.current = onElegir;
  const inicial = useRef({ puntos, propia, color });
  const [falla, setFalla] = useState("");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current) return;
        const { puntos: ps, propia: p, color: c } = inicial.current;
        const centro = ps[0] ?? p;
        if (!centro) {
          setFalla("Ninguna entrega tiene ubicación marcada.");
          return;
        }
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [centro.lng, centro.lat],
            zoom: 14,
            attributionControl: false,
            locale: TEXTOS_MAPA,
          });
        } catch {
          setFalla("Este navegador no puede mostrar el mapa.");
          return;
        }
        m.addControl(new ml.AttributionControl({ compact: true }));
        plegarAtribucion(m);
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        for (const pt of ps) {
          const el = ficha(String(pt.numero), c, `${pt.numero}. ${pt.etiqueta}`, true);
          el.addEventListener("click", () => elegir.current(pt.id));
          new ml.Marker({ element: el }).setLngLat([pt.lng, pt.lat]).addTo(m);
        }
        if (p) yo.current.marca = new ml.Marker({ element: ficha("Yo", "#DC2626", "Vos", false) }).setLngLat([p.lng, p.lat]).addTo(m);
        yo.current.ml = ml;
        mapa.current = m;
        const todos = [...ps, ...(p ? [p] : [])];
        if (todos.length > 1) {
          const limites = new ml.LngLatBounds();
          for (const t of todos) limites.extend([t.lng, t.lat]);
          m.fitBounds(limites, { padding: 56, maxZoom: 16, duration: 0 });
        }
        setListo(true);
      })
      .catch(() => vivo && setFalla("No se pudo cargar el mapa. Revisá tu conexión."));
    return () => {
      vivo = false;
      m?.remove();
      mapa.current = null;
      yo.current = { marca: null, ml: null };
    };
  }, []);

  // La posición propia llega después (el GPS tarda): se suma o se mueve sin rehacer el mapa.
  useEffect(() => {
    const m = mapa.current;
    const ml = yo.current.ml;
    if (!listo || !m || !ml || !propia) return;
    if (yo.current.marca) yo.current.marca.setLngLat([propia.lng, propia.lat]);
    else yo.current.marca = new ml.Marker({ element: ficha("Yo", "#DC2626", "Vos", false) }).setLngLat([propia.lng, propia.lat]).addTo(m);
  }, [listo, propia]);

  return (
    <div>
      <div
        ref={caja}
        role="application"
        aria-label="Mapa de tus entregas"
        style={{ height: alto, width: "100%", borderRadius: 16, overflow: "hidden", border: "1px solid #E5E7EB", background: "#EEF0F3" }}
      />
      {falla && (
        <p role="alert" className="mt-1.5 text-[13px] text-danger-text">
          {falla}
        </p>
      )}
    </div>
  );
}
