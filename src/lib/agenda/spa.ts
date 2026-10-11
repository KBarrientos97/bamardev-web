import type { DetalleVentaInput } from "../../types";
import { useAuth } from "../../store/AuthContext";
import { aMinutos, deMinutos, horaNegocio } from "./horaAgenda";
import type { CarritoCita, Cita, LineaCita, RecursoDelDia, Tramo } from "./tiposAgenda";
import type { CoberturaPaquete, LineaSpa } from "./tiposSpa";

/**
 * Piezas del spa completo (agenda fase 3) que no son pantalla: qué features
 * tiene el negocio, la agenda vista por espacio, la pose partida en dos
 * bloques y el cobro con sesiones de paquete. Puras (salvo el hook) para
 * probarlas sin montar nada.
 */

/**
 * Las tres features de la fase 3, **estrictas**: sólo si el negocio las tiene
 * cargadas. Las features de siempre fallan abiertas (un negocio sin features
 * ve todo); éstas son nuevas y sólo de belleza, así que un restaurante o una
 * farmacia sin features no tienen que ver cabinas ni paquetes.
 */
export function featuresSpa(features: readonly string[] | undefined) {
  const f = features ?? [];
  return {
    espacios: f.includes("espacios"),
    paquetes: f.includes("paquetes"),
    consentimientos: f.includes("consentimientos"),
  };
}

export function useSpa() {
  const { negocio } = useAuth();
  return featuresSpa(negocio?.features);
}

// ── Espacios ─────────────────────────────────────────────────────────────────

type LineaConSpa = LineaCita & LineaSpa;

/**
 * El espacio que ocupa una línea: el suyo, o el recurso mismo si la cita se
 * agendó por cabina (el backend no repite el espacio en ese caso).
 */
export function espacioDeLinea(l: LineaConSpa, esEspacio: (id: number) => boolean): number | null {
  if (l.espacioId != null) return l.espacioId;
  return esEspacio(l.recursoId) ? l.recursoId : null;
}

/**
 * La agenda del día con una columna por espacio (cabina, camilla): cada línea
 * va a la columna de su espacio, con el nombre del profesional en el bloque.
 * Las líneas que no ocupan espacio no aparecen.
 *
 * Una cabina sin horario cargado está disponible cuando haya alguien
 * trabajando (así lo calcula el backend): se pinta con el horario de los
 * profesionales del día para que la columna no salga toda gris.
 */
export function vistaPorEspacio(
  recursos: RecursoDelDia[],
  citas: Cita[],
): { recursos: RecursoDelDia[]; citas: Cita[] } {
  const espacios = recursos.filter((r) => r.tipo === "ESPACIO");
  const ids = new Set(espacios.map((e) => e.id));
  const delEquipo = recursos.filter((r) => r.tipo === "PROFESIONAL").flatMap((r) => r.tramos);
  const jornada: Tramo[] = delEquipo.length
    ? [
        {
          desde: deMinutos(Math.min(...delEquipo.map((t) => aMinutos(t.desde)))),
          hasta: deMinutos(Math.max(...delEquipo.map((t) => aMinutos(t.hasta)))),
        },
      ]
    : [];
  return {
    recursos: espacios.map((e) => (e.tramos.length ? e : { ...e, tramos: jornada })),
    citas: citas
      .map((c) => ({
        ...c,
        lineas: c.lineas.flatMap((l) => {
          const espacio = espacioDeLinea(l, (id) => ids.has(id));
          if (espacio == null) return [];
          const conQuien = espacio === l.recursoId ? "" : ` · ${l.recurso}`;
          return [{ ...l, recursoId: espacio, servicio: `${l.servicio}${conQuien}` }];
        }),
      }))
      .filter((c) => c.lineas.length > 0),
  };
}

/**
 * La agenda "Por terapeuta" (QA S2-04): con la feature `espacios`, las
 * cabinas tienen su propia vista ("Por espacio") y acá no van como columnas
 * —salían grises, "No trabaja este día", aunque estuvieran ocupadas, y
 * empujaban a las terapeutas fuera de la pantalla—. Sin la feature, un spa
 * que agenda por cabina (§7.6) las sigue viendo: ahí la cabina ES la agenda.
 * La pose se parte en dos bloques como siempre.
 */
export function vistaPorProfesional(
  recursos: RecursoDelDia[],
  citas: Cita[],
  conEspacios: boolean,
): { recursos: RecursoDelDia[]; citas: Cita[] } {
  return {
    recursos: conEspacios ? recursos.filter((r) => r.tipo !== "ESPACIO") : recursos,
    citas: partirPorPose(citas),
  };
}

// ── Tiempo de pose ──────────────────────────────────────────────────────────

/**
 * Parte en dos bloques cada línea con pose (trabajo · pose · trabajo), para
 * que en la columna del profesional se vea libre el medio —donde puede tener
 * otra cita—. El segundo bloque lleva el id en negativo: es la misma línea, y
 * `idLineaReal` lo devuelve a su id para moverla.
 */
export function partirPorPose(citas: Cita[]): Cita[] {
  return citas.map((c) => {
    if (!c.lineas.some((l: LineaConSpa) => l.poseDesde && l.poseHasta)) return c;
    return {
      ...c,
      lineas: c.lineas.flatMap((l: LineaConSpa) =>
        l.poseDesde && l.poseHasta
          ? [
              { ...l, fin: l.poseDesde },
              {
                ...l,
                id: -l.id,
                inicio: l.poseHasta,
                servicio: `${l.servicio} · después de la pose`,
              },
            ]
          : [l],
      ),
    };
  });
}

export function idLineaReal(id: number): number {
  return Math.abs(id);
}

/** "Pose 14:30 – 15:10" para el detalle de la cita. */
export function textoPose(l: LineaSpa): string | null {
  if (!l.poseDesde || !l.poseHasta) return null;
  return `Pose ${horaNegocio(l.poseDesde)} – ${horaNegocio(l.poseHasta)}: queda libre`;
}

/**
 * La cabina y la pose de una cita en una línea, para las listas (Mi agenda,
 * Hoy): "Cabina 1 · pose 11:45–12:15". Sin esto, un facial con pose y la
 * depilación metida en esa pose parecían dos citas encimadas, y la terapeuta
 * no sabía a qué cabina ir sin abrir cada una (QA S2-14). Null si la cita no
 * ocupa cabina ni tiene pose.
 */
export function textoCabinaYPose(lineas: LineaConSpa[]): string | null {
  const partes = lineas
    .map((l) => {
      const pose = l.poseDesde && l.poseHasta ? `pose ${horaNegocio(l.poseDesde)}–${horaNegocio(l.poseHasta)}` : "";
      return [l.espacio ?? "", pose].filter(Boolean).join(" · ");
    })
    .filter(Boolean);
  return partes.length ? [...new Set(partes)].join("; ") : null;
}

// ── Firma ───────────────────────────────────────────────────────────────────

/**
 * Píxeles reales por píxel CSS del lienzo de firma (QA S2-16): los de la
 * pantalla, entre 1 y 2 (más de 2× pasaría el tope del PNG en el backend).
 */
export function densidadDeFirma(dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio): number {
  return Math.min(2, Math.max(1, Number.isFinite(dpr) && dpr > 0 ? dpr : 1));
}

// ── Paquetes en el cobro de la cita ─────────────────────────────────────────

type LineaCarrito = CarritoCita["lineas"][number] & { paquete?: CoberturaPaquete | null };

/** Las líneas de la cita que se pagan con una sesión de paquete. */
export function lineasConPaquete(cita: CarritoCita | null): LineaCarrito[] {
  return (cita?.lineas ?? []).filter((l: LineaCarrito) => !!l.paquete);
}

/** La cita sin las líneas que cubre un paquete: lo que el POS carga al carrito. */
export function sinLineasConPaquete(cita: CarritoCita): CarritoCita {
  return { ...cita, lineas: cita.lineas.filter((l: LineaCarrito) => !l.paquete) };
}

/** La misma cita, pero cobrando todo (la clienta no quiere usar el paquete). */
export function sinUsarPaquetes(cita: CarritoCita): CarritoCita {
  return { ...cita, lineas: cita.lineas.map((l) => ({ ...l, paquete: null })) };
}

/**
 * Las líneas de venta de las sesiones de paquete: van a precio 0 con
 * `usarPaquete` y su profesional (la comisión sigue siendo suya).
 */
export function detallesDePaquete(cita: CarritoCita | null): DetalleVentaInput[] {
  return lineasConPaquete(cita).map((l) => ({
    productoId: l.productoId,
    cantidad: 1,
    precio: 0,
    ...(l.recursoId != null ? { recursoId: l.recursoId } : {}),
    usarPaquete: true,
  }));
}
