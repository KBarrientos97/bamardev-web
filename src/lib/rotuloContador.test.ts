import { describe, expect, it } from "vitest";
import { queCuentaElMenu } from "./rotuloContador";

describe("el rótulo del contador del menú", () => {
  it("pedidos web: singular con uno, plural con varios", () => {
    expect(`1 ${queCuentaElMenu("pedidos_web", 1)}`).toBe("1 pedido nuevo");
    expect(`2 ${queCuentaElMenu("pedidos_web", 2)}`).toBe("2 pedidos nuevos");
  });

  it("mesas de billar", () => {
    expect(`1 ${queCuentaElMenu("billar", 1)}`).toBe("1 mesa abierta");
    expect(`4 ${queCuentaElMenu("billar", 4)}`).toBe("4 mesas abiertas");
  });

  it("lo demás no cambia con el número", () => {
    expect(queCuentaElMenu("solicitudes", 1)).toBe("por atender");
    expect(queCuentaElMenu("solicitudes", 5)).toBe("por atender");
  });
});
