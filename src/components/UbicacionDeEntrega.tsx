import { lazy, Suspense, useId, useState } from "react";
import { Boton, Input } from "./ui";
import type { Ubicacion } from "../lib/mapa";
import { coordsDeEnlace } from "../lib/ubicacionEntrega";

// MapLibre (~1 MB) no viaja con el POS: se baja recién al tocar «Marcar en el mapa».
const ElegirUbicacion = lazy(() => import("./ElegirUbicacion"));

/**
 * El pin de un delivery que carga la caja (20-nov, AUDITORIA-REPARTIDOR §2.2
 * D3): opcional, para que el repartidor vea el destino en su mapa en vez de
 * buscar una dirección escrita a las apuradas.
 *
 * Dos formas, porque el caso real es el WhatsApp del cliente: pegar el enlace
 * de Google Maps que mandó (se saca el punto del enlace, sin abrir nada), o
 * tocar el mapa. Nunca es obligatorio: sin pin el pedido sale igual, como
 * siempre.
 *
 * No es un `Campo` (un <label>): adentro hay botones, y el primero se
 * llamaría como todo el texto.
 */
export default function UbicacionDeEntrega({
  valor,
  onCambio,
}: {
  valor: Ubicacion | null;
  onCambio: (u: Ubicacion | null) => void;
}) {
  const id = useId();
  const [enlace, setEnlace] = useState("");
  const [verMapa, setVerMapa] = useState(false);
  const [aviso, setAviso] = useState("");

  function pegar(texto: string) {
    setEnlace(texto);
    if (!texto.trim()) return setAviso("");
    const u = coordsDeEnlace(texto);
    if (u) {
      onCambio(u);
      setAviso("");
    } else {
      // Los enlaces cortos de «Compartir» (maps.app.goo.gl) no traen el punto.
      setAviso("De ese enlace no sale el punto. Pedile al cliente «Compartir ubicación» o marcalo en el mapa.");
    }
  }

  return (
    <div role="group" aria-labelledby={id} className="space-y-2">
      <span id={id} className="block text-[13px] font-semibold text-texto-2">
        Ubicación en el mapa (opcional)
      </span>
      <Input
        value={enlace}
        onChange={(e) => pegar(e.target.value)}
        placeholder="Pegá el enlace de Google Maps del cliente"
        aria-label="Enlace de Google Maps"
        inputMode="url"
      />
      {aviso && <p className="text-xs text-warning-text">{aviso}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-texto-2">
          {valor ? `Ubicación marcada (${valor.lat.toFixed(5)}, ${valor.lng.toFixed(5)})` : "Sin ubicación marcada"}
        </span>
        <Boton type="button" variante="ghost" className="min-h-11 !px-3 !py-1.5 text-[13px]" onClick={() => setVerMapa((v) => !v)}>
          {verMapa ? "Listo" : valor ? "Cambiar en el mapa" : "Marcar en el mapa"}
        </Boton>
        {valor && (
          <Boton
            type="button"
            variante="ghost"
            className="min-h-11 !px-3 !py-1.5 text-[13px]"
            onClick={() => {
              onCambio(null);
              setEnlace("");
              setVerMapa(false);
            }}
          >
            Quitar
          </Boton>
        )}
      </div>
      {verMapa && (
        <Suspense fallback={<div className="h-64 w-full rounded-xl bg-muted" />}>
          <ElegirUbicacion valor={valor} onCambio={onCambio} ayuda="Tocá el mapa donde se entrega; el pin se puede arrastrar." />
        </Suspense>
      )}
    </div>
  );
}
