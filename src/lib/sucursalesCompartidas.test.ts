import { describe, expect, it, vi } from "vitest";
import type { Almacen } from "../types";
import { VIDA_LISTA_MS, crearFuenteSucursales } from "./sucursalesCompartidas";

/** La lista de locales se pide una vez por sesión y la comparten todos los hooks. */

const LISTA = [{ id: 1, nombre: "Principal" }] as unknown as Almacen[];

describe("crearFuenteSucursales", () => {
  it("dos pedidos seguidos de la misma sesión hacen una sola llamada", async () => {
    const pedir = vi.fn().mockResolvedValue(LISTA);
    const fuente = crearFuenteSucursales(pedir);
    const [a, b] = await Promise.all([fuente.obtener("1:1"), fuente.obtener("1:1")]);
    expect(a).toBe(b);
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("otro usuario u otro negocio no reusa la lista", async () => {
    const pedir = vi.fn().mockResolvedValue(LISTA);
    const fuente = crearFuenteSucursales(pedir);
    await fuente.obtener("1:1");
    await fuente.obtener("1:2");
    await fuente.obtener("2:2");
    expect(pedir).toHaveBeenCalledTimes(3);
  });

  it("vence: pasado el TTL vuelve a pedir", async () => {
    let t = 1000;
    const pedir = vi.fn().mockResolvedValue(LISTA);
    const fuente = crearFuenteSucursales(pedir, () => t);
    await fuente.obtener("1:1");
    t += VIDA_LISTA_MS - 1;
    await fuente.obtener("1:1");
    expect(pedir).toHaveBeenCalledTimes(1);
    t += 2;
    await fuente.obtener("1:1");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("invalidar descarta la lista (después de crear o desactivar un local)", async () => {
    const pedir = vi.fn().mockResolvedValue(LISTA);
    const fuente = crearFuenteSucursales(pedir);
    await fuente.obtener("1:1");
    fuente.invalidar();
    await fuente.obtener("1:1");
    expect(pedir).toHaveBeenCalledTimes(2);
  });

  it("una llamada que falla no se guarda: el siguiente pedido reintenta", async () => {
    const pedir = vi.fn().mockRejectedValueOnce(new Error("sin red")).mockResolvedValue(LISTA);
    const fuente = crearFuenteSucursales(pedir);
    await expect(fuente.obtener("1:1")).rejects.toThrow("sin red");
    await expect(fuente.obtener("1:1")).resolves.toBe(LISTA);
    expect(pedir).toHaveBeenCalledTimes(2);
  });
});
