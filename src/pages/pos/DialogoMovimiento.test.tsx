import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Movimiento de efectivo": el del cierre de caja de siempre (sin las props de
 * Supervisión es exactamente el de antes) y, desde el 24-oct, el que el
 * administrador del billar usa para darle la cena a la cajera.
 */

vi.mock("../../lib/api", () => ({ api: { crearMovimientoCaja: vi.fn() } }));

import { api } from "../../lib/api";
import DialogoMovimiento from "./DialogoMovimiento";
import { MOTIVO_CENA } from "./motivosMovimiento";

const alGuardar = vi.fn();
const alCerrar = vi.fn();

async function abrir(props: Partial<React.ComponentProps<typeof DialogoMovimiento>> = {}) {
  render(<DialogoMovimiento cajaId={7} onClose={alCerrar} onGuardado={alGuardar} {...props} />);
  await act(async () => {});
  return screen.getByRole("dialog");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.crearMovimientoCaja).mockResolvedValue({ id: 1 } as never);
});

describe("el movimiento de efectivo de siempre", () => {
  it("trae los motivos de siempre y ninguna cena", async () => {
    const d = await abrir();
    for (const m of ["Sencillo", "Devolución", "Pago a proveedor", "Retiro", "Otro"]) {
      expect(within(d).getByText(m)).toBeInTheDocument();
    }
    expect(within(d).queryByText("Cena")).toBeNull();
    // Ni aviso de a qué caja va ni montos para tocar.
    expect(within(d).queryByText(/Va a la caja de/)).toBeNull();
    expect(within(d).queryByText(/el efectivo esperado pasa de/)).toBeNull();
  });

  it("un retiro se manda sin ningún origen", async () => {
    const d = await abrir();
    fireEvent.click(within(d).getByText("Retiro"));
    fireEvent.change(within(d).getByLabelText("Monto"), { target: { value: "25" } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "EGRESO", monto: 25, descripcion: "Retiro" });
    expect(alGuardar).toHaveBeenCalled();
  });

  it("pide un monto mayor a cero y no manda nada si falta", async () => {
    const d = await abrir();
    fireEvent.click(within(d).getByText("Sencillo"));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText("Poné un monto mayor a cero.")).toBeInTheDocument();
    expect(api.crearMovimientoCaja).not.toHaveBeenCalled();
  });
});

describe("la cena desde Supervisión del billar", () => {
  const supervision = { motivosExtra: [MOTIVO_CENA], deQuien: { nombre: "Carla", desde: new Date(2026, 9, 23, 16, 5).getTime() }, esperado: 165 };

  it("la cena va primero, con montos para tocar y el aviso de cómo cambia el cierre", async () => {
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    // Los motivos, en el orden en que se ven: la cena primero.
    const motivos = Array.from(within(d).getByText("Cena").parentElement!.querySelectorAll("button")).map((b) => b.textContent);
    expect(motivos).toEqual(["Cena", "Sencillo", "Devolución", "Pago a proveedor", "Retiro", "Otro"]);
    expect(within(d).getByText("Carla")).toBeInTheDocument();
    expect(within(d).getByText("Sale plata de la caja")).toBeInTheDocument();
    // Sin monto todavía no hay aviso.
    expect(within(d).queryByText(/el efectivo esperado pasa de/)).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: "20" }));
    expect(within(d).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/165,00.*145,00/);
  });

  it("se manda como cena, con la descripción «Cena»", async () => {
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    fireEvent.click(within(d).getByRole("button", { name: "15" }));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "EGRESO", monto: 15, descripcion: "Cena", origen: "CENA" });
  });

  it("con el botón general arranca en «Otro» y el aviso suma si es una entrada", async () => {
    const d = await abrir(supervision);
    expect(within(d).getByRole("textbox", { name: /Descripción/ })).toBeInTheDocument();
    fireEvent.click(within(d).getByText("Sencillo"));
    fireEvent.change(within(d).getByLabelText("Monto"), { target: { value: "30" } });
    expect(within(d).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/165,00.*195,00/);
  });

  it("un error del servidor se dice y no cierra el cuadro", async () => {
    vi.mocked(api.crearMovimientoCaja).mockRejectedValue(new Error("No hay suficiente efectivo en caja para este egreso. Disponible: 80.00"));
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    fireEvent.click(within(d).getByRole("button", { name: "30" }));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText(/No hay suficiente efectivo en caja/)).toBeInTheDocument();
    expect(alGuardar).not.toHaveBeenCalled();
  });
});
