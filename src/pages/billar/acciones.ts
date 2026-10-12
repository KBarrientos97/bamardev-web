import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { NombreIcono } from "../../components/Icon";
import { sePuedeAnular } from "./calculo";
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

const enCurso = new Set<string>();

/**
 * Una acción de un toque, sin diálogo (reanudar, cancelar la reserva, volver a
 * servicio). No se manda dos veces mientras espera, y si el servidor dice que
 * no (otra caja ya la tocó), se avisa en rojo: un botón que no hace nada sin
 * decir por qué es peor que un error.
 */
export function deUnToque(clave: string, fn: () => Promise<unknown>) {
  if (enCurso.has(clave)) return;
  enCurso.add(clave);
  fn()
    .catch((err: unknown) =>
      billar.avisar({
        tono: "rojo",
        titulo: "No se pudo",
        texto: err instanceof Error && err.message ? err.message : "Probá de nuevo.",
      }),
    )
    .finally(() => enCurso.delete(clave));
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
      const reanudar: AccionMesa = {
        clave: "reanudar",
        etiqueta: "Reanudar",
        icono: "play",
        hacer: () => deUnToque(`reanudar:${id}`, () => billar.reanudar(id)),
      };
      const cambiar: AccionMesa = { clave: "cambiar", etiqueta: "Cambiar mesa", icono: "swap", hacer: () => abrir({ tipo: "cambiar", mesaId: id }) };
      const finalizar: AccionMesa = { clave: "finalizar", etiqueta: "Finalizar mesa", icono: "check", hacer: () => navigate(`/billar/cerrar/${id}`) };
      const historial: AccionMesa = { clave: "historial", etiqueta: "Historial", icono: "clock", hacer: () => abrir({ tipo: "historial", mesaId: id }) };
      // Sin estas dos, una mesa abierta por error no se podía sacar: no tiene
      // nada que cobrar, y con ella abierta la caja no cierra.
      const corregir: AccionMesa = { clave: "inicio", etiqueta: "Corregir inicio", icono: "edit", hacer: () => abrir({ tipo: "editarInicio", mesaId: id }) };
      const anular: AccionMesa = { clave: "anular", etiqueta: "Anular mesa", icono: "trash", hacer: () => abrir({ tipo: "anularMesa", mesaId: id }) };
      // Anular, sólo mientras el reloj no pasa los 5 minutos (`sePuedeAnular`).
      // Si se dieron cuenta tarde, se finaliza y se anula la venta con PIN.
      const siAnulable = sePuedeAnular(v.cuenta) ? [anular] : [];

      switch (v.estado) {
        case "libre":
          return [
            { clave: "abrir", etiqueta: "Abrir mesa", icono: "plus", hacer: () => abrir({ tipo: "abrir", mesaId: id }) },
            { clave: "reservar", etiqueta: "Reservar", icono: "calendar", hacer: () => abrir({ tipo: "reservar", mesaId: id }) },
            { clave: "fuera", etiqueta: "Fuera de servicio", icono: "llave", hacer: () => abrir({ tipo: "fuera", mesaId: id }) },
            historial,
          ];
        case "juego":
          return [consumo, pago, ...(fijo ? [extender] : []), pausar, cambiar, finalizar, historial, corregir, ...siAnulable];
        case "vence":
        case "cumplido":
          return [extender, consumo, pago, pausar, cambiar, finalizar, historial, corregir, ...siAnulable];
        case "pausada":
          return [reanudar, consumo, pago, cambiar, finalizar, historial, corregir, ...siAnulable];
        case "reservada":
          return [
            { clave: "llego", etiqueta: "Llegó · Abrir", icono: "arrowRight", hacer: () => abrir({ tipo: "abrir", mesaId: id }) },
            {
              clave: "cancelar",
              etiqueta: "Cancelar reserva",
              icono: "x",
              hacer: () => deUnToque(`reserva:${id}`, () => billar.cancelarReserva(id)),
            },
            historial,
          ];
        case "fuera":
          return [
            {
              clave: "volver",
              etiqueta: "Volver a servicio",
              icono: "check",
              hacer: () => deUnToque(`servicio:${id}`, () => billar.volverAServicio(id)),
            },
            historial,
          ];
      }
    },
    [navigate, abrir],
  );
}
