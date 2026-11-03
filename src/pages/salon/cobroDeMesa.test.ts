import { describe, expect, it } from "vitest";
import { ApiError } from "../../lib/api";
import type { Mesa } from "../../types/salon";
import { avisoCuentaCambiada, cuerpoCobroDeMesa, esCuentaCambiada } from "./cobroDeMesa";

function mesa(p: Partial<Mesa> = {}): Mesa {
  return {
    id: 1,
    codigo: "M4",
    nombre: "Mesa M4",
    zonaCodigo: "salon",
    zonaNombre: "Salón",
    capacidad: 4,
    capacidadTotal: 4,
    unidas: [],
    activa: true,
    estado: "OCUPADA",
    comensales: 2,
    consumo: 217,
    propina: 0,
    comandas: [],
    ...p,
  };
}

const PAGOS = [{ formaPagoId: 1, monto: 197, recibido: 200 }];

describe("el cuerpo del cobro de una mesa", () => {
  it("SAL-08: manda el total que se cobró en pantalla como totalEsperado", () => {
    // Sin él, si el mesero le sumaba algo a la mesa en el medio, el backend
    // respondía "Los pagos (197) deben sumar el total de la venta (217)".
    expect(cuerpoCobroDeMesa(197, PAGOS, undefined, "id-1")).toEqual({
      pagos: PAGOS,
      totalEsperado: 197,
      clienteRequestId: "id-1",
    });
  });

  it("SAL-01: con propina, viaja aparte de los pagos, que no la incluyen", () => {
    // Ningún cobro de la web la mandaba: Mi turno y Ventas por mesero sólo
    // veían las propinas cargadas desde la app.
    const cuerpo = cuerpoCobroDeMesa(197, PAGOS, 15, "id-1");
    expect(cuerpo.propina).toBe(15);
    expect(cuerpo.pagos).toBe(PAGOS);
    expect(cuerpo.totalEsperado).toBe(197);
  });

  it("sin propina (o en cero) no viaja la clave", () => {
    expect(cuerpoCobroDeMesa(197, PAGOS, 0, "id-1")).not.toHaveProperty("propina");
    expect(cuerpoCobroDeMesa(197, PAGOS, 0.001, "id-1")).not.toHaveProperty("propina");
  });

  it("el total va redondeado a centavos, como lo compara el backend", () => {
    // 3 × 8.90 da 26.700000000000003 en punto flotante.
    expect(cuerpoCobroDeMesa(3 * 8.9, PAGOS, undefined, "x").totalEsperado).toBe(26.7);
  });
});

describe("la cuenta que cambió mientras se cobraba", () => {
  it("reconoce el 400 del backend por su texto", () => {
    const e = new ApiError(
      "La mesa M4 cambió mientras cobrabas: ahora son Bs 217.00. Volvé a entrar a la mesa para cobrar el total nuevo.",
      400,
    );
    expect(esCuentaCambiada(e)).toBe(true);
  });

  it("no confunde otros rechazos del cobro", () => {
    expect(esCuentaCambiada(new ApiError("La mesa M4 ya se cobró", 400))).toBe(false);
    expect(esCuentaCambiada(new ApiError("Los pagos (197) deben sumar el total de la venta (217)", 400))).toBe(false);
    expect(esCuentaCambiada("cambió mientras cobrabas")).toBe(false);
  });

  it("el aviso dice el total nuevo y qué hacer, según quién cobra", () => {
    const m = mesa({ unidas: [{ id: 2, codigo: "M5", capacidad: 4 }] });
    expect(avisoCuentaCambiada(m, "caja")).toMatch(
      /^La cuenta de M4 \+ M5 cambió mientras cobrabas: ahora son Bs\s217,00\. Revisá el total con el cliente y cobrá de nuevo\.$/,
    );
    expect(avisoCuentaCambiada(m, "mesero")).toMatch(/Revisala con el cliente antes de cobrar\.$/);
  });
});
