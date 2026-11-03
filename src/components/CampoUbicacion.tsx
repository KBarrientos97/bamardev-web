import { lazy, Suspense, useEffect, useId, useState } from "react";
import { Boton } from "./ui";
import { alDescansar, precargarMapa, type Ubicacion } from "../lib/mapa";

// MapLibre (~1 MB) no viaja con la ficha: es un pedazo aparte.
const pedazoMapa = () => import("./ElegirUbicacion");
const ElegirUbicacion = lazy(pedazoMapa);

/**
 * "Ubicación en el mapa" de una sucursal (PLAN-PAGINA-WEB §3.1): el pin del
 * mapa de la página y el destino de "Cómo llegar". Reemplazó al enlace de
 * Google Maps que había que ir a copiar (02-nov). Lo usan Mi página y la
 * ficha de la sucursal.
 *
 * No es un `Campo`: ése es un <label>, y el primer botón de adentro se
 * llamaría como todo el texto del label. Sus botones son `type="button"`:
 * también vive dentro de formularios (la sede de la academia) y no tienen
 * que enviarlos.
 */
export default function CampoUbicacion({
  nombre,
  valor,
  onCambio,
  hint,
}: {
  /** De qué sucursal es, para los lectores de pantalla. */
  nombre: string;
  valor: Ubicacion | null;
  onCambio: (u: Ubicacion | null) => void;
  hint: string;
}) {
  const id = useId();
  const [verMapa, setVerMapa] = useState(false);
  // Al entrar a la ficha (Sedes, Sucursales) se adelanta el mapa: MapLibre,
  // su worker y el estilo. Así "Marcar en el mapa" abre en un momento en vez
  // de esperar la descarga entera (03-nov). Con varias fichas en pantalla se
  // baja una sola vez (`cargarMaplibre` lo recuerda).
  useEffect(() => alDescansar(() => precargarMapa(pedazoMapa)), []);
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className="mb-1.5 block text-[13px] font-semibold text-texto-2">
        Ubicación en el mapa <span className="sr-only">de {nombre}</span>
      </span>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-texto-2">{valor ? "Ubicación marcada" : "Todavía sin marcar"}</span>
          {!verMapa && (
            <Boton type="button" variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => setVerMapa(true)}>
              {valor ? "Cambiar en el mapa" : "Marcar en el mapa"}
            </Boton>
          )}
          {verMapa && (
            <Boton type="button" variante="ghost" className="!px-3 !py-1.5 text-[13px]" onClick={() => setVerMapa(false)}>
              Listo
            </Boton>
          )}
          {valor && (
            <Boton
              type="button"
              variante="ghost"
              className="!px-3 !py-1.5 text-[13px]"
              onClick={() => {
                // El pin del mapa abierto ya no vale: se cierra.
                onCambio(null);
                setVerMapa(false);
              }}
            >
              Quitar
            </Boton>
          )}
        </div>
        {verMapa && (
          <Suspense fallback={<div className="h-64 w-full rounded-xl bg-muted" />}>
            <ElegirUbicacion valor={valor} onCambio={onCambio} />
          </Suspense>
        )}
      </div>
      <span className="mt-1 block text-xs text-texto-4">{hint}</span>
    </div>
  );
}
