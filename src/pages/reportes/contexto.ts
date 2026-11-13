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
   * Qué sucursal poner en lo que se baja (nombre del archivo y una fila arriba
   * del Excel): la elegida, "Todas las sucursales" en el consolidado de una
   * organización con 2+ locales, o la sede del usuario asignado. `null` con un
   * solo local: ahí los archivos quedan EXACTAMENTE como siempre. Opcional para
   * las pantallas y tests que arman el contexto a mano.
   */
  sucursalArchivo?: SucursalDeArchivo | null;
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

/**
 * La sucursal de lo que se baja (PLAN-SUCURSAL-TOTAL §3 etapa 6): `nombre` va
 * al archivo y a una fila de encabezado; `rotulo` es cómo lo llama el rubro
 * ("Sucursal", "Sede").
 */
export interface SucursalDeArchivo {
  nombre: string;
  rotulo: string;
}

/** Cómo se baja a Excel lo que se ve. Las hojas se arman recién al tocar el botón. */
export interface Exportacion {
  nombre: string;
  /**
   * La sucursal que lleva ESTE reporte, si no es la de la pantalla: el
   * comparativo junta todos los locales aunque arriba haya uno elegido. Sin el
   * campo (undefined) vale la de la pantalla (`DatosReporte.sucursalArchivo`);
   * `null` = no lleva ninguna.
   */
  sucursal?: SucursalDeArchivo | null;
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
  /** Ver `Exportacion.sucursal`. Sólo lo pasa un reporte que no sigue el filtro de sucursal. */
  sucursal?: SucursalDeArchivo | null,
) {
  const { registrarExportacion } = useReporte();
  const ref = useRef(armar);
  ref.current = armar;
  const refCompleta = useRef(completa);
  refCompleta.current = completa;
  const hay = armar != null;
  const conCompleta = completa != null;
  const sucursalNombre = sucursal === undefined ? undefined : (sucursal?.nombre ?? null);
  const sucursalRotulo = sucursal?.rotulo ?? "Sucursal";
  useEffect(() => {
    registrarExportacion(
      hay
        ? {
            nombre,
            ...(sucursalNombre === undefined
              ? {}
              : { sucursal: sucursalNombre === null ? null : { nombre: sucursalNombre, rotulo: sucursalRotulo } }),
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
  }, [hay, conCompleta, nombre, sucursalNombre, sucursalRotulo, registrarExportacion]);
}

/** "Sede Norte" → "sede-norte": sin acentos ni signos, para el nombre de un archivo. */
export function paraArchivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * El nombre del archivo: `estado-de-resultado-2026-11-13.xlsx`, y con una
 * sucursal `estado-de-resultado-centro-2026-11-13.xlsx` (la fecha va al final,
 * como siempre). Sin sucursal es el de toda la vida.
 */
export function nombreDeArchivo(nombre: string, dia: string, ext: string, sucursal?: SucursalDeArchivo | null): string {
  const sufijo = sucursal ? paraArchivo(sucursal.nombre) : "";
  return `${nombre}${sufijo ? `-${sufijo}` : ""}-${dia}.${ext}`;
}

/**
 * Una fila arriba de cada hoja que dice de qué sucursal es ("Sucursal: Centro",
 * "Sucursal: Todas las sucursales"). Los títulos de las columnas bajan una fila
 * y siguen en negrita y fijos (`encabezadoEn`). Sin sucursal devuelve las hojas
 * tal cual.
 */
export function hojasConSucursal(hojas: HojaNueva[], sucursal?: SucursalDeArchivo | null): HojaNueva[] {
  if (!sucursal) return hojas;
  return hojas.map((h) => ({
    ...h,
    filas: [[`${sucursal.rotulo}: ${sucursal.nombre}`], ...h.filas],
    encabezadoEn: (h.encabezadoEn ?? 0) + 1,
    // Las columnas de texto se cuentan por columna, no por fila: no cambian.
  }));
}

/**
 * Baja el libro. Con la fecha en el nombre: tres exportaciones del mismo
 * reporte no quedan como "(1)" y "(2)". Con `sucursal` (un local elegido, o el
 * consolidado de una organización con varios) el nombre y la primera fila lo
 * dicen; sin ella, nada cambia.
 */
export function bajarXlsx(nombre: string, hojas: HojaNueva[], sucursal?: SucursalDeArchivo | null) {
  const datos = crearXlsx(hojasConSucursal(hojas, sucursal));
  const blob = new Blob([datos as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreDeArchivo(nombre, isoDia(new Date()), "xlsx", sucursal);
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
