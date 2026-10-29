import { createContext, useContext, useEffect, useRef } from "react";
import { isoDia } from "../../lib/format";
import { crearXlsx, type HojaNueva } from "../../lib/planilla";
import type { RangoReporte } from "../../types";
import type { Comparacion, Periodo } from "./periodo";

/**
 * Lo que cada reporte recibe de la pantalla que lo contiene: el período, el
 * anterior con el que compara, la sucursal, y dónde anotar cómo se exporta lo
 * que muestra. Va por contexto porque son veintipico de reportes y todos
 * piden lo mismo.
 */
export interface DatosReporte {
  periodo: Periodo;
  comparacion: Comparacion;
  /** El período listo para la API, con la sucursal si se eligió una. */
  rango: RangoReporte;
  rangoAnterior: RangoReporte;
  /** El local elegido, para los textos. Vacío = todas las sucursales. */
  sucursalNombre: string;
  /**
   * A qué hora termina la jornada (minutos; ver `lib/jornada.ts`). Sólo un
   * billar tiene uno (cierra a las 2 a. m.); 0 o ausente = el calendario.
   * Ya va dentro de `rango`: esto es para lo que calcula la pantalla ("¿es el
   * mes en curso?").
   */
  corteMin?: number;
  registrarExportacion: (e: Exportacion | null) => void;
  /**
   * ¿Este usuario ve ese otro reporte? Para los "Ver compras" y "Ver
   * créditos" que saltan de un reporte a otro: un link a un reporte que no ve
   * lo devolvería al resumen sin explicación.
   */
  veReporte: (id: string) => boolean;
}

/** Cómo se baja a Excel lo que se ve. Las hojas se arman recién al tocar el botón. */
export interface Exportacion {
  nombre: string;
  hojas: () => HojaNueva[];
  /**
   * Un reporte paginado del restaurante (Ventas, Movimientos de caja; REP-03,
   * 28-oct) baja TODAS las páginas del período recién al tocar el botón y
   * arma las hojas con eso: si está, es lo que usa el botón, y `hojas` queda
   * como lo que se ve (la página en pantalla). La planilla salía con las 50
   * filas de la página y se leía como el período entero. Los demás rubros no
   * lo mandan (`exportaElPeriodo`) y bajan la página, como siempre.
   */
  completa?: () => Promise<ExportacionCompleta>;
}

/** Lo que arma `Exportacion.completa`. */
export interface ExportacionCompleta {
  hojas: HojaNueva[];
  /** Qué decir en pantalla al bajar (el archivo vino recortado), como el aviso de la app. Null si nada. */
  aviso: string | null;
}

export const ContextoReporte = createContext<DatosReporte | null>(null);

export function useReporte(): DatosReporte {
  const d = useContext(ContextoReporte);
  if (!d) throw new Error("useReporte va dentro de la pantalla de Reportes");
  return d;
}

/**
 * Anota el "Exportar a Excel" del reporte. Con `armar` en null (todavía
 * cargando, o sin nada que bajar) el botón no se dibuja: un Exportar que baja
 * una planilla vacía es peor que no tenerlo.
 *
 * `completa`, en un reporte paginado: baja el período entero al tocar el
 * botón (ver `Exportacion.completa`).
 */
export function useExportar(
  nombre: string,
  armar: (() => HojaNueva[]) | null,
  completa?: () => Promise<ExportacionCompleta>,
) {
  const { registrarExportacion } = useReporte();
  const ref = useRef(armar);
  ref.current = armar;
  const refCompleta = useRef(completa);
  refCompleta.current = completa;
  const hay = armar != null;
  const conCompleta = completa != null;
  useEffect(() => {
    registrarExportacion(
      hay
        ? {
            nombre,
            hojas: () => ref.current?.() ?? [],
            ...(conCompleta
              ? {
                  // Por la referencia, como `hojas`: el pedido sale con el
                  // período y el filtro de AHORA, no con los del primer render.
                  completa: () =>
                    refCompleta.current?.() ?? Promise.resolve({ hojas: ref.current?.() ?? [], aviso: null }),
                }
              : {}),
          }
        : null,
    );
    return () => registrarExportacion(null);
  }, [hay, conCompleta, nombre, registrarExportacion]);
}

/** Baja el libro. Con la fecha en el nombre: tres exportaciones del mismo reporte no quedan como "(1)" y "(2)". */
export function bajarXlsx(nombre: string, hojas: HojaNueva[]) {
  const datos = crearXlsx(hojas);
  const blob = new Blob([datos as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nombre}-${isoDia(new Date())}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Una hoja de Excel desde filas de objetos: los encabezados son los nombres de
 * la pantalla y los montos van como número (se suman en Excel), no como texto
 * con "Bs".
 */
export function hoja<T>(nombre: string, columnas: [string, (fila: T) => string | number | null][], filas: T[]): HojaNueva {
  return {
    // Excel no acepta hojas de más de 31 letras ni con / \ ? * [ ].
    nombre: nombre.replace(/[\\/?*[\]:]/g, " ").slice(0, 31),
    filas: [columnas.map(([titulo]) => titulo), ...filas.map((f) => columnas.map(([, valor]) => valor(f)))],
    anchos: columnas.map(([titulo]) => Math.max(12, titulo.length + 2)),
  };
}
