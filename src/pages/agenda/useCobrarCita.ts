import { useNavigate } from "react-router-dom";
import { rutaCobroCita } from "../../lib/agenda/cobroCita";
import { useAuth } from "../../store/AuthContext";

/**
 * "Cobrar" de la agenda (A3, A4): abre el POS con el carrito de la cita.
 *
 * Null si quien mira no tiene el punto de venta (un supervisor sin POS en su
 * rol, o un plan sin `pos`): la pantalla muestra el botón apagado con "Lo
 * cobra la caja" en vez de mandarlo a una ruta que lo devolvería al inicio.
 */
export function useCobrarCita(): ((citaId: number) => void) | null {
  const { puede } = useAuth();
  const navigate = useNavigate();
  if (!puede?.("pos")) return null;
  return (citaId) => navigate(rutaCobroCita(citaId));
}
