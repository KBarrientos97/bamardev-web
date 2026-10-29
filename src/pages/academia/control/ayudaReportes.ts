import type { TextoAyuda } from "../../../components/AyudaCalculo";

/**
 * "Cómo se calcula" de cada tarjeta de los Reportes del instituto (L5,
 * 28-oct), con las palabras de la academia: cuotas, módulos, días de espera.
 * El componente es el mismo de Reportes de ventas (`AyudaCalculo`).
 */
export function ayudaInstituto(diasEspera: number | undefined) {
  const espera = diasEspera != null ? `${diasEspera} ${diasEspera === 1 ? "día" : "días"}` : "los días de espera";
  return {
    estudiantes: {
      queMuestra: "Por día, semana o mes: cuántos estudiantes ingresaron, cuánto se cobró en clases y cómo están pagando las mensualidades que vencían en ese tramo.",
      deDonde: `Ingresaron cuenta las inscripciones nuevas por la fecha en que se inscribieron. Cobrado en clases suma las cuotas cobradas en ese tramo, netas de descuento. Al día, por cobrar y en mora miran las cuotas que VENCÍAN en el tramo y dicen cómo están HOY: pagadas, todavía sin vencer o dentro de la espera de ${espera}, o con la espera pasada. Ahí cada estudiante cuenta una vez por tramo, con su cuota más atrasada.`,
      incluye: ["Las inscripciones del mostrador y las de la página que ya se aceptaron.", "Los abonos y los pagos completos, en Cobrado en clases."],
      noIncluye: [
        "Las inscripciones importadas de otro sistema, las preinscripciones sin aceptar y las descartadas.",
        "Las ventas de productos (poleras, kits): están en Reportes de ventas.",
        "En al día, por cobrar y en mora: las cuotas anuladas y las de inscripciones retiradas.",
      ],
    },
    cursos: {
      queMuestra: "Cuántos estudiantes activos tiene cada curso hoy, contra el cupo de sus grupos, y cuánto se cobró del curso en el período.",
      deDonde: "Activos son los inscritos en grupos que ya empezaron y no terminaron. Por empezar, los de grupos que todavía no arrancaron. Lo cobrado son las cuotas del curso cobradas en el período; lo vencido, lo que se debe hoy de cuotas ya vencidas.",
      noIncluye: ["En los activos: los grupos cancelados o terminados, los retirados y las preinscripciones."],
    },
    asistencia: {
      queMuestra: "Qué parte de las clases del período vinieron los estudiantes, por grupo y en todo el instituto.",
      deDonde: "Presentes y tardes dividido por todas las asistencias marcadas en el período, sin contar las justificadas.",
      noIncluye: ["Las clases sin lista pasada.", "Las faltas justificadas: no cuentan ni a favor ni en contra."],
    },
    mora: {
      queMuestra: "Cómo están pagando hoy los estudiantes inscritos (también los de grupos que todavía no empezaron): al día, en la espera o en mora.",
      deDonde: `Es el mismo semáforo que ve el docente. En mora: debe una cuota que venció hace más de ${espera}. En la espera: debe, pero venció hace ${espera} o menos. Un estudiante en dos cursos cuenta una vez, con el peor color. Lo vencido suma lo que se debe de las cuotas ya vencidas.`,
      noIncluye: ["Las cuotas que todavía no vencieron: no son deuda todavía."],
    },
  } satisfies Record<string, TextoAyuda>;
}
