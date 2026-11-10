/**
 * Las siluetas de carga del panel del mesero.
 *
 * En lugar de la ruedita: la pantalla aparece ya con su forma (tarjetas,
 * filas) en gris y se llena cuando llega el dato. Se siente más rápido y no
 * salta el contenido de lugar (UX nativa, 10-nov).
 */

function Bloque({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-borde-soft motion-reduce:animate-none ${className}`} />;
}

/** El salón: contadores, dos tarjetas grandes y las libres chicas. */
export function EsqueletoSalon() {
  return (
    <div role="status" aria-label="Cargando el salón" className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Bloque key={i} className="h-[60px]" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Bloque key={i} className="h-[148px] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Bloque key={i} className="h-[60px]" />
        ))}
      </div>
    </div>
  );
}

/** Una lista de filas: "Por servir" y el historial de "Mi turno". */
export function EsqueletoFilas({ filas = 4, etiqueta }: { filas?: number; etiqueta: string }) {
  return (
    <div role="status" aria-label={etiqueta} className="space-y-2">
      {Array.from({ length: filas }, (_, i) => (
        <Bloque key={i} className="h-[72px]" />
      ))}
    </div>
  );
}

/** "Mi turno": el resumen grande y los números. */
export function EsqueletoTurno() {
  return (
    <div role="status" aria-label="Cargando tu turno" className="space-y-3">
      <Bloque className="h-[132px] rounded-2xl" />
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <Bloque key={i} className="h-[64px]" />
        ))}
      </div>
      <EsqueletoFilas filas={3} etiqueta="Cargando las mesas del turno" />
    </div>
  );
}

/** La carta: dos columnas de botones. */
export function EsqueletoCarta() {
  return (
    <div role="status" aria-label="Cargando la carta" className="grid grid-cols-2 gap-2">
      {Array.from({ length: 10 }, (_, i) => (
        <Bloque key={i} className="h-[68px]" />
      ))}
    </div>
  );
}
