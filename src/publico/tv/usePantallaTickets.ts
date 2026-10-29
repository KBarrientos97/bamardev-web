import { useCallback, useEffect, useRef, useState } from "react";
import type { PantallaTicketsApi } from "../../types/tickets";
import { apiTv } from "./apiTv";
import { clasificarFalla } from "./TvBillar.datos";

/**
 * Cada cuánto pregunta la TV de tickets. Más seguido que la del billar (10 s):
 * acá lo que importa es que el número suene apenas despacho lo marca listo,
 * con el cliente parado frente al mostrador. El backend admite 300 por minuto
 * por IP para esta ruta, y un local tiene una sola TV de tickets.
 */
export const CADA_MS_TICKETS = 2_500;
/** Llave anulada: se sigue preguntando, despacio, por si se vuelve a habilitar. */
const LENTO_MS = 60_000;
const TOPE_REINTENTO_MS = 30_000;

export interface EstadoPantallaTickets {
  /** Lo último que llegó. Sin conexión se conserva: mejor números de hace un rato que una pantalla vacía. */
  datos: PantallaTicketsApi | null;
  fase: "cargando" | "lista" | "anulada" | "invalida";
  sinConexion: string | null;
  /** La hora del servidor menos la del televisor, para el reloj y los minutos. */
  desfase: number;
}

/**
 * Mantiene al día la TV de tickets, como `useSalonPublico` con la del billar:
 * pregunta cada `CADA_MS_TICKETS`, se espacia sin conexión y se recupera sola.
 * Con la llave anulada borra lo que tenía: una TV cortada no puede seguir
 * mostrando números congelados como si anduviera.
 */
export function usePantallaTickets(llave: string, sucursalId?: number) {
  const [estado, setEstado] = useState<EstadoPantallaTickets>({
    datos: null,
    fase: "cargando",
    sinConexion: null,
    desfase: 0,
  });
  const traerRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setTimeout> | null = null;
    let enCurso: AbortController | null = null;
    let fallos = 0;
    setEstado({ datos: null, fase: "cargando", sinConexion: null, desfase: 0 });

    const programar = (ms: number) => {
      if (reloj) clearTimeout(reloj);
      reloj = setTimeout(() => void traer(), ms);
    };

    async function traer() {
      if (!vivo) return;
      if (reloj) clearTimeout(reloj);
      reloj = null;
      enCurso?.abort();
      const mio = new AbortController();
      enCurso = mio;
      const pedido = Date.now();
      try {
        const r = await apiTv.tickets(llave, sucursalId, mio.signal);
        if (!vivo || mio.signal.aborted) return;
        fallos = 0;
        // Corrida a la mitad del viaje, como la TV del billar.
        const desfase = r.ahora - (pedido + Date.now()) / 2;
        setEstado({ datos: r, fase: "lista", sinConexion: null, desfase });
        programar(CADA_MS_TICKETS);
      } catch (err) {
        if (!vivo || mio.signal.aborted) return;
        const falla = clasificarFalla(err);
        if (falla === "sinConexion") {
          fallos++;
          const texto = err instanceof Error && err.message ? err.message : "sin conexión";
          setEstado((e) => ({ ...e, sinConexion: texto }));
          programar(Math.min(TOPE_REINTENTO_MS, CADA_MS_TICKETS * 2 ** Math.min(fallos, 4)));
        } else {
          setEstado({ datos: null, fase: falla, sinConexion: null, desfase: 0 });
          programar(LENTO_MS);
        }
      } finally {
        if (enCurso === mio) enCurso = null;
      }
    }

    // A diferencia de la TV del billar, sigue preguntando con la pestaña
    // escondida: una TV de tickets puede quedar detrás de otra ventana y
    // tiene que seguir sonando.
    traerRef.current = () => void traer();
    const alConectar = () => void traer();
    void traer();
    window.addEventListener("online", alConectar);
    return () => {
      vivo = false;
      if (reloj) clearTimeout(reloj);
      enCurso?.abort();
      window.removeEventListener("online", alConectar);
    };
  }, [llave, sucursalId]);

  const reintentar = useCallback(() => traerRef.current(), []);
  return { ...estado, reintentar };
}
