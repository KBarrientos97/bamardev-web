import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEGOCIO_KEY, tokenStore, USER_KEY } from "../api";
import { dispositivoId, olvidarDispositivoPush, registrarTokenSiCambio } from "./registroPush";

function conSesion(usuarioId = 7, negocioId = 3) {
  tokenStore.set("jwt-de-prueba");
  localStorage.setItem(USER_KEY, JSON.stringify({ id: usuarioId, username: "caja" }));
  localStorage.setItem(NEGOCIO_KEY, JSON.stringify({ id: negocioId }));
}

describe("registro del token de push", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("el dispositivoId se genera una vez y se reusa", () => {
    const a = dispositivoId();
    expect(a).toBeTruthy();
    expect(dispositivoId()).toBe(a);
  });

  it("registra la primera vez y no vuelve a llamar si nada cambió", async () => {
    conSesion();
    expect(await registrarTokenSiCambio("tok-1")).toBe(true);
    expect(await registrarTokenSiCambio("tok-1")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/dispositivos-push$/);
    expect(JSON.parse(opciones.body)).toEqual({ dispositivoId: dispositivoId(), token: "tok-1", plataforma: "WEB" });
  });

  it("vuelve a registrar si cambia el token o el usuario", async () => {
    conSesion(7);
    await registrarTokenSiCambio("tok-1");
    await registrarTokenSiCambio("tok-2");
    conSesion(8);
    await registrarTokenSiCambio("tok-2");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("si el backend falla no guarda la huella: reintenta la próxima vez", async () => {
    conSesion();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await registrarTokenSiCambio("tok-1")).toBe(false);
    expect(await registrarTokenSiCambio("tok-1")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sin sesión no llama al API", async () => {
    expect(await registrarTokenSiCambio("tok-1")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("al cerrar sesión borra el dispositivo y el próximo login vuelve a registrar", async () => {
    conSesion();
    await registrarTokenSiCambio("tok-1");
    olvidarDispositivoPush("jwt-de-prueba");
    const [url, opciones] = fetchMock.mock.calls[1];
    expect(String(url)).toContain(`/auth/dispositivos-push/${dispositivoId()}`);
    expect(opciones.method).toBe("DELETE");
    await registrarTokenSiCambio("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
