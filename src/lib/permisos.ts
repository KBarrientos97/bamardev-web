import type { Feature, PerfilRubro, Rol, SesionUsuario } from "../types";
import { RUBROS_BELLEZA, etiquetaRolDelRubro, type Rubro } from "./rubro";

/**
 * Qué ve y qué puede tocar cada quien (PLAN-ROLES-NEGOCIO). Hay dos
 * vocabularios y no se mezclan:
 *
 *   • Permisos del ROL  (`ventas.vender`, `caja.operar`…) → qué puede hacer la
 *     persona. Vienen en `usuario.permisos` (y `permisosPropios`, los que tiene
 *     sólo sobre lo suyo), ya cruzados con el plan por el backend.
 *   • Features del PLAN (`pos`, `fiado`…) → qué compró el negocio. Vienen en
 *     `negocio.features`.
 *
 * **Nada se decide por el nombre del rol, su código legado ni los módulos**:
 * cada negocio arma sus propios roles, y uno que se llama "Cajero" puede tener
 * cualquier cosa. Una sección se ve si la persona tiene su permiso Y el plan
 * incluye su feature Y existe en el rubro.
 *
 * Sin permisos en la sesión (una guardada antes de que el backend los
 * mandara) no hay respaldo: `AuthContext` los pide a `/auth/me`, y si tampoco
 * vienen no se ve nada. Mostrar de más por un nombre de rol sería justo lo que
 * esto vino a sacar.
 *
 * Las features siguen fallando ABIERTAS con la lista vacía, como siempre (un
 * negocio con los códigos sin migrar no se queda sin menú): el corte de verdad
 * ya lo hacen los permisos, que el backend cruza con el plan.
 *
 * Y hay un tercer filtro, de otra naturaleza: el RUBRO (ver `rubro.ts`). Los
 * permisos y el plan dicen si te dejan entrar; el rubro dice si la sección
 * **existe** para ese tipo de negocio. Una farmacia con el plan más caro sigue
 * sin tener mesas de salón.
 */

export function tieneFeature(features: Feature[] | undefined, codigo: Feature): boolean {
  if (!features || features.length === 0) return true; // falla abierto
  return features.includes(codigo);
}

/** Secciones de primer nivel de la app. */
export type Seccion =
  | "pos"
  | "caja"
  | "inventario"
  | "productos"
  | "insumos"
  | "almacenes"
  | "movimientos"
  | "creditos"
  | "reportes"
  | "usuarios"
  | "reparto"
  /** El panel del mesero: el salón, lo que hay por servir y su turno. */
  | "salon"
  /** ABM de mesas y zonas: es del admin, no del mesero. */
  | "mesas"
  /**
   * El resumen de la farmacia como primer ítem DENTRO de Inventario. Es la
   * misma ruta que Inventario (`/inventario`): el grupo lleva a su primera
   * pantalla, y el sub-ítem dice cuál es. Sólo farmacia: en los demás rubros
   * Inventario sigue siendo un ítem solo, como siempre.
   */
  | "dashboard"
  /** Buscar un medicamento en el mostrador. Sólo farmacia. */
  | "busqueda"
  /** Los lotes que vencen y la plata parada en ellos. Sólo farmacia. */
  | "vencimientos"
  /** Lo que pidieron y no había. Sólo farmacia. */
  | "encargos"
  /**
   * El libro de psicotrópicos y estupefacientes: lo vendido con receta
   * archivada o valorada. Sólo farmacia.
   */
  | "controlados"
  /** A quién se le compra, y cuánto. Sólo farmacia. */
  | "proveedores"
  /**
   * Recibir la mercadería del proveedor: factura, lote y vencimiento por
   * línea. Es el movimiento de ENTRADA con pantalla propia. Sólo farmacia.
   */
  | "ingreso_mercaderia"
  /**
   * Dar de baja stock: vencido, dañado, robado o cargado de más. Es el
   * movimiento de SALIDA con pantalla propia. Sólo farmacia.
   */
  | "salida_mercaderia"
  /**
   * Mandar mercadería de una sucursal a otra, con su lote. Es el movimiento de
   * TRANSFERENCIA con pantalla propia. Sólo farmacia.
   */
  | "transferencia_mercaderia"
  /** Gastos operativos: el libro del resultado, aparte de la caja. */
  | "gastos"
  // ── Agenda de belleza: configuración ──
  /** Servicios con duración, profesionales y espacios, horarios y bloqueos (A8). */
  | "agenda_config"
  /** Las reglas del negocio y cómo se confirma una reserva online (A11). */
  | "config_negocio"
  // ── Agenda de belleza (fase 1) ──
  /** A1: la agenda del día, columnas por profesional. */
  | "agenda"
  /** A3: la lista de hoy con los botones rápidos (y la cola, A6). */
  | "hoy"
  /** A10: las citas de quien ve sólo su agenda (el profesional). */
  | "mi_agenda"
  /** A7: fichas de cliente con su historial (ola B). */
  | "clientes"
  /** A9: las solicitudes que entraron por la reserva online (fase 2). */
  | "solicitudes"
  // ── Agenda de belleza (fase 2) ──
  /** Comisiones de los profesionales: producción, adelantos y liquidación. */
  | "comisiones"
  /**
   * "Mi producción" dentro de Mi agenda (A10): la comisión del profesional
   * que entró. No es una ruta: es la tarjeta de su pantalla.
   */
  | "mi_produccion"
  /** Producción, no-shows, ocupación y retención de la agenda. */
  | "reportes_agenda"
  // ── Página del negocio (todas las verticales) ──
  /** "Mi página": el editor de la página pública del negocio. */
  | "mi_pagina"
  /** "Mis enlaces": los enlaces cortos con QR y clics. */
  | "mis_enlaces"
  /** "Mi asistente": preguntas frecuentes, mensajes y uso del chat de la página (extra). */
  | "mi_asistente"
  // ── CRM y promociones (PLAN-CRM-Y-PROMOCIONES) ──
  /** Promociones y cupones: el ABM, los cupones y el enlace de campaña. */
  | "promociones"
  /** Los clientes que no vuelven, los segmentos y el contacto por wa.me. */
  | "retencion"
  // ── Belleza fase 4 ──
  /** Vender gift cards, consultar su saldo y el listado. */
  | "gift_cards"
  /** Propinas por profesional (el profesional, sólo las suyas). */
  | "propinas"
  /** Qué insumos gasta cada servicio, y el costo y margen por servicio. */
  | "recetas_servicio"
  // ── Personal (PLAN-ROLES §9) ──
  /**
   * La gente del negocio, con o sin login: alta, darle o quitarle el acceso.
   * Sólo en los negocios con agenda (decisión del 07-oct).
   */
  | "personal"
  // ── Roles del negocio (PLAN-ROLES-NEGOCIO) ──
  /** Crear, renombrar, editar y borrar los roles del negocio, con su bitácora. */
  | "roles";

/**
 * Qué pide cada sección: un permiso (o varios, con `tambien`: alcanza con
 * cualquiera, y el primero que tenga manda el alcance) y la feature del plan.
 *
 * `alcance` distingue la pantalla de todos (GENERAL) de la de "lo suyo"
 * (PROPIO): la agenda de recepción y "Mi agenda" del profesional piden el
 * mismo permiso con distinto alcance. `sinGeneral` es la otra cara de "sólo lo
 * suyo" para los permisos que tienen su par general aparte: la pantalla de
 * quien hace lo suyo no se le muestra a quien administra lo de todos (el que
 * asigna los pedidos no tiene "Mis entregas").
 *
 * `feature: null` = la sección no se vende aparte; la decide el permiso. El
 * backend ya cruza los permisos con el plan, pero la feature se sigue mirando
 * porque la de la pantalla no siempre es la del permiso (Sucursales pide
 * `multi_almacen`, y su permiso es de `inventario`).
 */
interface Requisito {
  permiso: string;
  tambien?: string[];
  alcance?: "GENERAL" | "PROPIO";
  sinGeneral?: string;
  feature: Feature | null;
}

const REQUISITOS: Record<Seccion, Requisito> = {
  pos: { permiso: "ventas.vender", feature: "pos" },
  caja: { permiso: "caja.operar", feature: "caja" },
  // La primera pantalla de Inventario es el tablero (en farmacia, el suyo):
  // `dashboard` es la misma ruta y pide exactamente lo mismo, o el menú
  // mostraría un sub-ítem que lleva a una ruta que el guard rechaza.
  inventario: { permiso: "dashboard.ver", feature: "inventario" },
  dashboard: { permiso: "dashboard.ver", feature: "inventario" },
  // Artículos y Categorías son el ABM del catálogo: verlo (`catalogo.ver`) lo
  // tiene hasta el mesero, y no por eso administra los productos.
  productos: { permiso: "catalogo.editar", feature: "catalogo" },
  insumos: { permiso: "insumos.gestionar", feature: "insumos" },
  // Sin el plan de varias sucursales no hay qué administrar.
  almacenes: { permiso: "almacenes.administrar", feature: "multi_almacen" },
  movimientos: { permiso: "inventario.mover", feature: "inventario" },
  // Recibir y dar de baja mercadería SON movimientos de inventario, con
  // pantalla propia: la misma llave que `movimientos`.
  ingreso_mercaderia: { permiso: "inventario.mover", feature: "inventario" },
  salida_mercaderia: { permiso: "inventario.mover", feature: "inventario" },
  // Transferir es mover stock entre sucursales: sin el plan de varias
  // sucursales (la llave de Sucursales) no hay a dónde.
  transferencia_mercaderia: { permiso: "inventario.mover", feature: "multi_almacen" },
  // Las cuentas por cobrar las abre quien fía o quien cobra los abonos.
  creditos: { permiso: "credito.otorgar", tambien: ["credito.cobrar"], feature: "fiado" },
  reportes: { permiso: "reportes.ver", feature: "reportes" },
  usuarios: { permiso: "usuarios.administrar", feature: "usuarios" },
  // "Mis entregas" es la pantalla de quien reparte lo que le asignan; quien
  // gestiona todos los pedidos (`delivery.asignar`) lo hace desde el POS.
  reparto: { permiso: "entregas.realizar", sinGeneral: "delivery.asignar", feature: "delivery" },
  // El panel del salón: el mesero (sus mesas) y quien supervisa el salón.
  salon: { permiso: "salon.atender", feature: "salon" },
  // El ABM de mesas y zonas, parte de la misma sección vendida.
  mesas: { permiso: "salon.administrar", feature: "salon" },
  // Buscar un medicamento es consultar el catálogo y dónde hay: parte de
  // atender el mostrador. No se vende aparte.
  busqueda: { permiso: "catalogo.ver", feature: null },
  // La feature es la que exige el backend (`lotes`, sólo en PRO): con
  // `inventario` una farmacia BASICO veía la sección y entraba a un 403.
  vencimientos: { permiso: "lotes.gestionar", feature: "lotes" },
  encargos: { permiso: "encargos.gestionar", feature: "encargos" },
  // Una obligación legal, no algo que se vende aparte.
  controlados: { permiso: "controlados.libro", feature: null },
  proveedores: { permiso: "proveedores.gestionar", feature: "inventario" },
  gastos: { permiso: "gastos.gestionar", feature: "gastos" },
  // ── Agenda de belleza ──
  agenda: { permiso: "agenda.ver", alcance: "GENERAL", feature: "agenda" },
  hoy: { permiso: "agenda.ver", alcance: "GENERAL", feature: "agenda" },
  mi_agenda: { permiso: "agenda.ver", alcance: "PROPIO", feature: "agenda" },
  agenda_config: { permiso: "agenda.configurar", feature: "agenda" },
  // Las reglas del negocio (A11): el mismo permiso que el backend pide para
  // guardarlas. Es `negocio.configurar` (sólo el Administrador en las
  // plantillas) y no `agenda.configurar`: el Encargado arma servicios y
  // horarios, pero cómo entran las reservas lo decide el dueño.
  config_negocio: { permiso: "negocio.configurar", feature: "agenda" },
  // La cartera de clientes (A7) es la general; el profesional ve la ficha
  // mínima desde su cita, no la lista.
  clientes: { permiso: "cliente.ver_ficha", alcance: "GENERAL", feature: "clientes" },
  solicitudes: { permiso: "reservas.aprobar", feature: "reserva_online" },
  // La pantalla de comisiones es la de todos; con alcance PROPIO se ve la
  // suya en Mi agenda.
  comisiones: { permiso: "comisiones.ver", alcance: "GENERAL", feature: "comisiones" },
  mi_produccion: { permiso: "comisiones.ver", alcance: "PROPIO", feature: "comisiones" },
  reportes_agenda: { permiso: "agenda.reportes", feature: "agenda" },
  // ── Página del negocio, CRM y promociones ──
  mi_pagina: { permiso: "negocio.configurar", feature: "pagina_publica" },
  mis_enlaces: { permiso: "negocio.configurar", feature: "enlaces_cortos" },
  // El asistente de la página es un EXTRA: fuera de todos los planes.
  mi_asistente: { permiso: "negocio.configurar", feature: "asistente_pagina" },
  promociones: { permiso: "promociones.gestionar", feature: "promociones" },
  retencion: { permiso: "cliente.marketing", feature: "clientes_retencion" },
  // ── Belleza fase 4 ──
  gift_cards: { permiso: "vales.vender", feature: "gift_cards" },
  // QA N2-01: quien sólo entrega propinas (`propinas.pagar`) entra igual:
  // tiene que ver qué entrega. El backend pide lo mismo en GET /propinas.
  propinas: { permiso: "propinas.ver", tambien: ["propinas.pagar"], feature: "propinas" },
  recetas_servicio: { permiso: "consumo.recetas", feature: "consumo_servicio" },
  // Personal va con la feature `agenda` (07-oct): sólo en los negocios con agenda.
  personal: { permiso: "personal.gestionar", feature: "agenda" },
  // Los roles del negocio existen en todos los rubros y no se venden aparte.
  roles: { permiso: "roles.gestionar", feature: null },
};

/** El permiso que pide una sección (para tests y para explicar un rechazo). */
export function permisoDeSeccion(seccion: Seccion): string {
  return REQUISITOS[seccion].permiso;
}

/**
 * Features que NO fallan abiertas: sin la feature en la lista, la sección no
 * existe aunque la lista venga vacía. Son las nuevas de verdad —ningún negocio
 * las tuvo antes— y se prenden a mano por negocio: el fail-open de siempre se
 * las mostraría a quien no las tiene. A Omar no le aparece "Mi página" hasta
 * que se la prendan.
 */
const FEATURES_ESTRICTAS: Feature[] = [
  "agenda",
  "clientes",
  "reserva_online",
  "comisiones",
  "pagina_publica",
  "enlaces_cortos",
  "asistente_pagina",
  "promociones",
  "clientes_retencion",
  "gift_cards",
  "propinas",
  "consumo_servicio",
  "ficha_tecnica",
];

/**
 * Secciones que NO existen en un rubro. Es una lista NEGRA y no una blanca a
 * propósito: lo que no está acá se ve, que es como funcionaba antes de que el
 * rubro existiera. Así, agregar un rubro nuevo no le apaga el menú a nadie por
 * un olvido, y los negocios que ya trabajan no se enteran de este archivo.
 *
 * Por eso mismo sólo están FARMACIA y los rubros de belleza, que nacieron
 * después de esta lista. Que un minimarket vea "Mesas del salón" es raro, pero
 * es lo que ve hoy: sacárselo es otra decisión, de otro día, con su propio
 * cliente mirando. Acá no se toca nada que ya funcione.
 */
/**
 * Secciones que **nacen** de un rubro y no existen fuera de él. Es la lista
 * BLANCA, la otra mitad del par: la negra protege lo que ya existía (ante la
 * duda, se ve), y ésta encierra lo que se construyó para un rubro puntual
 * (ante la duda, no se ve). Una pollería no tiene por qué encontrarse una
 * pantalla llamada "Buscar medicamento".
 */
const SOLO_EN_RUBRO: Partial<Record<Seccion, Rubro[]>> = {
  dashboard: ["FARMACIA"],
  busqueda: ["FARMACIA"],
  vencimientos: ["FARMACIA"],
  encargos: ["FARMACIA"],
  controlados: ["FARMACIA"],
  proveedores: ["FARMACIA"],
  // Las dos pantallas guiadas son del rubro. Un restaurante sigue cargando
  // entradas y salidas desde Movimientos con el formulario de siempre: acá no
  // se le saca nada, se le agrega un atajo a la farmacia.
  ingreso_mercaderia: ["FARMACIA"],
  salida_mercaderia: ["FARMACIA"],
  transferencia_mercaderia: ["FARMACIA"],
  // La agenda nace en belleza. Además de la feature estricta, el rubro: un
  // restaurante o una farmacia no ven nada nuevo aunque alguien les prenda
  // `agenda` en el panel por error.
  agenda_config: RUBROS_BELLEZA,
  config_negocio: RUBROS_BELLEZA,
  // Segundo candado de la agenda, además de su feature: Omar y la farmacia no
  // se encuentran con ella aunque alguien la prenda a mano en el panel.
  agenda: RUBROS_BELLEZA,
  hoy: RUBROS_BELLEZA,
  mi_agenda: RUBROS_BELLEZA,
  clientes: RUBROS_BELLEZA,
  solicitudes: RUBROS_BELLEZA,
  comisiones: RUBROS_BELLEZA,
  mi_produccion: RUBROS_BELLEZA,
  reportes_agenda: RUBROS_BELLEZA,
  gift_cards: RUBROS_BELLEZA,
  propinas: RUBROS_BELLEZA,
  recetas_servicio: RUBROS_BELLEZA,
  // Personal existe sólo en los negocios con agenda (07-oct): Omar tiene su
  // gente cargada por el backfill, pero no ve la pantalla.
  personal: RUBROS_BELLEZA,
};

/**
 * Belleza va acá aunque el backend ya no le da `salon` ni `insumos` (la
 * plantilla de su vertical las excluye): es el segundo candado. Las features
 * fallan abiertas, así que un salón con la lista vacía —o con una feature
 * prendida a mano en el panel— vería "Mesas" en el menú.
 */
const FUERA_DE_RUBRO: Partial<Record<Seccion, Rubro[]>> = {
  // El salón entero es de restaurante: una farmacia no atiende mesas, y una
  // peluquería tampoco (su "salón" es otra cosa).
  mesas: ["FARMACIA", ...RUBROS_BELLEZA],
  salon: ["FARMACIA", ...RUBROS_BELLEZA],
  // Los insumos son materia prima: harina, aceite, pollo crudo. Una farmacia
  // no transforma nada, compra y vende lo mismo. El tinte de un salón se
  // gasta, pero no es una receta que se descuente al vender.
  insumos: ["FARMACIA", ...RUBROS_BELLEZA],
};

export interface ContextoPermisos {
  features?: Feature[];
  /** `negocio.tipoNegocio` del login. Sin rubro, se ve lo que no es de un rubro. */
  rubro?: string;
  /**
   * Permisos efectivos del login, ya cruzados con el plan. `undefined` (una
   * sesión vieja que todavía no los trajo de `/auth/me`) = ninguno.
   */
  permisos?: string[];
  permisosPropios?: string[];
}

type ConPermisos = Pick<SesionUsuario, "permisos" | "permisosPropios"> | null | undefined;

/** ¿Tiene este permiso, con cualquier alcance? Sin permisos en la sesión, no. */
export function tienePermiso(usuario: ConPermisos, codigo: string): boolean {
  return !!usuario?.permisos?.includes(codigo);
}

/** ¿Lo tiene sólo sobre lo suyo (alcance PROPIO)? */
export function soloLoSuyo(usuario: ConPermisos, codigo: string): boolean {
  return tienePermiso(usuario, codigo) && !!usuario?.permisosPropios?.includes(codigo);
}

/** ¿Lo tiene sobre lo de todos (alcance GENERAL)? */
export function sobreTodo(usuario: ConPermisos, codigo: string): boolean {
  return tienePermiso(usuario, codigo) && !usuario?.permisosPropios?.includes(codigo);
}

/**
 * ¿Edita la ficha de salud y toma la firma de un consentimiento? (decisión
 * del 07-oct, S2SEG-18). Ver salud no alcanza: la recepción la lee para
 * avisar, pero la escribe quien tiene `cliente.editar_salud` (el backend
 * recorta "de ese cliente" con el alcance PROPIO).
 */
export function editaSalud(usuario: ConPermisos): boolean {
  return tienePermiso(usuario, "cliente.editar_salud");
}

/**
 * ¿Da de alta clientes (QA DIA-09)? Lo mismo que pide el backend
 * (`cliente.editar`). La feature `clientes` la mira quien lo llama.
 */
export function creaClientes(usuario: ConPermisos): boolean {
  return tienePermiso(usuario, "cliente.editar");
}

/**
 * ¿Opera la cola de espera (anotar, atender, "se fue")? El backend pide
 * `agenda.gestionar` o `cola.gestionar`. A quien no los tiene la cola le
 * llega vacía y anotar le da 403: mostrarle la pestaña era ofrecerle un error.
 */
export function gestionaCola(usuario: ConPermisos): boolean {
  return tienePermiso(usuario, "cola.gestionar") || tienePermiso(usuario, "agenda.gestionar");
}

/**
 * Ve la agenda sólo sobre lo suyo y no la gestiona: es el profesional, se
 * llame como se llame su rol.
 */
export function veSoloSuAgenda(usuario: ConPermisos): boolean {
  return soloLoSuyo(usuario, "agenda.ver") && !tienePermiso(usuario, "agenda.gestionar");
}

function cumplePermiso(ctx: ContextoPermisos, req: Requisito): boolean {
  const permisos = ctx.permisos ?? [];
  const codigo = [req.permiso, ...(req.tambien ?? [])].find((c) => permisos.includes(c));
  if (!codigo) return false;
  if (req.sinGeneral && permisos.includes(req.sinGeneral)) return false;
  const propio = (ctx.permisosPropios ?? []).includes(codigo);
  if (req.alcance === "GENERAL") return !propio;
  if (req.alcance === "PROPIO") return propio;
  return true;
}

export function puedeVer(ctx: ContextoPermisos, seccion: Seccion): boolean {
  const fuera = FUERA_DE_RUBRO[seccion];
  if (fuera && ctx.rubro && (fuera as string[]).includes(ctx.rubro)) return false;

  const propia = SOLO_EN_RUBRO[seccion];
  // Sin rubro tampoco se muestra: una sesión vieja que no sabe de qué negocio
  // es no puede aterrizar en una pantalla que sólo tiene sentido en uno.
  if (propia && !(ctx.rubro && (propia as string[]).includes(ctx.rubro))) return false;

  const req = REQUISITOS[seccion];
  if (!cumplePermiso(ctx, req)) return false;
  if (req.feature && !tieneFeature(ctx.features, req.feature)) return false;
  if (req.feature && FEATURES_ESTRICTAS.includes(req.feature) && !ctx.features?.includes(req.feature)) {
    return false;
  }
  return true;
}

/**
 * Capacidades: cosas que se venden por separado pero que NO son una sección
 * del menú, sino un botón o un campo dentro de una pantalla que igual se ve.
 * Van acá y no en REQUISITOS porque no tienen ruta ni entrada de navegación.
 *
 * Cuando el plan no las incluye el control simplemente no se dibuja, igual
 * que en el menú: si el negocio no lo compró, no existe. Mostrarlo apagado
 * sólo haría que el cajero pregunte por algo que no puede usar.
 */
export type Capacidad =
  /** Armar productos COMPUESTOS con su receta. */
  | "combos"
  /** Partir una línea del carrito entre mesa y para llevar. */
  | "mesa_llevar"
  /** Cobrar por QR o repartido entre QR y efectivo. */
  | "pago_qr_mixto"
  /** Ingresos y egresos de efectivo dentro del turno. */
  | "movimientos_caja"
  /** Anular una venta autorizando con PIN. */
  | "autorizacion_pin"
  /** Imprimir o guardar el comprobante. */
  | "recibo_pdf"
  /** Movimientos que nacen pendientes y hay que aprobar. */
  | "aprobacion_inventario"
  /** Bajar los reportes a CSV. */
  | "exportacion"
  /** Reportes de cómo opera el negocio (horas, métodos, delivery…). */
  | "reportes_operacion"
  /** Reportes de plata (margen, rentabilidad, deuda…). */
  | "reportes_rentabilidad"
  /**
   * Consultar las partidas: el lote que sale por FEFO en una salida y los
   * lotes de la ficha del medicamento. Es la misma feature que la sección
   * Vencimientos, pero se usa DENTRO de pantallas que igual se ven. Cargar el
   * lote al recibir no depende de esto: el backend lo guarda con cualquier plan.
   */
  | "lotes";

/**
 * Las capacidades que además piden un permiso: mover efectivo de la caja lo
 * corta el backend por `caja.movimientos`, y ofrecérselo a quien no lo tiene
 * es mostrarle un botón que le da 403. Anular con PIN no está acá a propósito:
 * se le ofrece a cualquiera (pide la autorización de quien tiene el PIN).
 */
const PERMISO_CAPACIDAD: Partial<Record<Capacidad, string>> = {
  movimientos_caja: "caja.movimientos",
};

/**
 * Capacidades que no existen en un rubro, pase lo que pase con el plan.
 *
 * Es el mismo criterio que `FUERA_DE_RUBRO` pero para lo que vive DENTRO de una
 * pantalla. Y hace falta por algo puntual: las features fallan abiertas (lista
 * vacía = se muestra), así que una farmacia recién dada de alta, sin features
 * cargadas, veía "Todo en mesa / Todo para llevar" en su carrito. Eso no es un
 * problema de plan: en una farmacia no hay mesas.
 */
const CAPACIDAD_FUERA_DE_RUBRO: Partial<Record<Capacidad, Rubro[]>> = {
  // Un corte de pelo no se sirve en mesa ni se lleva: en belleza tampoco.
  mesa_llevar: ["FARMACIA", ...RUBROS_BELLEZA],
};

export function puede(ctx: ContextoPermisos, capacidad: Capacidad): boolean {
  const fuera = CAPACIDAD_FUERA_DE_RUBRO[capacidad];
  if (fuera && ctx.rubro && (fuera as string[]).includes(ctx.rubro)) return false;

  const permiso = PERMISO_CAPACIDAD[capacidad];
  if (permiso && !ctx.permisos?.includes(permiso)) return false;
  return tieneFeature(ctx.features, capacidad);
}

/**
 * Dónde aterriza cada quien al entrar, **por permisos**. Se devuelve siempre
 * una sección que de verdad puede ver: una fija haría que un dueño sin
 * inventario en el plan entrara a una ruta que el guard rechaza, y como el
 * rechazo vuelve al inicio quedaría rebotando con la pantalla en blanco.
 *
 * Primero los que tienen una sola pantalla, que entran directo a ella (como en
 * Android): quien ve sólo su agenda, quien reparte sin vender y quien atiende
 * mesas sin vender. Después, la primera sección visible en `ORDEN_INICIO`.
 */
export function rutaInicial(ctx: ContextoPermisos): string {
  // Ve sólo su agenda: "Mi agenda", y no pasa por la lista. Con la agenda
  // apagada en el plan la misma ruta dice que llega pronto; por la lista
  // caería en "/sin-acceso", que le diría que su cuenta está mal configurada.
  if (veSoloSuAgenda(ctx)) return RUTA_AGENDA_PRONTO;

  const tiene = (p: string) => !!ctx.permisos?.includes(p);
  if (tiene("entregas.realizar") && !tiene("ventas.vender") && puedeVer(ctx, "reparto")) {
    return "/reparto";
  }
  if (tiene("salon.atender") && !tiene("ventas.vender") && puedeVer(ctx, "salon")) return "/salon";

  // En un salón, quien configura la agenda empieza el día mirándola entera;
  // quien atiende el mostrador, en "Hoy" (la lista con los botones rápidos).
  const agenda: [Seccion, string][] = tiene("agenda.configurar")
    ? [
        ["agenda", "/agenda"],
        ["hoy", "/hoy"],
      ]
    : [
        ["hoy", "/hoy"],
        ["agenda", "/agenda"],
      ];
  for (const [seccion, ruta] of [...agenda, ...ORDEN_INICIO]) {
    if (puedeVer(ctx, seccion)) return ruta;
  }
  // Sin ninguna sección habilitada no hay a dónde ir: la pantalla de sin
  // acceso explica qué pasó en vez de dejar un blanco.
  return "/sin-acceso";
}

/**
 * El orden de preferencia para la primera pantalla, después de la agenda.
 * Arriba, lo de siempre (el dueño de un restaurante o una farmacia entra a
 * Inventario; el que atiende, al POS); después el resto, más o menos en el
 * orden del menú, para que nadie con alguna sección visible caiga en
 * "/sin-acceso" con esa misma sección dibujada en la barra de al lado.
 */
const ORDEN_INICIO: [Seccion, string][] = [
  ["inventario", "/inventario"],
  ["productos", "/inventario/productos"],
  ["pos", "/pos"],
  ["caja", "/pos"],
  ["reportes", "/reportes"],
  ["usuarios", "/usuarios"],
  ["creditos", "/creditos"],
  ["gastos", "/gastos"],
  ["clientes", "/clientes"],
  ["busqueda", "/buscar"],
  ["gift_cards", "/gift-cards"],
  ["propinas", "/propinas"],
  ["encargos", "/encargos"],
  ["vencimientos", "/vencimientos"],
  ["controlados", "/controlados"],
  ["movimientos", "/inventario/movimientos"],
  ["almacenes", "/inventario/almacenes"],
  ["insumos", "/inventario/insumos"],
  ["proveedores", "/inventario/proveedores"],
  ["solicitudes", "/solicitudes"],
  ["reportes_agenda", "/reportes-agenda"],
  ["agenda_config", "/configuracion/agenda"],
  ["recetas_servicio", "/configuracion/insumos-servicio"],
  ["mesas", "/mesas"],
  ["comisiones", "/comisiones"],
  ["personal", "/personal"],
  ["roles", "/roles"],
  ["config_negocio", "/configuracion/negocio"],
  ["mi_pagina", "/mi-pagina"],
  ["mis_enlaces", "/mis-enlaces"],
  ["mi_asistente", "/mi-asistente"],
  ["promociones", "/promociones"],
  ["retencion", "/clientes-que-no-vuelven"],
  ["salon", "/salon"],
  ["reparto", "/reparto"],
];

/**
 * "Mi agenda": la de quien ve sólo la suya si el negocio tiene la feature, y
 * si no el aviso de que llega pronto. Es una sola ruta, así prender la agenda
 * cambia la pantalla y no a dónde aterriza cada quien.
 */
export const RUTA_AGENDA_PRONTO = "/mi-agenda";

/**
 * Lo que hace falta del negocio para nombrar un rol. Estructural para poder
 * pasarle la `SesionNegocio` entera o un objeto armado en un test.
 */
export interface NegocioRol {
  tipoNegocio?: string | null;
  perfil?: Pick<PerfilRubro, "etiquetasRol"> | null;
}

/**
 * Cómo se dice en el rubro la palabra de un código legado: en una barbería el
 * PROFESIONAL es "Barbero" (del perfil, o del respaldo por rubro). **Es
 * vocabulario, no permisos**: la usa la agenda para nombrar la columna de los
 * profesionales. El nombre del rol de una persona es su `rolNombre`, que lo
 * elige el negocio.
 */
export function etiquetaRol(rol: Rol, negocio?: NegocioRol | null): string {
  const propia = etiquetaRolDelRubro(rol, negocio?.tipoNegocio, negocio?.perfil?.etiquetasRol);
  if (propia) return propia;
  const m: Record<string, string> = {
    ADMIN: "Administrador",
    SUPERVISOR: "Supervisor",
    CAJERO: "Cajero",
    REPARTIDOR: "Repartidor",
    MESERO: "Mesero",
    PROFESIONAL: "Profesional",
    PLATAFORMA: "Plataforma",
  };
  return m[rol] ?? rol;
}
