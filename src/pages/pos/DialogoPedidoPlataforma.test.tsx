import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DialogoPedidoPlataforma, { type LineaDelPedido } from "./DialogoPedidoPlataforma";

/**
 * El diálogo de confirmación de un pedido de Yango / PedidosYa
 * (PLAN-PEDIDOS-PLATAFORMA §5): el detalle, el N° opcional, el aviso de que no
 * se cobra, y qué pasa cuando el servidor dice que no. Desde el 19-nov, además,
 * el precio de cada producto EN LA APP, el descuento y las observaciones
 * (CONTRATO-PRECIO-PLATAFORMA).
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
      precios: [
        { clave: 5, productoId: 5, precioApp: 35, precioLocal: 35 },
        { clave: 6, productoId: 6, precioApp: 10, precioLocal: 10 },
      ],
      descuento: 0,
      observaciones: undefined,
      // Sin precios cambiados no hay nada que recordar (ni casilla).
      recordarPrecios: false,
      subtotal: 80,
      total: 80,
    });
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

describe("el precio de la app, el descuento y las observaciones (19-nov)", () => {
  // El caso real: en el local Bs 18, en PedidosYa Bs 21 (ya recordado), con un topping de Bs 3.
  const BRASA: LineaDelPedido = {
    clave: "12",
    productoId: 12,
    nombre: "Brasa económico",
    cantidad: 3,
    precioLocal: 18,
    precioRecordado: 21,
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

  it("precarga el precio recordado de esa app (o el del local) y suma los toppings al renglón", () => {
    montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    expect(screen.getByText("Precios como figuran en PedidosYa")).toBeInTheDocument();
    expect(precio("Brasa económico")).toHaveValue("21");
    expect(precio("Cuarto pierna broaster")).toHaveValue("18");
    // 3 × 21 = 63 · (18 + 3) × 1 = 21 · total 84.
    expect(screen.getByText(/Bs.63,00/)).toBeInTheDocument();
    expect(screen.getByText(/Bs.21,00/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bs.84,00/).length).toBeGreaterThan(0);
    // «En el local» sólo donde el precio de la app es otro; «c/u» sólo con cantidad distinta de 1.
    expect(screen.getAllByText(/En el local:/)).toHaveLength(1);
    expect(screen.getByText(/En el local: Bs.18,00/)).toBeInTheDocument();
    expect(screen.getAllByText("c/u")).toHaveLength(1);
    // Sin descuento no hay renglón de subtotal.
    expect(screen.queryByText("Subtotal")).not.toBeInTheDocument();
  });

  it("al cambiar un precio aparece «Recordar» tildada, y registrar manda precio, descuento, nota y recordar", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // La coma vale como punto (la convierte `Input`).
    fireEvent.change(precio("Cuarto pierna broaster"), { target: { value: "21,5" } });
    expect(precio("Cuarto pierna broaster")).toHaveValue("21.5");
    const recordar = screen.getByRole("checkbox", {
      name: "Recordar estos precios para los próximos pedidos de PedidosYa",
    });
    expect(recordar).toBeChecked();
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Observaciones (opcional)"), { target: { value: "  sin ají  " } });
    // Con descuento: subtotal 63 + 24,50 = 87,50 y total 86,50.
    expect(screen.getByText("Subtotal")).toBeInTheDocument();
    expect(screen.getByText(/Bs.87,50/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bs.86,50/).length).toBeGreaterThan(0);
    await registrar();
    expect(confirmado(a.onRegistrar)).toEqual({
      codigoExterno: undefined,
      precios: [
        { clave: "12", productoId: 12, precioApp: 21, precioLocal: 18 },
        { clave: "13", productoId: 13, precioApp: 21.5, precioLocal: 18 },
      ],
      descuento: 1,
      observaciones: "sin ají",
      recordarPrecios: true,
      subtotal: 87.5,
      total: 86.5,
    });
  });

  it("destildar «Recordar» registra igual, sin recordar", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("checkbox"));
    await registrar();
    expect(confirmado(a.onRegistrar)).toMatchObject({
      precios: [{ productoId: 12, precioApp: 22 }],
      recordarPrecios: false,
      total: 66,
    });
  });

  it("no deja escribir más de 2 decimales", () => {
    montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21.55" } });
    fireEvent.change(precio("Brasa económico"), { target: { value: "21.555" } });
    expect(precio("Brasa económico")).toHaveValue("21.55");
  });

  it("un precio vacío no registra y dice cuál falta", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA, CUARTO] });
    fireEvent.change(precio("Cuarto pierna broaster"), { target: { value: "" } });
    await registrar();
    expect(a.onRegistrar).not.toHaveBeenCalled();
    expect(screen.getByText("Poné el precio de «Cuarto pierna broaster» en PedidosYa.")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Pedido de PedidosYa" })).toBeInTheDocument();
  });

  it("el descuento mayor que el pedido no registra y muestra el error; igual al pedido sí (un pedido gratis)", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "63.01" } });
    // El Total no se muestra en negativo: Bs 0 hasta corregirlo.
    expect(screen.getAllByText(/Bs.0,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Bs.-/)).not.toBeInTheDocument();
    await registrar();
    expect(a.onRegistrar).not.toHaveBeenCalled();
    expect(screen.getByText("El descuento no puede ser mayor que el pedido.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Descuento (Bs)"), { target: { value: "63" } });
    await registrar();
    expect(confirmado(a.onRegistrar)).toMatchObject({ descuento: 63, subtotal: 63, total: 0 });
  });

  describe("se pone al día si llega otro precio con el diálogo abierto (otro equipo lo aprendió)", () => {
    function abrirConRerender() {
      const onRegistrar = vi.fn().mockResolvedValue(undefined);
      const props = { plataforma: "PEDIDOS_YA" as const, onClose: vi.fn(), onRegistrar };
      const r = render(<DialogoPedidoPlataforma {...props} lineas={[BRASA, CUARTO]} />);
      /** Lo que hace el POS cuando llega la respuesta: las mismas líneas con el precio nuevo. */
      const llega = (brasa: number, cuarto?: number) =>
        r.rerender(
          <DialogoPedidoPlataforma
            {...props}
            lineas={[{ ...BRASA, precioRecordado: brasa }, { ...CUARTO, precioRecordado: cuarto }]}
          />,
        );
      return { onRegistrar, llega };
    }

    it("un renglón sin tocar pasa al precio nuevo, y no aparece «Recordar» (no lo cambió el cajero)", async () => {
      const a = abrirConRerender();
      expect(precio("Brasa económico")).toHaveValue("21");
      a.llega(23, 20);
      expect(precio("Brasa económico")).toHaveValue("23");
      expect(precio("Cuarto pierna broaster")).toHaveValue("20");
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
      await registrar();
      expect(confirmado(a.onRegistrar)).toMatchObject({
        precios: [{ precioApp: 23 }, { precioApp: 20 }],
        recordarPrecios: false,
        total: 3 * 23 + 20 + 3,
      });
    });

    it("un renglón que el cajero ya editó queda con lo que escribió (aunque lo haya dejado igual)", () => {
      const a = abrirConRerender();
      fireEvent.change(precio("Brasa económico"), { target: { value: "22" } });
      fireEvent.change(precio("Cuarto pierna broaster"), { target: { value: "19" } });
      fireEvent.change(precio("Cuarto pierna broaster"), { target: { value: "18" } });
      a.llega(23, 20);
      expect(precio("Brasa económico")).toHaveValue("22");
      expect(precio("Cuarto pierna broaster")).toHaveValue("18");
      // «Recordar» sigue comparando contra el arranque vigente (21): 22 es un cambio.
      expect(screen.getByRole("checkbox")).toBeChecked();
    });
  });

  it("un precio de cero vale (un 2x1 de la app)", async () => {
    const a = montar({ plataforma: "PEDIDOS_YA", lineas: [BRASA] });
    fireEvent.change(precio("Brasa económico"), { target: { value: "0" } });
    await registrar();
    expect(confirmado(a.onRegistrar)).toMatchObject({ precios: [{ precioApp: 0 }], total: 0 });
  });
});
