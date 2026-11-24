import { useEffect, useRef, useState } from "react";
import type { Map as MapaGL, Marker } from "maplibre-gl";
import { estiloMapa } from "../../lib/estiloMapa";
import { cargarMaplibre, plegarAtribucion, redondear, SANTA_CRUZ, TEXTOS_MAPA, type Ubicacion } from "../../lib/mapa";

/**
 * El pin de la casa del cliente (pedidos web, 13-nov): se toca el mapa o se
 * arrastra el pin. Es obligatorio en un delivery y funciona sin GPS: el
 * navegador de Instagram y el de TikTok a veces lo bloquean.
 *
 * Es controlado: si `valor` cambia desde afuera (el botón «Usar mi ubicación»
 * del formulario) el pin se mueve y el mapa vuela hasta él. MapLibre se baja
 * recién cuando el cliente abre el pedido y elige delivery (`lazy` en quien
 * lo usa): la página pública no lo carga antes.
 *
 * Con `locales` muestra también dónde está cada local, con un marcador propio
 * del color del negocio (24-nov): el cliente ve de dónde sale su pedido.
 */
export interface LocalEnMapa {
  lat: number;
  lng: number;
  nombre: string;
}

export default function ElegirPin({
  valor,
  centro,
  onCambio,
  locales = [],
  color = "#1F2937",
  alto = 260,
}: {
  valor: Ubicacion | null;
  /** Dónde arranca el mapa si todavía no hay pin (la sucursal más cercana). */
  centro?: Ubicacion | null;
  /** El cliente tocó o arrastró: el pin es suyo, no del GPS. */
  onCambio: (u: Ubicacion) => void;
  /** Los locales que se dibujan (no se mueven ni se tocan). */
  locales?: LocalEnMapa[];
  /** El color del marcador de los locales. */
  color?: string;
  alto?: number | string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGL | null>(null);
  const poner = useRef<((u: Ubicacion, volar: boolean) => void) | null>(null);
  const avisar = useRef(onCambio);
  avisar.current = onCambio;
  const inicial = useRef({ valor, centro, locales, color });
  const ultimo = useRef<Ubicacion | null>(valor);
  const [falla, setFalla] = useState("");

  useEffect(() => {
    let vivo = true;
    let m: MapaGL | null = null;
    cargarMaplibre()
      .then((ml) => {
        if (!vivo || !caja.current) return;
        const { valor: v0, centro: c0, locales: l0, color: col0 } = inicial.current;
        const desde = v0 ?? c0 ?? SANTA_CRUZ;
        try {
          m = new ml.Map({
            container: caja.current,
            style: estiloMapa(),
            center: [desde.lng, desde.lat],
            zoom: v0 ? 17 : c0 ? 14 : 12,
            attributionControl: false,
            locale: TEXTOS_MAPA,
          });
        } catch {
          setFalla("Este navegador no puede mostrar el mapa.");
          return;
        }
        m.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        m.addControl(new ml.AttributionControl({ compact: true }));
        plegarAtribucion(m);
        for (const l of l0) {
          new ml.Marker({ element: marcadorLocal(l.nombre, col0), anchor: "bottom" }).setLngLat([l.lng, l.lat]).addTo(m);
        }
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
        // El pin que corresponde AHORA, no el del primer render: si «Usar mi
        // ubicación» contestó mientras el mapa todavía se bajaba, `poner` era null y
        // ese pin se perdía (el formulario ya lo tenía, el cliente no lo veía) (PW-11).
        const ya = ultimo.current;
        if (ya) colocar(ya, !v0 || ya.lat !== v0.lat || ya.lng !== v0.lng);
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
          height: alto,
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

/** El ícono del local con toldo (el mismo del botón del modo pedir). */
const ICONO_LOCAL = "M3 9l1.5-5h15L21 9M3 9a3 3 0 0 0 6 0a3 3 0 0 0 6 0a3 3 0 0 0 6 0M5 11.5V20h14v-8.5M10 20v-5h4v5";

/** El marcador de un local: una gota del color del negocio con el local adentro. */
function marcadorLocal(nombre: string, color: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `Local: ${nombre}`);
  el.title = nombre;
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;pointer-events:none";
  el.innerHTML =
    `<span style="width:36px;height:36px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center">` +
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONO_LOCAL}"/></svg></span>` +
    `<span style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};margin-top:-2px"></span>`;
  return el;
}
