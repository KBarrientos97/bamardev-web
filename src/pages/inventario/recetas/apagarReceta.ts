import { apiRecetas } from "../../../lib/recetas/api";

/**
 * Un plato «Con receta» que pasa a otro tipo en Artículos: la receta se guarda
 * como está pero deja de usarse (`conReceta: false`, CONTRATO-recetas-plato
 * §2.3). Va ANTES del PATCH del artículo: mientras el plato sigue con receta, el
 * backend ignora el costo escrito a mano, y el `PUT` sólo vale sobre un
 * elaborado.
 *
 * Se guardan los renglones cuyos insumos siguen listos para recetas: uno dado de
 * baja haría rechazar el `PUT`, y entonces el plato no se podría cambiar de tipo.
 */
export async function apagarReceta(platoId: number): Promise<void> {
  const [receta, insumos] = await Promise.all([apiRecetas.receta(platoId), apiRecetas.insumos()]);
  const listos = new Set(insumos.filter((i) => i.configurado).map((i) => i.id));
  await apiRecetas.guardar(platoId, {
    conReceta: false,
    lineas: receta.lineas
      .filter((l) => listos.has(l.insumoId))
      .map((l) => ({ insumoId: l.insumoId, porciones: l.porciones, grupo: l.grupo, puro: l.grupo === "GUARNICION" && l.puro })),
  });
}
