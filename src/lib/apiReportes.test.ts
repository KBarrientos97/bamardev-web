import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api";

/**
 * Tope de reportes: el backend rechaza un reporte demasiado grande (422), un
 * rango de más de un año (400) o uno que llega mientras corre otro grande
 * (503). Los tres traen un `message` pensado para el cliente, y es lo que la
 * pantalla tiene que mostrar —no un "Ocurrió un error" ni, en el 503, el
 * aviso genérico de servidor caído, que escondía el motivo real.
 */

beforeEach(() => {
  // Los 5xx se reportan a la telemetría, que en tests escribe en consola.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fetchQueFalla(status: number, cuerpo: unknown, tipo = "application/json") {
  const texto = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(texto, { status, headers: { "Content-Type": tipo } })),
  );
}

const RANGO = { desde: "2024-01-01", hasta: "2026-10-10" };

/** El error con el que rechaza el reporte. */
async function errorDel(promesa: Promise<unknown>): Promise<ApiError> {
  try {
    await promesa;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error("El reporte no falló");
}

describe("errores del tope de reportes", () => {
  it("422 REPORTE_DEMASIADO_GRANDE: el mensaje del backend, con el código y las cifras", async () => {
    const message =
      "Este período tiene 18.230 ventas y el máximo por reporte es 15.000. Elegí un período más corto.";
    fetchQueFalla(422, { codigo: "REPORTE_DEMASIADO_GRANDE", message, ventas: 18230, limite: 15000 });
    const e = await errorDel(api.reporte("top-productos", RANGO));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe(message);
    expect(e.status).toBe(422);
    expect(e.codigo).toBe("REPORTE_DEMASIADO_GRANDE");
    expect(e.detalle).toMatchObject({ ventas: 18230, limite: 15000 });
  });

  it("400 RANGO_DEMASIADO_LARGO: el mensaje del backend", async () => {
    const message = "El período no puede pasar de 366 días.";
    fetchQueFalla(400, { codigo: "RANGO_DEMASIADO_LARGO", message });
    const e = await errorDel(api.reporte("resumen", RANGO));
    expect(e.message).toBe(message);
    expect(e.codigo).toBe("RANGO_DEMASIADO_LARGO");
  });

  it("503 REPORTES_OCUPADO: el mensaje del backend, no el de servidor caído", async () => {
    const message = "Hay otro reporte grande en curso. Probá de nuevo en unos segundos.";
    fetchQueFalla(503, { codigo: "REPORTES_OCUPADO", message });
    const e = await errorDel(api.reporteVentas(RANGO));
    expect(e.message).toBe(message);
    expect(e.status).toBe(503);
    expect(e.codigo).toBe("REPORTES_OCUPADO");
  });

  it("un 503 sin código (despliegue, cuerpo HTML) sigue con el aviso de servidor no disponible", async () => {
    fetchQueFalla(503, "<html>Service Unavailable</html>", "text/html");
    const e = await errorDel(api.reporte("top-productos", RANGO));
    expect(e.message).toBe("El servidor no está disponible en este momento. Probá en unos segundos.");
  });
});
