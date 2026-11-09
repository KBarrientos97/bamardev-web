import { lazy, Suspense, useEffect, useState } from "react";
import { olvidarTokenDeSoporte, sesionDeSoporte, vencida } from "../../lib/armado";

const MiPagina = lazy(() => import("./MiPagina"));

/**
 * `/soporte`: la web del cliente abierta desde el panel (ver `lib/armado.ts`).
 * Fuera del AuthProvider, como la reserva y la TV: no hay login ni menú, y un
 * 401 de acá no cierra ninguna otra sesión del navegador.
 *
 * Con `armado` ("Te la armamos", PLAN-PAGINA-PRO M5) abre Mi página para
 * escribir en el borrador. Sin él, la misma pantalla en sólo lectura: el
 * backend rechaza cualquier cambio, y alcanza con que se pueda mirar.
 */

function Vencido() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-fondo p-4">
      <div role="alert" className="card max-w-md space-y-2 p-6 text-center">
        <h1 className="text-lg font-bold text-texto">Se venció el acceso</h1>
        <p className="text-sm text-texto-2">
          Volvé a abrirlo desde el panel. Lo que ya se guardó quedó en el borrador del negocio.
        </p>
      </div>
    </div>
  );
}

export default function SoporteNegocio() {
  const [sesion] = useState(sesionDeSoporte);
  // El servidor ya dijo que venció (un 401 recarga con `?vencido=1`).
  const [vencio, setVencio] = useState(
    () => vencida(sesion) || (typeof window !== "undefined" && window.location.search.includes("vencido=1")),
  );

  // Al llegar la hora, el cartel, aunque nadie toque nada.
  useEffect(() => {
    if (vencio || !sesion?.vence) return;
    const t = setTimeout(() => setVencio(true), Math.max(0, sesion.vence - Date.now()));
    return () => clearTimeout(t);
  }, [vencio, sesion]);
  useEffect(() => {
    if (vencio) olvidarTokenDeSoporte();
  }, [vencio]);

  if (!sesion || vencio) return <Vencido />;
  return (
    <div className="min-h-dvh bg-fondo">
      <Suspense fallback={<div className="min-h-dvh bg-fondo" aria-busy="true" />}>
        <MiPagina soporte={{ armado: sesion.armado, vence: sesion.vence }} />
      </Suspense>
    </div>
  );
}
