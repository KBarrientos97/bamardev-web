import { describe, expect, it, vi } from "vitest";
import type { PaginaMeta } from "../../../types";
import {
  avisoRecorte,
  exportaElPeriodo,
  FILAS_POR_TIRADA,
  nombreHojaPeriodo,
  recortado,
  TOPE_FILAS,
  traerTodoElPeriodo,
} from "./todoElPeriodo";

/**
 * REP-03 (28-oct): en el restaurante, el Excel de Ventas y de Movimientos de
 * caja baja el período entero, como la app, y no la página de 50 que se ve.
 */

describe("quién baja el período entero", () => {
  it("sólo el restaurante: los demás rubros siguen bajando la página que se ve", () => {
    // La primera versión lo dejaba para todos y le cambiaba el Excel al
    // billar, a belleza, a farmacia y a academia sin que nadie lo pidiera.
    expect(exportaElPeriodo("RESTAURANTE")).toBe(true);
    for (const otro of ["BILLAR", "FARMACIA", "PELUQUERIA", "BARBERIA", "SPA", "UNAS", "ACADEMIA", "MINIMARKET"]) {
      expect(exportaElPeriodo(otro), otro).toBe(false);
    }
    // Una sesión vieja sin rubro, como siempre.
    expect(exportaElPeriodo(null)).toBe(false);
    expect(exportaElPeriodo(undefined)).toBe(false);
  });
});

/** Un backend de mentira con `total` filas numeradas, paginadas como el real. */
function backend(total: number) {
  return vi.fn(async (page: number, limite: number) => {
    const desde = (page - 1) * limite;
    const items = Array.from({ length: Math.max(0, Math.min(limite, total - desde)) }, (_, i) => ({ id: desde + i + 1 }));
    const pagina: PaginaMeta = { page, limite, total, totalPaginas: Math.max(1, Math.ceil(total / limite)) };
    return { items, pagina };
  });
}

describe("bajar el período entero", () => {
  it("pide todas las páginas de a 200 y junta todas las filas", async () => {
    const pedir = backend(450);
    const todo = await traerTodoElPeriodo(pedir);
    expect(pedir.mock.calls).toEqual([
      [1, FILAS_POR_TIRADA],
      [2, FILAS_POR_TIRADA],
      [3, FILAS_POR_TIRADA],
    ]);
    expect(todo.filas).toHaveLength(450);
    expect(todo.total).toBe(450);
    expect(recortado(todo)).toBe(false);
    expect(avisoRecorte(todo)).toBeNull();
    expect(nombreHojaPeriodo("Ventas", todo)).toBe("Ventas");
  });

  it("un período que entra en una página se pide una sola vez", async () => {
    const pedir = backend(12);
    const todo = await traerTodoElPeriodo(pedir);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(todo.filas).toHaveLength(12);
  });

  it("corta en 5.000 filas y lo dice, en pantalla y en el nombre de la hoja", async () => {
    // Como la app: un archivo recortado sin decirlo se lee como el total.
    const pedir = backend(7312);
    const todo = await traerTodoElPeriodo(pedir);
    expect(pedir).toHaveBeenCalledTimes(TOPE_FILAS / FILAS_POR_TIRADA);
    expect(todo.filas).toHaveLength(TOPE_FILAS);
    expect(recortado(todo)).toBe(true);
    expect(avisoRecorte(todo)).toBe(
      "El Excel trae las 5.000 filas más nuevas de las 7.312 del período: acortá el período para bajar el resto.",
    );
    expect(nombreHojaPeriodo("Ventas", todo)).toBe("Ventas (5.000 de 7.312)");
  });

  it("si falla una página, falla todo: no baja una planilla con un hueco", async () => {
    const pedir = backend(450);
    pedir.mockImplementationOnce(backend(450)).mockRejectedValueOnce(new Error("Se cortó la conexión"));
    await expect(traerTodoElPeriodo(pedir)).rejects.toThrow("Se cortó la conexión");
  });

  it("una venta que entra mientras se baja no sale dos veces", async () => {
    // Exportar "Hoy" con la caja abierta: la venta nueva corre todo un lugar
    // y la primera fila de la página 2 es la última de la 1. Sumaba doble.
    const pedir = vi.fn(async (page: number) => ({
      items: page === 1 ? [{ id: 3 }, { id: 2 }] : [{ id: 2 }, { id: 1 }],
      pagina: { page, limite: 2, total: page === 1 ? 3 : 4, totalPaginas: 2 },
    }));
    const todo = await traerTodoElPeriodo(pedir, (f) => f.id);
    expect(todo.filas.map((f) => f.id)).toEqual([3, 2, 1]);
    // Lo que llegó después de tocar el botón no es un recorte.
    expect(avisoRecorte(todo)).toBeNull();
  });

  it("una página vacía corta aunque el backend diga que hay más", async () => {
    const pedir = vi.fn(async (page: number) => ({
      items: page === 1 ? [{ id: 1 }] : [],
      pagina: { page, limite: 1, total: 5, totalPaginas: 5 },
    }));
    const todo = await traerTodoElPeriodo(pedir);
    expect(pedir).toHaveBeenCalledTimes(2);
    expect(todo.filas).toHaveLength(1);
  });
});
