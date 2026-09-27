import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";

/**
 * La venta de la farmacia vive por encima de las pantallas: se carga desde el
 * POS o desde Buscar medicamento, sobrevive a ir y volver (y a un F5), y fuera
 * del POS la sigue un botón "Ver venta".
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ puede: () => true }),
}));

vi.mock("../../lib/api", () => ({
  api: { getProducto: vi.fn() },
}));

import { api } from "../../lib/api";
import VentaFarmaciaProvider from "./VentaFarmaciaProvider";
import { useVentaFarmacia } from "./ventaFarmacia";

function med(over: Partial<Producto>): Producto {
  return {
    id: 1,
    nombre: "Paracetamol 500 mg",
    descripcion: null,
    codBarra: null,
    tipoProducto: "ALMACENABLE",
    precio: 0.5,
    costo: 0.2,
    stockMinimo: 10,
    habilitado: true,
    icono: null,
    categoria: null,
    unidadMedida: null,
    stockTotal: 240,
    componentes: [],
    principioActivo: "Paracetamol",
    concentracion: "500 mg",
    formaFarmaceutica: "Comprimido",
    laboratorio: "BAGÓ",
    registroSanitario: null,
    condicionVenta: "LIBRE",
    manejaLote: true,
    controlado: false,
    ...over,
  };
}

/** Una pantalla cualquiera que agrega: hace de Buscar medicamento. */
function Pantalla({ producto }: { producto: Producto }) {
  const venta = useVentaFarmacia()!;
  return <button onClick={() => venta.agregar(producto)}>Sumar {producto.nombre}</button>;
}

async function montar(producto: Producto, ruta = "/buscar") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <VentaFarmaciaProvider>
        <Routes>
          <Route path="/buscar" element={<Pantalla producto={producto} />} />
          <Route path="/pos" element={<p>El punto de venta</p>} />
        </Routes>
      </VentaFarmaciaProvider>
    </MemoryRouter>,
  );
  // Deja que termine la rehidratación.
  await act(async () => {});
}

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

const verVenta = () => screen.queryByRole("button", { name: /Ver venta/ });

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("agregar desde otra pantalla", () => {
  it("avisa, y aparece el botón que lleva a la venta", async () => {
    await montar(med({}));
    expect(verVenta()).not.toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Paracetamol 500 mg agregado a la venta");
    expect(verVenta()).toHaveTextContent("Ver venta · 1 u. · Bs 0,50");

    await tocar(verVenta()!);
    expect(screen.getByText("El punto de venta")).toBeInTheDocument();
    // En el POS el carrito ya está a la vista: el botón sobra.
    expect(verVenta()).not.toBeInTheDocument();
  });

  it("un controlado pregunta por la receta antes de sumarlo", async () => {
    await montar(
      med({ nombre: "Clonazepam 2 mg", controlado: true, condicionVenta: "RECETA_VALORADA" }),
    );
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByText(/Pedí la receta y quedátela/)).toBeInTheDocument();
    expect(verVenta()).not.toBeInTheDocument();

    await tocar(screen.getByRole("button", { name: "Tengo la receta" }));
    expect(verVenta()).toHaveTextContent("1 u.");
  });

  it("sin stock no lo suma, y lo dice en vez de avisar que se agregó", async () => {
    await montar(med({ stockTotal: 0 }));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Paracetamol 500 mg: agotado");
    expect(verVenta()).not.toBeInTheDocument();
  });
});

describe("después de un F5", () => {
  it("la venta vuelve, con el precio de hoy", async () => {
    // Se guardan ids y cantidades; el artículo se vuelve a pedir, así que si
    // el precio cambió mientras tanto se cobra el nuevo.
    sessionStorage.setItem(
      "bamar.carrito.LOCAL",
      JSON.stringify([{ id: 5, cantidad: 2, enMesa: 2, nota: "" }]),
    );
    vi.mocked(api.getProducto).mockResolvedValue(med({ id: 5, precio: 3 }));

    await montar(med({}));
    expect(api.getProducto).toHaveBeenCalledWith(5);
    expect(verVenta()).toHaveTextContent("Ver venta · 2 u. · Bs 6,00");
  });
});
