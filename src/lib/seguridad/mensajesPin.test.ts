import { afterEach, describe, expect, it, vi } from "vitest";
import { request } from "../api";

/**
 * Lo que lee quien pidió un PIN y le fue mal (18-oct). El backend no cambia
 * su `message` (la app lo muestra tal cual); la web suma, siempre con el mismo
 * texto, que quedó registrado: así la cajera no aprende a partir de cuántos
 * intentos se le avisa al dueño.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function responde(status: number, cuerpo: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } })),
  );
}

const mensaje = async () => {
  try {
    await request("/ventas/1/anular", { method: "POST" });
    return "(no falló)";
  } catch (e) {
    return (e as Error).message;
  }
};

describe("el mensaje de un PIN rechazado", () => {
  it("un PIN mal escrito dice que quedó registrado, siempre igual", async () => {
    responde(403, { statusCode: 403, message: "Usuario o PIN incorrecto", registrado: true });
    expect(await mensaje()).toBe("Usuario o PIN incorrecto. Quedó registrado y lo ve el administrador.");
    // El de la agenda trae punto final: no queda doble.
    responde(403, { statusCode: 403, message: "PIN incorrecto.", registrado: true, codigo: "AUTORIZACION_SOBRE_TURNO" });
    expect(await mensaje()).toBe("PIN incorrecto. Quedó registrado y lo ve el administrador.");
  });

  it("un 403 de otra cosa no se toca", async () => {
    responde(403, { statusCode: 403, message: "Para anular hace falta la autorización de un encargado" });
    expect(await mensaje()).toBe("Para anular hace falta la autorización de un encargado");
  });

  it("el freno de 15 minutos avisa que el dueño lo ve; el del día ya lo dice el backend", async () => {
    responde(429, { statusCode: 429, codigo: "PIN_BLOQUEADO", message: "Demasiados intentos de PIN. Probá de nuevo en 15 minutos." });
    expect(await mensaje()).toBe("Demasiados intentos de PIN. Probá de nuevo en 15 minutos. El administrador ya lo puede ver.");
    const delDia = "Hubo demasiados PIN equivocados desde tu usuario en las últimas 24 horas: tus autorizaciones con PIN quedaron frenadas.";
    responde(429, { statusCode: 429, codigo: "PIN_BLOQUEADO", frenado: true, message: delDia });
    expect(await mensaje()).toBe(delDia);
  });
});
