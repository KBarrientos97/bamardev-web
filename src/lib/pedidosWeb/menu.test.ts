import { describe, expect, it } from "vitest";
import { puedeVer } from "../permisos";
import { ctxDe } from "../../test/sesiones";

/** El negocio prendió «Recibir pedidos en el sistema» (`negocio.pedidosWeb` de la sesión). */
const recibe = (ctx: ReturnType<typeof ctxDe>) => ({ ...ctx, pedidosWeb: true });

/**
 * Quién ve «Pedidos web» (CONTRATO-PEDIDOS-WEB §8 y §9): la feature `delivery`,
 * `delivery.asignar` y el interruptor del negocio prendido.
 */
describe("la entrada «Pedidos web»", () => {
  it("la ven el administrador y el cajero con delivery en el plan y los pedidos prendidos", () => {
    expect(puedeVer(recibe(ctxDe("ADMIN", "RESTAURANTE", ["pos", "delivery"])), "pedidos_web")).toBe(true);
    expect(puedeVer(recibe(ctxDe("CAJERO", "RESTAURANTE", ["pos", "delivery"])), "pedidos_web")).toBe(true);
  });

  it("con delivery pero sin prender los pedidos (Omar) no existe: el menú de siempre", () => {
    expect(puedeVer(ctxDe("ADMIN", "RESTAURANTE", ["pos", "delivery"]), "pedidos_web")).toBe(false);
    expect(puedeVer({ ...ctxDe("CAJERO", "RESTAURANTE", ["pos", "delivery"]), pedidosWeb: false }, "pedidos_web")).toBe(false);
  });

  it("sin la feature delivery no existe, aunque tenga el permiso y los pedidos prendidos", () => {
    const ctx = { ...ctxDe("ADMIN", "RESTAURANTE", ["pos", "caja"]), permisos: ["delivery.asignar"], pedidosWeb: true };
    expect(puedeVer(ctx, "pedidos_web")).toBe(false);
  });

  it("el repartidor no la ve: él tiene «Mis entregas», que no depende del interruptor", () => {
    expect(puedeVer(recibe(ctxDe("REPARTIDOR", "RESTAURANTE", ["delivery"])), "pedidos_web")).toBe(false);
    expect(puedeVer(ctxDe("REPARTIDOR", "RESTAURANTE", ["delivery"]), "reparto")).toBe(true);
  });

  it("el mesero tampoco", () => {
    expect(puedeVer(recibe(ctxDe("MESERO", "RESTAURANTE", ["delivery", "salon"])), "pedidos_web")).toBe(false);
  });
});
