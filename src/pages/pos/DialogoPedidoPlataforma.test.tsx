import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DialogoPedidoPlataforma, { type LineaDelPedido } from "./DialogoPedidoPlataforma";

/**
 * El diálogo de confirmación de un pedido de Yango / PedidosYa
 * (PLAN-PEDIDOS-PLATAFORMA §5): el detalle, el N° opcional, el aviso de que no
 * se cobra, y qué pasa cuando el servidor dice que no. Desde el 19-nov, además,
 * el precio de cada producto EN LA APP, el descuento y las observaciones
 * (CONTRATO-PRECIO-PLATAFORMA). Desde el 20-nov el precio de la app se escribe
 * a mano en cada pedido: el campo abre vacío y, vacío, vale el del local.
 */

const lineas: LineaDelPedido[] = [
  { clave: 5, productoId: 5, nombre: "Arroz con leche L", cantidad: 2, precioLocal: 35 },
  { clave: 6, productoId: 6, nombre: "Gaseosa", cantidad: 1, precioLocal: 10 },
];

function montar(props: Partial<React.ComponentProps<typeof DialogoPedidoPlataforma>> = {}) {
  const onRegistrar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DialogoPedidoPlataforma
      plataforma="YANGO"
      lineas={lineas}
      onClose={onClose}
      onRegistrar={onRegistrar}
      {...props}
    />,
  );
  return { onRegistrar, onClose };
}

const registrar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
  });
};
/** Lo que recibió `onRegistrar` la última vez. */
const confirmado = (f: ReturnType<typeof vi.fn>) => f.mock.calls.at(-1)![0];

describe("DialogoPedidoPlataforma", () => {
  it("muestra el detalle del carrito, el total y dónde queda registrado", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(screen.getByText("Arroz con leche L")).toBeInTheDocument();
    expect(screen.getByText("Gaseosa")).toBeInTheDocument();
    // 2 × Bs 35 y el total del pedido.
    expect(screen.getByText(/Bs.70,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bs.80,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("Queda en el reporte de Yango.")).toBeInTheDocument();
    expect(screen.getByLabelText("N° de pedido de Yango (opcional)")).toBeInTheDocument();
  });

  it("dice PedidosYa (junto, como la marca) cuando es esa plataforma", () => {
    montar({ plataforma: "PEDIDOS_YA" });
    expect(screen.getByLabelText("N° de pedido de PedidosYa (opcional)")).toBeInTheDocument();
    expect(screen.getByText("Queda en el reporte de PedidosYa.")).toBeInTheDocument();
  });

  it("la ayuda del número largo va sólo en PedidosYa", () => {
    montar({ plataforma: "PEDIDOS_YA" });
    const ayuda = "En PedidosYa usá el número largo (ej. 2351234567): es el que figura en la liquidación.";
    expect(screen.getByText(ayuda)).toBeInTheDocument();
    expect(screen.getByLabelText("N° de pedido de PedidosYa (opcional)")).toHaveAccessibleDescription(ayuda);
  });

  it("en Yango no va la ayuda del número largo", () => {
    montar();
    expect(screen.queryByText(/número largo/)).not.toBeInTheDocument();
  });

  it("el camino rápido no cambia: el foco arranca en el N° y Enter registra al precio de siempre", async () => {
    const a = montar();
    const campo = screen.getByLabelText("N° de pedido de Yango (opcional)");
    expect(campo).toHaveFocus();
    fireEvent.change(campo, { target: { value: "  A-123  " } });
    await act(async () => {
      fireEvent.keyDown(campo, { key: "Enter" });
    });
    expect(a.onRegistrar).toHaveBeenCalledTimes(1);
    expect(confirmado(a.onRegistrar)).toEqual({
      codigoExterno: "A-123",
      // Sin precio escrito no viaja `precioApp`: el servidor pone el del local.
      precios: [
        { clave: 5, productoId: 5, precioLocal: 35 },
        { clave: 6, productoId: 6, precioLocal: 10 },
      ],
      descuento: 0,
      observaciones: undefined,
      subtotal: 80,
      total: 80,
    });
    for (const p of confirmado(a.onRegistrar).precios) expect(p).not.toHaveProperty("precioApp");
    // Ninguna casilla: el precio de la app no se guarda para el próximo pedido.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("Registrar sin N° manda el código vacío", async () => {
    const a = montar();
    await registrar();
    expect(confirmado(a.onRegistrar).codigoExterno).toBeUndefined();
  });

  it("el N° no pasa de 64 caracteres (lo que guarda el backend)", () => {
    montar();
    const campo = screen.getByLabelText("N° de pedido de Yango (opcional)");
    fireEvent.change(campo, { target: { value: "x".repeat(100) } });
    expect(campo).toHaveValue("x".repeat(64));
  });

  it("Volver cierra sin registrar nada", () => {
    const a = montar();
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(a.onClose).toHaveBeenCalled();
    expect(a.onRegistrar).not.toHaveBeenCalled();
  });

  it("si el servidor dice que no (un 4xx), el mensaje se ve y el diálogo sigue para corregir o volver", async () => {
    const a = montar({ onRegistrar: vi.fn().mockRejectedValue(new Error("Los pedidos de Yango no están activados")) });
    await registrar();
    expect(screen.getByText("Los pedidos de Yango no están activados")).toBeInTheDocument();
    // Sigue abierto y se puede volver a intentar.
    expect(screen.getByRole("button", { name: "Registrar" })).toBeEnabled();
    expect(a.onClose).not.toHaveBeenCalled();
  });

  it("mientras registra, no se puede tocar dos veces", async () => {
    let terminar!: () => void;
    const lento = vi.fn(
      () =>
        new Promise<void>((ok) => {
          terminar = ok;
        }),
    );
    montar({ onRegistrar: lento });
    fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    expect(screen.getByRole("button", { name: "Registrando…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Registrando…" }));
    expect(lento).toHaveBeenCalledTimes(1);
    await act(async () => terminar());
  });
});

describe("el precio de la app (escrito a mano, 20-nov), el descuento y las observaciones", () => {
  // El caso real: en el local Bs 18 y en PedidosYa Bs 21; uno con un topping de Bs 3.
  const BRASA: LineaDelPedido = {
    clave: "12",
    productoId: 12,
    nombre: "Brasa económico",
    cantidad: 3,
    precioLocal: 18,
  };
  const CUARTO: LineaDelPedido = {
    clave: "13",
    productoId: 13,
    nombre: "Cuarto pierna broaster",
    cantidad: 1,
    precioLocal: 18,
    extraPorUnidad: 3,
    agregados: "+ Arroz",
  };
  const precio = (nombre: string) => screen.getByLabelText(`Precio de «${nombre}» en PedidosYa`);
  const total = () => screen.getByText("Total").nextElementSibling!.textContent;

  it("abre con el campo vacío y sin placeholder, y cada renglón vale lo del local (más los toppings)", () => {
    montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    expect(screen.getByText("Precio en PedidosYa: escribilo sólo si es distinto al del local.")).toBeInTheDocument();
    for (const nombre of ["Brasa económico", "Cuarto pierna broaster"]) {
      expect(precio(nombre)).toHaveValue("");
      expect(precio(nombre)).not.toHaveAttribute("placeholder");
    }
    // 3 × 18 = 54 · (18 + 3) × 1 = 21 · total 75: lo mismo que dice el carrito.
    expect(screen.getByText(/Bs.54,00/)).toBeInTheDocument();
    expect(screen.getByText(/Bs.21,00/)).toBeInTheDocument();
    expect(total()).toMatch(/Bs.75,00/);
    // «En el local» va siempre, en cada renglón; «c/u» sólo con cantidad distinta de 1.
    expect(screen.getAllByText(/En el local: Bs.18,00/)).toHaveLength(2);
    expect(screen.getAllByText("c/u")).toHaveLength(1);
    // Sin descuento no hay renglón de subtotal.
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
  });

  it("escribir el precio cambia el renglón y el total; borrarlo vuelve al del local", () => {
    montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21" } });
    // 3 × 21 = 63 · total 63 + 21 = 84. El precio del local sigue a la vista.
    expect(screen.getByText(/Bs.63,00/)).toBeInTheDocument();
    expect(total()).toMatch(/Bs.84,00/);
    expect(screen.getAllByText(/En el local: Bs.18,00/)).toHaveLength(2);
    expect(screen.getByRole("dialog", { name: "Pedido de PedidosYa" })).toHaveTextContent(/2 productos · Bs.84,00/);
    fireEvent.change(precio("Brasa económico"), { target: { value: "" } });
    expect(screen.getByText(/Bs.54,00/)).toBeInTheDocument();
    expect(screen.queryByText(/Bs.63,00/)).not.toBeInTheDocument();
    expect(total()).toMatch(/Bs.75,00/);
  });

  it("registrar manda el precio de la app sólo donde se escribió, con el descuento y la nota", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    // La coma vale como punto (la convierte `Input`).
    fireEvent.change(precio("Cuarto pierna broaster"), { target: { value: "21,5" } });
    expect(precio("Cuarto pierna broaster")).toHaveValue("21.5");
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), { target: { value: "  sin ají  " } });
    // Con descuento: subtotal 54 + 24,50 = 78,50 y total 77,50.
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText(/Bs.78,50/)).toBeInTheDocument();
    expect(total()).toMatch(/Bs.77,50/);
    await registrar();
    expect(confirmado(a.onRegistrar)).toEqual({
      codigoExterno: undefined,
      precios: [
        { clave: "12", productoId: 12, precioLocal: 18 },
        { clave: "13", productoId: 13, precioLocal: 18, precioApp: 21.5 },
      ],
      descuento: 1,
      observaciones: "sin ají",
      subtotal: 78.5,
      total: 77.5,
    });
    expect(confirmado(a.onRegistrar).precios[0]).not.toHaveProperty("precioApp");
  });

  it("un precio vacío no es un error: registra con el del local", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "2" } });
    fireEvent.change(precio("Brasa económico"), { target: { value: "" } });
    await registrar();
    expect(a.onRegistrar).toHaveBeenCalledTimes(1);
    expect(confirmado(a.onRegistrar)).toEqual({
      codigoExterno: undefined,
      precios: [{ clave: "12", productoId: 12, precioLocal: 18 }],
      descuento: 0,
      observaciones: undefined,
      subtotal: 54,
      total: 54,
    });
  });

  it("no deja escribir más de 2 decimales ni más que el máximo del backend", () => {
    montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21.55" } });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21.555" } });
    expect(precio("Brasa económico")).toHaveValue("21.55");
    fireEvent.change(precio("Brasa económico"), { target: { value: "9999999" } });
    fireEvent.change(precio("Brasa económico"), { target: { value: "9999999.5" } });
    expect(precio("Brasa económico")).toHaveValue("9999999");
  });

  it("el descuento mayor que el pedido no registra y muestra el error; igual al pedido sí (un pedido gratis)", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21" } });
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "63.01" } });
    // El Total no se muestra en negativo: Bs 0 hasta corregirlo.
    expect(total()).toMatch(/Bs.0,00/);
    expect(screen.queryByText(/Bs.-/)).not.toBeInTheDocument();
    await registrar();
    expect(a.onRegistrar).not.toHaveBeenCalled();
    expect(screen.getByText("El descuento no puede ser mayor que el pedido.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "63" } });
    await registrar();
    expect(confirmado(a.onRegistrar)).toMatchObject({ descuento: 63, subtotal: 63, total: 0 });
  });

  it("un precio de cero vale (un 2x1 de la app), no es «vacío»", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "0" } });
    await registrar();
    expect(confirmado(a.onRegistrar)).toMatchObject({ precios: [{ precioApp: 0 }], total: 0 });
  });
});
