import type { NombreIcono } from "../components/Icon";
import type { Seccion } from "./permisos";
import type { Termino } from "./rubro";

/**
 * «Configuración» del restaurante (15-nov): UNA entrada del menú que abre la
 * lista de lo que se ajusta del negocio, como en la app (`PermisosConfiguracion`
 * de Android).
 *
 * Por qué: en el restaurante el menú tenía un grupo «Configuración» con un hijo
 * que también se llamaba «Configuración» (el recibo), y el recibo venía con los
 * extras de las TVs: el dueño de un restaurante sin TVs no encontraba dónde
 * poner su logo. Desde el 15-nov «Ticket y recibo» es de base en el
 * restaurante (backend `c3e880f`) y las opciones viven en una sola pantalla.
 *
 * Qué NO hace: fuera del restaurante nada cambia. Salón, farmacia, billar,
 * minimarket y el resto siguen con su grupo «Configuración» del menú (o su
 * entrada suelta), y el instituto con su menú propio. La rama está en
 * `construirMenu` y la fija `menuConfiguracion.test.ts`.
 */

/** La lista. Sus opciones cuelgan de esta ruta: el menú la enciende en todas. */
export const RUTA_CONFIGURACION = "/configuracion";

/** El botón de vuelta de cada opción, en el restaurante (ver `EncabezadoPagina`). */
export const VOLVER_A_CONFIGURACION = { a: RUTA_CONFIGURACION, etiqueta: "Volver a Configuración" } as const;

export interface OpcionConfiguracion {
  /** La sección que la deja ver: la misma que filtraba el hijo del grupo del menú. */
  seccion: Seccion;
  a: string;
  titulo: string;
  /** El título armado con el vocabulario del rubro (las sucursales son «sedes» en un instituto). */
  etiqueta?: (palabra: (clave: Termino) => string) => string;
  /** Para qué sirve, en una línea. */
  detalle: string;
  icono: NombreIcono;
}

/**
 * En el orden en que se muestran. «Punto de venta» va primera (16-nov): es lo
 * que más se toca en un local que recién arranca, y existe sólo en la web. Las
 * tres siguientes son las de Android, con sus mismos textos
 * (`strings_pantallas.xml` y `strings_qr_cobro.xml`); las dos de abajo existen
 * sólo en la web (en la app, el pie de la pantalla lo dice).
 */
export const OPCIONES_CONFIGURACION: readonly OpcionConfiguracion[] = [
  {
    seccion: "config_pos",
    a: "/configuracion/punto-de-venta",
    titulo: "Punto de venta",
    detalle: "Cómo se ven los productos y cómo se cobra.",
    icono: "cart",
  },
  {
    // Sin sección propia (17-nov): es la misma caja y la misma gente que
    // «Punto de venta», y sus ajustes viajan en el mismo `/pos/config`. Así
    // el permiso y el rubro no se pueden desalinear de la pantalla de al lado.
    seccion: "config_pos",
    a: "/configuracion/caja",
    titulo: "Caja",
    detalle: "Lo que se cuenta al abrir y al cerrar el turno, y a qué hora termina el día.",
    icono: "lock",
  },
  {
    seccion: "config_recibo",
    a: "/configuracion/recibo",
    titulo: "Ticket y recibo",
    detalle: "El logo, el papel de 58 u 80 mm, la letra y qué se imprime al cobrar.",
    icono: "printer",
  },
  {
    seccion: "config_tickets",
    a: "/configuracion/tickets",
    titulo: "Tickets y despacho",
    detalle: "Cómo se numeran los pedidos y si se usa la pantalla de Despacho.",
    icono: "ticket",
  },
  {
    seccion: "qr_cobro",
    a: "/configuracion/qr-cobro",
    titulo: "QR de cobro",
    detalle: "La cuenta a la que entra la plata cuando el cliente paga con QR.",
    icono: "qr",
  },
  {
    seccion: "config_inventario",
    a: "/configuracion/inventario",
    titulo: "Inventario y stock",
    detalle: "Si el stock frena la venta, y el conteo para volver a controlarlo.",
    icono: "box",
  },
  {
    seccion: "config_sucursales",
    a: "/configuracion/sucursales",
    // No "Sucursales" a secas, como en el menú: en farmacia así se llama Almacenes.
    titulo: "Datos de las sucursales",
    etiqueta: (palabra) => `Datos de las ${palabra("sucursales")}`,
    detalle: "La dirección, la ubicación en el mapa y el horario de atención.",
    icono: "pin",
  },
];

/**
 * Las secciones de la lista: con cualquiera, el restaurante ve «Configuración».
 * La primera es la sección del ítem del menú y el resto van en su `tambien`
 * (ver `CONFIGURACION_RESTAURANTE`): el orden no cambia quién lo ve.
 */
export const SECCIONES_CONFIGURACION: readonly Seccion[] = OPCIONES_CONFIGURACION.map((o) => o.seccion);

/**
 * Si este rubro tiene la Configuración en una lista. Sólo el restaurante: es
 * el único donde el grupo del menú juntaba cinco opciones y repetía el nombre.
 */
export function configuracionEnLista(rubro: string | null | undefined): boolean {
  return rubro === "RESTAURANTE";
}

/**
 * Las opciones que esta persona ve, en su orden. Vacía fuera del restaurante,
 * o si no ve ninguna: entonces no hay «Configuración» en el menú ni se deja
 * abrir la ruta.
 */
export function opcionesConfiguracion(
  puede: (s: Seccion) => boolean,
  rubro: string | null | undefined,
): OpcionConfiguracion[] {
  if (!configuracionEnLista(rubro)) return [];
  return OPCIONES_CONFIGURACION.filter((o) => puede(o.seccion));
}

/** Si el menú ofrece «Configuración» (la lista) y si la ruta se deja abrir. */
export function veConfiguracion(puede: (s: Seccion) => boolean, rubro: string | null | undefined): boolean {
  return opcionesConfiguracion(puede, rubro).length > 0;
}
