import { RUTA_CALENDARIO, RUTA_CURSOS, RUTA_MI_PAGINA } from "./inscripcionEnLinea";
import type { AjustesAcademia, Carrera, Docente, GrupoResumen, Sede } from "./tipos";
import { RUTA_SEDES } from "./vista";

/**
 * C1 (auditoría 26-oct): «Primeros pasos» de un instituto nuevo. Con todo
 * vacío no se sabe el orden (sede → franjas → curso → docente → grupo →
 * página); esta función dice, con los datos que las pantallas ya cargan, cuáles
 * de las seis casillas están hechas. Es pura para probarla sin pantalla.
 */

export type ClavePaso = "sede" | "franjas" | "curso" | "docente" | "grupo" | "pagina" | "qr" | "pin";

/**
 * Los dos requisitos del mostrador (ronda 2, R5): sin el QR cargado el cobro por
 * QR no tiene qué mostrar, y sin el PIN del administrador la recepción no puede
 * dar un descuento ni anular. Se suman si el plan los trae y se pudo saber su
 * estado; no cuentan para dar la lista por «completa para siempre».
 */
export const PASOS_DEL_MOSTRADOR: ClavePaso[] = ["qr", "pin"];

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
  /** Las sedes de `GET /academia/sedes` (con sus conteos): ya no depende de `almacenes.administrar`. */
  sedes: Sede[] | null;
  ajustes: AjustesAcademia | null;
  cursos: Carrera[] | null;
  docentes: Docente[] | null;
  grupos: GrupoResumen[] | null;
  /** Las features del plan: la página en línea es un paso sólo si el plan la trae. */
  features: string[] | undefined;
  /** ¿Hay un QR de cobro cargado? `null`/ausente: no se pudo saber o no le toca cargarlo. */
  qrCargado?: boolean | null;
  /** ¿El administrador tiene PIN de autorización? `null`/ausente: no se pudo saber o no le toca. */
  pinPuesto?: boolean | null;
  palabras: { carrera: string; docente: string; sede: string; Sede: string; Sedes: string };
}

export { RUTA_SEDES };
export const RUTA_PERSONAL = "/personal";
export const RUTA_QR_COBRO = "/configuracion/qr-cobro";
export const RUTA_USUARIOS = "/usuarios";

/**
 * Los datos de «Primeros pasos» se piden al entrar; cuando una pantalla guarda
 * algo que cambia un paso (una sede, un curso, un grupo) avisa con este evento
 * y la lista se vuelve a leer sin salir de la pantalla (ronda 2, R3).
 */
export const EVENTO_PRIMEROS_PASOS = "primeros-pasos-cambiaron";
export const avisarPrimerosPasos = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_PRIMEROS_PASOS));
};

/**
 * A dónde lleva un paso de sedes. Con una sola sede, la pantalla ya la muestra
 * entera; con varias, el enlace abre la primera que falta (`?sede=ID&ver=…`).
 */
function rutaDeSedes(sedes: Sede[], falta: Sede | undefined, ver: "franjas" | "editar") {
  return sedes.length > 1 && falta ? `${RUTA_SEDES}?sede=${falta.id}&ver=${ver}` : RUTA_SEDES;
}

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
    // `GET /academia/sedes` ya trae sólo las sedes activas (no depósitos).
    const sinDireccion = d.sedes.find((s) => !lleno(s.direccion));
    pasos.push({
      clave: "sede",
      titulo: `${p.Sede} con sus datos`,
      detalle: `Poné el nombre y la dirección de tu ${p.sede}.`,
      hecho: d.sedes.some((s) => lleno(s.nombre) && lleno(s.direccion)),
      a: rutaDeSedes(d.sedes, sinDireccion, "editar"),
      accion: `Ir a ${p.Sedes}`,
    });
    // Las franjas son de cada sede (C5): alcanza con que una tenga (el conteo
    // incluye las «de todas las sedes»), que es lo que hace andar el calendario.
    pasos.push({
      clave: "franjas",
      titulo: "Franjas horarias",
      detalle: `Son las filas del calendario: en qué horarios das clase. Se cargan en cada ${p.sede}.`,
      hecho: d.sedes.some((s) => s.franjas > 0),
      a: rutaDeSedes(d.sedes, d.sedes.find((s) => s.franjas === 0), "franjas"),
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
  // Y sólo si el plan trae también la página pública: el paso lleva a /mi-pagina, que la pide
  // (`pagina_publica`); sin ella el enlace rebotaba (ronda 2).
  if (d.ajustes && conPaginaEnLinea(d.features) && d.ajustes.paginaPublicada !== undefined) {
    pasos.push({
      clave: "pagina",
      titulo: "Página de inscripción en línea publicada",
      detalle: "Para que la gente se inscriba desde el celular.",
      hecho: d.ajustes.paginaPublicada === true,
      a: RUTA_MI_PAGINA,
      accion: "Ir a Mi página",
    });
  }
  if (d.qrCargado != null && d.features?.includes("pago_qr_mixto")) {
    pasos.push({
      clave: "qr",
      titulo: "El QR de cobro cargado",
      detalle: "Es el que ve el estudiante al pagar por QR. Lo subís una vez y lo reciben todas las cajas.",
      hecho: d.qrCargado,
      a: RUTA_QR_COBRO,
      accion: "Cargar el QR",
    });
  }
  if (d.pinPuesto != null && d.features?.includes("autorizacion_pin")) {
    pasos.push({
      clave: "pin",
      titulo: "Tu PIN de autorización",
      detalle: "Con tu PIN autorizás los descuentos y las anulaciones de la recepción. Abrí tu usuario y tocá «Asignar PIN».",
      hecho: d.pinPuesto,
      a: RUTA_USUARIOS,
      accion: "Poner mi PIN",
    });
  }
  return pasos;
}

/**
 * Cuántos pasos debería haber con todo a la vista: los cinco de siempre y, si el
 * plan trae la inscripción en línea, el de la página. Menos que eso quiere decir
 * que algo no se pudo saber (un permiso, un corte).
 */
export const pasosEsperados = (features: string[] | undefined) => 5 + (conPaginaEnLinea(features) ? 1 : 0);

/** La inscripción en línea necesita la página pública donde se publica (`/mi-pagina`). */
const conPaginaEnLinea = (features: string[] | undefined) => !!features?.includes("preinscripcion_online") && !!features.includes("pagina_publica");

/** Los pasos de siempre, sin el QR ni el PIN (los que dicen si algo "no se pudo saber"). */
export const pasosBase = (pasos: PasoInicial[]) => pasos.filter((x) => !PASOS_DEL_MOSTRADOR.includes(x.clave));

/** ¿Están todas las casillas? (y hay alguna: sin datos no se declara «completo»). */
export const completo = (pasos: PasoInicial[]) => pasos.length > 0 && pasos.every((x) => x.hecho);

/** Para el contador «3 de 6». */
export const cuantosHechos = (pasos: PasoInicial[]) => pasos.filter((x) => x.hecho).length;
