import { describe, expect, it } from "vitest";
import type { Feature, Modulo, Rol } from "../types";
import { aplanar, construirMenu, esMenuDeAgenda, tituloDe } from "./menu";
import { puedeVer } from "./permisos";

/**
 * El menú del salón: la agenda en un grupo y Administración agrupada por tema
 * (Equipo, Finanzas, Marketing). Los demás rubros quedan como estaban.
 */

const MODULOS: Modulo[] = ["INVENTARIO", "POS", "CAJA", "REPORTES", "USUARIOS", "CONFIG"];
const SALON: Feature[] = [
  "pos",
  "caja",
  "catalogo",
  "usuarios",
  "inventario",
  "reportes",
  "gastos",
  "fiado",
  "agenda",
  "clientes",
  "reserva_online",
  "comisiones",
  "propinas",
  "gift_cards",
  "pagina_publica",
  "enlaces_cortos",
  "promociones",
  "clientes_retencion",
];

const ctx = (rol: Rol, rubro: string, features: Feature[] = SALON) => ({ rol, rubro, features, modulos: MODULOS });

function menu(rol: Rol, rubro: string, features: Feature[] = SALON) {
  const c = ctx(rol, rubro, features);
  return construirMenu((s) => puedeVer(c, s), rubro, undefined, esMenuDeAgenda(rubro, features));
}

const admin = (m: ReturnType<typeof menu>) => m.find((b) => b.bloque === "administracion")?.nodos ?? [];

describe("menú del salón", () => {
  it("se arma así sólo con la feature y el rubro de belleza", () => {
    expect(esMenuDeAgenda("BARBERIA", SALON)).toBe(true);
    expect(esMenuDeAgenda("BARBERIA", ["pos"])).toBe(false);
    // Una pollería con `agenda` prendida por error no cambia de menú.
    expect(esMenuDeAgenda("RESTAURANTE", SALON)).toBe(false);
  });

  it("Administración va agrupada por tema y Configuración queda suelta", () => {
    const nodos = admin(menu("ADMIN", "BARBERIA"));
    expect(nodos.map((n) => n.item.label)).toEqual(["Equipo", "Finanzas", "Marketing", "Configuración"]);
    const hijos = Object.fromEntries(nodos.map((n) => [n.item.label, n.hijos.map((h) => h.item.label)]));
    expect(hijos.Equipo).toEqual(["Personal", "Usuarios", "Comisiones", "Propinas"]);
    expect(hijos.Finanzas).toEqual(["Cuentas por cobrar", "Gastos operativos", "Reportes"]);
    expect(hijos.Marketing).toEqual(["Mi página", "Mis enlaces", "Promociones", "Clientes que no vuelven"]);
  });

  it("PER-09: en la barra de íconos, Clientes y Clientes que no vuelven no comparten ícono", () => {
    const todos = aplanar(menu("ADMIN", "BARBERIA").flatMap((b) => b.nodos));
    const icono = (label: string) => todos.find((n) => n.item.label === label)?.item.icono;
    expect(icono("Clientes")).toBe("userHeart");
    expect(icono("Clientes que no vuelven")).toBe("userX");
  });

  it("VER-06: Clientes, Personal, Usuarios y las pantallas de plata no repiten ícono", () => {
    const todos = aplanar(menu("ADMIN", "BARBERIA").flatMap((b) => b.nodos));
    const icono = (label: string) => todos.find((n) => n.item.label === label && n.item.seccion)?.item.icono;
    const personas = ["Clientes", "Personal", "Usuarios"].map(icono);
    const plata = ["Comisiones", "Propinas", "Cuentas por cobrar", "Promociones"].map(icono);
    expect(personas.every(Boolean) && plata.every(Boolean)).toBe(true);
    expect(new Set(personas).size).toBe(3);
    expect(new Set(plata).size).toBe(4);
  });

  it("las propinas pasan de Vender a Equipo", () => {
    const m = menu("ADMIN", "BARBERIA");
    const vender = m.find((b) => b.bloque === "vender")?.nodos.map((n) => n.item.label) ?? [];
    expect(vender).not.toContain("Propinas");
    expect(aplanar(admin(m)).map((n) => n.item.label)).toContain("Propinas");
  });

  it("un grupo con un solo hijo visible no se dibuja: el hijo va suelto", () => {
    const sinMarketing = SALON.filter((f) => !["enlaces_cortos", "promociones", "clientes_retencion"].includes(f));
    const nodos = admin(menu("ADMIN", "BARBERIA", sinMarketing));
    expect(nodos.map((n) => n.item.label)).toContain("Mi página");
    expect(nodos.map((n) => n.item.label)).not.toContain("Marketing");
  });

  it("el grupo lleva a la pantalla de su primer hijo visible y es título", () => {
    const equipo = admin(menu("ADMIN", "BARBERIA")).find((n) => n.item.label === "Equipo");
    expect(equipo?.item.a).toBe("/personal");
    expect(equipo?.esTitulo).toBe(true);
    // Los ids no chocan con los de sus hijos (son la clave de "abierto").
    const ids = aplanar(menu("ADMIN", "BARBERIA").flatMap((b) => b.nodos)).map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("al restaurante no le cambia nada", () => {
    const base: Feature[] = ["pos", "caja", "catalogo", "usuarios", "inventario", "reportes", "gastos", "fiado"];
    const c = ctx("ADMIN", "RESTAURANTE", base);
    const plano = construirMenu((s) => puedeVer(c, s), "RESTAURANTE");
    expect(menu("ADMIN", "RESTAURANTE", base)).toEqual(plano);
    expect(admin(plano).every((n) => n.hijos.length === 0)).toBe(true);
  });
});

describe("nombres dentro del grupo Agenda", () => {
  it("dentro del grupo van cortos y la cabecera usa el nombre completo", () => {
    const m = menu("ADMIN", "BARBERIA");
    const agenda = m[0].nodos.find((n) => n.item.label === "Agenda");
    const hijos = agenda?.hijos.map((h) => h.item.label) ?? [];
    expect(hijos).toContain("Reportes");
    expect(hijos).toContain("Configuración");
    expect(hijos).not.toContain("Reportes de agenda");
    const planos = aplanar(m.flatMap((b) => b.nodos));
    expect(tituloDe(planos, "/reportes-agenda")).toBe("Reportes de agenda");
    expect(tituloDe(planos, "/configuracion/agenda")).toBe("Configuración de agenda");
    expect(tituloDe(planos, "/reportes")).toBe("Reportes");
  });
});
