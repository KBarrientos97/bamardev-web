import { useEffect, useState } from "react";
import { apiAcademia } from "./apiAcademia";
import { nombreDe, textoModulos } from "./formato";
import type { MateriaDelGrupo } from "./tipos";
import { nombreCuotaDeCurso } from "./vista";

/**
 * Los nombres de los módulos de un grupo, por orden ({1: "Cortes", 2: "Degradados"}),
 * para decir «M2 Degradados» donde antes salía el código «M2» (auditoría
 * 26-oct, D6). Las cuotas del backend traen sólo el orden de lo que cubren
 * (`materiaOrdenes`), no el nombre: se lo busca en el detalle del grupo, una
 * sola vez por grupo y por sesión.
 */
export type NombresModulos = Record<number, string>;

export function nombresDe(materias: Pick<MateriaDelGrupo, "materia">[] | undefined | null): NombresModulos {
  const r: NombresModulos = {};
  for (const m of materias ?? []) if (m.materia?.nombre) r[m.materia.orden] = m.materia.nombre;
  return r;
}

const cache = new Map<number, Promise<NombresModulos>>();

/** Para los tests: cada uno arranca sin lo que dejó el anterior. */
export function olvidarModulos() {
  cache.clear();
}

/**
 * Si el detalle falla (sin permiso, sin red, un test sin ese endpoint) no es
 * un error de pantalla: se sigue con los códigos «M2», como antes.
 */
function cargar(grupoId: number): Promise<NombresModulos> {
  let p = cache.get(grupoId);
  if (!p) {
    try {
      p = apiAcademia
        .grupo(grupoId)
        .then((g) => nombresDe(g.materiasGrupo))
        .catch(() => {
          cache.delete(grupoId);
          return {};
        });
    } catch {
      return Promise.resolve({});
    }
    cache.set(grupoId, p);
  }
  return p;
}

/** Los nombres de los módulos de varios grupos, por id del grupo; llegan a medida que se cargan. */
export function useModulosDeGrupos(grupoIds: number[]): Record<number, NombresModulos> {
  const [porGrupo, setPorGrupo] = useState<Record<number, NombresModulos>>({});
  const clave = [...new Set(grupoIds.filter((id) => id > 0))].sort((a, b) => a - b).join(",");
  useEffect(() => {
    let vivo = true;
    for (const id of clave ? clave.split(",").map(Number) : []) {
      void cargar(id).then((nombres) => {
        if (vivo && Object.keys(nombres).length) setPorGrupo((prev) => (prev[id] ? prev : { ...prev, [id]: nombres }));
      });
    }
    return () => {
      vivo = false;
    };
  }, [clave]);
  return porGrupo;
}

/** Los nombres de los módulos de un grupo (vacío mientras carga o si no se pudo). */
export function useModulosDeGrupo(grupoId: number | null | undefined): NombresModulos | undefined {
  const todos = useModulosDeGrupos(grupoId ? [grupoId] : []);
  return grupoId ? todos[grupoId] : undefined;
}

/**
 * Qué módulo cubre cada cuota de una inscripción, con el curso y los nombres.
 * El carrito de «Cobrar» y el recibo traen la cuota con su concepto pero no
 * qué módulos cubre: sale de la ficha del estudiante (que sí lo trae).
 */
export interface ModulosDeCuotas {
  curso: string;
  porCuota: Record<number, number[]>;
  nombres: NombresModulos;
}

export function useModulosDeCuotas(alumnoId: number | null | undefined, inscripcionId: number | null | undefined): ModulosDeCuotas | null {
  const [info, setInfo] = useState<{ clave: string; datos: ModulosDeCuotas } | null>(null);
  const clave = alumnoId && inscripcionId ? `${alumnoId}:${inscripcionId}` : "";
  useEffect(() => {
    if (!clave || !alumnoId) return;
    let vivo = true;
    void (async () => {
      try {
        const a = await apiAcademia.alumno(alumnoId);
        const insc = a.inscripciones.find((i) => i.id === inscripcionId);
        if (!insc) return;
        const nombres = await cargar(insc.grupo.id);
        const porCuota: Record<number, number[]> = {};
        for (const c of insc.cuotas) porCuota[c.id] = c.materiaOrdenes;
        if (vivo) setInfo({ clave, datos: { curso: nombreDe(insc.grupo.carrera), porCuota, nombres } });
      } catch {
        // Sin eso se sigue con el texto que mandó el backend.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave, alumnoId, inscripcionId]);
  return info && info.clave === clave ? info.datos : null;
}

/** «Barbería · M2 Degradados» para una línea de «Cobrar»; sin los datos, el `respaldo` del backend. */
export function descripcionDeCuota(info: ModulosDeCuotas | null, cuotaId: number, respaldo: string): string {
  const ordenes = info?.porCuota[cuotaId];
  if (!info || !ordenes?.length || !Object.keys(info.nombres).length) return respaldo;
  return nombreCuotaDeCurso(info.curso, { concepto: "", numero: 0, materiaOrdenes: ordenes }, info.nombres);
}

/** Los módulos de cada cuota con su nombre («M2 Degradados»), para el recibo. Vacío si no se saben los nombres. */
export function modulosDeCuotas(info: ModulosDeCuotas | null): Record<number, string> {
  const r: Record<number, string> = {};
  if (!info || !Object.keys(info.nombres).length) return r;
  for (const [id, ordenes] of Object.entries(info.porCuota)) if (ordenes.length) r[Number(id)] = textoModulos(ordenes, info.nombres);
  return r;
}
