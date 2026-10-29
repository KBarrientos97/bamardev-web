import { useEffect, useState } from "react";

/**
 * La lógica del buscador de estudiante (auditoría 26-oct, D2), aparte del
 * componente (`pages/academia/BuscadorEstudiante.tsx`): el mismo rótulo, la
 * misma demora y el mismo mínimo de letras en Estudiantes, Cobrar, Inscribir y
 * Cobranza. Antes había tres rótulos distintos —«Nombre, CI, código o
 * teléfono», «Nombre, CI o código» y «CI, nombre o teléfono»— aunque todos
 * terminan en el mismo filtro del backend (`filtroBusquedaAlumno`: nombre, CI,
 * código y teléfono).
 */
export const PLACEHOLDER_BUSCAR_ESTUDIANTE = "Nombre, CI, código o teléfono";

/** Con menos letras que esto no se pregunta al backend: saldría media base. */
export const MINIMO_BUSQUEDA = 2;

/**
 * Lo que de verdad se le pregunta al backend: con menos del mínimo, nada (la
 * lista completa). Estudiantes y Cobranza mandaban `q=a` con una sola letra
 * (ronda 2, B7), contra lo que dice este archivo.
 */
export const busquedaValida = (buscado: string) => (buscado.trim().length >= MINIMO_BUSQUEDA ? buscado : "");

/** Lo que se espera después de la última tecla antes de buscar. */
export const DEMORA_BUSQUEDA_MS = 300;

/**
 * El texto ya recortado y con la demora: lo que de verdad se busca. Va aparte
 * para quien guarda el texto en otro lado (Inscribir lo comparte con el
 * formulario) y no puede usar `useBusquedaEstudiante`.
 */
export function useTextoDemorado(q: string) {
  const [buscado, setBuscado] = useState(q.trim());
  useEffect(() => {
    const t = setTimeout(() => setBuscado(q.trim()), DEMORA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [q]);
  return buscado;
}

/**
 * El texto que escribe quien busca y el que de verdad se busca (`buscado`).
 * Se separan para no pedirle al backend una vez por tecla.
 */
export function useBusquedaEstudiante(inicial = "") {
  const [q, setQ] = useState(inicial);
  const buscado = useTextoDemorado(q);
  return { q, setQ, buscado };
}
