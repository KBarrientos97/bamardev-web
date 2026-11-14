import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL } from "maplibre-gl";
import { estiloMapa } from "../../lib/estiloMapa";
import { cargarMaplibre, TEXTOS_MAPA, type Ubicacion } from "../../lib/mapa";

export interface PuntoMapa extends Ubicacion {
  nombre: string;
}

/**
 * El mapa de "Dónde estamos" (PLAN-PAGINA-WEB §3.1): un pin del color de la
 * página por sucursal, con su nombre al tocarlo. Gestos cooperativos: en el
 * celular se mueve con dos dedos, así bajar por la página con un dedo no
 * queda atrapado en el mapa. Lo carga `MapaPagina` cuando entra en pantalla.
 */
export default function MapaSucursales({ puntos, color }: { puntos: PuntoMapa[]; color: string }) {
  const caja = useRef<HTMLDivElement>(null);
  const [falla, setFalla] = useState(false);
  const clave = JSON.stringify(puntos);

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    const lista = JSON.parse(clave) as PuntoMapa[];
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current || lista.length === 0) return;
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [lista[0].lng, lista[0].lat],
            zoom: 15,
            attributionControl: false,
            locale: TEXTOS_MAPA,
            cooperativeGestures: true,
          });
        } catch {
          setFalla(true);
          return;
        }
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.AttributionControl({ compact: true }));
        for (const p of lista) {
          new ml.Marker({ color })
            .setLngLat([p.lng, p.lat])
            .setPopup(new ml.Popup({ offset: 24, closeButton: false }).setText(p.nombre))
            .addTo(m);
        }
        if (lista.length > 1) {
          const limites = new ml.LngLatBounds();
          for (const p of lista) limites.extend([p.lng, p.lat]);
          m.fitBounds(limites, { padding: 48, maxZoom: 15, duration: 0 });
        }
      })
      .catch(() => vivo && setFalla(true));
    return () => {
      vivo = false;
      m?.remove();
    };
  }, [clave, color]);

  // Sin mapa (navegador viejo, sin red): queda el recuadro y las tarjetas de
  // abajo siguen teniendo la dirección y "Cómo llegar".
  return <div ref={caja} style={{ position: "absolute", inset: 0, display: falla ? "none" : "block" }} />;
}
