import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DialogoPedidoPlataforma from "./DialogoPedidoPlataforma";

/**
 * El diálogo de confirmación de un pedido de Yango / PedidosYa
 * (PLAN-PEDIDOS-PLATAFORMA §5): el detalle, el N° opcional, el aviso de que no
 * se cobra, y qué pasa cuando el servidor dice que no.
 */

const lineas = [
  { clave: 5, nombre: "Arroz con leche L", cantidad: 2, precio: 35 },
  { clave: 6, nombre: "Gaseosa", cantidad: 1, precio: 10 },
];

function montar(props: Partial<React.ComponentProps<typeof DialogoPedidoPlataforma>> = {}) {
  const onRegistrar = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <DialogoPedidoPlataforma
      plataforma="YANGO"
      lineas={lineas}
      total={80}
      onClose={onClose}
      onRegistrar={onRegistrar}
      {...props}
    />,
  );
  return { onRegistrar, onClose };
}

describe("DialogoPedidoPlataforma", () => {
  it("muestra el detalle del carrito, el total y el aviso de que no se cobra", () => {
    montar();
    expect(screen.getByRole("dialog", { name: "Pedido de Yango" })).toBeInTheDocument();
    expect(screen.getByText("Arroz con leche L")).toBeInTheDocument();
    expect(screen.getByText("Gaseosa")).toBeInTheDocument();
    // 2 × Bs 35 y el total del pedido.
    expect(screen.getByText(/Bs.70,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bs.80,00/).length).toBeGreaterThan(0);
    expect(screen.getByText("No se cobra ni entra a la caja. Queda en el reporte de Yango.")).toBeInTheDocument();
    expect(screen.getByLabelText("N° de pedido de Yango (opcional)")).toBeInTheDocument();
  });

  it("dice PedidosYa (junto, como la marca) cuando es esa plataforma", () => {
    montar({ plataforma: "PEDIDOS_YA" });
    expect(screen.getByLabelText("N° de pedido de PedidosYa (opcional)")).toBeInTheDocument();
    expect(screen.getByText("No se cobra ni entra a la caja. Queda en el reporte de PedidosYa.")).toBeInTheDocument();
  });

  it("Registrar sin N° manda undefined; con N° lo manda recortado", async () => {
    const a = montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(a.onRegistrar).toHaveBeenCalledWith(undefined);
  });

  it("con N°, lo manda sin espacios de más", async () => {
    const a = montar();
    fireEvent.change(screen.getByLabelText("N° de pedido de Yango (opcional)"), { target: { value: "  A-123  " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
    expect(a.onRegistrar).toHaveBeenCalledWith("A-123");
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Registrar" }));
    });
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
