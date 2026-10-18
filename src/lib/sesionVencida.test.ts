import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { request, SESION_VENCIDA_KEY, tokenStore } from "./api";

/**
 * Un 401 con sesión deja la marca para que el login diga que la sesión se
 * cerró (prueba profunda, 18-oct): el token dura 7 días y vence en pleno
 * turno, y el login aparecía limpio. Sin token (cerró sesión en otra
 * pestaña) no hay nada que avisar.
 */

const assign = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("location", { ...window.location, assign });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ statusCode: 401, message: "Unauthorized" }), { status: 401 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  assign.mockReset();
});

describe("la sesión que se corta", () => {
  it("con sesión, deja la marca para el login y vuelve al inicio", async () => {
    tokenStore.set("un-token");
    await expect(request("/billar/tablero")).rejects.toThrow("La sesión venció");
    expect(localStorage.getItem(SESION_VENCIDA_KEY)).toBe("1");
    expect(assign).toHaveBeenCalledWith("/");
  });

  it("sin sesión no deja marca", async () => {
    await expect(request("/billar/tablero")).rejects.toThrow();
    expect(localStorage.getItem(SESION_VENCIDA_KEY)).toBeNull();
  });
});
