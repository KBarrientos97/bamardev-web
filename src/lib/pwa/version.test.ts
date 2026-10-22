import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reiniciarEstadoPwa, revisarVersion, usePwa } from "./pwa";
import { VERSION_APP, versionDelServidor, versionLegible } from "./version";
import { renderHook } from "@testing-library/react";

const estado = () => renderHook(() => usePwa()).result.current;

describe("versionLegible", () => {
  it("la hora de Bolivia y el commit", () => {
    expect(versionLegible("2026-10-22T02:40:11Z+28944d4")).toBe("21-oct 22:40 · 28944d4");
  });

  it("sin commit, sólo la fecha; si no es una fecha, tal cual", () => {
    expect(versionLegible("2026-01-01T12:05:00Z")).toBe("1-ene 08:05");
    expect(versionLegible("dev")).toBe("dev");
  });
});

describe("versionDelServidor", () => {
  it("pide sin caché y con un parámetro distinto cada vez", async () => {
    const pedir = vi.fn(async () => Response.json({ version: "v2" }));
    expect(await versionDelServidor(pedir as unknown as typeof fetch)).toBe("v2");
    const [url, init] = pedir.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^\/version\.json\?t=\d+$/);
    expect(init.cache).toBe("no-store");
  });

  it("sin red, un error o un archivo raro: null (no decide nada)", async () => {
    const falla = vi.fn(async () => {
      throw new Error("sin red");
    });
    expect(await versionDelServidor(falla as unknown as typeof fetch)).toBeNull();
    const error = vi.fn(async () => new Response("x", { status: 500 }));
    expect(await versionDelServidor(error as unknown as typeof fetch)).toBeNull();
    const raro = vi.fn(async () => Response.json({ otra: 1 }));
    expect(await versionDelServidor(raro as unknown as typeof fetch)).toBeNull();
  });
});

describe("revisarVersion", () => {
  const sinEspera = () => Promise.resolve();
  let update: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    reiniciarEstadoPwa();
    update = vi.fn(async () => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("la misma versión: no hace nada", async () => {
    await revisarVersion({ update } as never, { servidor: async () => VERSION_APP, esperar: sinEspera });
    expect(update).not.toHaveBeenCalled();
    expect(estado().atascada).toBe(false);
  });

  it("sin respuesta del servidor: no hace nada", async () => {
    await revisarVersion({ update } as never, { servidor: async () => null, esperar: sinEspera });
    expect(update).not.toHaveBeenCalled();
  });

  it("otra versión: le pide al SW que la traiga; si no llega, queda atascada", async () => {
    await revisarVersion({ update } as never, { servidor: async () => "otra", esperar: sinEspera });
    expect(update).toHaveBeenCalledOnce();
    expect(estado().atascada).toBe(true);
  });

  it("otra versión y el SW la trae: no queda atascada", async () => {
    update.mockImplementation(async () => {
      reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() });
    });
    await revisarVersion({ update } as never, { servidor: async () => "otra", esperar: sinEspera });
    expect(estado().versionNueva).toBe(true);
    expect(estado().atascada).toBe(false);
  });

  it("con la versión nueva ya esperando, no vuelve a preguntar", async () => {
    reiniciarEstadoPwa({ versionNueva: true, versionNuevaDesde: Date.now() });
    const servidor = vi.fn(async () => "otra");
    await revisarVersion({ update } as never, { servidor, esperar: sinEspera });
    expect(servidor).not.toHaveBeenCalled();
  });
});
