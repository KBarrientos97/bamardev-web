import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Movimiento de efectivo": el del cierre de caja de siempre (sin las props de
 * Supervisión es exactamente el de antes) y, desde el 24-oct, el que el
 * administrador del billar usa para darle la cena a la cajera.
 */

vi.mock("../../lib/api", () => ({ api: { crearMovimientoCaja: vi.fn(), resumenCaja: vi.fn() } }));

import { api } from "../../lib/api";
import DialogoMovimiento from "./DialogoMovimiento";
import { MOTIVOS_BILLAR } from "./motivosMovimiento";

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

describe("los movimientos desde Supervisión del billar", () => {
  const supervision = {
    motivos: MOTIVOS_BILLAR,
    deQuien: { nombre: "Carla", desde: new Date(2026, 9, 23, 16, 5).getTime() },
    esperado: 165,
  };
  const grupo = (d: HTMLElement, titulo: string) =>
    within(within(d).getByRole("group", { name: titulo }))
      .getAllByRole("button")
      .map((b) => b.textContent);

  it("los motivos van agrupados por sentido, sin «Otro» ni «Devolución»", async () => {
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    expect(grupo(d, "Sale de la caja")).toEqual(["Cena", "Gasto", "Pago a proveedor", "Retiro", "Otra salida"]);
    expect(grupo(d, "Entra a la caja")).toEqual(["Sencillo", "Otra entrada"]);
    // Un "Otro" no diría si es un gasto; una devolución se hace anulando la venta.
    expect(within(d).queryByRole("button", { name: "Otro" })).toBeNull();
    expect(within(d).queryByRole("button", { name: "Devolución" })).toBeNull();
    expect(within(d).getByText("Carla")).toBeInTheDocument();
  });

  it("la cena tiene montos para tocar y avisa cómo cambia el cierre", async () => {
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    // Sin monto todavía no hay aviso.
    expect(within(d).queryByText(/el efectivo esperado pasa de/)).toBeNull();
    fireEvent.click(within(d).getByRole("button", { name: "20" }));
    expect(within(d).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/165,00.*145,00/);
    expect(within(d).getByText(/Resta de la ganancia del mes, en «Cenas del personal»/)).toBeInTheDocument();
  });

  it("se manda como cena, con la descripción «Cena»", async () => {
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    fireEvent.click(within(d).getByRole("button", { name: "15" }));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "EGRESO", monto: 15, descripcion: "Cena", origen: "CENA" });
  });

  it("con el botón general arranca sin motivo y no deja registrar hasta elegir uno", async () => {
    const d = await abrir(supervision);
    fireEvent.change(within(d).getByLabelText("Monto"), { target: { value: "30" } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText("Elegí el motivo.")).toBeInTheDocument();
    expect(api.crearMovimientoCaja).not.toHaveBeenCalled();
    // El sencillo entra: el aviso suma.
    fireEvent.click(within(d).getByRole("button", { name: "Sencillo" }));
    expect(within(d).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/165,00.*195,00/);
    expect(within(d).getByText(/No suma a la ganancia: es plata para dar cambio/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "INGRESO", monto: 30, descripcion: "Sencillo", origen: "SENCILLO" });
  });

  it("un gasto pide en qué fue y avisa que no se cargue también en Gastos operativos", async () => {
    const d = await abrir(supervision);
    fireEvent.click(within(d).getByRole("button", { name: "Gasto" }));
    expect(within(d).getByText(/No lo cargues también en Gastos operativos/)).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText("Monto"), { target: { value: "12" } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText("Falta el detalle: ¿En qué?")).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText("¿En qué?"), { target: { value: "  Hielo " } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "EGRESO", monto: 12, descripcion: "Hielo", origen: "GASTO" });
  });

  it("el pago a proveedor dice que no resta de la ganancia y el detalle es opcional", async () => {
    const d = await abrir(supervision);
    fireEvent.click(within(d).getByRole("button", { name: "Pago a proveedor" }));
    expect(within(d).getByText(/No resta de la ganancia: es mercadería para vender/)).toBeInTheDocument();
    fireEvent.change(within(d).getByLabelText("Monto"), { target: { value: "300" } });
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(7, { tipo: "EGRESO", monto: 300, descripcion: "Pago a proveedor", origen: "PROVEEDOR" });
  });

  it("con dos cajas abiertas se elige a cuál va, y el aviso usa el esperado de esa caja", async () => {
    // Con su cajaId: el aviso sólo usa el resumen de la caja elegida (mientras
    // llega el de otra, `useApi` conserva el anterior).
    vi.mocked(api.resumenCaja).mockResolvedValue({ cajaId: 9, saldoEsperado: 80 } as never);
    const d = await abrir({
      ...supervision,
      motivoInicial: "Cena",
      cajas: [
        { id: 7, cajero: "Carla", desde: new Date(2026, 9, 23, 16, 5).getTime() },
        { id: 9, cajero: "Kevin", desde: new Date(2026, 9, 23, 15, 50).getTime() },
      ],
    });
    const select = within(d).getByLabelText("¿En qué caja?") as HTMLSelectElement;
    expect(select.value).toBe("7");
    await act(async () => {
      fireEvent.change(select, { target: { value: "9" } });
    });
    expect(api.resumenCaja).toHaveBeenCalledWith(9);
    fireEvent.click(within(d).getByRole("button", { name: "20" }));
    expect(within(d).getByText(/el efectivo esperado pasa de/)).toHaveTextContent(/Kevin.*80,00.*60,00/);
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(api.crearMovimientoCaja).toHaveBeenCalledWith(9, { tipo: "EGRESO", monto: 20, descripcion: "Cena", origen: "CENA" });
    // Supervisión necesita saber adónde fue: puede no ser la caja que se mira.
    expect(alGuardar).toHaveBeenCalledWith(9);
  });

  it("un error del servidor se dice y no cierra el cuadro", async () => {
    vi.mocked(api.crearMovimientoCaja).mockRejectedValue(new Error("No hay suficiente efectivo en caja para este egreso. Disponible: Bs 80,00"));
    const d = await abrir({ ...supervision, motivoInicial: "Cena" });
    fireEvent.click(within(d).getByRole("button", { name: "30" }));
    await act(async () => {
      fireEvent.click(within(d).getByRole("button", { name: "Registrar" }));
    });
    expect(screen.getByText(/No hay suficiente efectivo en caja/)).toBeInTheDocument();
    expect(alGuardar).not.toHaveBeenCalled();
  });
});
