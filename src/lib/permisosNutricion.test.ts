import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, tituloDe, type BloqueMenu } from "./menu";
import { editaNutricion, puedeVer, rutaInicial, RUTA_AGENDA_PRONTO, type ContextoPermisos } from "./permisos";
import { RUBROS } from "./rubro";

/**
 * La evaluación de pacientes (CONTRATO-nutricion-evaluacion-22nov §1 y §4.4):
 * existe sólo en NUTRICION con la feature `nutricion` (estricta). El ítem
 * «Evaluación» va en el bloque Atención; la Nutricionista entra directo ahí;
 * a los demás rubros y roles no les cambia nada: ni el menú, ni la pantalla
 * de entrada.
 */

/** Lo que trae un consultorio de nutrición: el núcleo y la evaluación. */
const PLAN_NUTRICION = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "gastos", "nutricion"];

const ctx = (rol: Plantilla, rubro: string, features = PLAN_NUTRICION, extra: string[] = []): ContextoPermisos =>
  ctxDe(rol, rubro, features, { extra });
const menu = (c: ContextoPermisos): BloqueMenu[] => construirMenu((s) => puedeVer(c, s), c.rubro);
const rutas = (c: ContextoPermisos) => aplanar(menu(c).flatMap((b) => b.nodos)).map((n) => n.item.a);

describe("NUTRICION con la feature ve «Evaluación» y puede entrar", () => {
  it("el dueño: «Evaluación» en Atención, arriba de todo", () => {
    const c = ctx("ADMIN", "NUTRICION", PLAN_NUTRICION, PERMISOS_NUEVOS);
    expect(puedeVer(c, "nutricion")).toBe(true);
    const m = menu(c);
    expect(m[0].bloque).toBe("agenda");
    expect(m[0].nodos.map((n) => [n.item.a, n.item.label, n.item.titulo])).toEqual([["/evaluacion", "Evaluación", "Evaluación de pacientes"]]);
    expect(editaNutricion(c)).toBe(true);
  });

  it("la Nutricionista ve sólo la evaluación, y registra", () => {
    const c = ctx("NUTRICIONISTA", "NUTRICION");
    expect(puedeVer(c, "nutricion")).toBe(true);
    expect(rutas(c)).toEqual(["/evaluacion"]);
    expect(editaNutricion(c)).toBe(true);
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
    expect(puedeVer({ rubro: "NUTRICION", features: [], permisos: ["nutricion.ver", "nutricion.editar"], permisosPropios: [] }, "nutricion")).toBe(false);
  });

  it("la barra del celular dice dónde se está", () => {
    const planos = aplanar(menu(ctx("ADMIN", "NUTRICION")).flatMap((b) => b.nodos));
    expect(tituloDe(planos, "/evaluacion")).toBe("Evaluación de pacientes");
    expect(tituloDe(planos, "/evaluacion/nuevo")).toBe("Nuevo paciente");
    expect(tituloDe(planos, "/evaluacion/12")).toBe("Paciente");
    expect(tituloDe(planos, "/evaluacion/12/editar")).toBe("Editar evaluación");
  });
});

describe("los demás rubros no la ven, ni con la feature prendida a mano", () => {
  it.each([...RUBROS.filter((r) => r !== "NUTRICION"), "RUBRO_NUEVO"])("%s: ni el ítem ni la ruta", (rubro) => {
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO", "PROFESIONAL"] as Plantilla[]) {
      // El dueño con todos los permisos de la evaluación y la feature en el plan.
      const c = ctx(rol, rubro, [...PLAN_NUTRICION, "agenda", "academia"], ["nutricion.ver", "nutricion.editar"]);
      expect(puedeVer(c, "nutricion"), `${rubro} ${rol}`).toBe(false);
      expect(rutas(c), `${rubro} ${rol}`).not.toContain("/evaluacion");
      expect(rutaInicial(c), `${rubro} ${rol}`).not.toBe("/evaluacion");
    }
  });
});

describe("la pantalla de entrada", () => {
  it("la Nutricionista entra directo a la evaluación", () => {
    expect(rutaInicial(ctx("NUTRICIONISTA", "NUTRICION"))).toBe("/evaluacion");
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
