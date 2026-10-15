import { describe, expect, it } from "vitest";
import { ctxDe, PERMISOS_NUEVOS, type Plantilla } from "../test/sesiones";
import { aplanar, construirMenu, type Bloque, type BloqueMenu } from "./menu";
import { puedeVer } from "./permisos";
import { RUBROS } from "./rubro";

/**
 * La división del menú es la misma en todos los rubros (11-oct-2026: la de la
 * barbería, que Kevin pidió para todos). Cada rubro ve lo suyo —eso lo decide
 * `permisos.ts`—, pero los bloques y los grupos salen en el mismo orden.
 *
 * Recorre `RUBROS` y uno inventado: un rubro nuevo entra solo a estos tests y
 * nace con la división. Si alguno falla después de agregar una pantalla, casi
 * seguro quedó suelta al final de Administración: va dentro del grupo de su
 * tema (ver `ITEMS` en menu.ts).
 */

/**
 * Todas las features que abren una pantalla del menú: el dueño con el plan
 * más grande. Que un rubro vea algo que el backend no le da (mesas de salón en
 * un minimarket) no importa acá: lo que se mira es el orden, no el contenido.
 */
const TODAS = [
  "pos",
  "caja",
  "catalogo",
  "usuarios",
  "inventario",
  "insumos",
  "multi_almacen",
  "reportes",
  "gastos",
  "fiado",
  "delivery",
  "salon",
  "billar",
  "lotes",
  "encargos",
  "agenda",
  "clientes",
  "reserva_online",
  "comisiones",
  "propinas",
  "gift_cards",
  "consumo_servicio",
  "pagina_publica",
  "enlaces_cortos",
  "asistente_pagina",
  "promociones",
  "clientes_retencion",
  // Educación: sólo compatibles con EDUCACION en el backend; acá van para
  // todos porque lo que se mira es el orden.
  "academia",
  "asistencia",
  "notas",
  "planilla_docente",
  "preinscripcion_online",
];

const BLOQUES: Bloque[] = ["agenda", "vender", "stock", "administracion"];
// Reportes va entre los grupos, de primer nivel: junta los de todas las
// funcionalidades y ya no cuelga de Finanzas (13-oct-2026).
const GRUPOS = ["Equipo", "Finanzas", "Reportes", "Marketing"];
/** Lo que se arma una vez: suelto, debajo de los grupos y en este orden. */
const SUELTOS = ["Mesas del salón", "Mesas de billar", "Configuración"];

function menu(rol: Plantilla, rubro: string): BloqueMenu[] {
  const c = ctxDe(rol, rubro, TODAS, { extra: rol === "ADMIN" ? PERMISOS_NUEVOS : [] });
  return construirMenu((s) => puedeVer(c, s), rubro);
}

const administracion = (m: BloqueMenu[]) =>
  m.find((b) => b.bloque === "administracion")?.nodos.map((n) => n.item.label) ?? [];

describe.each([...RUBROS, "RUBRO_NUEVO"])("menú de %s", (rubro) => {
  it("los bloques van en el orden de siempre", () => {
    const orden = menu("ADMIN", rubro).map((b) => b.bloque);
    expect(orden).toEqual(BLOQUES.filter((b) => orden.includes(b)));
  });

  it("Administración: Equipo, Finanzas, Reportes y Marketing, y abajo lo que se arma una vez", () => {
    const items = administracion(menu("ADMIN", rubro));
    expect(items.slice(0, GRUPOS.length)).toEqual(GRUPOS);
    // Nada suelto fuera de esa lista: una pantalla nueva va en su grupo.
    const resto = items.slice(GRUPOS.length);
    expect(resto).toEqual(SUELTOS.filter((s) => resto.includes(s)));
  });

  it("ningún rol ve un grupo con una sola pantalla adentro", () => {
    // Al cajero, con sólo "Cuentas por cobrar", una carpeta "Finanzas" le
    // agregaría un clic para llegar a lo único que tiene.
    for (const rol of ["ADMIN", "SUPERVISOR", "CAJERO"] as Plantilla[]) {
      for (const n of aplanar(menu(rol, rubro).flatMap((b) => b.nodos))) {
        if (n.hijos.length) expect(n.hijos.length, `${rol}: ${n.item.label}`).toBeGreaterThan(1);
      }
    }
  });

  it("hay UNA sola entrada a reportes, suelta, y ningún grupo esconde otra", () => {
    const todos = aplanar(menu("ADMIN", rubro).flatMap((b) => b.nodos));
    const reportes = todos.filter((n) => n.item.a.startsWith("/reportes"));
    expect(reportes.map((n) => [n.item.a, n.item.label, n.hijos.length])).toEqual([["/reportes", "Reportes", 0]]);
    const finanzas = todos.find((n) => n.item.label === "Finanzas");
    expect(finanzas?.hijos.map((h) => h.item.label) ?? []).not.toContain("Reportes");
  });
});

/**
 * El instituto (PLAN-ACADEMIAS §4): lo del día en Atención, Cobranza en
 * Finanzas y las carreras en Configuración, con el vocabulario del perfil.
 * Nada de lo que no existe en el rubro: ni mesas, ni insumos, ni cuentas por
 * cobrar (lo que se debe son cuotas).
 */
describe("menú de ACADEMIA", () => {
  const SOLO_ACADEMIA = ["pos", "caja", "catalogo", "usuarios", "inventario", "multi_almacen", "reportes",
    "gastos", "fiado", "salon", "insumos", "pagina_publica", "academia", "asistencia", "notas",
    "preinscripcion_online"];
  const labels = (rol: Plantilla) => {
    const c = ctxDe(rol, "ACADEMIA", SOLO_ACADEMIA, { extra: rol === "ADMIN" ? PERMISOS_NUEVOS : [] });
    return construirMenu((s) => puedeVer(c, s), "ACADEMIA");
  };
  const todos = (m: BloqueMenu[]) => aplanar(m.flatMap((b) => b.nodos)).map((n) => n.item.label);

  it("la dirección ve Hoy, Grupos, Alumnos y Preinscripciones en Atención", () => {
    const atencion = labels("ADMIN").find((b) => b.bloque === "agenda")?.nodos.map((n) => n.item.label);
    expect(atencion).toEqual(["Hoy", "Grupos", "Alumnos", "Preinscripciones"]);
  });

  it("Cobranza en Finanzas y las carreras en Configuración; sin mesas ni cuentas por cobrar", () => {
    const m = labels("ADMIN");
    const nombres = todos(m);
    expect(nombres).toContain("Cobranza");
    expect(nombres).toContain("Carreras y planes");
    expect(nombres).toContain("Ajustes académicos");
    expect(nombres).toContain("Sedes");
    for (const no of ["Cuentas por cobrar", "Mesas del salón", "Insumos", "Billar"]) {
      expect(nombres).not.toContain(no);
    }
    const config = aplanar(m.flatMap((b) => b.nodos)).find((n) => n.item.label === "Configuración");
    expect(config?.hijos.map((h) => h.item.label)).toEqual(["Carreras y planes", "Ajustes académicos"]);
  });

  it("el vocabulario del perfil nombra las cosas", () => {
    const c = ctxDe("ADMIN", "ACADEMIA", SOLO_ACADEMIA);
    const m = construirMenu((s) => puedeVer(c, s), "ACADEMIA", { carrera: "curso", clientes: "estudiantes" });
    const nombres = todos(m);
    expect(nombres).toContain("Cursos y planes");
    expect(nombres).toContain("Estudiantes");
  });

  it("la secretaría no configura ni ve Configuración; el docente ve sólo sus grupos", () => {
    const secretaria = todos(labels("CAJERO"));
    expect(secretaria).toEqual(expect.arrayContaining(["Hoy", "Grupos", "Alumnos", "Cobranza"]));
    expect(secretaria).not.toContain("Carreras y planes");
    const docente = todos(labels("PROFESIONAL"));
    expect(docente).toContain("Grupos");
    expect(docente).not.toContain("Hoy");
    expect(docente).not.toContain("Cobranza");
  });
});
