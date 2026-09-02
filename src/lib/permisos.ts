import type { Feature, Modulo, Rol } from "../types";

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
  | "reparto";

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
};

export interface ContextoPermisos {
  rol: Rol;
  modulos?: Modulo[];
  features?: Feature[];
}

export function puedeVer(ctx: ContextoPermisos, seccion: Seccion): boolean {
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

export function puede(ctx: ContextoPermisos, capacidad: Capacidad): boolean {
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
    ctx.rol === "REPARTIDOR"
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
    PLATAFORMA: "Plataforma",
  };
  return m[rol] ?? rol;
}
