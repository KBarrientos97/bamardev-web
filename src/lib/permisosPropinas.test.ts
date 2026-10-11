import { describe, expect, it } from "vitest";
import type { Feature } from "../types";
import { puedeVer } from "./permisos";

/**
 * QA N2-01: la recepción que el dueño habilita a entregar propinas
 * (`propinas.pagar`, ajuste apagado del CAJERO) entra a "Propinas" aunque no
 * tenga "ver propinas": tiene que ver qué entrega.
 */
const base = { rubro: "BARBERIA", features: ["propinas"] as Feature[] };

describe("sección Propinas", () => {
  it("la recepción sin ajuste no la ve; con el ajuste de entregar, sí", () => {
    expect(puedeVer({ ...base, permisos: ["ventas.vender"] }, "propinas")).toBe(false);
    expect(puedeVer({ ...base, permisos: ["ventas.vender", "propinas.pagar"] }, "propinas")).toBe(true);
  });

  it("el encargado la ve con ver propinas, como siempre", () => {
    expect(puedeVer({ ...base, permisos: ["propinas.ver"] }, "propinas")).toBe(true);
  });
});
