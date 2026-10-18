import { aCentavos } from "../../lib/dinero";
import { fmtMoney } from "../../lib/format";
import { imputarPagos, pausadoAntesDe, round2 } from "./calculo";
import type { PagoNuevo } from "./store";
import { INICIO_MAX_ATRAS_MS } from "./ModalesMesa.datos";
import type { Pago, Sesion, VentaBillar } from "./tipos";

/**
 * "en efectivo", "por QR": el medio en el botón de cobrar. El cobro arranca en
 * Efectivo y el botón decía sólo "Confirmar cobro", así que el medio mal
 * marcado salía de la propia pantalla (revisión del 17-oct).
 */
export function medioDelBoton(metodo: PagoNuevo["metodo"]): string {
  if (metodo === "Efectivo") return "en efectivo";
  if (metodo === "QR") return "por QR";
  return "mixto (efectivo + QR)";
}

/** Los pagos finales de un cobro, como los guarda la venta (el mixto, en dos). */
export function pagosFinales(p: PagoNuevo): { metodo: string; monto: number }[] {
  if (p.metodo === "Mixto") {
    return [
      { metodo: "Efectivo", monto: p.partes?.efectivo ?? 0 },
      { metodo: "QR", monto: p.partes?.qr ?? 0 },
    ];
  }
  return [{ metodo: p.metodo, monto: p.monto }];
}

const norm = (metodo: string) => (metodo.toLowerCase().includes("efectivo") ? "efectivo" : metodo.trim().toLowerCase());

const firma = (pagos: { metodo: string; monto: number }[]) =>
  pagos
    .filter((p) => p.monto > 0.005)
    .map((p) => `${norm(p.metodo)}:${round2(p.monto).toFixed(2)}`)
    .sort()
    .join("|");

/**
 * Si la venta que devolvió un reintento quedó con OTROS pagos que los que se
 * mandaron, cómo figura ("Efectivo Bs 45,00"); null si coincide.
 *
 * El reintento de un cobro manda la misma clave aunque el cajero haya cambiado
 * de medio (la clave es la mesa y la hora de la cuenta): si la primera
 * respuesta se cortó y el cliente dijo "le pago por QR", el backend devolvía
 * la venta ya grabada en efectivo y el aviso decía "QR". La caja esperaba un
 * efectivo que no estaba y nadie se enteraba (revisión del 17-oct).
 *
 * Lo esperado es lo que arma el backend al cerrar: lo que cubre la cuenta de
 * cada adelanto (`imputarPagos`, lo no efectivo primero) más los pagos finales.
 */
export function cobroQueFigura(
  figura: VentaBillar["pagos"],
  previos: Pick<Pago, "metodo" | "monto">[],
  total: number,
  finales: { metodo: string; monto: number }[],
): string | null {
  const real = figura.filter((p) => p.metodo !== "Fiado");
  if (!real.length) return null;
  const esperado = [
    ...imputarPagos(previos, total)
      .filter((x) => x.cubre > 0.005)
      .map((x) => ({ metodo: x.pago.metodo, monto: x.cubre })),
    ...finales,
  ];
  if (firma(real) === firma(esperado)) return null;
  return real.map((p) => `${p.metodo} ${fmtMoney(p.monto)}`).join(" + ");
}

/**
 * Una mesa en pausa que en realidad siguió jugando: a qué hora correr el
 * inicio para cobrar lo jugado en pausa, o null si ya no se puede. El aviso
 * decía "que el encargado corrija la hora de inicio" sin decir cuánto, y con
 * la hora real el diálogo ni deja confirmar (prueba profunda, 18-oct).
 *
 * Con la mesa en pausa el reloj se corta en `pausedAt`: correr el inicio lo
 * que pasó desde ahí suma ese tiempo. No se puede con la cuenta traída de otra
 * mesa (el backend no deja ir antes del cambio), a más de 12 h, ni si la pausa
 * se corrió por una corrección anterior (`pausedAt` después de `pausaDesde`).
 */
export function inicioParaCobrarLaPausa(
  s: Pick<Sesion, "start" | "pausedAt" | "pausaDesde" | "prev" | "pausas">,
  ahora: number,
): { inicio: number; pausaMs: number } | null {
  if (s.pausedAt == null || s.prev) return null;
  if (s.pausaDesde != null && s.pausaDesde < s.pausedAt) return null;
  const pausaMs = Math.max(0, ahora - s.pausedAt);
  const inicio = s.start - pausaMs;
  if (pausaMs < 60_000 || ahora - inicio > INICIO_MAX_ATRAS_MS) return null;
  // Si hay pausas terminadas entre la hora nueva y la de ahora (las sacó una
  // corrección anterior hacia adelante), correr el inicio también las devuelve
  // y la mesa quedaría con menos de lo que dice el aviso (revisión del 18-oct).
  if (pausadoAntesDe(s.pausas ?? [], inicio, s.start) > 0) return null;
  return { inicio, pausaMs };
}

/**
 * Lo que el cobro tenía encaminado con la cuenta de antes: lo que se mandó a
 * cobrar, o lo que hay en el formulario. Si la cuenta cambia, la de ahora se
 * compara con esto para decir qué hacer con la plata que ya se entregó.
 */
export interface CobroIntentado {
  /** La hora de la cuenta (`hasta`). */
  hasta: number;
  total: number;
  saldo: number;
  pagado: number;
  /** Lo pagado de más que había que devolver. */
  aFavor: number;
  /** Lo que ya entró por QR: el QR confirmado o la parte QR del mixto. */
  qr: number;
  /** Lo que se cobraba en efectivo (el vuelto se dio sobre esto). */
  efectivo: number;
}

/**
 * Desde cuándo la cuenta es vieja: el servidor no cobra una de hace más de 5
 * minutos (`HASTA_MAX_ATRAS_MS` en billar.service.ts). Con 15 s de margen, la
 * pantalla la recalcula sola antes de que llegue el rechazo. Un rechazo que no
 * era por la hora y se toma por viejo pierde su mensaje esa vez; si sigue
 * pasando, el siguiente ya llega con la hora al día y queda a la vista.
 */
export const CUENTA_VIEJA_MS = 5 * 60_000 - 15_000;

/** Cómo dejar el cobro al aceptar la cuenta nueva cuando ya entró un QR. */
export type CobroSugerido = { metodo: "Mixto"; efectivo: number } | { metodo: "QR" } | null;

/** Por qué cambió la cuenta: pasaron 5 minutos, otro rechazo que cruzó un tramo, u otro equipo. */
export type MotivoRecalculo = "vieja" | "hora" | "otroEquipo";

const MOTIVOS: Record<MotivoRecalculo, string> = {
  vieja: "Pasaron 5 minutos y la cuenta se recalculó a la hora de ahora",
  hora: "La cuenta se recalculó a la hora de ahora",
  otroEquipo: "La cuenta cambió mientras cobrabas (otro equipo cargó o cobró algo)",
};

/**
 * El aviso de una cuenta que cambió mientras se cobraba (se recalculó a la
 * hora de ahora, u otro equipo cargó o cobró algo), o null si da lo mismo.
 *
 * Compara el TOTAL y lo PAGADO, no el saldo: con lo pagado de más el saldo es
 * 0 antes y después, y la devolución pasaba de Bs 15 a Bs 10 sin aviso. El
 * cajero que ya había devuelto los 15 dejaba el cajón Bs 5 corto (revisión del
 * 18-oct).
 *
 * Y dice qué hacer con lo que ya se entregó con la cuenta vieja. Lo que más
 * pasa es esperar un QR: el cliente transfirió Bs 15, la cuenta pasó a Bs 20, y
 * la pantalla pedía confirmar un QR de Bs 20 mirando en el banco uno de Bs 15
 * (se registraban Bs 5 que no llegaron). `sugerido` deja el cobro en Mixto con
 * lo que ya entró por QR, o todo por QR si eso ya lo cubre: con la cuenta
 * nueva en Efectivo, «Justo» registraba efectivo que nunca entró.
 */
export function avisoCuentaRecalculada(
  antes: CobroIntentado,
  ahora: { total: number; saldo: number; pagado: number },
  motivo: MotivoRecalculo,
): { texto: string; sugerido: CobroSugerido } | null {
  if (aCentavos(antes.total) === aCentavos(ahora.total) && aCentavos(antes.pagado) === aCentavos(ahora.pagado)) {
    return null;
  }
  const hay = (x: number) => x > 0.005;
  const base = MOTIVOS[motivo];
  const aFavor = Math.max(0, round2(ahora.pagado - ahora.total));
  if (!hay(antes.saldo) && !hay(ahora.saldo)) {
    if (!hay(antes.aFavor)) return { texto: `${base}: ahora hay que devolver ${fmtMoney(aFavor)}.`, sugerido: null };
    if (!hay(aFavor)) {
      return {
        texto: `${base}: ya no hay nada que devolver (era ${fmtMoney(antes.aFavor)}). Si ya lo devolviste, pedíselo al cliente antes de cerrar.`,
        sugerido: null,
      };
    }
    const dif = round2(antes.aFavor - aFavor);
    return {
      texto:
        `${base}: ahora hay que devolver ${fmtMoney(aFavor)} (era ${fmtMoney(antes.aFavor)}). ` +
        (dif > 0
          ? `Si ya devolviste ${fmtMoney(antes.aFavor)}, pedile ${fmtMoney(dif)} al cliente antes de cerrar.`
          : `Si ya devolviste ${fmtMoney(antes.aFavor)}, devolvele ${fmtMoney(-dif)} más.`),
      sugerido: null,
    };
  }
  const texto = `${base}: ahora el saldo es ${fmtMoney(ahora.saldo)} (era ${fmtMoney(antes.saldo)}).`;
  if (hay(antes.qr)) {
    // Lo que falta aparte de lo que ya entró por QR (negativo: el QR ya pasa
    // el saldo).
    const resto = round2(ahora.saldo - antes.qr);
    // En el mixto ya hay efectivo en la mano: cuánto más pedirle o devolverle.
    // Sin esto, con la cuenta en baja el efectivo del cliente no se registraba
    // ni se mandaba a devolver (revisión del 18-oct).
    const difEfectivo = round2(Math.max(0, resto) - antes.efectivo);
    const delEfectivo = !hay(antes.efectivo)
      ? ""
      : hay(difEfectivo)
        ? ` De efectivo ya te dio ${fmtMoney(antes.efectivo)}: pedile ${fmtMoney(difEfectivo)} más.`
        : hay(-difEfectivo)
          ? ` De efectivo ya te dio ${fmtMoney(antes.efectivo)}: devolvele ${fmtMoney(-difEfectivo)}.`
          : "";
    const yaPagaron = `Si ya te pagaron ${fmtMoney(antes.qr)} por QR`;
    if (hay(resto)) {
      return {
        texto: `${texto} ${yaPagaron}, no lo cobres otra vez: al aceptar queda en Mixto, con ${fmtMoney(antes.qr)} por QR y ${fmtMoney(resto)} en efectivo.${delEfectivo}`,
        sugerido: { metodo: "Mixto", efectivo: resto },
      };
    }
    if (!hay(ahora.saldo)) {
      // Lo que ya estaba pagado cubre la cuenta: este QR sobra entero.
      return {
        texto: `${texto} ${yaPagaron}, ya no queda nada que cobrar: esos ${fmtMoney(antes.qr)} se los devuelve el encargado.${delEfectivo}`,
        sugerido: null,
      };
    }
    if (!hay(-resto)) {
      return {
        texto: `${texto} ${yaPagaron}, eso cubre el saldo: al aceptar queda todo por QR.${delEfectivo}`,
        sugerido: { metodo: "QR" },
      };
    }
    return {
      texto: `${texto} ${yaPagaron}, eso cubre el saldo y sobran ${fmtMoney(-resto)}: al aceptar queda todo por QR, y los ${fmtMoney(-resto)} se los devuelve el encargado.${delEfectivo}`,
      sugerido: { metodo: "QR" },
    };
  }
  if (hay(antes.efectivo)) {
    if (!hay(ahora.saldo)) {
      return {
        texto: `${texto} Ya no queda saldo: si ya te dio ${fmtMoney(antes.efectivo)} en efectivo, devolvéselos${hay(aFavor) ? ` y además ${fmtMoney(aFavor)}` : ""}.`,
        sugerido: null,
      };
    }
    // Con el vuelto ya dado, en la mano quedó justo lo que se cobraba: escrito
    // en "Recibido", el formulario dice el cambio o lo que falta.
    return {
      texto: `${texto} Si ya diste el vuelto, en «Recibido» escribí ${fmtMoney(antes.efectivo)} (lo que te quedó): el cambio o lo que falta sale solo.`,
      sugerido: null,
    };
  }
  if (hay(antes.aFavor)) {
    return {
      texto: `${texto} Si ya le devolviste ${fmtMoney(antes.aFavor)}, cobrá el saldo y pedile aparte los ${fmtMoney(antes.aFavor)} que le devolviste.`,
      sugerido: null,
    };
  }
  return { texto, sugerido: null };
}
