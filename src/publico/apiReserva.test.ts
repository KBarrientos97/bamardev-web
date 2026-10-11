import { afterEach, describe, expect, it, vi } from "vitest";
import { apiReserva } from "./apiReserva";

function respuesta(cuerpo: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(JSON.stringify(cuerpo), { status: 200, headers: { "Content-Type": "application/json" } }),
  );
}

afterEach(() => vi.unstubAllGlobals());

// B29 (ronda 1 de QA): con `Content-Type: application/json` un GET deja de
// ser "simple" y el navegador manda un OPTIONS antes de cada consulta.
describe("cliente de la reserva", () => {
  it("un GET sale sin Content-Type (sin preflight)", async () => {
    const f = respuesta({ desde: "2026-10-13", ultimaFecha: "2026-11-12", dias: [] });
    vi.stubGlobal("fetch", f);
    await apiReserva.negocio("bellavista");
    const init = f.mock.calls[0][1]!;
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });

  it("un POST con cuerpo sí lo lleva", async () => {
    const f = respuesta({});
    vi.stubGlobal("fetch", f);
    await apiReserva.cancelar("bellavista", "x".repeat(22)).catch(() => undefined);
    await apiReserva
      .reservar("bellavista", {
        sucursal: "centro",
        servicioIds: [1],
        profesionalId: null,
        inicio: "2026-10-13T14:30:00.000Z",
        nombre: "María",
        telefono: "76543210",
        aceptaPrivacidad: true,
        privacidadVersion: "v0.1",
      })
      .catch(() => undefined);
    const conCuerpo = f.mock.calls.find(([, init]) => init?.body != null)!;
    expect(new Headers(conCuerpo[1]!.headers).get("Content-Type")).toBe("application/json");
  });
});
