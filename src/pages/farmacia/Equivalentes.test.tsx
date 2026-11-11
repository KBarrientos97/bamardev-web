import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * El panel de equivalentes (#11): "no hay BAGÓ, hay INTI a Bs 0,45". Pide los
 * otros con la misma droga y concentración, los muestra con laboratorio,
 * precio y stock, y deja sumar a la venta sólo lo que hay.
 */

// Se mockea la red y nada más: el armado de la URL es parte de lo que se prueba.
vi.mock("../../lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/api")>()),
  request: vi.fn(),
}));

import { request } from "../../lib/api";
import { Equivalentes } from "./Equivalentes";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Ibuprofeno 400 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.7,
    costo: 0.3,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 180,
    componentes: [],
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "INTI",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    ...over,
  };
}

/** El que no hay: la marca que pidió el cliente. */
const ibupirac = med({ id: 1, nombre: "Ibupirac 400", laboratorio: "BAGÓ", precio: 0.6, stockTotal: 0 });
const inti = med({ id: 2, nombre: "Ibuprofeno 400 mg", laboratorio: "INTI", precio: 0.45, stockTotal: 120 });
const ifa = med({ id: 3, nombre: "Ibuprofeno IFA", laboratorio: "IFA", precio: 0.4, stockTotal: 6, stockVencido: 6 });
const lafar = med({ id: 4, nombre: "Ibuprofeno LAFAR", laboratorio: "LAFAR", precio: 0.5, stockTotal: 0 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(request).mockResolvedValue([inti, ifa, lafar]);
});

describe("la lista", () => {
  it("pide los de la sucursal y los muestra con laboratorio, precio y stock; lo que hay va primero", async () => {
    render(<Equivalentes producto={ibupirac} sucursalId={917} />);
    expect(screen.getByText("Buscando equivalentes…")).toBeInTheDocument();

    expect(await screen.findByText("INTI")).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("/productos/1/equivalentes?sucursalId=917");
    expect(screen.getByText(/Mismo principio activo/)).toHaveTextContent(
      "Mismo principio activo (Ibuprofeno 400 mg)",
    );

    // INTI es el único que hay; de los otros dos, el más barato antes.
    const filas = screen.getAllByRole("listitem");
    expect(filas).toHaveLength(3);
    expect(filas[0]).toHaveTextContent("INTI");
    expect(filas[0]).toHaveTextContent("0,45");
    expect(filas[0]).toHaveTextContent("120 u.");
    expect(filas[1]).toHaveTextContent("IFA");
    expect(filas[1]).toHaveTextContent("Vencido");
    expect(filas[2]).toHaveTextContent("LAFAR");
    expect(filas[2]).toHaveTextContent("Agotado");
  });

  it("Agregar a la venta sólo en lo que se puede vender, y entrega ese producto", async () => {
    const onAgregar = vi.fn();
    render(<Equivalentes producto={ibupirac} onAgregar={onAgregar} />);

    const botones = await screen.findAllByRole("button", { name: "Agregar a la venta" });
    expect(botones).toHaveLength(1);
    expect(botones[0].closest("li")).toHaveTextContent("INTI");
    fireEvent.click(botones[0]);
    expect(onAgregar).toHaveBeenCalledWith(inti);
    // Sin sucursal no viaja el parámetro: el backend usa la de quien pregunta.
    expect(request).toHaveBeenCalledWith("/productos/1/equivalentes");
  });

  it("sin onAgregar no hay botones: la ficha del catálogo no vende", async () => {
    render(<Equivalentes producto={ibupirac} />);
    await screen.findByText("INTI");
    expect(screen.queryByRole("button", { name: "Agregar a la venta" })).toBeNull();
  });
});

describe("cuando no hay", () => {
  it("lo dice: no hay otro con la misma droga y concentración", async () => {
    vi.mocked(request).mockResolvedValue([]);
    render(<Equivalentes producto={ibupirac} />);
    expect(await screen.findByText(/No hay otro con la misma droga/)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("sin principio activo en la ficha no pide nada y dice qué falta", () => {
    // El backend devolvería vacío y "no hay otro" sería mentira: lo que no
    // hay es el dato, y se dice eso.
    render(<Equivalentes producto={med({ principioActivo: null, stockTotal: 0 })} />);
    expect(screen.getByText(/Sin principio activo en la ficha/)).toBeInTheDocument();
    expect(screen.queryByText(/Mismo principio activo/)).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("si falla", () => {
  it("muestra el error con Reintentar, y al reintentar vuelve a pedir", async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error("Sin conexión"));
    render(<Equivalentes producto={ibupirac} />);
    expect(await screen.findByText("Sin conexión")).toBeInTheDocument();
    expect(screen.queryByText(/No hay otro/)).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(await screen.findByText("INTI")).toBeInTheDocument();
    expect(screen.queryByText("Sin conexión")).toBeNull();
    expect(request).toHaveBeenCalledTimes(2);
  });
});
