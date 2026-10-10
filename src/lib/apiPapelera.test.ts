import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

/**
 * La papelera de Artículos e Insumos ("Dados de baja"). El backend la abre
 * con `?eliminados=true` (compara el texto): con `=1` devolvía el catálogo
 * activo, y lo archivado no se podía ver ni restaurar desde la web.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function fetchVacio() {
  const f = vi.fn(async (_url: RequestInfo | URL) => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", f);
  return f;
}

describe("papelera del catálogo", () => {
  it("artículos dados de baja: ?eliminados=true", async () => {
    const f = fetchVacio();
    await api.getProductos(true);
    expect(String(f.mock.calls[0][0])).toMatch(/[?&]eliminados=true(&|$)/);
  });

  it("insumos dados de baja: ?eliminados=true", async () => {
    const f = fetchVacio();
    await api.getInsumos(true);
    expect(String(f.mock.calls[0][0])).toMatch(/[?&]eliminados=true(&|$)/);
  });

  it("el catálogo activo no manda el parámetro", async () => {
    const f = fetchVacio();
    await api.getProductos();
    await api.getInsumos();
    expect(String(f.mock.calls[0][0])).not.toContain("eliminados");
    expect(String(f.mock.calls[1][0])).not.toContain("eliminados");
  });
});
