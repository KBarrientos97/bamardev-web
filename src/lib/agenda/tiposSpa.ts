/**
 * Tipos del spa completo (agenda fase 3): espacios, tiempo de pose, paquetes
 * de sesiones y consentimientos (PLAN-AGENDA-BELLEZA §2.5, §7.5, §13, §17.3).
 *
 * Archivo propio, como los de la agenda: varias ramas tocan la agenda a la vez
 * y un archivo nuevo no choca con ninguna.
 */

/** Un tipo de espacio que un servicio puede exigir ("Cabina"). */
export interface TipoEspacio {
  id: number;
  nombre: string;
  activo: boolean;
  orden: number;
  /** Cuántos espacios (recursos ESPACIO) son de este tipo. */
  espacios: number;
  /** Cuántos servicios lo exigen. */
  servicios: number;
}

export interface TipoEspacioInput {
  nombre?: string;
  activo?: boolean;
  orden?: number;
}

/** Lo que el servicio suma en la fase 3 (todo opcional: un backend anterior no lo manda). */
export interface ServicioSpa {
  requiereEspacioTipoId?: number | null;
  /** A los cuántos minutos del inicio empieza la pose; null = sin pose. */
  poseInicioMin?: number | null;
  poseMin?: number | null;
}

/** Lo que una línea de cita suma en la fase 3. */
export interface LineaSpa {
  /** La cabina que ocupa además del profesional (null si no ocupa). */
  espacioId?: number | null;
  espacio?: string | null;
  /** El tramo en que el profesional queda libre. */
  poseDesde?: string | null;
  poseHasta?: string | null;
}

// ── Paquetes ─────────────────────────────────────────────────────────────────

export interface ItemPaquete {
  servicioId: number;
  servicio: string;
  sesiones: number;
}

/** Un paquete que se vende en el POS (`GET /paquetes`). */
export interface Paquete {
  productoId: number;
  nombre: string;
  precio: number;
  categoriaId: number | null;
  vigenciaDias: number;
  activo: boolean;
  items: ItemPaquete[];
}

export interface PaqueteInput {
  nombre?: string;
  precio?: number;
  categoriaId?: number | null;
  vigenciaDias?: number;
  items?: { servicioId: number; sesiones: number }[];
  activo?: boolean;
}

/** Un paquete comprado por el cliente, con su saldo. */
export interface PaqueteDelCliente {
  id: number;
  nombre: string;
  compradoEn: string;
  venceEn: string;
  /** El último día en que se puede usar (fecha de La Paz). */
  ultimoDia: string;
  estado: "ACTIVO" | "ANULADO";
  vencido: boolean;
  ventaId: number | null;
  items: {
    servicioId: number;
    servicio: string;
    sesiones: number;
    usadas: number;
    restantes: number;
  }[];
}

/** En el carrito de la cita: la sesión de paquete que cubriría ese servicio. */
export interface CoberturaPaquete {
  paqueteClienteId: number;
  nombre: string;
  /** Las que le quedan después de usar ésta. */
  restantes: number;
  ultimoDia: string;
}

// ── Consentimientos ─────────────────────────────────────────────────────────

/** Ficha de salud del cliente. **Dato sensible**: nunca a PostHog ni a logs. */
export interface FichaSalud {
  antecedentes: string | null;
  medicamentos: string | null;
  contraindicaciones: string | null;
  /** null = no se preguntó. */
  embarazo: boolean | null;
  observaciones: string | null;
  actualizadoEn: string;
}

export type FichaSaludInput = Partial<Omit<FichaSalud, "actualizadoEn">>;

export interface ConsentimientoFirmado {
  id: number;
  servicioId: number;
  servicio: string;
  version: number;
  /** false = el texto del servicio cambió después: hay que firmar de nuevo. */
  vigente: boolean;
  firmante: string | null;
  firmadoEn: string;
  citaId: number | null;
}

/** `GET /consentimientos/clientes/:id`. */
export interface SaludCliente {
  ficha: FichaSalud | null;
  firmados: ConsentimientoFirmado[];
}

/** Lo que falta firmar para atender una cita, con el texto a leer. */
export interface ConsentimientoFaltante {
  servicioId: number;
  servicio: string;
  version: number;
  texto: string;
}

/** Qué servicio exige consentimiento (`GET /consentimientos/servicios`). */
export interface PlantillaConsentimiento {
  servicioId: number;
  servicio: string;
  requiere: boolean;
  texto: string | null;
  version: number | null;
  textoSugerido: string;
}

/** Un consentimiento firmado con su firma (`GET /consentimientos/:id`). */
export interface ConsentimientoDetalle {
  id: number;
  servicio: string;
  texto: string;
  version: number;
  firmante: string;
  firmadoEn: string;
  /** `data:image/png;base64,…` */
  firma: string;
}

export interface FirmarInput {
  clienteId: number;
  servicioId: number;
  citaId?: number;
  firmante: string;
  /** El PNG del canvas, como `data:` URL. */
  firma: string;
  version: number;
}
