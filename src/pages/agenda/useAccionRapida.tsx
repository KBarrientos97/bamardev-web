import { useState } from "react";
import { Confirmar } from "../../components/ui";
import { apiAgenda, mensajeDe } from "../../lib/agenda/apiAgenda";
import type { AccionCita, Cita } from "../../lib/agenda/tiposAgenda";

/**
 * Los botones rápidos de las listas (Hoy, Mi agenda, la lista del celular).
 *
 * "No vino" pide confirmación: es un toque al lado de "Llegó" y marca una
 * inasistencia en la ficha del cliente, que a la tercera lo señala (§5.2).
 * Lo demás va directo: si alguien se equivoca de "Llegó", la siguiente acción
 * lo corrige, y una confirmación por cada clienta del día cansa a recepción.
 */
export function useAccionRapida(onHecha: (cita: Cita) => void) {
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [porConfirmar, setPorConfirmar] = useState<Cita | null>(null);

  async function ejecutar(cita: Cita, accion: AccionCita) {
    setError("");
    setOcupadoId(cita.id);
    try {
      onHecha(await apiAgenda.cambiarEstado(cita.id, accion));
    } catch (e) {
      setError(`${cita.cliente.nombre}: ${mensajeDe(e)}`);
    } finally {
      setOcupadoId(null);
      setPorConfirmar(null);
    }
  }

  function pedir(cita: Cita, accion: AccionCita) {
    if (accion === "NO_ASISTIO") setPorConfirmar(cita);
    else ejecutar(cita, accion);
  }

  const dialogo = (
    <Confirmar
      abierto={porConfirmar !== null}
      titulo="¿No vino?"
      texto={`Se marca como inasistencia de ${porConfirmar?.cliente.nombre ?? ""} y se libera el horario.`}
      etiquetaOk="No vino"
      peligroso
      procesando={ocupadoId !== null}
      onCancel={() => setPorConfirmar(null)}
      onOk={() => porConfirmar && ejecutar(porConfirmar, "NO_ASISTIO")}
    />
  );

  return { pedir, ocupadoId, error, setError, dialogo };
}
