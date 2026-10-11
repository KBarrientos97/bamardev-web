import { useEffect, useState } from "react";
import { apiPromociones } from "./apiPromociones";

/**
 * El código del cupón que se pone en la misma promoción (PLAN-DESARROLLO-
 * BELLEZA §12, decisión 8): sólo A-Z y 0-9, de 3 a 20, en mayúsculas, único
 * en el negocio. El backend valida lo mismo; acá es para que el dueño lo vea
 * mientras escribe y no recién al guardar.
 */
export const CODIGO_MIN = 3;
export const CODIGO_MAX = 20;

/**
 * Lo que se escribe, como se va a guardar: "verano 20!" → "VERANO20". Los
 * acentos se pierden sin perder la letra ("Otoño" → "OTONO"): se dicta por
 * teléfono y se tipea en el celular del cajero.
 */
export function limpiarCodigo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODIGO_MAX);
}

/**
 * Limpia lo escrito y dice dónde queda el cursor: lo que había antes del
 * cursor, ya limpio, mide lo mismo que su nueva posición. Sin esto, al
 * corregir en el medio ("QA|S2" + "x-y") el cursor saltaba al final y lo
 * siguiente se escribía ahí (QA CUP-04).
 */
export function limpiarConCursor(
  texto: string,
  cursor: number | null,
  limpiar: (t: string) => string = limpiarCodigo,
): { valor: string; cursor: number } {
  const valor = limpiar(texto);
  if (cursor == null) return { valor, cursor: valor.length };
  return { valor, cursor: Math.min(limpiar(texto.slice(0, cursor)).length, valor.length) };
}

export type EstadoCodigo =
  | { estado: "vacio" }
  | { estado: "corto" }
  | { estado: "consultando" }
  | { estado: "libre" }
  | { estado: "tomado"; mensaje: string }
  | { estado: "invalido"; mensaje: string }
  | { estado: "error" };

/** Cuánto se espera a que deje de escribir antes de preguntar. */
export const ESPERA_CONSULTA_MS = 350;

/**
 * El aviso al instante: pregunta al backend si el código está libre, con una
 * espera corta para no consultar por cada letra. Una respuesta vieja (de lo
 * que había escrito antes) no pisa la nueva.
 */
export function useDisponibilidadCodigo(codigo: string, activo: boolean): EstadoCodigo {
  const [estado, setEstado] = useState<EstadoCodigo>({ estado: "vacio" });
  useEffect(() => {
    if (!activo || !codigo) {
      setEstado({ estado: "vacio" });
      return;
    }
    if (codigo.length < CODIGO_MIN) {
      setEstado({ estado: "corto" });
      return;
    }
    setEstado({ estado: "consultando" });
    let vigente = true;
    const t = setTimeout(() => {
      apiPromociones
        .disponibilidadCupon(codigo)
        .then((r) => {
          if (!vigente) return;
          if (r.disponible) setEstado({ estado: "libre" });
          else if (r.motivo === "FORMATO")
            setEstado({ estado: "invalido", mensaje: r.mensaje ?? "Sólo letras y números, de 3 a 20" });
          else setEstado({ estado: "tomado", mensaje: r.mensaje ?? `Ya existe un cupón ${codigo}` });
        })
        .catch(() => {
          // Sin conexión o sin permiso: no se bloquea, el alta lo vuelve a mirar.
          if (vigente) setEstado({ estado: "error" });
        });
    }, ESPERA_CONSULTA_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [codigo, activo]);
  return estado;
}

/** ¿El estado del código deja guardar? Vacío sí: el código es opcional. */
export function codigoBloqueaGuardar(e: EstadoCodigo): boolean {
  return e.estado === "corto" || e.estado === "consultando" || e.estado === "tomado" || e.estado === "invalido";
}

/** Un código que el backend rechazó con 409 `CUPON_EXISTE` al guardar. */
export interface ConflictoCodigo {
  codigo: string;
  mensaje: string;
}

/**
 * El 409 del alta manda sobre el aviso al instante mientras el código siga
 * siendo el mismo: entre la consulta y el guardado otro pudo tomarlo, y el
 * campo seguía diciendo "Disponible" con Guardar habilitado (QA CUP-03).
 */
export function conConflicto(
  estado: EstadoCodigo,
  codigo: string,
  conflicto: ConflictoCodigo | null,
): EstadoCodigo {
  return conflicto && conflicto.codigo === codigo ? { estado: "tomado", mensaje: conflicto.mensaje } : estado;
}

/** ¿El error del backend es el 409 de un código tomado? */
export function esCodigoTomado(e: unknown): boolean {
  return !!e && typeof e === "object" && (e as { codigo?: unknown }).codigo === "CUPON_EXISTE";
}
