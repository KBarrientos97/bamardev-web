import { describe, expect, it } from "vitest";
import { puedeVer } from "../permisos";
import { ctxDe } from "../../test/sesiones";

/** Quién ve «Pedidos web» (CONTRATO-PEDIDOS-WEB §8): la feature `delivery` y `delivery.asignar`. */
describe("la entrada «Pedidos web»", () => {
  it("la ven el administrador y el cajero con delivery en el plan", () => {
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", ["pos", "delivery"]), "pedidos_web")).toBe(true);
    expect(puedeVer(ctxDe("CAJERO", "RESTAURANTE", ["pos", "delivery"]), "pedidos_web")).toBe(true);
  });

  it("sin la feature delivery no existe, aunque tenga el permiso", () => {
    const ctx = { ...ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja"]), permisos: ["delivery.asignar"] };
    expect(puedeVer(ctx, "pedidos_web")).toBe(false);
  });

  it("el repartidor no la ve: él tiene «Mis entregas»", () => {
    expect(puedeVer(ctxDe("REPARTIDOR", "RESTAURANTE", ["delivery"]), "pedidos_web")).toBe(false);
    expect(puedeVer(ctxDe("REPARTIDOR", "RESTAURANTE", ["delivery"]), "reparto")).toBe(true);
  });

  it("el mesero tampoco", () => {
    expect(puedeVer(ctxDe("MESERO", "RESTAURANTE", ["delivery", "salon"]), "pedidos_web")).toBe(false);
  });
});
