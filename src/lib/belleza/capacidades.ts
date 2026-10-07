import type { SesionUsuario } from "../../types";
import { tienePermiso } from "../permisos";
import { esBelleza } from "../rubro";

/**
 * Qué piezas de la fase 4 de belleza se dibujan DENTRO de pantallas que ya
 * existen (el cobro, la cita, la ficha del cliente). No son secciones del
 * menú: son bloques que aparecen o no.
 *
 * Las features son ESTRICTAS (sin la feature en la lista, no hay bloque),
 * igual que la agenda: son nuevas, se prenden a mano por negocio, y un
 * restaurante o una farmacia no pueden encontrarse un campo "Gift card" en su
 * cobro porque su lista de features vino vacía. Además, el rubro: sólo belleza.
 *
 * Quién: sólo por permiso, nunca por el nombre del rol.
 */
export interface ContextoExtras {
  features?: string[] | null;
  rubro?: string | null;
  usuario?: Pick<SesionUsuario, "permisos" | "permisosPropios"> | null;
}

function conFeature(ctx: ContextoExtras, codigo: string): boolean {
  return esBelleza(ctx.rubro) && !!ctx.features?.includes(codigo);
}

/** Cobrar con un vale (forma de pago "Gift card"). */
export function cobraConVale(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "gift_cards");
}

/** Anotar propinas por profesional al cobrar. */
export function cobraPropinas(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "propinas");
}

/** Anular un vale sin usar (devuelve la plata). */
export function anulaVales(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "gift_cards") && tienePermiso(ctx.usuario, "vales.anular");
}

/** Entregarle sus propinas a un profesional (sale de la caja). */
export function pagaPropinas(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "propinas") && tienePermiso(ctx.usuario, "propinas.pagar");
}

/** Ver y corregir los insumos que gastó una cita. */
export function veInsumosCita(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "consumo_servicio") && tienePermiso(ctx.usuario, "consumo.ajustar");
}

/** Ver la ficha técnica (fórmulas y fotos). Dato sensible. */
export function veFichaTecnica(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "ficha_tecnica") && tienePermiso(ctx.usuario, "fichatecnica.ver");
}

/** Cargar fórmulas y fotos en la ficha técnica. */
export function editaFichaTecnica(ctx: ContextoExtras): boolean {
  return conFeature(ctx, "ficha_tecnica") && tienePermiso(ctx.usuario, "fichatecnica.editar");
}
