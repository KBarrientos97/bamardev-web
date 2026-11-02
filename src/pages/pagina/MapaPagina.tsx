import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import type { SucursalPublica } from "../../lib/pagina/tipos";
import type { PuntoMapa } from "./MapaSucursales";

const MapaSucursales = lazy(() => import("./MapaSucursales"));

/**
 * El lugar del mapa en la página (PLAN-PAGINA-WEB §3.1). Sólo si alguna
 * sucursal trae ubicación (la manda el backend si el dueño no ocultó el
 * mapa). MapLibre se baja recién cuando el recuadro está por entrar en
 * pantalla: quien mira sólo los botones de arriba no lo paga. Sin
 * IntersectionObserver (los tests) queda el recuadro.
 */
export function MapaPagina({
  sucursales,
  color,
  radio,
  borde,
  fondo,
  alto = 220,
}: {
  sucursales: SucursalPublica[];
  color: string;
  radio: CSSProperties["borderRadius"];
  borde?: string;
  fondo: string;
  alto?: number;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const puntos: PuntoMapa[] = sucursales.flatMap((s) => (s.ubicacion ? [{ nombre: s.nombre, ...s.ubicacion }] : []));
  const hay = puntos.length > 0;

  useEffect(() => {
    if (!hay || visible || !caja.current || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(caja.current);
    return () => io.disconnect();
  }, [hay, visible]);

  if (!hay) return null;
  return (
    <div
      ref={caja}
      role="region"
      aria-label={puntos.length === 1 ? `Mapa: ${puntos[0].nombre}` : "Mapa de las sucursales"}
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
      {visible && (
        <Suspense fallback={null}>
          <MapaSucursales puntos={puntos} color={color} />
        </Suspense>
      )}
    </div>
  );
}
