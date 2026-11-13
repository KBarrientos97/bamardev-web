import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiPedidosWeb } from "../../lib/pedidosWeb/apiPrivada";
import { TARIFA_POR_DEFECTO } from "../../lib/pedidosWeb/tarifa";
import EditorPedidosRegalos from "./EditorPedidosRegalos";

// La tarifa de envío se baja del servidor al prender los pedidos en el sistema.
vi.mock("../../lib/pedidosWeb/apiPrivada", () => ({
  apiPedidosWeb: { tarifa: vi.fn(), guardarTarifa: vi.fn() },
}));
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
      sistemaGuardado={false}
      borrador={{}}
      cambiar={cambiar}
      negocio="Barbería El Navajazo"
      rubro="BARBERIA"
      color="#3F3C3A"
      fotoUrl={null}
      conGiftCards
      conPedidos
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

  it("sin el extra de pedidos no ofrece el interruptor y explica cómo pedirlo", () => {
    montar({ conPedidos: false });
    expect(screen.queryByRole("checkbox", { name: /Recibir pedidos por WhatsApp/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Es un extra: pedilo a BamarDev/)).toBeInTheDocument();
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

  describe("pedidos en el sistema (13-nov)", () => {
    beforeEach(() => {
      vi.mocked(apiPedidosWeb.tarifa).mockResolvedValue(TARIFA_POR_DEFECTO);
      vi.mocked(apiPedidosWeb.guardarTarifa).mockImplementation(async (t) => t);
    });

    it("con delivery y «Mis productos» se prende; manda pedidosSistema al borrador", () => {
      const cambiar = montar({ conDelivery: true, conProductos: true });
      fireEvent.click(screen.getByRole("checkbox", { name: /Recibir pedidos en el sistema/ }));
      expect(cambiar).toHaveBeenCalledWith({ pedidosSistema: true });
    });

    it("sin la feature delivery no ofrece el interruptor y explica cómo pedirlo", () => {
      montar({ conDelivery: false, conProductos: true });
      expect(screen.queryByRole("checkbox", { name: /Recibir pedidos en el sistema/ })).not.toBeInTheDocument();
      expect(screen.getByText(/parte del módulo de Delivery: pedilo a BamarDev/)).toBeInTheDocument();
    });

    it("con el catálogo armado a mano no se puede prender y dice por qué", () => {
      montar({ conDelivery: true, conProductos: false, borrador: { pedidosSistema: true } });
      expect(screen.getByRole("checkbox", { name: /Recibir pedidos en el sistema/ })).toBeDisabled();
      expect(screen.getByRole("checkbox", { name: /Recibir pedidos en el sistema/ })).not.toBeChecked();
      expect(screen.getByText(/pasá tu catálogo a «Mis productos»/)).toBeInTheDocument();
    });

    it("con WhatsApp también prendido avisa que gana WhatsApp", () => {
      montar({ conDelivery: true, conProductos: true, sistemaGuardado: true, pedidosGuardado: true });
      expect(screen.getByText(/gana WhatsApp/)).toBeInTheDocument();
    });

    it("prendido, muestra la tarifa de envío; se edita y se guarda al toque", async () => {
      montar({ conDelivery: true, conProductos: true, sistemaGuardado: true });
      expect(await screen.findByLabelText("Precio fijo del primer tramo")).toHaveValue("7");
      expect(screen.getByText(/3 km = Bs.9,00 · 5 km = Bs.13,00 · 8 km = Bs.18,00/)).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Precio fijo del primer tramo"), { target: { value: "8" } });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Guardar tarifa" }));
      });
      expect(apiPedidosWeb.guardarTarifa).toHaveBeenCalledWith({
        tramos: [{ hastaKm: 2, base: 8 }, { hastaKm: 5, porKm: 2 }, { hastaKm: 10, porKm: 1.5 }, { hastaKm: null, porKm: 1 }],
        maxKm: 12,
      });
      expect(await screen.findByText("Tarifa guardada.")).toBeInTheDocument();
    });

    it("una tarifa inválida no se manda", async () => {
      montar({ conDelivery: true, conProductos: true, sistemaGuardado: true });
      fireEvent.change(await screen.findByLabelText("Distancia máxima en km"), { target: { value: "80" } });
      expect(screen.getByText(/entre 1 y 50 km/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Guardar tarifa" })).toBeDisabled();
    });
  });
});
