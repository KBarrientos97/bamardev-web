import { describe, expect, it } from "vitest";
import { conBotonFlotante } from "./ayuda/ayuda";
import { ctxDe, PERMISOS_NUEVOS, usuarioDe, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, tituloDe, type BloqueMenu } from "./menu";
import {
  editaNutricion,
  editaSeguimiento,
  etiquetaRol,
  puedeVer,
  rutaInicial,
  RUTA_AGENDA_PRONTO,
  RUTA_SEGUIMIENTO,
  type ContextoPermisos,
} from "./permisos";
import { RUBROS } from "./rubro";

/**
 * La evaluación de pacientes (CONTRATO-nutricion-evaluacion-22nov §1 y §4.4)
 * y el seguimiento del tratamiento (CONTRATO-nutricion-seguimiento-23nov §1 y
 * §4.3): existen sólo en NUTRICION con la feature `nutricion` (estricta).
 * «Evaluación» y, justo debajo, «Seguimiento» van en el bloque Atención; la
 * Nutricionista entra a la evaluación y el Médico al seguimiento; a los demás
 * rubros y roles no les cambia nada: ni el menú, ni la pantalla de entrada.
 */

/** Lo que trae un consultorio de nutrición: el núcleo y la evaluación. */
const PLAN_NUTRICION = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "gastos", "nutricion"];

const ctx = (rol: Plantilla, rubro: string, features = PLAN_NUTRICION, extra: string[] = []): ContextoPermisos =>
  ctxDe(rol, rubro, features, { extra });
const menu = (c: ContextoPermisos): BloqueMenu[] => construirMenu((s) => puedeVer(c, s), c.rubro);
const rutas = (c: ContextoPermisos) => aplanar(menu(c).flatMap((b) => b.nodos)).map((n) => n.item.a);

describe("NUTRICION con la feature ve «Evaluación» y puede entrar", () => {
  it("el dueño: «Evaluación» y, justo debajo, «Seguimiento» en Atención, arriba de todo", () => {
    const c = ctx("ADMIN", "NUTRICION", PLAN_NUTRICION, PERMISOS_NUEVOS);
    expect(puedeVer(c, "nutricion")).toBe(true);
    expect(puedeVer(c, "seguimiento")).toBe(true);
    const m = menu(c);
    expect(m[0].bloque).toBe("agenda");
    expect(m[0].nodos.map((n) => [n.item.a, n.item.label, n.item.titulo, n.item.icono])).toEqual([
      ["/evaluacion", "Evaluación", "Evaluación de pacientes", "evaluacion"],
      ["/seguimiento", "Seguimiento", "Seguimiento del tratamiento", "seguimiento"],
    ]);
    expect(editaNutricion(c)).toBe(true);
    expect(editaSeguimiento(c)).toBe(true);
  });

  it("la Nutricionista ve la evaluación y el seguimiento, y registra en los dos", () => {
    const c = ctx("NUTRICIONISTA", "NUTRICION");
    expect(puedeVer(c, "nutricion")).toBe(true);
    expect(rutas(c)).toEqual(["/evaluacion", "/seguimiento"]);
    expect(editaNutricion(c)).toBe(true);
    expect(editaSeguimiento(c)).toBe(true);
  });

  it("el Médico ve la evaluación (sin registrar) y carga el seguimiento", () => {
    const c = ctx("MEDICO", "NUTRICION");
    expect(rutas(c)).toEqual(["/evaluacion", "/seguimiento"]);
    expect(editaNutricion(c)).toBe(false);
    expect(editaSeguimiento(c)).toBe(true);
  });

  it("con sólo `seguimiento.ver` lo ve de sólo lectura, sin la evaluación", () => {
    const c: ContextoPermisos = { rubro: "NUTRICION", features: PLAN_NUTRICION, permisos: ["seguimiento.ver"], permisosPropios: [] };
    expect(rutas(c)).toEqual(["/seguimiento"]);
    expect(editaSeguimiento(c)).toBe(false);
    expect(rutaInicial(c)).toBe(RUTA_SEGUIMIENTO);
  });

  it("el Encargado y la Recepción no ven el seguimiento de fábrica", () => {
    for (const rol of ["SUPERVISOR", "CAJERO"] as Plantilla[]) {
      expect(puedeVer(ctx(rol, "NUTRICION"), "seguimiento"), rol).toBe(false);
      expect(rutas(ctx(rol, "NUTRICION")), rol).not.toContain("/seguimiento");
    }
  });

  it("el Encargado y la Recepción no la traen de fábrica (el dueño se la da en Roles)", () => {
    for (const rol of ["SUPERVISOR", "CAJERO"] as Plantilla[]) {
      expect(puedeVer(ctx(rol, "NUTRICION"), "nutricion"), rol).toBe(false);
      expect(rutas(ctx(rol, "NUTRICION")), rol).not.toContain("/evaluacion");
    }
    // Con el permiso de ver y sin el de registrar, la ve de sólo lectura.
    const recepcion = ctx("CAJERO", "NUTRICION", PLAN_NUTRICION, ["nutricion.ver"]);
    expect(puedeVer(recepcion, "nutricion")).toBe(true);
    expect(editaNutricion(recepcion)).toBe(false);
  });

  it("sin la feature no existe, aunque la lista de features venga vacía", () => {
    const sinFeature = PLAN_NUTRICION.filter((f) => f !== "nutricion");
    expect(puedeVer(ctx("ADMIN", "NUTRICION", sinFeature), "nutricion")).toBe(false);
    expect(puedeVer(ctx("ADMIN", "NUTRICION", sinFeature), "seguimiento")).toBe(false);
    expect(puedeVer({ rubro: "NUTRICION", features: [], permisos: ["nutricion.ver", "nutricion.editar"], permisosPropios: [] }, "nutricion")).toBe(false);
    expect(puedeVer({ rubro: "NUTRICION", features: [], permisos: ["seguimiento.ver", "seguimiento.editar"], permisosPropios: [] }, "seguimiento")).toBe(false);
  });

  it("la barra del celular dice dónde se está", () => {
    const planos = aplanar(menu(ctx("ADMIN", "NUTRICION")).flatMap((b) => b.nodos));
    expect(tituloDe(planos, "/evaluacion")).toBe("Evaluación de pacientes");
    expect(tituloDe(planos, "/evaluacion/nuevo")).toBe("Nuevo paciente");
    expect(tituloDe(planos, "/evaluacion/12")).toBe("Paciente");
    expect(tituloDe(planos, "/evaluacion/12/editar")).toBe("Editar evaluación");
    expect(tituloDe(planos, "/seguimiento")).toBe("Seguimiento del tratamiento");
    expect(tituloDe(planos, "/seguimiento/pagos")).toBe("Pagos pendientes");
    expect(tituloDe(planos, "/seguimiento/12")).toBe("Hoja de seguimiento");
  });

  it("sin botón flotante de Ayuda en el seguimiento, como en la evaluación", () => {
    for (const ruta of ["/seguimiento", "/seguimiento/pagos", "/seguimiento/12", "/evaluacion"]) expect(conBotonFlotante(ruta), ruta).toBe(false);
    expect(conBotonFlotante("/seguimientos")).toBe(true);
  });

  it("el rol se lee «Médico» y «Nutricionista» (los dos con el código PROFESIONAL): manda el nombre del rol", () => {
    const medico = usuarioDe("MEDICO");
    const nutri = usuarioDe("NUTRICIONISTA");
    expect([medico.rol, medico.rolNombre]).toEqual(["PROFESIONAL", "Médico"]);
    expect([nutri.rol, nutri.rolNombre]).toEqual(["PROFESIONAL", "Nutricionista"]);
    // Lo mismo que muestran la barra y la Ayuda: el `rolNombre` antes que la etiqueta del código.
    const comoSeLee = (u: typeof medico) => u.rolNombre?.trim() || etiquetaRol(u.rol, { tipoNegocio: "NUTRICION" });
    expect(comoSeLee(medico)).toBe("Médico");
    expect(comoSeLee(nutri)).toBe("Nutricionista");
    // Sin el nombre (una sesión vieja), el respaldo del rubro sigue siendo el de siempre.
    expect(etiquetaRol("PROFESIONAL", { tipoNegocio: "NUTRICION" })).toBe("Nutricionista");
  });
});

describe("los demás rubros no la ven, ni con la feature prendida a mano", () => {
  it.each([...RUBROS.filter((r) => r !== "NUTRICION"), "RUBRO_NUEVO"])("%s: ni el ítem ni la ruta", (rubro) => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL", "MEDICO"] as Plantilla[]) {
      // El dueño con todos los permisos de la evaluación y del seguimiento, y la feature en el plan.
      const c = ctx(rol, rubro, [...PLAN_NUTRICION, "agenda", "academia"], ["nutricion.ver", "nutricion.editar", "seguimiento.ver", "seguimiento.editar"]);
      expect(puedeVer(c, "nutricion"), `${rubro} ${rol}`).toBe(false);
      expect(puedeVer(c, "seguimiento"), `${rubro} ${rol}`).toBe(false);
      expect(rutas(c), `${rubro} ${rol}`).not.toContain("/evaluacion");
      expect(rutas(c), `${rubro} ${rol}`).not.toContain("/seguimiento");
      expect(rutaInicial(c), `${rubro} ${rol}`).not.toBe("/evaluacion");
      expect(rutaInicial(c), `${rubro} ${rol}`).not.toBe("/seguimiento");
    }
  });

  it("restaurante, farmacia y belleza con su plan de siempre: el menú y la entrada no cambian", () => {
    for (const rubro of ["RESTAURANTE", "FARMACIA", "PELUQUERIA", "BARBERIA"]) {
      for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] as Plantilla[]) {
        const c = ctx(rol, rubro, ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "agenda"]);
        expect(rutas(c), `${rubro} ${rol}`).not.toContain("/seguimiento");
        expect(rutaInicial(c), `${rubro} ${rol}`).not.toBe("/seguimiento");
      }
    }
  });
});

describe("la pantalla de entrada", () => {
  it("la Nutricionista entra directo a la evaluación (aunque ahora también cargue el seguimiento)", () => {
    expect(rutaInicial(ctx("NUTRICIONISTA", "NUTRICION"))).toBe("/evaluacion");
  });

  it("el Médico entra directo al seguimiento: su regla va antes de la de la Nutricionista", () => {
    expect(rutaInicial(ctx("MEDICO", "NUTRICION"))).toBe(RUTA_SEGUIMIENTO);
    // Con la sesión tal cual la manda el login (rol PROFESIONAL, «Médico»).
    const c: ContextoPermisos = {
      features: PLAN_NUTRICION,
      rubro: "NUTRICION",
      permisos: ["nutricion.ver", "seguimiento.ver", "seguimiento.editar"],
      permisosPropios: [],
    };
    expect(rutaInicial(c)).toBe("/seguimiento");
    // Aunque su rol (código PROFESIONAL) traiga permisos de agenda, no cae en «Mi agenda».
    expect(rutaInicial(ctx("MEDICO", "NUTRICION", [...PLAN_NUTRICION, "agenda"], ["agenda.ver:PROPIO"]))).toBe("/seguimiento");
  });

  it("la Recepción no entra al seguimiento: sigue en el punto de venta", () => {
    expect(rutaInicial(ctx("CAJERO", "NUTRICION"))).toBe("/pos");
    expect(puedeVer(ctx("CAJERO", "NUTRICION"), "seguimiento")).toBe(false);
    // Con el seguimiento prestado (y la caja), sigue entrando al punto de venta.
    expect(rutaInicial(ctx("CAJERO", "NUTRICION", PLAN_NUTRICION, ["seguimiento.ver", "seguimiento.editar"]))).toBe("/pos");
  });

  it("con la sesión tal cual la manda el login (§3.4), y no en «Tu cuenta no tiene secciones»", () => {
    // Lo que trae el login del backend para la Nutricionista, sin tocar.
    const usuario = {
      rol: "PROFESIONAL",
      arquetipo: "PROFESIONAL",
      rolNombre: "Nutricionista",
      modulos: [] as string[],
      permisos: ["nutricion.ver", "nutricion.editar"],
      permisosPropios: [] as string[],
    };
    const negocio = { tipoNegocio: "NUTRICION", features: PLAN_NUTRICION };
    // Lo mismo que arma `Inicio` (y `SinAcceso`) en AppNegocio.
    const c: ContextoPermisos = {
      features: negocio.features,
      rubro: negocio.tipoNegocio,
      permisos: usuario.permisos,
      permisosPropios: usuario.permisosPropios,
    };
    expect(rutaInicial(c)).toBe("/evaluacion");
    expect(puedeVer(c, "nutricion")).toBe(true);
    expect(editaNutricion(usuario)).toBe(true);
  });

  it("aunque su rol (código PROFESIONAL) traiga permisos de agenda, no cae en «Mi agenda»", () => {
    const conAgenda = ctx("NUTRICIONISTA", "NUTRICION", [...PLAN_NUTRICION, "agenda"], ["agenda.ver:PROPIO", "agenda.estado:PROPIO"]);
    expect(rutaInicial(conAgenda)).toBe("/evaluacion");
  });

  it("de sólo lectura también entra ahí", () => {
    expect(rutaInicial({ rubro: "NUTRICION", features: PLAN_NUTRICION, permisos: ["nutricion.ver"], permisosPropios: [] })).toBe("/evaluacion");
  });

  it("el dueño y la recepción del consultorio entran donde entraban", () => {
    expect(rutaInicial(ctx("ADMIN", "NUTRICION"))).toBe("/inventario");
    expect(rutaInicial(ctx("CAJERO", "NUTRICION"))).toBe("/pos");
    // La recepción con la evaluación prestada sigue entrando al punto de venta.
    expect(rutaInicial(ctx("CAJERO", "NUTRICION", PLAN_NUTRICION, ["nutricion.ver"]))).toBe("/pos");
  });

  it("el profesional del salón y el docente del instituto no cambian", () => {
    expect(rutaInicial(ctx("PROFESIONAL", "BARBERIA", ["agenda", "nutricion"], ["nutricion.ver"]))).toBe(RUTA_AGENDA_PRONTO);
    const docente = ctx("PROFESIONAL", "ACADEMIA", ["academia", "asistencia", "notas", "nutricion"], ["nutricion.ver"]);
    expect(rutaInicial(docente)).toBe("/academia/mis-clases");
  });
});
