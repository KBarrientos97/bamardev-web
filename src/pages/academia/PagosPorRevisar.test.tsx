import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PagoEnLinea } from "../../lib/academia/tipos";

/**
 * M5 · Pagos por revisar: los comprobantes del QR fijo. La recepción (con
 * `academia.pagos_en_linea`) los ve en grande y los aprueba o los rechaza con motivo; el
 * aviso al estudiante es un botón de WhatsApp. Un grupo que se llenó en el
 * medio pide confirmar el cupo.
 */

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      pagosEnLinea: vi.fn(),
      comprobanteComoUrl: vi.fn(),
      aprobarPagoEnLinea: vi.fn(),
      rechazarPagoEnLinea: vi.fn(),
    },
  };
});

vi.mock("../../lib/academia/vista", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/vista")>();
  return { ...real, abrirWhatsapp: vi.fn() };
});

import { ApiError } from "../../lib/api";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { abrirWhatsapp } from "../../lib/academia/vista";
import PagosPorRevisar from "./PagosPorRevisar";

const PAGO: PagoEnLinea = {
  id: 7,
  estado: "POR_REVISAR",
  opcion: "CUOTA",
  etiqueta: "Primer mes",
  monto: 500,
  creadoEn: new Date().toISOString(),
  revisadoEn: null,
  motivoRechazo: null,
  inscripcionId: 31,
  estadoInscripcion: "PREINSCRITA",
  alumno: "Montaño Ríos, Sofía",
  curso: "Barbería",
  grupo: "L-M-V 07:00",
  sede: "Central",
  whatsapp: null,
};
const WA = { telefono: "73333333", aTutor: false, url: "https://wa.me/59173333333?text=Hola" };

const pagina = (items: PagoEnLinea[]) => ({ items, total: items.length, page: 1, pageSize: 50 });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.pagosEnLinea).mockResolvedValue(pagina([PAGO]));
  vi.mocked(apiAcademia.comprobanteComoUrl).mockResolvedValue("blob:comprobante");
});

async function montar() {
  render(<PagosPorRevisar />);
  await act(async () => {});
}

async function abrir() {
  await montar();
  fireEvent.click(screen.getByRole("button", { name: /Revisar el comprobante de Montaño/ }));
  await act(async () => {});
}

describe("M5 · Pagos por revisar", () => {
  it("lista lo que espera: quién, qué pagó, cuánto, y que todavía está preinscrito", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: /Pagos por revisar/ })).toBeInTheDocument();
    const fila = screen.getByText("Montaño Ríos, Sofía").closest("li")!;
    expect(fila).toHaveTextContent("Barbería · L-M-V 07:00 · Central");
    expect(fila).toHaveTextContent("Primer mes");
    expect(fila).toHaveTextContent("todavía preinscrito");
    expect(fila).toHaveTextContent("500,00");
  });

  it("sin nada por revisar es una línea tranquila, con acceso a lo ya resuelto", async () => {
    vi.mocked(apiAcademia.pagosEnLinea).mockResolvedValue(pagina([]));
    await montar();
    expect(screen.getByText("No hay comprobantes por revisar.")).toBeInTheDocument();
    vi.mocked(apiAcademia.pagosEnLinea).mockResolvedValue(pagina([{ ...PAGO, estado: "APROBADO", whatsapp: WA }]));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver los ya resueltos" }));
    });
    expect(apiAcademia.pagosEnLinea).toHaveBeenLastCalledWith(expect.objectContaining({ estado: "APROBADO" }));
    expect(screen.getByText("Aprobado")).toBeInTheDocument();
  });

  it("sin permiso (403) no dibuja nada", async () => {
    vi.mocked(apiAcademia.pagosEnLinea).mockRejectedValue(new ApiError("Sin permiso", 403));
    const { container } = render(<PagosPorRevisar />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("aprobar registra el cobro y deja el botón de WhatsApp para avisarle", async () => {
    vi.mocked(apiAcademia.aprobarPagoEnLinea).mockResolvedValue({ ...PAGO, estado: "APROBADO", whatsapp: WA });
    await abrir();
    expect(apiAcademia.comprobanteComoUrl).toHaveBeenCalledWith(7);
    expect(screen.getByRole("img", { name: "Comprobante de pago" })).toHaveAttribute("src", "blob:comprobante");
    expect(screen.getByText(/al aprobar queda inscrito y ocupa un lugar/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(apiAcademia.aprobarPagoEnLinea).toHaveBeenCalledWith(7, {});
    expect(screen.getByRole("status")).toHaveTextContent("Cobrado en línea");
    fireEvent.click(screen.getByRole("button", { name: "Avisar por WhatsApp" }));
    expect(abrirWhatsapp).toHaveBeenCalledWith(WA.url);
    // La lista se vuelve a pedir: ya no está por revisar.
    expect(vi.mocked(apiAcademia.pagosEnLinea).mock.calls.length).toBeGreaterThan(1);
  });

  it("rechazar pide el motivo; rechazado, la deuda sigue y se avisa por WhatsApp", async () => {
    vi.mocked(apiAcademia.rechazarPagoEnLinea).mockResolvedValue({
      ...PAGO,
      estado: "RECHAZADO",
      motivoRechazo: "El monto no coincide con lo que se debe",
      whatsapp: WA,
    });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));
    const dialogo = screen.getByRole("dialog");
    // Sin elegir motivo no se rechaza.
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar" }));
    });
    expect(apiAcademia.rechazarPagoEnLinea).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByText("El monto no coincide con lo que se debe"));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Rechazar" }));
    });
    expect(apiAcademia.rechazarPagoEnLinea).toHaveBeenCalledWith(7, "El monto no coincide con lo que se debe");
    expect(screen.getByRole("status")).toHaveTextContent("La deuda sigue igual");
    expect(screen.getByRole("button", { name: "Avisar por WhatsApp" })).toBeInTheDocument();
  });

  it("si el grupo se llenó mientras tanto, avisa y deja aprobar igual o rechazar", async () => {
    vi.mocked(apiAcademia.aprobarPagoEnLinea)
      .mockRejectedValueOnce(new ApiError("El grupo ya tiene 2 de 2 lugares.", 409, { codigo: "GRUPO_LLENO", inscritos: 2, cupo: 2 }))
      .mockResolvedValueOnce({ ...PAGO, estado: "APROBADO", whatsapp: WA });
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("El grupo ya está lleno (2 de 2 lugares)");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar igual y pasar el cupo" }));
    });
    expect(apiAcademia.aprobarPagoEnLinea).toHaveBeenLastCalledWith(7, { confirmarSobreCupo: true });
    expect(screen.getByRole("status")).toHaveTextContent("Cobrado en línea");
  });

  it("si la deuda cambió, el error del servidor se muestra tal cual", async () => {
    vi.mocked(apiAcademia.aprobarPagoEnLinea).mockRejectedValue(
      new ApiError("La deuda del estudiante cambió desde que pagó (Bs 500,00).", 409, { codigo: "DEUDA_CAMBIO" }),
    );
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
    });
    expect(screen.getByText(/La deuda del estudiante cambió/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobar igual y pasar el cupo" })).not.toBeInTheDocument();
  });
});
