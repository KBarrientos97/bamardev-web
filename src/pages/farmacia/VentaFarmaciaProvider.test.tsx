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
  api: { getProducto: vi.fn(), cajaActual: vi.fn() },
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
  return (
    <>
      <button onClick={() => venta.agregar(producto)}>Sumar {producto.nombre}</button>
      {/* Lo que el POS le va a mandar al servidor al cobrar. */}
      <pre data-testid="detalles">{JSON.stringify(venta.carrito.aDetalles())}</pre>
      <button onClick={() => venta.carrito.vaciar()}>Cobrada</button>
    </>
  );
}

const detalles = () =>
  JSON.parse(screen.getByTestId("detalles").textContent ?? "[]") as {
    productoId: number;
    receta?: Record<string, string>;
  }[];

/** Llena el formulario de la receta con lo que trae el papel. */
async function llenarReceta(numero = "V-981") {
  // Por el comienzo: cuando el campo marca un error, el texto del label lo suma.
  const escribir = (label: RegExp, valor: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value: valor } });
  await act(async () => {
    escribir(/^Paciente \*/, "Juan Pérez");
    escribir(/^Médico \*/, "Dra. Ana Rojas");
    escribir(/^Matrícula \*/, "R-1234");
    escribir(/^N° de receta/, numero);
  });
  await tocar(screen.getByRole("button", { name: /Agregar a la venta/ }));
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
  vi.mocked(api.cajaActual).mockResolvedValue({ caja: null });
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

  it("un controlado pide los datos de la receta antes de sumarlo", async () => {
    await montar(
      med({ nombre: "Clonazepam 2 mg", controlado: true, condicionVenta: "RECETA_VALORADA" }),
    );
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByText(/Pedí la receta y quedátela/)).toHaveTextContent(
      "libro de Estupefacientes",
    );
    expect(verVenta()).not.toBeInTheDocument();

    // Sin los datos no se agrega: los marca y espera.
    await tocar(screen.getByRole("button", { name: /Agregar a la venta/ }));
    expect(screen.getByText("Nombre y apellido del paciente")).toBeInTheDocument();
    expect(screen.getByText("La receta valorada es un formulario numerado")).toBeInTheDocument();
    expect(verVenta()).not.toBeInTheDocument();

    await llenarReceta();
    expect(verVenta()).toHaveTextContent("1 u.");
  });

  it("la receta viaja con la venta, sin espacios de más", async () => {
    await montar(med({ id: 14, nombre: "Clonazepam 2 mg", condicionVenta: "RECETA_ARCHIVADA" }));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    await llenarReceta("  V-981 ");
    expect(detalles()[0]).toMatchObject({
      productoId: 14,
      receta: {
        pacienteNombre: "Juan Pérez",
        medicoMatricula: "R-1234",
        recetaNumero: "V-981",
      },
    });
  });

  it("una unidad más del mismo no vuelve a pedirla; el cliente siguiente sí", async () => {
    await montar(med({ nombre: "Clonazepam 2 mg", controlado: true }));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    await llenarReceta();
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.queryByText(/Pedí la receta/)).not.toBeInTheDocument();
    expect(verVenta()).toHaveTextContent("2 u.");

    // Se cobró: la receta se fue con la venta. El próximo cliente no hereda
    // el paciente del anterior.
    await tocar(screen.getByRole("button", { name: "Cobrada" }));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByText(/Pedí la receta/)).toBeInTheDocument();
  });

  it("lo que no pide receta no la lleva", async () => {
    await montar(med({}));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.queryByText(/Pedí la receta/)).not.toBeInTheDocument();
    expect(detalles()[0].receta).toBeUndefined();
  });

  it("sin stock no lo suma, y lo dice en vez de avisar que se agregó", async () => {
    await montar(med({ stockTotal: 0 }));
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Paracetamol 500 mg: agotado");
    expect(verVenta()).not.toBeInTheDocument();
  });
});

describe("escribir la cantidad", () => {
  /** Hace de renglón del carrito: fija la cantidad que se le pide. */
  function Renglon({ producto, cantidad }: { producto: Producto; cantidad: number }) {
    const venta = useVentaFarmacia()!;
    return (
      <button onClick={() => venta.fijarCantidad(producto, cantidad)}>
        Poner {cantidad}
      </button>
    );
  }

  async function montarRenglon(producto: Producto, cantidad: number) {
    render(
      <MemoryRouter initialEntries={["/buscar"]}>
        <VentaFarmaciaProvider>
          <Pantalla producto={producto} />
          <Renglon producto={producto} cantidad={cantidad} />
        </VentaFarmaciaProvider>
      </MemoryRouter>,
    );
    await act(async () => {});
    await tocar(screen.getByRole("button", { name: /Sumar/ }));
  }

  it("un blíster de 10 son 10 unidades", async () => {
    await montarRenglon(med({}), 10);
    await tocar(screen.getByRole("button", { name: "Poner 10" }));
    expect(verVenta()).toHaveTextContent("Ver venta · 10 u. · Bs 5,00");
  });

  it("más de lo que hay queda en lo que hay, y lo dice", async () => {
    await montarRenglon(med({ stockTotal: 24 }), 300);
    await tocar(screen.getByRole("button", { name: "Poner 300" }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Paracetamol 500 mg: no hay tanto, quedan 24 u.",
    );
    expect(verVenta()).toHaveTextContent("24 u.");
  });

  it("no vuelve a preguntar por la receta: ya se preguntó al agregarlo", async () => {
    const clona = med({ nombre: "Clonazepam 2 mg", controlado: true });
    await montarRenglon(clona, 3);
    await llenarReceta();
    await tocar(screen.getByRole("button", { name: "Poner 3" }));
    expect(screen.queryByText(/Pedí la receta/)).not.toBeInTheDocument();
    expect(verVenta()).toHaveTextContent("3 u.");
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
    expect(api.getProducto).toHaveBeenCalledWith(5, null);
    expect(verVenta()).toHaveTextContent("Ver venta · 2 u. · Bs 6,00");
  });

  it("vuelve con el precio y el stock de la sucursal de la caja", async () => {
    // El dueño no tiene sucursal: sin esto le volvía el precio de lista y el
    // stock de todo el negocio, y podía cargar más de lo que hay en el mostrador.
    sessionStorage.setItem(
      "bamar.carrito.LOCAL",
      JSON.stringify([{ id: 5, cantidad: 1, enMesa: 1, nota: "" }]),
    );
    vi.mocked(api.cajaActual).mockResolvedValue({ caja: { almacenId: 917 } as never });
    vi.mocked(api.getProducto).mockResolvedValue(med({ id: 5 }));

    await montar(med({}));
    expect(api.getProducto).toHaveBeenCalledWith(5, 917);
  });
});
