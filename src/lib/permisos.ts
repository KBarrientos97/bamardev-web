import type { Feature, Modulo, Rol } from "../types";
import type { Rubro } from "./rubro";

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
  /** Buscar un medicamento en el mostrador. Sólo farmacia. */
  | "busqueda"
  /** Los lotes que vencen y la plata parada en ellos. Sólo farmacia. */
  | "vencimientos"
  /** Lo que pidieron y no había. Sólo farmacia. */
  | "encargos"
  /**
   * Recibir la mercadería del proveedor: factura, lote y vencimiento por
   * línea. Es el movimiento de ENTRADA con pantalla propia. Sólo farmacia.
   */
  | "ingreso_mercaderia"
  /**
   * Dar de baja stock: vencido, dañado, robado o cargado de más. Es el
   * movimiento de SALIDA con pantalla propia. Sólo farmacia.
   */
  | "salida_mercaderia";

/**
 * Qué módulo de rol y qué feature de plan exige cada sección. `feature: null`
 * = no está en el catálogo de planes, alcanza con el módulo del rol.
 */
const REQUISITOS: Record<Seccion, { modulo: Modulo; feature: Feature | null }> = {
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
  // Buscar un medicamento es parte de atender: la hace quien está en el
  // mostrador, así que va con el módulo del POS. No se vende aparte.
  busqueda: { modulo: "POS", feature: null },
  // Vencimientos es de inventario: decide qué se devuelve al proveedor y qué
  // se da de baja, no atiende a nadie.
  vencimientos: { modulo: "INVENTARIO", feature: "inventario" },
  // Los encargos los anota quien ATIENDE, así que van con el módulo del POS:
  // el que escucha "¿no tenés…?" es el del mostrador, no el que administra.
  encargos: { modulo: "POS", feature: null },
  // Recibir y dar de baja mercadería SON movimientos de inventario: la misma
  // llave que `movimientos`, sólo que con pantalla propia. No se venden aparte
  // ni se le pueden dar a alguien que no pueda ver el registro.
  ingreso_mercaderia: { modulo: "INVENTARIO", feature: "inventario" },
  salida_mercaderia: { modulo: "INVENTARIO", feature: "inventario" },
};

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
  // El cajero entra: es el que atiende el mostrador y el que más la usa.
  busqueda: ["ADMIN", "SUPERVISOR", "CAJERO"],
  vencimientos: ["ADMIN", "SUPERVISOR"],
  encargos: ["ADMIN", "SUPERVISOR", "CAJERO"],
  // Quien recibe del proveedor y quien da de baja un lote vencido es el mismo
  // que puede ver Movimientos: mover stock no es atender el mostrador.
  ingreso_mercaderia: ["ADMIN", "SUPERVISOR"],
  salida_mercaderia: ["ADMIN", "SUPERVISOR"],
};

/**
 * Secciones que NO existen en un rubro. Es una lista NEGRA y no una blanca a
 * propósito: lo que no está acá se ve, que es como funcionaba antes de que el
 * rubro existiera. Así, agregar un rubro nuevo no le apaga el menú a nadie por
 * un olvido, y los negocios que ya trabajan no se enteran de este archivo.
 *
 * Por eso mismo hoy sólo está FARMACIA. Que un minimarket vea "Mesas del
 * salón" es raro, pero es lo que ve hoy: sacárselo es otra decisión, de otro
 * día, con su propio cliente mirando. Acá no se toca nada que ya funcione.
 */
/**
 * Secciones que **nacen** de un rubro y no existen fuera de él. Es la lista
 * BLANCA, la otra mitad del par: la negra protege lo que ya existía (ante la
 * duda, se ve), y ésta encierra lo que se construyó para un rubro puntual
 * (ante la duda, no se ve). Una pollería no tiene por qué encontrarse una
 * pantalla llamada "Buscar medicamento".
 */
const SOLO_EN_RUBRO: Partial<Record<Seccion, Rubro[]>> = {
  busqueda: ["FARMACIA"],
  vencimientos: ["FARMACIA"],
  encargos: ["FARMACIA"],
  // Las dos pantallas guiadas son del rubro. Un restaurante sigue cargando
  // entradas y salidas desde Movimientos con el formulario de siempre: acá no
  // se le saca nada, se le agrega un atajo a la farmacia.
  ingreso_mercaderia: ["FARMACIA"],
  salida_mercaderia: ["FARMACIA"],
};

const FUERA_DE_RUBRO: Partial<Record<Seccion, Rubro[]>> = {
  // El salón entero es de restaurante: una farmacia no atiende mesas.
  mesas: ["FARMACIA"],
  salon: ["FARMACIA"],
  // Los insumos son materia prima: harina, aceite, pollo crudo. Una farmacia
  // no transforma nada, compra y vende lo mismo.
  insumos: ["FARMACIA"],
};

export interface ContextoPermisos {
  rol: Rol;
  modulos?: Modulo[];
  features?: Feature[];
  /** `negocio.tipoNegocio` del login. Sin rubro, se ve todo (como antes). */
  rubro?: string;
}

export function puedeVer(ctx: ContextoPermisos, seccion: Seccion): boolean {
  const fuera = FUERA_DE_RUBRO[seccion];
  if (fuera && ctx.rubro && (fuera as string[]).includes(ctx.rubro)) return false;

  const propia = SOLO_EN_RUBRO[seccion];
  // Sin rubro tampoco se muestra: una sesión vieja que no sabe de qué negocio
  // es no puede aterrizar en una pantalla que sólo tiene sentido en uno.
  if (propia && !(ctx.rubro && (propia as string[]).includes(ctx.rubro))) return false;

  const roles = ROLES_PERMITIDOS[seccion];
  if (roles && !roles.includes(ctx.rol)) return false;

  const req = REQUISITOS[seccion];
  if (!tieneModulo(ctx.modulos, req.modulo)) return false;
  if (req.feature && !tieneFeature(ctx.features, req.feature)) return false;
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
  | "reportes_rentabilidad";

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
  mesa_llevar: ["FARMACIA"],
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
  const orden: [Seccion, string][] =
    // El mesero entra directo al salón: es su única pantalla. Igual que
    // AuthenticationActivity en Android, que lo manda a MeserosActivity sin
    // pasar por el menú del admin.
    ctx.rol === "MESERO"
      ? [["salon", "/salon"]]
      : ctx.rol === "REPARTIDOR"
      ? [["reparto", "/reparto"], ["pos", "/pos"]]
      : ctx.rol === "CAJERO"
        ? [["pos", "/pos"], ["caja", "/pos"], ["creditos", "/creditos"]]
        : [
            ["inventario", "/inventario"],
            ["productos", "/inventario/productos"],
            ["pos", "/pos"],
            ["reportes", "/reportes"],
            ["usuarios", "/usuarios"],
            ["creditos", "/creditos"],
          ];

  for (const [seccion, ruta] of orden) {
    if (puedeVer(ctx, seccion)) return ruta;
  }
  // Sin ninguna sección habilitada no hay a dónde ir: la pantalla de sin
  // acceso explica qué pasó en vez de dejar un blanco.
  return "/sin-acceso";
}

export function etiquetaRol(rol: Rol): string {
  const m: Record<Rol, string> = {
    ADMIN: "Administrador",
    SUPERVISOR: "Supervisor",
    CAJERO: "Cajero",
    REPARTIDOR: "Repartidor",
    MESERO: "Mesero",
    PLATAFORMA: "Plataforma",
  };
  return m[rol] ?? rol;
}
