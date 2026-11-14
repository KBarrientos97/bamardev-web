import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL, Marker } from "maplibre-gl";
import { Boton } from "./ui";
import { estiloMapa } from "../lib/estiloMapa";
import { cargarMaplibre, redondear, SANTA_CRUZ, TEXTOS_MAPA, type Ubicacion } from "../lib/mapa";

/**
 * Marcar dónde está la sucursal (PLAN-PAGINA-WEB §3.1): se toca el mapa o se
 * arrastra el pin, o se usa la ubicación del celular cuando el dueño lo
 * configura desde el local. Se carga aparte (React.lazy): MapLibre no viaja
 * con la ficha.
 */
export default function ElegirUbicacion({
  valor,
  onCambio,
}: {
  valor: Ubicacion | null;
  onCambio: (u: Ubicacion) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const marcar = useRef<((u: Ubicacion) => void) | null>(null);
  const avisar = useRef(onCambio);
  avisar.current = onCambio;
  // Sólo para arrancar: después el pin es del mapa, no de las props.
  const inicial = useRef(valor);
  const [falla, setFalla] = useState("");
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current) return;
        const desde = inicial.current ?? SANTA_CRUZ;
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [desde.lng, desde.lat],
            zoom: inicial.current ? 16 : 12,
            attributionControl: false,
            locale: TEXTOS_MAPA,
          });
        } catch {
          setFalla("Este navegador no puede mostrar el mapa.");
          return;
        }
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.AttributionControl({ compact: true }));
        let pin: Marker | null = null;
        const poner = (u: Ubicacion) => {
          if (pin) {
            pin.setLngLat([u.lng, u.lat]);
            return;
          }
          pin = new ml.Marker({ draggable: true }).setLngLat([u.lng, u.lat]).addTo(m!);
          pin.on("dragend", () => {
            const p = pin!.getLngLat();
            avisar.current(redondear({ lat: p.lat, lng: p.lng }));
          });
        };
        if (inicial.current) poner(inicial.current);
        m.on("click", (e) => {
          const u = redondear({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          poner(u);
          avisar.current(u);
        });
        mapa.current = m;
        marcar.current = poner;
      })
      .catch(() => vivo && setFalla("No se pudo cargar el mapa. Revisá la conexión."));
    return () => {
      vivo = false;
      m?.remove();
      mapa.current = null;
      marcar.current = null;
    };
  }, []);

  const usarMiUbicacion = () => {
    if (!navigator.geolocation) return setFalla("Este navegador no da la ubicación.");
    setFalla("");
    setBuscando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBuscando(false);
        const u = redondear({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        marcar.current?.(u);
        mapa.current?.flyTo({ center: [u.lng, u.lat], zoom: 17 });
        avisar.current(u);
      },
      () => {
        setBuscando(false);
        setFalla("No pudimos leer tu ubicación. Revisá que el navegador tenga permiso.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="space-y-2">
      <div
        ref={caja}
        role="application"
        aria-label="Mapa para marcar la ubicación"
        className="h-64 w-full overflow-hidden rounded-xl border border-borde bg-muted"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Boton type="button" variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={usarMiUbicacion} disabled={buscando}>
          {buscando ? "Buscando…" : "Usar mi ubicación"}
        </Boton>
        <span className="text-[12px] text-texto-3">Tocá el mapa donde está el local; el pin se puede arrastrar.</span>
      </div>
      {falla && (
        <p role="alert" className="text-[13px] text-danger-text">
          {falla}
        </p>
      )}
    </div>
  );
}
