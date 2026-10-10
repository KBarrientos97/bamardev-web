import { beforeEach, describe, expect, it } from "vitest";
import { CUPO_ILIMITADO, cupoEmprendedor } from "../test/cupoFixtures";
import {
  aplicaCupo,
  avisosDe,
  cupoDelError,
  esCupoAgotado,
  fmtCreditos,
  marcarMostrado,
  proyectar,
  sinMostrar,
  textoChip,
  tituloAgotado,
} from "./cupo";

/**
 * La proyección local de §5.1: decide si se manda la venta o la cita, o si
 * se abre la hoja de compra. El servidor es la verdad; esto evita mandar lo
 * que ya se sabe que va a rebotar.
 */

const HOY = "2026-10-09";

beforeEach(() => localStorage.clear());

describe("aplicaCupo: sólo el Emprendedor tiene algo que controlar", () => {
  it("sin cupo, o con ilimitado (Básico, Profesional), no aplica", () => {
    expect(aplicaCupo(null)).toBe(false);
    expect(aplicaCupo(undefined)).toBe(false);
    expect(aplicaCupo(CUPO_ILIMITADO)).toBe(false);
    expect(aplicaCupo(cupoEmprendedor())).toBe(true);
  });

  it("sin cupo que controlar la proyección deja pasar todo", () => {
    expect(proyectar(CUPO_ILIMITADO, "VENTA", { hoy: HOY }).puede).toBe(true);
    expect(proyectar(null, "CITA", { hoy: HOY }).puede).toBe(true);
    expect(avisosDe(CUPO_ILIMITADO, "VENTA", HOY)).toEqual([]);
  });
});

describe("proyectar", () => {
  it("con lugar en el cupo se puede, sin créditos", () => {
    const p = proyectar(cupoEmprendedor({ ventas: 32 }), "VENTA", { hoy: HOY });
    expect(p).toMatchObject({ usadas: 32, limite: 50, restante: 18, puede: true, usaCreditos: false });
  });

  it("con el cupo lleno, se puede mientras alcancen los créditos", () => {
    expect(proyectar(cupoEmprendedor({ ventas: 50, saldo: 1 }), "VENTA", { hoy: HOY }).puede).toBe(true);
    expect(proyectar(cupoEmprendedor({ ventas: 50, saldo: 0 }), "VENTA", { hoy: HOY }).puede).toBe(false);
  });

  it("una cita fuera del cupo cuesta 2 créditos: con 1 no alcanza", () => {
    const sinLugar = { citas: 50, ventas: 50 };
    expect(proyectar(cupoEmprendedor({ ...sinLugar, saldo: 1 }), "CITA", { hoy: HOY }).puede).toBe(false);
    expect(proyectar(cupoEmprendedor({ ...sinLugar, saldo: 1 }), "VENTA", { hoy: HOY }).puede).toBe(true);
    expect(proyectar(cupoEmprendedor({ ...sinLugar, saldo: 2 }), "CITA", { hoy: HOY })).toMatchObject({
      puede: true,
      costo: 2,
    });
  });

  it("con saldo negativo (la cola de Android lo dejó así) no se puede", () => {
    const p = proyectar(cupoEmprendedor({ ventas: 50, saldo: -3 }), "VENTA", { hoy: HOY });
    expect(p.puede).toBe(false);
  });

  it("un snapshot de ayer arranca el día en 0 y conserva el saldo", () => {
    const ayer = cupoEmprendedor({ fecha: "2026-10-08", ventas: 50, citas: 50, saldo: 7 });
    expect(proyectar(ayer, "VENTA", { hoy: HOY })).toMatchObject({ usadas: 0, restante: 50, saldo: 7, puede: true });
    expect(proyectar(ayer, "CITA", { hoy: HOY })).toMatchObject({ usadas: 0, puede: true });
  });

  it("las ventas pendientes de la cola descuentan cupo y luego saldo (Android; la web pasa 0)", () => {
    const p = proyectar(cupoEmprendedor({ ventas: 48, saldo: 3 }), "VENTA", { hoy: HOY, pendientes: 5 });
    // 48 + 5 = 53: se pasó en 3 y esas 3 ya se comieron los 3 créditos.
    expect(p).toMatchObject({ restante: 0, saldo: 0, puede: false });
  });

  it("las citas no tienen pendientes (no son offline)", () => {
    const p = proyectar(cupoEmprendedor({ citas: 48 }), "CITA", { hoy: HOY, pendientes: 5 });
    expect(p.restante).toBe(2);
  });

  it("una unidad sin límite (null) siempre se puede", () => {
    const p = proyectar(cupoEmprendedor({ limiteCitas: null, citas: 999 }), "CITA", { hoy: HOY });
    expect(p).toMatchObject({ limite: null, puede: true, usaCreditos: false });
  });
});

describe("textos", () => {
  it('el chip dice "Hoy 32/50 · Créditos 240" y en la agenda "Citas hoy"', () => {
    const c = cupoEmprendedor({ ventas: 32, citas: 12, saldo: 240 });
    expect(textoChip(c, "VENTA", HOY)).toEqual({ contador: "Hoy 32/50", creditos: "Créditos 240" });
    expect(textoChip(c, "CITA", HOY)).toEqual({ contador: "Citas hoy 12/50", creditos: "Créditos 240" });
  });

  it("el saldo negativo lleva el signo menos de verdad", () => {
    expect(fmtCreditos(-3)).toBe("−3");
    expect(textoChip(cupoEmprendedor({ saldo: -3 }), "VENTA", HOY).creditos).toBe("Créditos −3");
  });

  it("el título de la hoja dice el límite de la unidad", () => {
    expect(tituloAgotado(cupoEmprendedor(), "VENTA")).toBe("Llegaste a tus 50 ventas de hoy");
    expect(tituloAgotado(cupoEmprendedor({ limiteCitas: 30 }), "CITA")).toBe("Llegaste a tus 30 citas de hoy");
  });
});

describe("avisos del día", () => {
  it("al 80 % del cupo: te quedan 10", () => {
    const a = avisosDe(cupoEmprendedor({ ventas: 40, saldo: 100 }), "VENTA", HOY);
    expect(a.map((x) => x.texto)).toEqual(["Te quedan 10 ventas en el cupo de hoy"]);
    expect(avisosDe(cupoEmprendedor({ ventas: 39, saldo: 100 }), "VENTA", HOY)).toEqual([]);
  });

  it("con el cupo lleno: desde ahora cada venta usa 1 crédito, y cada cita 2", () => {
    const v = avisosDe(cupoEmprendedor({ ventas: 50, saldo: 240 }), "VENTA", HOY);
    expect(v.map((x) => x.texto)).toContain(
      "Ya usaste las 50 de hoy: desde ahora cada venta usa 1 crédito (te quedan 240)",
    );
    const c = avisosDe(cupoEmprendedor({ citas: 50, saldo: 240 }), "CITA", HOY);
    expect(c.map((x) => x.texto)).toContain(
      "Ya usaste las 50 de hoy: desde ahora cada cita usa 2 créditos (te quedan 240)",
    );
  });

  it("saldo bajo (< 20) se avisa cuando el cupo ya está por llenarse, no antes", () => {
    expect(avisosDe(cupoEmprendedor({ ventas: 3, saldo: 10 }), "VENTA", HOY)).toEqual([]);
    const a = avisosDe(cupoEmprendedor({ ventas: 45, saldo: 10 }), "VENTA", HOY);
    expect(a.map((x) => x.texto)).toContain("Te quedan 10 créditos");
  });

  it("cada aviso sale una sola vez por día; al día siguiente puede volver", () => {
    const a = avisosDe(cupoEmprendedor({ ventas: 40, saldo: 100 }), "VENTA", HOY);
    expect(sinMostrar(a, HOY)).toHaveLength(1);
    marcarMostrado(a[0].clave, HOY);
    expect(sinMostrar(a, HOY)).toHaveLength(0);
    expect(sinMostrar(a, "2026-10-10")).toHaveLength(1);
  });
});

describe("el 403 CUPO_AGOTADO", () => {
  it("se reconoce por el código y trae el cupo del servidor", () => {
    const cupo = cupoEmprendedor({ ventas: 50 });
    const e = Object.assign(new Error("Llegaste a tus 50 ventas de hoy y no te quedan créditos."), {
      status: 403,
      codigo: "CUPO_AGOTADO",
      detalle: { codigo: "CUPO_AGOTADO", unidad: "VENTA", cupo },
    });
    expect(esCupoAgotado(e)).toBe(true);
    expect(cupoDelError(e)).toEqual(cupo);
  });

  it("el 403 de licencia u otro error no es de cupo", () => {
    expect(esCupoAgotado({ status: 403, codigo: "LICENCIA_SUSPENDIDA" })).toBe(false);
    expect(esCupoAgotado(new Error("x"))).toBe(false);
    expect(cupoDelError({ detalle: {} })).toBeNull();
  });
});
