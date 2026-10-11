import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { NombreIcono } from "../../components/Icon";
import { useDialogos } from "./dialogos";
import { billar } from "./store";
import type { VistaMesa } from "./vista";

/** Una acción sobre una mesa: la usan el botón de la tarjeta, el menú "…" y el panel. */
export interface AccionMesa {
  clave: string;
  etiqueta: string;
  icono: NombreIcono;
  hacer: () => void;
}

/**
 * Qué se puede hacer con una mesa según cómo está (§7.1, §7.12). La primera es
 * la principal: va en el botón de la tarjeta.
 */
export function useAccionesMesa() {
  const navigate = useNavigate();
  const { abrir } = useDialogos();

  return useCallback(
    (v: VistaMesa): AccionMesa[] => {
      const id = v.mesa.id;
      const fijo = !!v.mesa.sesion?.prepago;
      const consumo: AccionMesa = {
        clave: "consumo",
        etiqueta: "Agregar consumo",
        icono: "plus",
        hacer: () => navigate(`/billar/consumo/${id}`),
      };
      const pago: AccionMesa = { clave: "pago", etiqueta: "Registrar pago", icono: "billetera", hacer: () => abrir({ tipo: "pago", mesaId: id }) };
      const extender: AccionMesa = { clave: "extender", etiqueta: "Extender", icono: "cronometro", hacer: () => abrir({ tipo: "extender", mesaId: id }) };
      const pausar: AccionMesa = { clave: "pausar", etiqueta: "Pausar", icono: "pausa", hacer: () => abrir({ tipo: "pausar", mesaId: id }) };
      const reanudar: AccionMesa = { clave: "reanudar", etiqueta: "Reanudar", icono: "play", hacer: () => billar.reanudar(id) };
      const cambiar: AccionMesa = { clave: "cambiar", etiqueta: "Cambiar mesa", icono: "swap", hacer: () => abrir({ tipo: "cambiar", mesaId: id }) };
      const finalizar: AccionMesa = { clave: "finalizar", etiqueta: "Finalizar mesa", icono: "check", hacer: () => navigate(`/billar/cerrar/${id}`) };
      const historial: AccionMesa = { clave: "historial", etiqueta: "Historial", icono: "clock", hacer: () => abrir({ tipo: "historial", mesaId: id }) };

      switch (v.estado) {
        case "libre":
          return [
            { clave: "abrir", etiqueta: "Abrir mesa", icono: "plus", hacer: () => abrir({ tipo: "abrir", mesaId: id }) },
            { clave: "reservar", etiqueta: "Reservar", icono: "calendar", hacer: () => abrir({ tipo: "reservar", mesaId: id }) },
            { clave: "fuera", etiqueta: "Fuera de servicio", icono: "llave", hacer: () => abrir({ tipo: "fuera", mesaId: id }) },
            historial,
          ];
        case "juego":
          return [consumo, pago, ...(fijo ? [extender] : []), pausar, cambiar, finalizar, historial];
        case "vence":
        case "cumplido":
          return [extender, consumo, pago, pausar, cambiar, finalizar, historial];
        case "pausada":
          return [reanudar, consumo, pago, cambiar, finalizar, historial];
        case "reservada":
          return [
            { clave: "llego", etiqueta: "Llegó · Abrir", icono: "arrowRight", hacer: () => abrir({ tipo: "abrir", mesaId: id }) },
            { clave: "cancelar", etiqueta: "Cancelar reserva", icono: "x", hacer: () => billar.cancelarReserva(id) },
            historial,
          ];
        case "fuera":
          return [
            { clave: "volver", etiqueta: "Volver a servicio", icono: "check", hacer: () => billar.volverAServicio(id) },
            historial,
          ];
      }
    },
    [navigate, abrir],
  );
}
