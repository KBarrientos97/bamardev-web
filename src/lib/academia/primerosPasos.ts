import type { Almacen } from "../../types";
import { RUTA_CALENDARIO, RUTA_CURSOS, RUTA_MI_PAGINA } from "./inscripcionEnLinea";
import type { AjustesAcademia, Carrera, Docente, GrupoResumen } from "./tipos";

/**
 * C1 (auditoría 26-oct): «Primeros pasos» de un instituto nuevo. Con todo
 * vacío no se sabe el orden (sede → franjas → curso → docente → grupo →
 * página); esta función dice, con los datos que las pantallas ya cargan, cuáles
 * de las seis casillas están hechas. Es pura para probarla sin pantalla.
 */

export type ClavePaso = "sede" | "franjas" | "curso" | "docente" | "grupo" | "pagina";

export interface PasoInicial {
  clave: ClavePaso;
  titulo: string;
  /** Qué hace falta, en una frase. */
  detalle: string;
  hecho: boolean;
  /** La pantalla donde se hace. */
  a: string;
  /** El texto del botón que lleva ahí. */
  accion: string;
}

/**
 * Lo que se sabe de cada cosa. `null` = no se pudo saber (todavía cargando,
 * un permiso que falta, un corte): ese paso NO se muestra, porque marcarlo
 * como pendiente (o hecho) sería inventar.
 */
export interface DatosPrimerosPasos {
  sedes: Almacen[] | null;
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null;
  docentes: Docente[] | null;
  grupos: GrupoResumen[] | null;
  /** Las features del plan: la página en línea es un paso sólo si el plan la trae. */
  features: string[] | undefined;
  palabras: { carrera: string; docente: string; sede: string; Sede: string; Sedes: string };
}

export const RUTA_SEDES = "/inventario/almacenes";
export const RUTA_FRANJAS = "/configuracion/academia#s-franjas";
export const RUTA_PERSONAL = "/personal";

const lleno = (t: string | null | undefined) => !!t?.trim();

/** Un curso que ya se puede ofrecer: vivo, con módulos y con un precio. */
export function cursoListo(c: Carrera): boolean {
  const modulos = c.materias.filter((m) => m.activa).length;
  const conPrecio = (c.precioModulo ?? 0) > 0 || (c.planes ?? []).some((pl) => pl.activo && pl.total > 0);
  return c.activa && modulos > 0 && conPrecio;
}

export function pasosPrimeros(d: DatosPrimerosPasos): PasoInicial[] {
  const p = d.palabras;
  const pasos: PasoInicial[] = [];

  if (d.sedes) {
    pasos.push({
      clave: "sede",
      titulo: `${p.Sede} con sus datos`,
      detalle: `Poné el nombre y la dirección de tu ${p.sede}.`,
      hecho: d.sedes.some((s) => s.activo && s.tipo !== "DEPOSITO" && lleno(s.nombre) && lleno(s.direccion)),
      a: RUTA_SEDES,
      accion: `Ir a ${p.Sedes}`,
    });
  }
  if (d.ajustes) {
    pasos.push({
      clave: "franjas",
      titulo: "Franjas horarias",
      detalle: "Son las filas del calendario: en qué horarios das clase.",
      hecho: (d.ajustes.franjas ?? []).length > 0,
      a: RUTA_FRANJAS,
      accion: "Cargar franjas",
    });
  }
  if (d.cursos) {
    pasos.push({
      clave: "curso",
      titulo: `Un ${p.carrera} con módulos y precio`,
      detalle: "Nombre, módulos y cuánto cuesta cada uno.",
      hecho: d.cursos.some(cursoListo),
      a: RUTA_CURSOS,
      accion: "Crear un curso",
    });
  }
  if (d.docentes) {
    pasos.push({
      clave: "docente",
      titulo: `Un ${p.docente} con acceso`,
      detalle: `Para que pase lista y cargue notas desde su celular.`,
      hecho: d.docentes.some((x) => x.tieneLogin),
      a: RUTA_PERSONAL,
      accion: `Ir a Personal`,
    });
  }
  if (d.grupos) {
    pasos.push({
      clave: "grupo",
      titulo: "Un grupo abierto",
      detalle: `Un ${p.carrera} con su horario y su ${p.docente}, para empezar a inscribir.`,
      hecho: d.grupos.some((g) => !g.cancelado && g.estado !== "TERMINADO"),
      a: RUTA_CALENDARIO,
      accion: "Abrir un grupo",
    });
  }
  // La página en línea sólo es un paso si el plan la incluye; un backend que
  // no dice si está publicada no permite marcarla ni pedirla.
  if (d.ajustes && d.features?.includes("preinscripcion_online") && d.ajustes.paginaPublicada !== undefined) {
    pasos.push({
      clave: "pagina",
      titulo: "Página de inscripción en línea publicada",
      detalle: "Para que la gente se inscriba desde el celular.",
      hecho: d.ajustes.paginaPublicada === true,
      a: RUTA_MI_PAGINA,
      accion: "Ir a Mi página",
    });
  }
  return pasos;
}

/**
 * Cuántos pasos debería haber con todo a la vista: los cinco de siempre y, si el
 * plan trae la inscripción en línea, el de la página. Menos que eso quiere decir
 * que algo no se pudo saber (un permiso, un corte).
 */
export const pasosEsperados = (features: string[] | undefined) => 5 + (features?.includes("preinscripcion_online") ? 1 : 0);

/** ¿Están todas las casillas? (y hay alguna: sin datos no se declara «completo»). */
export const completo = (pasos: PasoInicial[]) => pasos.length > 0 && pasos.every((x) => x.hecho);

/** Para el contador «3 de 6». */
export const cuantosHechos = (pasos: PasoInicial[]) => pasos.filter((x) => x.hecho).length;
