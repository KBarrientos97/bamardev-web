import { describe, expect, it } from "vitest";
import type { Feature } from "../types";
import { puedeVer } from "./permisos";

/**
 * Promociones y CRM son nuevas y estrictas: sin la feature no existen, aunque
 * la lista venga vacía (fail-open de siempre). A Omar no le aparece nada.
 */
const base = { rol: "ADMIN" as const, modulos: [], rubro: "RESTAURANTE" };

describe("secciones de promociones y CRM", () => {
  it("sin la feature no se ven, ni con la lista de features vacía", () => {
    expect(puedeVer({ ...base, features: [] }, "promociones")).toBe(false);
    expect(puedeVer({ ...base, features: ["pos", "caja"] as Feature[] }, "retencion")).toBe(false);
  });

  it("con la feature y el permiso, sí; sin el permiso, no", () => {
    const features = ["pos", "promociones", "clientes_retencion"] as Feature[];
    expect(
      puedeVer({ ...base, features, permisos: ["promociones.gestionar", "cliente.marketing"] }, "promociones"),
    ).toBe(true);
    expect(puedeVer({ ...base, rol: "CAJERO", features, permisos: ["cliente.marketing"] }, "promociones")).toBe(false);
    expect(puedeVer({ ...base, rol: "CAJERO", features, permisos: ["cliente.marketing"] }, "retencion")).toBe(true);
  });

  it("sesión vieja sin permisos: decide el rol", () => {
    const features = ["promociones", "clientes_retencion"] as Feature[];
    expect(puedeVer({ ...base, features }, "promociones")).toBe(true);
    expect(puedeVer({ ...base, rol: "CAJERO", features }, "promociones")).toBe(false);
    expect(puedeVer({ ...base, rol: "CAJERO", features }, "retencion")).toBe(true);
  });
});
