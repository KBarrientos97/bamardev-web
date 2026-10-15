import { useMemo } from "react";
import { useAuth } from "../../store/AuthContext";
import { conMayuscula, termino, type Termino } from "../rubro";

/**
 * Las palabras del instituto, ya resueltas con el perfil del negocio: el
 * contrato manda "alumno", "docente", "sede", "carrera" y "materia", y un
 * instituto que dice "estudiante" o "curso" se ve con las suyas. Cada una en
 * minúscula y con mayúscula inicial (`Alumnos`), para no repetir el
 * `conMayuscula` en cada pantalla.
 */
export function usePalabras() {
  const { rubro, vocabulario } = useAuth();
  return useMemo(() => {
    const p = (k: Termino) => termino(rubro, k, vocabulario);
    const claves = ["cliente", "clientes", "profesional", "sucursal", "sucursales", "carrera", "carreras", "materia", "materias"] as const;
    const base = Object.fromEntries(claves.map((k) => [k, p(k)])) as Record<(typeof claves)[number], string>;
    return {
      alumno: base.cliente,
      alumnos: base.clientes,
      Alumno: conMayuscula(base.cliente),
      Alumnos: conMayuscula(base.clientes),
      docente: base.profesional,
      Docente: conMayuscula(base.profesional),
      sede: base.sucursal,
      sedes: base.sucursales,
      Sede: conMayuscula(base.sucursal),
      Sedes: conMayuscula(base.sucursales),
      carrera: base.carrera,
      carreras: base.carreras,
      Carrera: conMayuscula(base.carrera),
      Carreras: conMayuscula(base.carreras),
      materia: base.materia,
      materias: base.materias,
      Materia: conMayuscula(base.materia),
      Materias: conMayuscula(base.materias),
    };
  }, [rubro, vocabulario]);
}

export type Palabras = ReturnType<typeof usePalabras>;
