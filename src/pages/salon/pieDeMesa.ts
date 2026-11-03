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

import { esPositivo } from "../../lib/dinero";
import type { Mesa } from "../../types/salon";
import { comandasPendientes, consumoDeMesa, tieneConsumo } from "./logicaSalon";

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
  /**
   * "exito" pinta el aviso en verde. Todos iban en ámbar, y "El cliente ya
   * pagó" se leía como una advertencia justo cuando la mesa quedó bien.
   */
  tonoBanner?: "aviso" | "exito";
  /**
   * "Cobrar Bs X": el mesero cobra la mesa él mismo. Cuando está, va arriba
   * del principal, que pasa a segundo plano. Ver `cobroDelMesero`.
   */
  cobrar?: { texto: string };
  principal: Boton;
  secundario?: Boton;
  terciario?: Boton;
}

/**
 * Lo que hace falta para ofrecerle al mesero cobrar la mesa. Sólo se pasa si
 * el negocio prendió `mesero_cobra`: sin esto el pie es el de siempre.
 */
export interface ContextoCobroMesero {
  /**
   * Tiene `salon.cobrar_mesero`: que el negocio lo habilite no se lo da a
   * todos los roles.
   */
  cobraSusMesas: boolean;
  /** Quién mira la mesa: cobra sólo las suyas. */
  usuarioId?: number | null;
}

/**
 * ¿Puede el mesero cobrar esta mesa ahora? Port de `pintarCobrarYo`
 * (MesaDetalleDialog.kt), que la web no tenía: dibujaba "Cobrar" con sólo
 * mirar que hubiera consumo.
 *
 * El llamador ya descartó lo que frena por el estado: nunca en una PAGADA (el
 * botón aparecía en TODA mesa pagada, encima de "Levantar y liberar", y el
 * backend respondía "la mesa ya se cobró") ni con platos sin servir. Acá van
 * las de la persona, en el orden de la app:
 *  - el permiso: sin él, nada (ni el porqué: no es algo que pueda hacer);
 *  - la mesa es SUYA: es lo que hace que su plata y su liquidación cuadren con
 *    su turno. La de otro el backend la rechaza, y ofrecer un botón que va a
 *    fallar es peor que no ofrecerlo; se dice por qué, para que no parezca que
 *    la app se rompió. Se compara con quien la abrió, igual que el backend.
 */
function cobroDelMesero(
  mesa: Mesa,
  cobro: ContextoCobroMesero | undefined,
  fmtMoney: (n: number) => string,
): { cobrar?: PieDeMesa["cobrar"]; deOtro?: string } {
  const consumo = consumoDeMesa(mesa);
  if (!cobro?.cobraSusMesas || !tieneConsumo(mesa) || !esPositivo(consumo)) return {};
  if (mesa.meseroId == null || mesa.meseroId !== cobro.usuarioId) {
    return {
      deOtro: mesa.meseroNombre
        ? `Esta mesa la atiende ${mesa.meseroNombre}. Sólo puede cobrarla quien la atendió, o la caja.`
        : "Sólo puede cobrarla quien la atendió, o la caja.",
    };
  }
  return { cobrar: { texto: `Cobrar ${fmtMoney(consumo)}` } };
}

export function pieDeMesa(
  mesa: Mesa,
  fmtMoney: (n: number) => string,
  /** Sólo con `mesero_cobra` prendido. Ver `ContextoCobroMesero`. */
  cobro?: ContextoCobroMesero,
): PieDeMesa {
  const pendientes = comandasPendientes(mesa).length;

  switch (mesa.estado) {
    case "RESERVADA":
      return {
        principal: { accion: "abrir", texto: "Ya llegaron · abrir mesa" },
        secundario: { accion: "reserva_cambiar", texto: "Cambiar la reserva" },
        terciario: { accion: "reserva_anular", texto: "Anular reserva" },
      };

    case "PAGADA":
      // Nunca "Cobrar", aunque el mesero cobre sus mesas: la sesión sigue
      // abierta hasta liberarla y el consumo sigue > 0, así que la web ofrecía
      // "Cobrar Bs X" como botón principal en TODA mesa pagada (el backend
      // respondía "la mesa ya se cobró") y "Levantar y liberar" pasaba a
      // segundo plano.
      return {
        banner: `El cliente ya pagó ${fmtMoney(mesa.consumo ?? 0)}`,
        tonoBanner: "exito",
        principal: { accion: "liberar", texto: "Levantar y liberar la mesa" },
      };

    case "CUENTA":
      return {
        banner: "La cuenta ya está en caja. Avisale al cliente que pase a pagar.",
        // Si el cliente le pone la plata en la mano, el mesero la cobra ahí
        // mismo: la caja la sigue viendo hasta que alguno cobre, y el segundo
        // recibe "la mesa ya se cobró". No frena lo que falta servir: la mesa
        // se mandó a caja a propósito, igual que en el POS. Y no se explica la
        // mesa ajena: el renglón ya lo ocupa lo de la caja, que es lo urgente.
        cobrar: cobroDelMesero(mesa, cobro, fmtMoney).cobrar,
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
        // plato. Por lo mismo el mesero tampoco la cobra: sería cobrarle algo
        // que todavía no recibió (y ahí el backend no frena).
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
      // Todo servido: además de pasarla a caja, el mesero la puede cobrar él
      // (son dos caminos, no un reemplazo). Si es de otro, el renglón libre
      // dice por qué no está el botón.
      const { cobrar, deOtro } = cobroDelMesero(mesa, cobro, fmtMoney);
      return {
        ...(deOtro ? { banner: deOtro, tonoBanner: "aviso" as const } : {}),
        cobrar,
        principal: { accion: "agregar", texto: "Agregar pedido" },
        secundario: { accion: "cuenta", texto: "Pedir la cuenta · pasar a caja" },
      };
    }

    default:
      // LIBRE: no hay nada que contar de ella, sólo sentar gente.
      return { principal: { accion: "abrir", texto: "Tomar pedido" } };
  }
}
