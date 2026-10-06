import type { Feature, Modulo, PerfilRubro, Rol, SesionUsuario } from "../types";
import { RUBROS_BELLEZA, etiquetaRolDelRubro, type Rubro } from "./rubro";

/**
 * Permisos de la app. Hay DOS vocabularios distintos y no se mezclan:
 *
 *   • Módulos del ROL   (MAYÚSCULAS: POS, CAJA, …) → qué puede hacer la persona.
 *     Vienen en `usuario.modulos` del login.
 *   • Features del PLAN (minúsculas: pos, fiado, …) → qué compró el negocio.
 *     Vienen en `negocio.features`.
 *
 * El backend NO los intersecta (lo dice explícito en auth.service.ts), así que
 * la intersección la hacemos acá: una sección se muestra sólo si el rol la
 * permite Y el plan la incluye.
 *
 * Las dos comprobaciones fallan ABIERTAS cuando la lista viene vacía, igual
 * que la app Android: una sesión vieja o un negocio sin features migradas se
 * quedaría sin menú, y eso es peor que mostrar de más — el backend igual
 * responde 403 si de verdad no corresponde.
 *
 * Y hay un tercer filtro, de otra naturaleza: el RUBRO (ver `rubro.ts`). El rol
 * y el plan dicen si te dejan entrar; el rubro dice si la sección **existe**
 * para ese tipo de negocio. Una farmacia con el plan más caro sigue sin tener
 * mesas de salón.
 */

export function tieneModulo(modulos: Modulo[] | undefined, codigo: Modulo): boolean {
  if (!modulos || modulos.length === 0) return true; // falla abierto
  return modulos.includes(codigo);
}

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
  /** A1: la agenda del día, columnas por profesional. Recepción y dueño. */
  | "agenda"
  /** A3: la lista de hoy con los botones rápidos (y la cola, A6). */
  | "hoy"
  /** A10: las citas del profesional que entró. Sólo el rol PROFESIONAL. */
  | "mi_agenda"
  /** A7: fichas de cliente con su historial (ola B). Recepción y dueño. */
  | "clientes"
  /** A9: las solicitudes que entraron por la reserva online (fase 2). */
  | "solicitudes"
  // ── Página del negocio (todas las verticales) ──
  /** "Mi página": el editor de la página pública del negocio. */
  | "mi_pagina"
  /** "Mis enlaces": los enlaces cortos con QR y clics. */
  | "mis_enlaces"
  // ── CRM y promociones (PLAN-CRM-Y-PROMOCIONES) ──
  /** Promociones y cupones: el ABM, los cupones y el enlace de campaña. */
  | "promociones"
  /** Los clientes que no vuelven, los segmentos y el contacto por wa.me. */
  | "retencion";

/**
 * Qué módulo de rol y qué feature de plan exige cada sección. `feature: null`
 * = no está en el catálogo de planes, alcanza con el módulo del rol. `modulo:
 * null` = no pide módulo (la agenda, D23): la decide la feature y el rol.
 */
const REQUISITOS: Record<Seccion, { modulo: Modulo | null; feature: Feature | null }> = {
  pos: { modulo: "POS", feature: "pos" },
  caja: { modulo: "CAJA", feature: "caja" },
  inventario: { modulo: "INVENTARIO", feature: "inventario" },
  productos: { modulo: "INVENTARIO", feature: "catalogo" },
  insumos: { modulo: "INVENTARIO", feature: "insumos" },
  almacenes: { modulo: "INVENTARIO", feature: "multi_almacen" },
  movimientos: { modulo: "INVENTARIO", feature: "inventario" },
  creditos: { modulo: "POS", feature: "fiado" },
  reportes: { modulo: "REPORTES", feature: "reportes" },
  usuarios: { modulo: "USUARIOS", feature: "usuarios" },
  // El reparto no es una sección vendible: es la app del repartidor.
  reparto: { modulo: "POS", feature: "delivery" },
  // El salón es el panel del mesero. El módulo es POS porque es lo que el
  // backend le da al rol MESERO, y la feature `salon` SÍ está en el catálogo
  // (se vende en Profesional desde el 09-sep): apagarla desde el panel tiene
  // que sacar la sección. Estaba en `null` con un comentario que decía que no
  // existía, y por eso seguía apareciendo con la feature apagada.
  salon: { modulo: "POS", feature: "salon" },
  // El ABM de mesas es parte de la misma sección vendida: si el negocio no
  // contrató el salón, no hay mesas que administrar.
  mesas: { modulo: "INVENTARIO", feature: "salon" },
  // Es la pantalla de `/inventario`: pide exactamente lo mismo, o el menú
  // mostraría un sub-ítem que lleva a una ruta que el guard rechaza.
  dashboard: { modulo: "INVENTARIO", feature: "inventario" },
  // Buscar un medicamento es parte de atender: la hace quien está en el
  // mostrador, así que va con el módulo del POS. No se vende aparte.
  busqueda: { modulo: "POS", feature: null },
  // Vencimientos es de inventario: decide qué se devuelve al proveedor y qué
  // se da de baja, no atiende a nadie. La feature es `lotes` y no `inventario`
  // porque es la que exige el backend (`@RequiereFeature('lotes')`, sólo en
  // PRO): con `inventario` una farmacia BASICO veía la sección y entraba a un
  // 403.
  vencimientos: { modulo: "INVENTARIO", feature: "lotes" },
  // Los encargos los anota quien ATIENDE, así que van con el módulo del POS:
  // el que escucha "¿no tenés…?" es el del mostrador, no el que administra.
  // La feature es la misma que pide el backend: apagarla en el panel la saca.
  encargos: { modulo: "POS", feature: "encargos" },
  // El libro de controlados es una obligación legal, no algo que se vende
  // aparte: sin feature. El módulo es el que pide el backend (INVENTARIO).
  controlados: { modulo: "INVENTARIO", feature: null },
  // Los proveedores son de quien recibe la mercadería: la misma llave que
  // Movimientos, que es donde se eligen.
  proveedores: { modulo: "INVENTARIO", feature: "inventario" },
  // Recibir y dar de baja mercadería SON movimientos de inventario: la misma
  // llave que `movimientos`, sólo que con pantalla propia. No se venden aparte
  // ni se le pueden dar a alguien que no pueda ver el registro.
  ingreso_mercaderia: { modulo: "INVENTARIO", feature: "inventario" },
  salida_mercaderia: { modulo: "INVENTARIO", feature: "inventario" },
  // Transferir es mover stock entre sucursales: sin el plan de varias
  // sucursales (la misma llave que la pantalla de Sucursales) no hay a dónde.
  transferencia_mercaderia: { modulo: "INVENTARIO", feature: "multi_almacen" },
  // Igual que en Android (`Permisos.kt`): el modulo es REPORTES porque un
  // gasto es del libro del resultado, no de la caja del turno, y la feature
  // `gastos` esta en el catalogo desde sep-2026.
  gastos: { modulo: "REPORTES", feature: "gastos" },
  // La agenda no tiene módulo de rol (D23): el backend sólo exige la feature,
  // así que acá tampoco se pide ninguno. Quién entra lo dice ROLES_PERMITIDOS.
  agenda_config: { modulo: null, feature: "agenda" },
  config_negocio: { modulo: null, feature: "agenda" },
  agenda: { modulo: null, feature: "agenda" },
  hoy: { modulo: null, feature: "agenda" },
  mi_agenda: { modulo: null, feature: "agenda" },
  // La ficha es su propia feature (`clientes`): sin ella el backend da 403.
  clientes: { modulo: null, feature: "clientes" },
  // La bandeja sólo existe con la reserva online: sin ella no entra nada.
  solicitudes: { modulo: null, feature: "reserva_online" },
  // La página no tiene módulo de rol: la decide la feature y el rol ADMIN
  // (el backend exige las dos).
  mi_pagina: { modulo: null, feature: "pagina_publica" },
  mis_enlaces: { modulo: null, feature: "enlaces_cortos" },
  // Nuevas del 06-oct, sin módulo de rol: las cortan la feature y el permiso.
  promociones: { modulo: null, feature: "promociones" },
  retencion: { modulo: null, feature: "clientes_retencion" },
};

/**
 * Features que NO fallan abiertas: sin la feature en la lista, la sección no
 * existe aunque la lista venga vacía. Cubre todas las secciones de agenda
 * (A1, Hoy, Mi agenda, A8, A11): al profesional sin la feature lo deja en "Tu
 * agenda llega pronto" en vez de en un 403. La agenda es lo único nuevo de
 * verdad —ningún negocio la tuvo antes— y se prende a mano por negocio (F1.8): un
 * salón que todavía no la tiene no puede encontrarse la configuración de algo
 * que no puede usar, y el fail-open de siempre se la mostraría.
 *
 * La página del negocio y los enlaces cortos, igual: son nuevos y se prenden
 * por negocio. A Omar no le aparece "Mi página" hasta que se la prendan.
 */
const FEATURES_ESTRICTAS: Feature[] = [
  "agenda",
  "clientes",
  "reserva_online",
  "pagina_publica",
  "enlaces_cortos",
  // Promociones y CRM: nuevas, se prenden por negocio. A Omar no le aparecen.
  "promociones",
  "clientes_retencion",
];

/**
 * Roles que además pueden entrar a cada sección. El backend lo exige con
 * RolesGuard en reportes y usuarios; acá evitamos ofrecer lo que va a fallar.
 */
const ROLES_PERMITIDOS: Partial<Record<Seccion, Rol[]>> = {
  // El repartidor tiene el módulo POS (es lo que le habilita sus entregas),
  // así que sin esta lista le aparecería el punto de venta entero y podría
  // abrir caja y vender.
  pos: ["ADMIN", "SUPERVISOR", "CAJERO"],
  caja: ["ADMIN", "SUPERVISOR", "CAJERO"],
  creditos: ["ADMIN", "SUPERVISOR", "CAJERO"],
  reportes: ["ADMIN", "SUPERVISOR"],
  usuarios: ["ADMIN", "SUPERVISOR"],
  inventario: ["ADMIN", "SUPERVISOR"],
  productos: ["ADMIN", "SUPERVISOR"],
  insumos: ["ADMIN", "SUPERVISOR"],
  almacenes: ["ADMIN", "SUPERVISOR"],
  movimientos: ["ADMIN", "SUPERVISOR"],
  reparto: ["REPARTIDOR"],
  // El mesero SÓLO ve su panel: no cobra, así que no tiene POS ni caja. El
  // admin y el supervisor también entran, para poder mirar el salón sin tener
  // que pedirle el celular a alguien.
  salon: ["MESERO", "ADMIN", "SUPERVISOR"],
  // Crear mesas y zonas es del admin: el mesero las usa, no las administra.
  mesas: ["ADMIN", "SUPERVISOR"],
  dashboard: ["ADMIN", "SUPERVISOR"],
  // El cajero entra: es el que atiende el mostrador y el que más la usa.
  busqueda: ["ADMIN", "SUPERVISOR", "CAJERO"],
  vencimientos: ["ADMIN", "SUPERVISOR"],
  encargos: ["ADMIN", "SUPERVISOR", "CAJERO"],
  // Trae nombres de pacientes y de médicos: lo lee quien responde ante el
  // SEDES, no el cajero. El backend lo exige igual.
  controlados: ["ADMIN", "SUPERVISOR"],
  // Lo que se le compró a cada uno es plata del negocio: no lo ve un cajero.
  proveedores: ["ADMIN", "SUPERVISOR"],
  // Quien recibe del proveedor y quien da de baja un lote vencido es el mismo
  // que puede ver Movimientos: mover stock no es atender el mostrador.
  ingreso_mercaderia: ["ADMIN", "SUPERVISOR"],
  salida_mercaderia: ["ADMIN", "SUPERVISOR"],
  transferencia_mercaderia: ["ADMIN", "SUPERVISOR"],
  // El backend lo exige con RolesGuard: un cajero no carga gastos del negocio.
  gastos: ["ADMIN", "SUPERVISOR"],
  // §4 de PLAN-AGENDA-BELLEZA: horarios, servicios y recursos los tocan el
  // dueño y el encargado; las reglas del negocio (A11), sólo el dueño. El
  // backend no lo exige todavía (D23): es la pantalla la que no lo ofrece.
  agenda_config: ["ADMIN", "SUPERVISOR"],
  config_negocio: ["ADMIN"],
  // La tabla de §4 del plan de agenda se aplica en las pantallas (el backend
  // no tiene guard de rol, D23). Recepción es el CAJERO de siempre; el
  // profesional ve sólo lo suyo, en su propia pantalla.
  agenda: ["ADMIN", "SUPERVISOR", "CAJERO"],
  hoy: ["ADMIN", "SUPERVISOR", "CAJERO"],
  mi_agenda: ["PROFESIONAL"],
  // A7 es de recepción y dueño (§5.1): el profesional ve la ficha mínima
  // desde su cita, no la cartera entera.
  clientes: ["ADMIN", "SUPERVISOR", "CAJERO"],
  // Aprobar una reserva online es de recepción, como confirmar por teléfono.
  solicitudes: ["ADMIN", "SUPERVISOR", "CAJERO"],
  // La página es la vitrina del negocio: la edita el dueño (§3).
  mi_pagina: ["ADMIN"],
  mis_enlaces: ["ADMIN"],
  // Respaldo sin permisos del backend (sesión vieja): lo de §9.2 del plan.
  promociones: ["ADMIN"],
  retencion: ["ADMIN", "SUPERVISOR", "CAJERO"],
};

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
  rol: Rol;
  modulos?: Modulo[];
  features?: Feature[];
  /** `negocio.tipoNegocio` del login. Sin rubro, se ve todo (como antes). */
  rubro?: string;
  /**
   * Permisos efectivos del login (PLAN-ROLES §8.2), ya cruzados con el plan.
   * `undefined` = backend o sesión anteriores: se decide como siempre.
   */
  permisos?: string[];
  permisosPropios?: string[];
  /** El rol "de fondo" de la plantilla; decide la ruta inicial si viene. */
  arquetipo?: string | null;
}

/**
 * Qué permiso exige cada sección **cuando el backend manda permisos**
 * (PLAN-ROLES §8.2, fase R4). Por ahora sólo la agenda, que el backend ya
 * corta por permisos (R3): el resto sigue con `ROLES_PERMITIDOS` y los módulos
 * hasta que su controlador se corte, así Omar y la farmacia no ven ningún
 * cambio. `alcance` distingue la agenda de recepción (GENERAL) de "Mi agenda"
 * del profesional (PROPIO).
 */
const PERMISO_SECCION: Partial<
  Record<Seccion, { permiso: string; alcance?: "GENERAL" | "PROPIO" }>
> = {
  agenda: { permiso: "agenda.ver", alcance: "GENERAL" },
  hoy: { permiso: "agenda.ver", alcance: "GENERAL" },
  mi_agenda: { permiso: "agenda.ver", alcance: "PROPIO" },
  agenda_config: { permiso: "agenda.configurar" },
  // Las reglas del negocio (A11) son configuración de la agenda: el mismo
  // permiso que el backend pide para guardarlas.
  config_negocio: { permiso: "agenda.configurar" },
  // Los módulos nuevos del 06-oct nacen cortados por permisos en el backend:
  // la pantalla pide lo mismo. La cartera de clientes (A7) es la general; el
  // profesional ve la ficha mínima desde su cita, no la lista.
  clientes: { permiso: "cliente.ver_ficha", alcance: "GENERAL" },
  solicitudes: { permiso: "reservas.aprobar" },
  mi_pagina: { permiso: "negocio.configurar" },
  mis_enlaces: { permiso: "negocio.configurar" },
  promociones: { permiso: "promociones.gestionar" },
  retencion: { permiso: "cliente.marketing" },
};

type ConPermisos = Pick<SesionUsuario, "permisos" | "permisosPropios"> | null | undefined;

/**
 * ¿Tiene este permiso? Si el backend mandó permisos, manda eso; si no (backend
 * o sesión viejos), el `respaldo` de siempre (por rol).
 */
export function tienePermiso(usuario: ConPermisos, codigo: string, respaldo: boolean): boolean {
  return usuario?.permisos ? usuario.permisos.includes(codigo) : respaldo;
}

/** ¿Lo tiene sólo sobre lo suyo (alcance PROPIO)? Con respaldo, igual que arriba. */
export function soloLoSuyo(usuario: ConPermisos, codigo: string, respaldo: boolean): boolean {
  if (!usuario?.permisos) return respaldo;
  return usuario.permisos.includes(codigo) && (usuario.permisosPropios ?? []).includes(codigo);
}

/**
 * El profesional en la agenda: la ve sólo sobre lo suyo y no la gestiona.
 * Respaldo: el rol PROFESIONAL, como hasta ahora.
 */
export function veSoloSuAgenda(usuario: (ConPermisos & { rol?: Rol }) | null | undefined): boolean {
  if (!usuario?.permisos) return usuario?.rol === "PROFESIONAL";
  return soloLoSuyo(usuario, "agenda.ver", false) && !usuario.permisos.includes("agenda.gestionar");
}

function cumplePermiso(ctx: ContextoPermisos, req: { permiso: string; alcance?: "GENERAL" | "PROPIO" }) {
  const permisos = ctx.permisos ?? [];
  if (!permisos.includes(req.permiso)) return false;
  const propio = (ctx.permisosPropios ?? []).includes(req.permiso);
  if (req.alcance === "GENERAL") return !propio;
  if (req.alcance === "PROPIO") return propio;
  return true;
}

export function puedeVer(ctx: ContextoPermisos, seccion: Seccion): boolean {
  // El profesional sólo ve lo que lo nombra en `ROLES_PERMITIDOS` (su agenda).
  // Hace falta decirlo explícito: su rol no tiene módulos (D23), y con la
  // lista vacía `tieneModulo` falla abierto — sin esta línea, la primera
  // sección nueva sin `ROLES_PERMITIDOS` le quedaría abierta.
  if (
    (ctx.arquetipo ?? ctx.rol) === "PROFESIONAL" &&
    !ROLES_PERMITIDOS[seccion]?.includes("PROFESIONAL")
  ) {
    return false;
  }

  const fuera = FUERA_DE_RUBRO[seccion];
  if (fuera && ctx.rubro && (fuera as string[]).includes(ctx.rubro)) return false;

  const propia = SOLO_EN_RUBRO[seccion];
  // Sin rubro tampoco se muestra: una sesión vieja que no sabe de qué negocio
  // es no puede aterrizar en una pantalla que sólo tiene sentido en uno.
  if (propia && !(ctx.rubro && (propia as string[]).includes(ctx.rubro))) return false;

  // Con permisos del backend, la sección que ya se cortó por permisos (la
  // agenda) se decide por permiso y no por nombre de rol ni módulo.
  const porPermiso = ctx.permisos ? PERMISO_SECCION[seccion] : undefined;
  if (porPermiso) {
    if (!cumplePermiso(ctx, porPermiso)) return false;
  } else {
    const roles = ROLES_PERMITIDOS[seccion];
    if (roles && !roles.includes(ctx.rol)) return false;
  }

  const req = REQUISITOS[seccion];
  if (!porPermiso && req.modulo && !tieneModulo(ctx.modulos, req.modulo)) return false;
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
 * Una capacidad puede exigir además un rol: anular con PIN se lo ofrecemos a
 * cualquiera (el cajero pide autorización a un encargado), pero mover
 * efectivo de la caja lo bloquea el backend con RolesGuard.
 */
const ROLES_CAPACIDAD: Partial<Record<Capacidad, Rol[]>> = {
  movimientos_caja: ["ADMIN", "SUPERVISOR"],
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

  const roles = ROLES_CAPACIDAD[capacidad];
  if (roles && !roles.includes(ctx.rol)) return false;
  return tieneFeature(ctx.features, capacidad);
}

/** Anular una venta o registrar movimientos de caja sin PIN de por medio. */
export function puedeSupervisar(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "SUPERVISOR";
}

/**
 * Dónde aterriza cada quien al entrar. Se prueba en orden de preferencia
 * según el rol y se devuelve la PRIMERA sección que de verdad puede ver: si
 * devolviéramos una fija, un ADMIN cuyo plan no incluye inventario entraría a
 * una ruta que el guard rechaza, y como el rechazo vuelve al inicio quedaría
 * rebotando en un bucle con la pantalla en blanco.
 */
export function rutaInicial(ctx: ContextoPermisos): string {
  // Por arquetipo si viene (PLAN-ROLES §8.2): un rol nuevo con arquetipo
  // conocido aterriza donde corresponde sin tocar esta función.
  const rol = (ctx.arquetipo ?? ctx.rol) as Rol;
  // No pasa por la lista: con la agenda prendida su pantalla es "Mi agenda", y
  // sin ella es el aviso de que llega pronto, en la MISMA ruta. Por la lista
  // caería en "/sin-acceso", que le diría que su cuenta está mal configurada.
  if (rol === "PROFESIONAL") return RUTA_AGENDA_PRONTO;

  const orden: [Seccion, string][] =
    // El mesero entra directo al salón: es su única pantalla. Igual que
    // AuthenticationActivity en Android, que lo manda a MeserosActivity sin
    // pasar por el menú del admin.
    rol === "MESERO"
      ? [["salon", "/salon"]]
      : rol === "REPARTIDOR"
      ? [["reparto", "/reparto"], ["pos", "/pos"]]
      : rol === "CAJERO"
        ? // Recepción de un salón entra a "Hoy": es su mostrador. Fuera de
          // belleza (o sin la feature) no existe, y sigue el POS de siempre.
          [["hoy", "/hoy"], ["pos", "/pos"], ["caja", "/pos"], ["creditos", "/creditos"]]
        : [
            // Lo mismo para el dueño y el encargado de un salón: su día
            // empieza en la agenda. Omar y la farmacia no la tienen.
            ["agenda", "/agenda"],
            ["inventario", "/inventario"],
            ["productos", "/inventario/productos"],
            ["pos", "/pos"],
            ["reportes", "/reportes"],
            ["usuarios", "/usuarios"],
            ["creditos", "/creditos"],
            // Ultima, en el mismo orden del menu. Sin esto, un negocio cuyo
            // plan solo deja gastos aterrizaba en "/sin-acceso" --"tu cuenta no
            // tiene secciones"-- con "Gastos operativos" dibujado en la barra
            // de al lado: la pantalla se contradecia sola.
            ["gastos", "/gastos"],
          ];

  for (const [seccion, ruta] of orden) {
    if (puedeVer(ctx, seccion)) return ruta;
  }
  // Sin ninguna sección habilitada no hay a dónde ir: la pantalla de sin
  // acceso explica qué pasó en vez de dejar un blanco.
  return "/sin-acceso";
}

/**
 * Inicio del profesional: "Mi agenda" si el negocio tiene la feature, y si no
 * el aviso de que llega pronto. Es una sola ruta, así prender la agenda cambia
 * la pantalla y no a dónde aterriza cada quien.
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
 * Cómo se llama el rol en pantalla. Con el negocio, en su idioma: en una
 * barbería el CAJERO es "Recepción" y el PROFESIONAL, "Barbero" (del perfil,
 * o del respaldo por rubro). Sin negocio, o en los rubros de siempre, el
 * nombre de siempre.
 */
export function etiquetaRol(rol: Rol, negocio?: NegocioRol | null): string {
  const propia = etiquetaRolDelRubro(rol, negocio?.tipoNegocio, negocio?.perfil?.etiquetasRol);
  if (propia) return propia;
  const m: Record<Rol, string> = {
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

// ── Roles que se asignan desde Usuarios ─────────────────────────────────────

/** Roles que se pueden crear desde la app. PLATAFORMA queda afuera a propósito:
 *  es la cuenta del panel de licencias y el backend rechaza asignarla acá.
 *
 *  MESERO llegó después que la pantalla de Usuarios y no estaba: editar a un
 *  mesero dejaba la página en blanco (el formulario buscaba los permisos de un
 *  rol que no conocía), las tarjetas no lo contaban y no se lo podía crear. El
 *  backend y la app Android ya lo manejaban. PROFESIONAL entró igual, pero
 *  junto con el backend. */
export const ROLES_APP = [
  "ADMIN",
  "SUPERVISOR",
  "CAJERO",
  "MESERO",
  "REPARTIDOR",
  "PROFESIONAL",
] as const;
export type RolApp = (typeof ROLES_APP)[number];

/**
 * ¿El perfil del rubro ofrece este rol?
 *
 * Si el perfil trae `config.rolesOfrecidos`, esa lista manda para TODOS los
 * roles: una barbería no tiene repartidores ni meseros, y ofrecérselos sería
 * invitar al dueño a crear cuentas que no van a ninguna pantalla. Si no la
 * trae (o no hay perfil, como con el backend de hoy), son los roles de
 * siempre y PROFESIONAL no: el backend rechaza asignarlo donde el perfil no
 * lo ofrece, y un backend sin perfiles ni siquiera tiene el rol.
 */
export function ofreceRol(
  perfil: Pick<PerfilRubro, "config"> | null | undefined,
  rol: Rol,
): boolean {
  const ofrecidos = perfil?.config?.rolesOfrecidos;
  if (Array.isArray(ofrecidos)) return ofrecidos.includes(rol);
  return rol !== "PROFESIONAL";
}

/**
 * Los roles que se le ofrecen a quien está creando o editando un usuario.
 *
 * Un SUPERVISOR administra personal de piso (cajero, mesero, repartidor,
 * profesional), no a sus pares ni a un ADMIN: ofrecerle roles que el backend
 * le va a rechazar es hacerle llenar el formulario para nada. Un ADMIN los
 * asigna todos.
 */
export function rolesAsignables(opc: {
  /** El rol de quien está usando la pantalla. */
  rolActual: Rol | undefined;
  /** El rol que ya tiene el usuario que se edita (undefined al crear). */
  rolDelUsuario?: Rol;
  /** ¿El negocio tiene salón? El mesero sólo existe donde hay mesas. */
  conSalon: boolean;
  perfil?: Pick<PerfilRubro, "config"> | null;
}): RolApp[] {
  const { rolActual, rolDelUsuario, conSalon, perfil } = opc;
  return ROLES_APP.filter(
    (r) =>
      // ADMIN nunca se ofrece: el administrador nace con el negocio, en el
      // panel. El backend lo rechaza, así que mostrarlo sería hacerle llenar
      // el formulario para nada.
      (r !== "ADMIN" &&
        (r !== "MESERO" || conSalon) &&
        ofreceRol(perfil, r) &&
        (rolActual === "ADMIN" ||
          r === "CAJERO" ||
          r === "MESERO" ||
          r === "REPARTIDOR" ||
          r === "PROFESIONAL")) ||
      // El rol que YA tiene el usuario se sigue mostrando: si no, editarle el
      // teléfono a un admin le cambiaría el rol sin querer al guardar.
      r === rolDelUsuario,
  );
}
