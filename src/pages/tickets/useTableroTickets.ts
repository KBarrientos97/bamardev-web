import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { apiTickets } from "../../lib/apiTickets";
import type { TableroTickets, TicketPedido } from "../../types/tickets";

/** Cada cuánto se refresca el tablero: lo que cobra la caja aparece solo en despacho. */
export const REFRESCO_TABLERO_MS = 3_000;

/**
 * El tablero de hoy del local, al día solo: Despacho y Tickets y pedidos lo
 * comparten. Pregunta cada pocos segundos mientras la pestaña se ve, y apenas
 * vuelve a verse.
 *
 * Una acción (listo, entregado…) se ve al toque: el ticket que devuelve el
 * backend reemplaza al de la lista sin esperar la vuelta siguiente. En un
 * mostrador con gente esperando, un toque que tarda tres segundos en verse se
 * vuelve a tocar.
 */
export function useTableroTickets() {
  const [datos, setDatos] = useState<TableroTickets | null>(null);
  const [error, setError] = useState("");
  /** La hora del servidor menos la del equipo: el cronómetro de cada pedido. */
  const [desfase, setDesfase] = useState(0);
  const enCurso = useRef(false);

  const recargar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    const pedido = Date.now();
    try {
      const r = await apiTickets.tablero();
      setDesfase(r.ahora - (pedido + Date.now()) / 2);
      setDatos(r);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar los pedidos");
    } finally {
      enCurso.current = false;
    }
  }, []);

  useEffect(() => {
    void recargar();
    const id = setInterval(() => {
      if (!document.hidden) void recargar();
    }, REFRESCO_TABLERO_MS);
    const alVolver = () => {
      if (!document.hidden) void recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("online", alVolver);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("online", alVolver);
    };
  }, [recargar]);

  /**
   * Corre una acción sobre un ticket y la deja vista. Devuelve el ticket como
   * quedó, o tira el mensaje del backend ("ya se entregó", "cambió en otra
   * pantalla") para que la pantalla lo muestre.
   */
  const aplicar = useCallback(
    async (accion: () => Promise<TicketPedido>): Promise<TicketPedido> => {
      try {
        const t = await accion();
        setDatos((d) => (d ? { ...d, tickets: reemplazar(d.tickets, t) } : d));
        void recargar();
        return t;
      } catch (e) {
        // Otro equipo lo movió o la venta se anuló: la lista de acá está vieja.
        void recargar();
        throw new Error(e instanceof ApiError || e instanceof Error ? e.message : "No se pudo hacer");
      }
    },
    [recargar],
  );

  return { datos, error, desfase, recargar, aplicar };
}

function reemplazar(lista: TicketPedido[], t: TicketPedido): TicketPedido[] {
  return lista.some((x) => x.id === t.id) ? lista.map((x) => (x.id === t.id ? t : x)) : [...lista, t];
}

/** Los que se preparan, del más viejo al más nuevo: el que más espera, primero. */
export function preparando(tickets: TicketPedido[]): TicketPedido[] {
  return tickets
    .filter((t) => t.estado === "PREPARANDO")
    .sort((a, b) => Date.parse(a.creadoEn) - Date.parse(b.creadoEn));
}

/** Los listos, del último llamado al primero: el que acaba de sonar, arriba. */
export function listos(tickets: TicketPedido[]): TicketPedido[] {
  return tickets
    .filter((t) => t.estado === "LISTO")
    .sort((a, b) => Date.parse(b.llamadoEn ?? b.listoEn ?? b.creadoEn) - Date.parse(a.llamadoEn ?? a.listoEn ?? a.creadoEn));
}

/** Los entregados, del último al primero. */
export function entregados(tickets: TicketPedido[]): TicketPedido[] {
  return tickets
    .filter((t) => t.estado === "ENTREGADO")
    .sort((a, b) => Date.parse(b.entregadoEn ?? b.creadoEn) - Date.parse(a.entregadoEn ?? a.creadoEn));
}

/**
 * Qué tan atrasado va un pedido que se prepara: ámbar a los 8 minutos, rojo a
 * los 15 (los de la maqueta, pensados para una pollería: un cuarto de pollo
 * sale en 5 a 10).
 */
export function demora(minutos: number): "normal" | "tarde" | "muy_tarde" {
  if (minutos >= 15) return "muy_tarde";
  if (minutos >= 8) return "tarde";
  return "normal";
}

/** "03:07": el cronómetro de un pedido, desde que se cobró. Pasada la hora, "62:10". */
export function cronometro(desdeIso: string, ahora: number): string {
  const seg = Math.max(0, Math.floor((ahora - Date.parse(desdeIso)) / 1000));
  return `${String(Math.floor(seg / 60)).padStart(2, "0")}:${String(seg % 60).padStart(2, "0")}`;
}
