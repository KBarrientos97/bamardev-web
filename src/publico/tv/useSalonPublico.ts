import { useCallback, useEffect, useRef, useState } from "react";
import { fijarMoneda } from "../../lib/format";
import { fijarDesfase } from "../../pages/billar/reloj";
import { apiTv, type SalonPublicoApi } from "./apiTv";
import { CADA_MS, clasificarFalla, esperaTrasFallo, LENTO_MS } from "./TvBillar.datos";

export interface EstadoSalonPublico {
  /** Lo último que llegó. Se conserva sin conexión: mejor mesas de hace un rato que una pantalla vacía. */
  datos: SalonPublicoApi | null;
  fase: "cargando" | "lista" | "anulada" | "invalida";
  /** Por qué falló la última vuelta, si falló por la red o el servidor; null si anduvo. */
  sinConexion: string | null;
}

/**
 * Mantiene al día la TV pública: pregunta cada `CADA_MS`, se espacia sin
 * conexión y se recupera sola apenas vuelve (también con el evento `online`
 * del navegador, sin esperar la vuelta siguiente).
 *
 * Con la llave anulada BORRA lo que tenía: una TV cortada desde Mesas de
 * billar no puede seguir mostrando el salón congelado como si anduviera.
 */
export function useSalonPublico(llave: string, sucursalId?: number) {
  const [estado, setEstado] = useState<EstadoSalonPublico>({ datos: null, fase: "cargando", sinConexion: null });
  const traerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    let enCurso: AbortController | null = null;
    let fallos = 0;
    setEstado({ datos: null, fase: "cargando", sinConexion: null });

    const programar = (ms: number) => {
      if (reloj) clearTimeout(reloj);
      reloj = setTimeout(() => void traer(), ms);
    };

    async function traer() {
      if (!vivo) return;
      if (reloj) clearTimeout(reloj);
      reloj = null;
      // Con la pestaña escondida no pregunta: al volver, pregunta enseguida.
      if (document.hidden) return;
      enCurso?.abort();
      const mio = new AbortController();
      enCurso = mio;
      const pedido = Date.now();
      try {
        const r = await apiTv.salon(llave, sucursalId, mio.signal);
        if (!vivo || mio.signal.aborted) return;
        // La hora del servidor, corrida a la mitad del viaje (como el tablero):
        // con el reloj de la TV atrasado, el tiempo jugado se veía de menos.
        fijarDesfase(r.ahora - (pedido + Date.now()) / 2);
        if (r.moneda) fijarMoneda(r.moneda);
        fallos = 0;
        setEstado({ datos: r, fase: "lista", sinConexion: null });
        programar(CADA_MS);
      } catch (err) {
        // Cancelada por otra vuelta más nueva (o porque se desmontó): ésa manda.
        if (!vivo || mio.signal.aborted) return;
        const falla = clasificarFalla(err);
        if (falla === "sinConexion") {
          fallos++;
          const texto = err instanceof Error && err.message ? err.message : "sin conexión";
          setEstado((e) => ({ ...e, sinConexion: texto }));
          programar(esperaTrasFallo(fallos));
        } else {
          setEstado({ datos: null, fase: falla, sinConexion: null });
          programar(LENTO_MS);
        }
      } finally {
        if (enCurso === mio) enCurso = null;
      }
    }

    traerRef.current = () => void traer();
    const alVolver = () => {
      if (!document.hidden) void traer();
    };
    const alConectar = () => void traer();
    void traer();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alConectar);
    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
      enCurso?.abort();
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alConectar);
    };
  }, [llave, sucursalId]);

  const reintentar = useCallback(() => traerRef.current(), []);
  return { ...estado, reintentar };
}
