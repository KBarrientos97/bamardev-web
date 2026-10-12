import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EditorPedidosRegalos from "./EditorPedidosRegalos";
import type { CambiosPagina, ConfigRegalos } from "../../lib/pagina/tipos";

/** "Pedidos y gift cards" en el editor de Mi página (IDEAS/6 #1 y #6). */

const GUARDADO: ConfigRegalos = {
  activo: true,
  montos: [50, 100],
  montoLibre: true,
  disenos: [],
  diseno: null,
  vigenciaDias: null,
  condiciones: null,
};

function montar(over: Partial<Parameters<typeof EditorPedidosRegalos>[0]> = {}) {
  const cambiar = vi.fn<(c: CambiosPagina) => void>();
  render(
    <EditorPedidosRegalos
      guardado={GUARDADO}
      pedidosGuardado={false}
      borrador={{}}
      cambiar={cambiar}
      negocio="Barbería El Navajazo"
      rubro="BARBERIA"
      color="#3F3C3A"
      fotoUrl={null}
      conGiftCards
      conWhatsapp
      {...over}
    />,
  );
  return cambiar;
}

describe("Pedidos y gift cards (editor)", () => {
  it("prende los pedidos por WhatsApp", () => {
    const cambiar = montar();
    fireEvent.click(screen.getByRole("checkbox", { name: /Recibir pedidos por WhatsApp/ }));
    expect(cambiar).toHaveBeenCalledWith({ pedidosWhatsapp: true });
  });

  it("muestra los 10 diseños con el color y el rubro; sacar uno guarda la lista, y el último no se saca", () => {
    const cambiar = montar();
    expect(screen.getAllByRole("img", { name: /Gift card de Barbería El Navajazo/ })).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Neón: ofrecido" }));
    const lista = cambiar.mock.calls[0]![0].regalosDisenos!;
    expect(lista).toHaveLength(9);
    expect(lista).not.toContain("NEON");
    cambiar.mockClear();
    montar({ guardado: { ...GUARDADO, disenos: ["VALE"] } });
    fireEvent.click(screen.getAllByRole("button", { name: "Vale: ofrecido" }).at(-1)!);
    expect(cambiar).not.toHaveBeenCalled();
  });

  it("la estrella elige el que aparece primero", () => {
    const cambiar = montar();
    fireEvent.click(screen.getByRole("button", { name: "Que Elegante aparezca primero" }));
    expect(cambiar).toHaveBeenCalledWith({ regalosDiseno: "ELEGANTE" });
  });

  it("agrega un monto válido y rechaza uno fuera de rango", () => {
    const cambiar = montar();
    fireEvent.change(screen.getByLabelText("Nuevo monto"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(cambiar).not.toHaveBeenCalled();
    expect(screen.getByText(/Entre Bs 10 y Bs 10/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nuevo monto"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));
    expect(cambiar).toHaveBeenCalledWith({ regalosMontos: [50, 100, 200] });
  });

  it("sin la feature gift_cards no ofrece configurarlas; sin WhatsApp avisa", () => {
    montar({ conGiftCards: false, conWhatsapp: false });
    expect(screen.queryByRole("checkbox", { name: /Ofrecer gift cards/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Agregá tu WhatsApp/)).toBeInTheDocument();
  });
});
