/**
 * Qué botones muestra la hoja de detalle según cómo esté la mesa.
 *
 * El pie cambia según el estado, y ese es el punto: en cada momento hay **una**
 * acción obvia y el resto pasa a segundo plano. Ofrecer siempre las mismas
 * cinco es lo que hace que alguien mande a caja una mesa vacía o libere una sin
 * cobrar.
 *
 * Vive aparte del componente porque es la regla de negocio de la pantalla —
 * la parte que no se puede romper sin que alguien pierda plata — y así se
 * puede probar sin montar la hoja entera.
 */

import type { Mesa } from "../../types/salon";
import { comandasPendientes, tieneConsumo } from "./logicaSalon";

export type AccionMesa =
  | "agregar"
  | "cuenta"
  | "liberar"
  | "abrir"
  | "reserva_cambiar"
  | "reserva_anular";

export interface Boton {
  accion: AccionMesa;
  texto: string;
  /** Apagado pero visible: hay una razón que el banner explica. */
  deshabilitado?: boolean;
}

export interface PieDeMesa {
  /** Aviso arriba de los botones. Explica por qué algo está apagado. */
  banner?: string;
  principal: Boton;
  secundario?: Boton;
  terciario?: Boton;
}

export function pieDeMesa(mesa: Mesa, fmtMoney: (n: number) => string): PieDeMesa {
  const pendientes = comandasPendientes(mesa).length;

  switch (mesa.estado) {
    case "RESERVADA":
      return {
        principal: { accion: "abrir", texto: "Ya llegaron · abrir mesa" },
        secundario: { accion: "reserva_cambiar", texto: "Cambiar la reserva" },
        terciario: { accion: "reserva_anular", texto: "Anular reserva" },
      };

    case "PAGADA":
      return {
        banner: `El cliente ya pagó ${fmtMoney(mesa.consumo ?? 0)}`,
        principal: { accion: "liberar", texto: "Levantar y liberar la mesa" },
      };

    case "CUENTA":
      return {
        banner: "La cuenta ya está en caja. Avisale al cliente que pase a pagar.",
        // Todavía se puede pedir algo más: el cliente que ve la cuenta y pide
        // un café último no puede obligar a abrir otra mesa.
        principal: { accion: "agregar", texto: "Agregar pedido" },
      };

    case "OCUPADA": {
      if (!tieneConsumo(mesa)) {
        // Una mesa sin nada pedido no tiene cuenta que mandar: lo que
        // corresponde es soltarla. Pasa cuando el cliente se levanta sin pedir
        // o cuando se anula todo, y sin esta salida la mesa quedaba ocupada
        // para siempre — "Pedir la cuenta" apagado era el único botón, y la
        // caja no cobra Bs 0.
        return {
          principal: { accion: "agregar", texto: "Agregar pedido" },
          secundario: { accion: "liberar", texto: "Liberar la mesa · nadie pidió nada" },
        };
      }
      if (pendientes > 0) {
        // Con pedidos todavía sin llevar, la cuenta se estaría cerrando con
        // comida en camino: el cliente no pidió la cuenta si todavía espera un
        // plato.
        return {
          banner:
            pendientes === 1
              ? "Primero llevá a la mesa el pedido que falta. Después podés pasar la cuenta a caja."
              : `Primero llevá a la mesa los ${pendientes} pedidos que faltan. Después podés pasar la cuenta a caja.`,
          principal: { accion: "agregar", texto: "Agregar pedido" },
          secundario: {
            accion: "cuenta",
            texto: "Pedir la cuenta · pasar a caja",
            deshabilitado: true,
          },
        };
      }
      return {
        principal: { accion: "agregar", texto: "Agregar pedido" },
        secundario: { accion: "cuenta", texto: "Pedir la cuenta · pasar a caja" },
      };
    }

    default:
      // LIBRE: no hay nada que contar de ella, sólo sentar gente.
      return { principal: { accion: "abrir", texto: "Tomar pedido" } };
  }
}
