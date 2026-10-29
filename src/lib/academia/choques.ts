import { useEffect, useRef, useState } from "react";
import { apiAcademia } from "./apiAcademia";
import { nombreDe } from "./formato";
import type { ConsultaChoques, RespuestaChoques } from "./tipos";

/** Cuánto se espera sin cambios antes de preguntarle al backend (mientras se tipea o se tocan los días). */
export const ESPERA_CHOQUES_MS = 500;

export interface EstadoChoques {
  /** Lo que choca, o null si no hay nada que avisar (o todavía no se sabe). */
  choques: RespuestaChoques | null;
  /** La consulta falló: no se sabe, y se puede guardar igual. */
  falla: boolean;
  verificando: boolean;
}

/**
 * C10: el aviso de choques de aula y de docente. Pregunta a
 * `POST /academia/grupos/choques` cuando la consulta cambia (con espera) y
 * devuelve lo que encontró. Es sólo un AVISO: si la consulta es `null` no
 * pregunta, y si falla (red, 5xx) devuelve `falla` sin lanzar nada, para que
 * guardar el grupo nunca dependa de esto.
 */
export function useChoques(consulta: ConsultaChoques | null, esperaMs = ESPERA_CHOQUES_MS): EstadoChoques {
  const clave = consulta ? JSON.stringify(consulta) : "";
  const ultima = useRef(consulta);
  ultima.current = consulta;
  const [resultado, setResultado] = useState<{ clave: string; datos: RespuestaChoques | null; falla: boolean } | null>(null);

  useEffect(() => {
    const pedida = ultima.current;
    if (!pedida) return;
    let vigente = true;
    const t = setTimeout(() => {
      apiAcademia
        .choques(pedida)
        .then((datos) => vigente && setResultado({ clave, datos, falla: false }))
        .catch(() => vigente && setResultado({ clave, datos: null, falla: true }));
    }, esperaMs);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [clave, esperaMs]);

  // Una respuesta de otra consulta (se cambió el horario después) no se muestra.
  const vigente = !!consulta && resultado?.clave === clave ? resultado : null;
  return {
    choques: vigente?.datos?.hayChoques ? vigente.datos : null,
    falla: !!vigente?.falla,
    verificando: !!consulta && !vigente,
  };
}

/** Los renglones del aviso, en palabras de la recepción. Sin tope: quien los muestra decide cuántos. */
export function lineasDeChoques(
  r: RespuestaChoques,
  { aula, docente }: { aula?: string | null; docente: string },
): string[] {
  const grupo = (g: { carrera: { nombre: string }; nombre: string }) =>
    g.nombre && g.nombre !== g.carrera.nombre ? `${g.carrera.nombre} (${g.nombre})` : g.carrera.nombre;
  return [
    ...r.aula.map((c) => `El aula «${aula || "elegida"}» ya está ocupada de ${c.horario} por ${grupo(c)}.`),
    ...r.docentes.map((c) => `El ${docente} ${c.docente} ya dicta ${grupo(c)} ${c.horario} en ${nombreDe(c.sede)}.`),
  ];
}
