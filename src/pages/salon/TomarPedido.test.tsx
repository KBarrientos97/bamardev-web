import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";
import type { Mesa } from "../../types/salon";

/**
 * BUG-salon-5: la comanda viaja con `clienteRequestId`, el mismo en un
 * reintento, para que la cocina no reciba dos veces el mismo pedido.
 */

vi.mock("../../lib/api", () => ({
  api: {
    cartaSalon: vi.fn(),
    crearComanda: vi.fn(),
  },
}));

// La tarjeta de la carta es de otra pantalla: acá basta con poder sumar.
vi.mock("./TarjetaCarta", () => ({
  default: (p: { producto: Producto; onAgregar: () => void }) => (
    <li>
      <button onClick={p.onAgregar}>{p.producto.nombre}</button>
    </li>
  ),
}));

import { api } from "../../lib/api";
import TomarPedido from "./TomarPedido";

const COCA = { id: 3, nombre: "Coca-Cola", precio: 10, categoria: { nombre: "Bebidas" } } as unknown as Producto;
const BRASA = { id: 4, nombre: "Brasa cuarto", precio: 26, categoria: { nombre: "Pollos" } } as unknown as Producto;

const MESA = {
  id: 1,
  codigo: "M1",
  nombre: "Mesa M1",
  zonaCodigo: "salon",
  zonaNombre: "Salón",
  capacidad: 4,
  capacidadTotal: 4,
  unidas: [],
  activa: true,
  estado: "OCUPADA",
  comensales: 2,
  consumo: 0,
  propina: 0,
  comandas: [],
} satisfies Mesa;

async function montar(onEnviado = vi.fn()) {
  render(<TomarPedido mesa={MESA} onAtras={() => {}} onEnviado={onEnviado} />);
  await screen.findByText("Coca-Cola");
  return onEnviado;
}

/** Abre el carrito (la píldora del pedido) y toca "Enviar a cocina". */
async function enviar() {
  if (!screen.queryByRole("button", { name: /Enviar a cocina/ })) {
    fireEvent.click(screen.getByRole("button", { name: /Bs/ }));
  }
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Enviar a cocina/ }));
  });
}

const idDel = (llamada: number) =>
  vi.mocked(api.crearComanda).mock.calls[llamada][1].clienteRequestId;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.cartaSalon).mockResolvedValue([COCA, BRASA]);
});

describe("BUG-salon-5: la comanda no se duplica en un reintento", () => {
  it("un reintento después de un error manda el MISMO clienteRequestId", async () => {
    // El caso: la respuesta se pierde (wifi del local, el corte de 20 s), la
    // pantalla muestra el error y el mesero toca "Enviar" otra vez. Sin el id,
    // el backend no puede saber que es el mismo pedido y la cocina lo hace dos
    // veces (y se cobra dos veces si nadie lo ve).
    vi.mocked(api.crearComanda)
      .mockRejectedValueOnce(new Error("El servidor está tardando demasiado. Probá de nuevo en un momento."))
      .mockResolvedValueOnce(MESA);
    const onEnviado = await montar();
    fireEvent.click(screen.getByText("Coca-Cola"));

    await enviar();
    expect(await screen.findByText(/está tardando demasiado/)).toBeInTheDocument();
    await enviar();

    expect(api.crearComanda).toHaveBeenCalledTimes(2);
    expect(idDel(0)).toEqual(expect.any(String));
    expect(idDel(1)).toBe(idDel(0));
    expect(vi.mocked(api.crearComanda).mock.calls[0][1].items).toEqual([{ productoId: 3, cantidad: 1 }]);
    expect(onEnviado).toHaveBeenCalledWith("Pedido enviado a cocina");
  });

  it("si después del error el pedido cambió, es otro envío: id nuevo", async () => {
    // Con el mismo id, si el primero sí había entrado, el backend devolvería
    // esa comanda vieja y lo agregado no llegaría a la cocina.
    vi.mocked(api.crearComanda).mockRejectedValueOnce(new Error("Sin internet.")).mockResolvedValueOnce(MESA);
    await montar();
    fireEvent.click(screen.getByText("Coca-Cola"));
    await enviar();
    await screen.findByText("Sin internet.");

    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByText("Brasa cuarto"));
    await enviar();

    expect(idDel(1)).not.toBe(idDel(0));
  });
});
