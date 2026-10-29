/**
 * Los tickets de pedido (feature `tickets_pedido`): el número que la caja le
 * da al cliente de mostrador, que despacho marca listo y la TV llama.
 *
 * Calcados de `bamardev-backend/src/tickets`. Lo que llega del backend es
 * opcional donde una versión vieja podría no mandarlo: un campo que falta
 * deja la tarjeta en blanco, no tira la pantalla de despacho en pleno
 * servicio.
 */

export type EstadoTicket = "PREPARANDO" | "LISTO" | "ENTREGADO";

/** Un renglón de lo que hay que preparar: sin precios (despacho no cobra). */
export interface ItemTicket {
  producto: string;
  cantidad: number;
  nota: string | null;
  consumo: "MESA" | "LLEVAR";
}

export interface TicketPedido {
  id: number;
  numero: number;
  estado: EstadoTicket;
  creadoEn: string;
  listoEn: string | null;
  llamadoEn: string | null;
  llamados: number;
  entregadoEn: string | null;
  comprobante: string | null;
  items: ItemTicket[];
}

/** GET /tickets: lo de hoy del local y el número del próximo cobro. */
export interface TableroTickets {
  ahora: number;
  sucursalId: number;
  siguiente: number;
  tickets: TicketPedido[];
}

export const TEMAS_TV = ["rojo", "verde", "brasa", "crema", "personalizado"] as const;
export type TemaTv = (typeof TEMAS_TV)[number];

export const TONOS_TV = ["banco", "campanilla", "ascensor", "bip"] as const;
export type TonoTv = (typeof TONOS_TV)[number];

export interface TextosTv {
  listos: string;
  llamando: string;
  etiqueta: string;
  preparacion: string;
  frase: string;
  pieIzquierda: string;
  pieDerecha: string;
}

/** El diseño y el sonido de la TV de tickets (`tickets/ajustes-tv.ts` del backend). */
export interface AjustesTicketsTv {
  tema: TemaTv;
  colores: { fondo: string; acento: string; texto: string };
  logo: boolean;
  reloj: boolean;
  mostrarPreparacion: boolean;
  mostrarMinutos: boolean;
  textos: TextosTv;
  tono: TonoTv;
  voz: boolean;
  volumen: number;
  repetir: number;
  segundosResaltado: number;
}

/** GET /publico/pantallas/:llave/tickets: sólo números, sin montos ni nombres. */
export interface PantallaTicketsApi {
  negocio: string;
  sucursal?: string;
  ahora: number;
  ajustes: AjustesTicketsTv;
  /** Ruta del logo del negocio (Configuración), o null: va el nombre. */
  logo?: string | null;
  preparando: { numero: number; desde: number }[];
  listos: { numero: number; llamadoEn: number | null; llamados: number }[];
}

/**
 * Los de fábrica, iguales a los del backend: la vista previa los usa mientras
 * llegan los guardados, y la TV si un backend viejo no los manda.
 */
export const AJUSTES_TV_DE_FABRICA: AjustesTicketsTv = {
  tema: "rojo",
  colores: { fondo: "#A30000", acento: "#FFC800", texto: "#FFFFFF" },
  logo: true,
  reloj: true,
  mostrarPreparacion: true,
  mostrarMinutos: true,
  textos: {
    listos: "Listos para entregar",
    llamando: "¡Llamando!",
    etiqueta: "TICKET",
    preparacion: "En preparación",
    frase: "Su pedido está listo",
    pieIzquierda: "Gracias por su preferencia",
    pieDerecha: "",
  },
  tono: "banco",
  voz: true,
  volumen: 80,
  repetir: 2,
  segundosResaltado: 15,
};
