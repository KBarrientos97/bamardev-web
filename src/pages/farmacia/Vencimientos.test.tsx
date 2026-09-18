import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LotePorVencer, Vencimientos as DatosVencimientos } from "../../types";

/**
 * Vencimientos no es una lista para mirar: es una lista para actuar.
 *
 * Tocar un lote abre su detalle, y de ahí salen las dos únicas cosas que se
 * hacen con mercadería que vence —darla de baja o devolverla al proveedor—
 * dejando el formulario de salida cargado. Estos tests fijan que el lote que
 * se toca sea el que viaja.
 */

const navegado = vi.hoisted(() => ({ a: "", con: null as unknown }));

vi.mock("react-router-dom", async () => {
  const real = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...real,
    useNavigate: () => (a: string, opciones?: { state?: unknown }) => {
      navegado.a = a;
      navegado.con = opciones?.state ?? null;
    },
  };
});

vi.mock("../../lib/api", () => ({
  api: { vencimientos: vi.fn() },
}));

import { api } from "../../lib/api";
import Vencimientos from "./Vencimientos";

const vacio = { lotes: 0, unidades: 0, valor: 0 };

const paracetamol: LotePorVencer = {
  loteId: 11,
  codigo: "PAR-002A",
  vencimiento: "2026-09-03",
  diasRestantes: -15,
  tramo: "VENCIDO",
  cantidad: 30,
  costoUnitario: 0.24,
  valor: 7.2,
  almacen: { id: 2, nombre: "Mostrador" },
  producto: { id: 5, nombre: "Paracetamol 500 mg", laboratorio: "IFA" },
};

const azitromicina: LotePorVencer = {
  loteId: 12,
  codigo: "AZI-010A",
  vencimiento: "2026-10-03",
  diasRestantes: 15,
  tramo: "HASTA_30",
  cantidad: 20,
  costoUnitario: 5.8,
  valor: 116,
  almacen: { id: 1, nombre: "Depósito" },
  producto: { id: 9, nombre: "Azitromicina 500 mg", laboratorio: "INTI" },
};

const datos: DatosVencimientos = {
  vencidos: { lotes: 1, unidades: 30, valor: 7.2 },
  hasta30: { lotes: 1, unidades: 20, valor: 116 },
  hasta60: vacio,
  hasta90: vacio,
  valorEnRiesgo: 123.2,
  detalle: [paracetamol, azitromicina],
};

beforeEach(() => {
  vi.clearAllMocks();
  navegado.a = "";
  navegado.con = null;
  vi.mocked(api.vencimientos).mockResolvedValue(datos);
});

async function abrirLote(nombre: string) {
  render(
    <MemoryRouter>
      <Vencimientos />
    </MemoryRouter>,
  );
  const fila = await screen.findByText(nombre);
  await act(async () => {
    fireEvent.click(fila);
  });
}

describe("Vencimientos", () => {
  it("tocar un lote abre su detalle con lo que hace falta para decidir", async () => {
    await abrirLote("Paracetamol 500 mg");

    const dialogo = screen.getByRole("dialog");
    expect(dialogo).toHaveTextContent("Lote PAR-002A");
    expect(dialogo).toHaveTextContent("IFA");
    expect(dialogo).toHaveTextContent("Mostrador");
    expect(dialogo).toHaveTextContent("30 u.");
    expect(dialogo).toHaveTextContent("Venció hace 15 d");
  });

  it("dar de baja abre la salida cargada con ESE lote y el motivo puesto", async () => {
    await abrirLote("Paracetamol 500 mg");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Dar de baja/ }));
    });

    expect(navegado.a).toBe("/inventario/movimientos/salida");
    expect(navegado.con).toEqual({
      productoId: 5,
      almacenId: 2,
      cantidad: 30,
      motivo: "Vencimiento",
    });
  });

  it("devolver al proveedor manda el otro motivo, y el lote que se tocó", async () => {
    await abrirLote("Azitromicina 500 mg");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Devolver al proveedor/ }));
    });

    expect(navegado.con).toEqual({
      productoId: 9,
      almacenId: 1,
      cantidad: 20,
      motivo: "Devolución a proveedor",
    });
  });
});
