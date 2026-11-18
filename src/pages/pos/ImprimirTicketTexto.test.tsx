import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReporteCierreProductos } from "../../types";

/**
 * El papel de los tickets de texto de 58 mm (CONTRATO-DELIVERY-FULL-18NOV
 * ítem 2): SIEMPRE en negrita y en negro puro, con o sin «Letra gruesa» de
 * Ticket y recibo, porque en la térmica la letra normal sale clara.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Nombre del negocio" }, usuario: { id: 1 } }),
}));

import ImprimirTicketCierre from "./ImprimirTicketCierre";
import ImprimirTicketTexto from "./ImprimirTicketTexto";

const PRODUCTOS = {
  unidades: 4,
  total: 60,
  lineas: 1,
  categorias: [{ nombre: "Pollos", unidades: 4, total: 60, items: [{ nombre: "Cuarto de pollo", cantidad: 4, precio: 15, total: 60, productoId: 1 }] }],
} as unknown as ReporteCierreProductos;

const papel = () => document.getElementById("area-impresion");

beforeEach(() => {
  window.print = vi.fn();
});

describe("el ticket de cierre", () => {
  it("sale siempre en negrita y negro puro, en el rollo de 58 mm", () => {
    render(<ImprimirTicketCierre productos={PRODUCTOS} datos={{ negocio: "Nombre del negocio", abrio: "2026-11-18T12:00:00.000Z" }} />);
    expect(papel()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir ticket" }));
    expect(window.print).toHaveBeenCalledTimes(1);
    const p = papel()!;
    expect(p).toHaveClass("papel-negrita");
    expect(p.dataset.testid).toBe("ticket-cierre");
    expect(p.style.getPropertyValue("--ancho-ticket")).toBe("48mm");
    const pre = p.querySelector("pre")!;
    expect(pre.style.fontWeight).toBe("700");
    expect(pre.style.color).toBe("rgb(0, 0, 0)");
    expect(pre.textContent).toContain("4 Cuarto de pollo");
    // Al terminar la impresión el papel se retira.
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(papel()).toBeNull();
  });
});

describe("ImprimirTicketTexto", () => {
  it("imprime el texto tal cual, en negrita, y lo arma recién al tocar", () => {
    const armar = vi.fn(() => "PEDIDO YANGO\n2 x Brasa entero          224.00");
    render(<ImprimirTicketTexto etiqueta="Imprimir pedido" texto={armar} testId="ticket-pedido-web" />);
    expect(armar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Imprimir pedido" }));
    expect(armar).toHaveBeenCalledTimes(1);
    const p = papel()!;
    expect(p).toHaveClass("papel-negrita");
    expect(p.dataset.testid).toBe("ticket-pedido-web");
    expect(p.querySelector("pre")!.textContent).toBe("PEDIDO YANGO\n2 x Brasa entero          224.00");
    expect(p.querySelector("pre")!.style.fontWeight).toBe("700");
  });

  it("dos impresiones seguidas no dejan dos papeles", () => {
    render(<ImprimirTicketTexto texto="uno" />);
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    fireEvent.click(screen.getByRole("button", { name: "Imprimir" }));
    expect(document.querySelectorAll("#area-impresion")).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(papel()).toBeNull();
  });
});
