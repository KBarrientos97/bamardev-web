import type { Feature } from "../../types";
import type {
  CampoRegla,
  ModoConfirmacion,
  OrigenRegla,
  Reglas,
  ValoresReglas,
} from "./tiposConfigAgenda";

/**
 * Las reglas del negocio (A11, PLAN-AGENDA-BELLEZA §7.4 y §8.9): qué se
 * muestra, cómo se agrupa y qué se manda al guardar. Sin React, para probarlo
 * sin montar la pantalla.
 */

export type GrupoRegla = "interna" | "profesional" | "online";

export const TITULO_GRUPO: Record<GrupoRegla, string> = {
  interna: "Agenda interna",
  profesional: "Reglas del profesional",
  online: "Reserva online",
};

interface MetaNumero {
  tipo: "numero";
  etiqueta: string;
  /** Lo que va después del número: "min", "horas"… */
  unidad: string;
  min: number;
  max: number;
  ayuda?: string;
}
interface MetaBooleano {
  tipo: "booleano";
  etiqueta: string;
  ayuda?: string;
}
interface MetaModo {
  tipo: "modo";
  etiqueta: string;
}
export type MetaRegla = (MetaNumero | MetaBooleano | MetaModo) & { grupo: GrupoRegla };

/**
 * Cada campo con su grupo, su texto y su rango. Los rangos son de sentido
 * común (y los del anticipo, los de §8.9): el backend valida igual, esto es
 * para avisar antes de guardar y no después.
 */
export const META_REGLAS: Record<CampoRegla, MetaRegla> = {
  granularidadMin: {
    grupo: "interna",
    tipo: "numero",
    etiqueta: "Los turnos empiezan cada",
    unidad: "min",
    min: 5,
    max: 60,
    ayuda: "9:00, 9:15, 9:30… En barbería suele ser 10.",
  },
  bufferGeneralMin: {
    grupo: "interna",
    tipo: "numero",
    etiqueta: "Margen entre citas",
    unidad: "min",
    min: 0,
    max: 120,
    ayuda: "Para limpiar o preparar. Cada servicio puede tener el suyo.",
  },
  profesionalPuedeAgendar: {
    grupo: "profesional",
    tipo: "booleano",
    etiqueta: "Puede agendar y mover sus propias citas",
  },
  profesionalPuedeBloquear: {
    grupo: "profesional",
    tipo: "booleano",
    etiqueta: "Puede bloquear su horario",
  },
  profesionalVeTelefono: {
    grupo: "profesional",
    tipo: "booleano",
    etiqueta: "Ve el teléfono del cliente",
    ayuda: "Apagado, el que se va no se lleva la cartera de clientes.",
  },
  profesionalVePrecios: {
    grupo: "profesional",
    tipo: "booleano",
    etiqueta: "Ve precios y totales",
  },
  modoConfirmacion: {
    grupo: "online",
    tipo: "modo",
    etiqueta: "¿Cómo se confirma una reserva online?",
  },
  anticipacionMinHoras: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Se puede reservar con al menos",
    unidad: "horas de anticipación",
    min: 0,
    max: 168,
  },
  anticipacionMaxDias: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Y hasta",
    unidad: "días adelante",
    min: 1,
    max: 365,
  },
  ventanaCancelacionHoras: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "El cliente puede cancelar o cambiar hasta",
    unidad: "horas antes",
    min: 0,
    max: 168,
  },
  vencimientoSolicitudHoras: {
    grupo: "online",
    tipo: "numero",
    // "vence a las 12 horas" se leía como una hora del reloj (B26).
    etiqueta: "Una solicitud sin respuesta vence después de",
    unidad: "horas",
    min: 1,
    max: 168,
  },
  citasActivasPorTelefono: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Reservas activas por teléfono",
    unidad: "citas",
    min: 1,
    max: 50,
  },
  citasPorTelefonoPorDia: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Reservas por teléfono en un mismo día",
    unidad: "citas",
    min: 1,
    max: 20,
  },
  noShowsParaBloquear: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Bloquear reservas online después de",
    unidad: "inasistencias",
    min: 0,
    max: 50,
    ayuda: "0 = nunca.",
  },
  mostrarPreciosOnline: {
    grupo: "online",
    tipo: "booleano",
    etiqueta: "Mostrar precios en la página de reservas",
  },
  anticipoPct: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Anticipo mínimo",
    unidad: "%",
    min: 20,
    max: 50,
  },
  anticipoPlazoMin: {
    grupo: "online",
    tipo: "numero",
    etiqueta: "Plazo para pagarlo",
    unidad: "min",
    min: 10,
    max: 30,
  },
};

export const CAMPOS_REGLA = Object.keys(META_REGLAS) as CampoRegla[];

/** Los campos de un grupo, en el orden de la tabla. */
export function camposDe(grupo: GrupoRegla): CampoRegla[] {
  return CAMPOS_REGLA.filter((c) => META_REGLAS[c].grupo === grupo);
}

/** Los dos campos del anticipo: viven dentro de la opción (c), no en la grilla. */
export const CAMPOS_ANTICIPO: CampoRegla[] = ["anticipoPct", "anticipoPlazoMin"];

/**
 * Lo editable de unas reglas resueltas: sólo los campos conocidos. Un campo
 * nuevo que mande el backend no viaja de vuelta en el PUT sin que nadie lo
 * haya mirado.
 */
export function valoresDe(r: Reglas): ValoresReglas {
  const v: Record<string, unknown> = {};
  for (const c of CAMPOS_REGLA) v[c] = r[c];
  return v as unknown as ValoresReglas;
}

/**
 * Sólo lo que cambió. Mandar todo fijaría como "propio de la sucursal" cada
 * valor que hasta ahora heredaba del negocio, y el día que el dueño cambie la
 * regla general esa sucursal ya no la seguiría.
 */
export function cambiosReglas(
  original: ValoresReglas,
  editado: ValoresReglas,
): Partial<ValoresReglas> {
  const cambios: Partial<ValoresReglas> = {};
  for (const c of CAMPOS_REGLA) {
    if (original[c] !== editado[c]) {
      (cambios as Record<string, unknown>)[c] = editado[c];
    }
  }
  return cambios;
}

/** Errores por campo numérico. Vacío = se puede guardar. */
export function erroresReglas(r: ValoresReglas): Partial<Record<CampoRegla, string>> {
  const errores: Partial<Record<CampoRegla, string>> = {};
  for (const c of CAMPOS_REGLA) {
    const meta = META_REGLAS[c];
    if (meta.tipo !== "numero") continue;
    const v = r[c] as number;
    if (!Number.isFinite(v) || !Number.isInteger(v)) {
      errores[c] = "Tiene que ser un número entero.";
    } else if (v < meta.min || v > meta.max) {
      errores[c] = `Entre ${meta.min} y ${meta.max}.`;
    }
  }
  return errores;
}

/**
 * Qué decir del origen de un valor según qué se está mirando.
 *
 * Mirando "Todo el negocio", lo único que vale la pena marcar es lo que sigue
 * con el valor del rubro (el dueño nunca lo tocó). Mirando una sucursal, lo
 * importante es lo contrario: qué es propio de ella y qué hereda, porque lo
 * heredado cambia solo cuando cambia la regla general.
 */
export function textoOrigen(
  origen: OrigenRegla | undefined,
  mirando: "NEGOCIO" | "SUCURSAL",
): string | null {
  if (!origen) return null;
  if (mirando === "NEGOCIO") return origen === "DEFECTO" ? "Valor sugerido del rubro" : null;
  if (origen === "SUCURSAL") return "Propio de esta sucursal";
  if (origen === "NEGOCIO") return "Heredado de todo el negocio";
  return "Valor sugerido del rubro";
}

export const MODOS_CONFIRMACION: {
  modo: ModoConfirmacion;
  titulo: string;
  texto: string;
}[] = [
  {
    modo: "MANUAL",
    titulo: "La apruebo yo",
    texto:
      "Cada reserva entra como solicitud y la aprobás o rechazás desde la agenda. Si nadie responde a tiempo, se libera el horario.",
  },
  {
    modo: "AUTOMATICA",
    titulo: "Queda lista cuando el cliente la confirma",
    texto:
      "El cliente elige el horario, confirma y la cita queda reservada sin que tengas que hacer nada.",
  },
  {
    modo: "ANTICIPO_QR",
    titulo: "Queda lista cuando paga un anticipo por QR",
    texto:
      "El cliente paga una parte al reservar. Si no paga a tiempo, el horario se libera. El anticipo se descuenta al cobrar en caja.",
  },
];

/**
 * Por qué el modo con anticipo no se puede elegir (D20). Mientras la fase 2b
 * sea deuda técnica (D21) la opción está siempre apagada con "Próximamente";
 * esto agrega el motivo concreto que va a quedar cuando se habilite, para que
 * el dueño sepa desde ya qué le va a hacer falta.
 *
 * La web no recibe el plan del negocio, así que se deduce de las features:
 * `sena_online` sólo existe en el plan Profesional.
 */
export function motivoAnticipo(features: Feature[] | undefined): string {
  const tiene = (f: string) => !!features?.includes(f);
  if (!tiene("sena_online")) return "Disponible en el plan Profesional.";
  return "Para pedir anticipo necesitás el QR automático de tu banco integrado con BamarDev. Pedilo a soporte.";
}

/** Nombre de un campo para la bitácora; uno desconocido se muestra tal cual. */
export function etiquetaCampo(campo: string): string {
  const meta = META_REGLAS[campo as CampoRegla];
  if (!meta) return campo;
  if (campo === "anticipacionMaxDias") return "Anticipación máxima";
  if (campo === "modoConfirmacion") return "Modo de confirmación";
  return meta.etiqueta;
}

/** Un valor de la bitácora, legible. */
export function fmtValorRegla(campo: string, valor: unknown): string {
  if (valor === null || valor === undefined) return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (campo === "modoConfirmacion") {
    return MODOS_CONFIRMACION.find((m) => m.modo === valor)?.titulo ?? String(valor);
  }
  const meta = META_REGLAS[campo as CampoRegla];
  if (meta?.tipo === "numero") return `${String(valor)} ${meta.unidad}`;
  return String(valor);
}
