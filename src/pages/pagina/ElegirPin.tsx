import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL, Marker } from "maplibre-gl";
import { estiloMapa } from "../../lib/estiloMapa";
import { cargarMaplibre, redondear, SANTA_CRUZ, type Ubicacion } from "../../lib/mapa";

/**
 * El pin de la casa del cliente (pedidos web, 13-nov): se toca el mapa o se
 * arrastra el pin. Es obligatorio en un delivery y funciona sin GPS: el
 * navegador de Instagram y el de TikTok a veces lo bloquean.
 *
 * Es controlado: si `valor` cambia desde afuera (el botón «Usar mi ubicación»
 * del formulario) el pin se mueve y el mapa vuela hasta él. MapLibre se baja
 * recién cuando el cliente abre el pedido y elige delivery (`lazy` en quien
 * lo usa): la página pública no lo carga antes.
 */
export default function ElegirPin({
  valor,
  centro,
  onCambio,
}: {
  valor: Ubicacion | null;
  /** Dónde arranca el mapa si todavía no hay pin (la sucursal más cercana). */
  centro?: Ubicacion | null;
  /** El cliente tocó o arrastró: el pin es suyo, no del GPS. */
  onCambio: (u: Ubicacion) => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const poner = useRef<((u: Ubicacion, volar: boolean) => void) | null>(null);
  const avisar = useRef(onCambio);
  avisar.current = onCambio;
  const inicial = useRef({ valor, centro });
  const ultimo = useRef<Ubicacion | null>(valor);
  const [falla, setFalla] = useState("");

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current) return;
        const { valor: v0, centro: c0 } = inicial.current;
        const desde = v0 ?? c0 ?? SANTA_CRUZ;
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [desde.lng, desde.lat],
            zoom: v0 ? 17 : c0 ? 14 : 12,
            attributionControl: false,
          });
        } catch {
          setFalla("Este navegador no puede mostrar el mapa.");
          return;
        }
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.AttributionControl({ compact: true }));
        let pin: Marker | null = null;
        const colocar = (u: Ubicacion, volar: boolean) => {
          ultimo.current = u;
          if (pin) pin.setLngLat([u.lng, u.lat]);
          else {
            pin = new ml.Marker({ draggable: true }).setLngLat([u.lng, u.lat]).addTo(m!);
            pin.on("dragend", () => {
              const p = pin!.getLngLat();
              const u2 = redondear({ lat: p.lat, lng: p.lng });
              ultimo.current = u2;
              avisar.current(u2);
            });
          }
          if (volar) m!.flyTo({ center: [u.lng, u.lat], zoom: Math.max(m!.getZoom(), 17) });
        };
        if (v0) colocar(v0, false);
        m.on("click", (e) => {
          const u = redondear({ lat: e.lngLat.lat, lng: e.lngLat.lng });
          colocar(u, false);
          avisar.current(u);
        });
        mapa.current = m;
        poner.current = colocar;
      })
      .catch(() => vivo && setFalla("No se pudo cargar el mapa. Revisá tu conexión."));
    return () => {
      vivo = false;
      m?.remove();
      mapa.current = null;
      poner.current = null;
    };
  }, []);

  // Un cambio de afuera (el GPS): se mueve el pin y se vuela hasta él.
  useEffect(() => {
    if (!valor) return;
    const ya = ultimo.current;
    if (ya && ya.lat === valor.lat && ya.lng === valor.lng) return;
    ultimo.current = valor;
    poner.current?.(valor, true);
  }, [valor]);

  return (
    <div>
      <div
        ref={caja}
        role="application"
        aria-label="Mapa para marcar dónde te lo llevamos"
        style={{
          height: 260,
          width: "100%",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid #D1D5DB",
          background: "#EEF0F3",
        }}
      />
      {falla && (
        <p role="alert" style={{ margin: "6px 0 0", fontSize: 13, color: "#B91C1C" }}>
          {falla}
        </p>
      )}
    </div>
  );
}
