import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const sesion = vi.hoisted(() => ({
  usuario: { sucursalId: null as number | null | undefined },
  negocio: { tipoNegocio: "RESTAURANTE", features: ["multi_almacen"], sucursalesActivas: 2 as number | undefined },
}));
vi.mock("../store/AuthContext", () => ({ useAuth: () => sesion }));

import { useHayVariasSucursales, useLocalDelPapel } from "./useHayVariasSucursales";

describe("¿hay varias sucursales? (para los papeles)", () => {
  it("con 2+ locales, sí: la organización y el que es de un local", () => {
    sesion.negocio.sucursalesActivas = 2;
    sesion.usuario.sucursalId = null;
    expect(renderHook(() => useHayVariasSucursales()).result.current).toBe(true);
    sesion.usuario.sucursalId = 3;
    expect(renderHook(() => useHayVariasSucursales()).result.current).toBe(true);
  });

  it("con un solo local, o sin saberlo (sesión vieja), no: el papel queda como siempre", () => {
    sesion.usuario.sucursalId = null;
    sesion.negocio.sucursalesActivas = 1;
    expect(renderHook(() => useHayVariasSucursales()).result.current).toBe(false);
    sesion.negocio.sucursalesActivas = undefined;
    expect(renderHook(() => useHayVariasSucursales()).result.current).toBe(false);
  });

  it("sin «Varios almacenes» el negocio opera como de un local aunque tenga más cargados", () => {
    sesion.negocio.sucursalesActivas = 2;
    sesion.negocio.features = ["pos"];
    expect(renderHook(() => useHayVariasSucursales()).result.current).toBe(false);
    sesion.negocio.features = ["multi_almacen"];
  });

  it("el local del papel sale sólo con varios y con nombre", () => {
    sesion.negocio.sucursalesActivas = 2;
    const sede = { nombre: "Sur" };
    expect(renderHook(() => useLocalDelPapel(sede)).result.current).toBe(sede);
    expect(renderHook(() => useLocalDelPapel(null)).result.current).toBeNull();
    expect(renderHook(() => useLocalDelPapel({ nombre: "" })).result.current).toBeNull();
    sesion.negocio.sucursalesActivas = 1;
    expect(renderHook(() => useLocalDelPapel(sede)).result.current).toBeNull();
  });
});
