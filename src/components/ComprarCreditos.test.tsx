import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompraCreditosVista, CupoEstado, EstadoLicencia, PaqueteCreditosVista, PaquetesCreditos } from "../types";
import { cupoEmprendedor } from "../test/cupoFixtures";

/**
 * La hoja "Comprar créditos (QR)" (§5.1): paquetes en tres columnas, el
 * recordatorio de la mensualidad en gracia (D24), el QR y el sondeo hasta que
 * el banco confirme. Suspendida no compra.
 */

const sesion = vi.hoisted(() => ({
  cupo: null as CupoEstado | null,
  licencia: null as EstadoLicencia | null,
  actualizarCupo: vi.fn(),
  refrescarCupo: vi.fn(async () => {}),
}));

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    cupo: sesion.cupo,
    licencia: sesion.licencia,
    actualizarCupo: sesion.actualizarCupo,
    refrescarCupo: sesion.refrescarCupo,
  }),
}));

vi.mock("../lib/apiMonedero", () => ({
  apiMonedero: {
    monedero: vi.fn(),
    paquetesCreditos: vi.fn(),
    comprarCreditos: vi.fn(),
    compraCreditos: vi.fn(),
  },
}));

import { apiMonedero } from "../lib/apiMonedero";
import { abrirHojaCupo } from "../lib/hojaCupo";
import { HojaCupoHost, SONDEO_MS, SONDEOS_ANTES_DE_PAUSAR } from "./ComprarCreditos";

function paquete(id: number, creditos: number, precio: number, nombre: string | null = null): PaqueteCreditosVista {
  return {
    id,
    nombre,
    creditos,
    precio,
    moneda: "BOB",
    precioPorCredito: Math.round((precio / creditos) * 100) / 100,
    alcanzaVentas: creditos,
    alcanzaCitas: Math.floor(creditos / 2),
    activo: true,
    orden: id * 10,
  };
}

const CATALOGO: PaquetesCreditos = {
  paquetes: [paquete(1, 20, 10, "De emergencia"), paquete(2, 50, 20), paquete(3, 100, 35)],
  saldo: 0,
  puedeComprar: true,
  motivo: null,
  recordatorioLicencia: null,
};

const LICENCIA: EstadoLicencia = {
  vencimiento: null,
  diasGracia: 3,
  urlPago: "",
  situacion: "activa",
  vigente: true,
  diasRestantes: null,
  diasParaBloqueo: null,
  mensaje: "",
};

function compra(over: Partial<CompraCreditosVista> = {}): CompraCreditosVista {
  return {
    id: 77,
    estado: "PENDIENTE",
    creditos: 50,
    monto: 20,
    moneda: "BOB",
    metodo: "QR",
    paquete: { id: 2, nombre: null, creditos: 50 },
    qr: { alias: "BMD-CR-77", imagenQr: "data:image/png;base64,QR", venceEn: "2099-01-01T00:00:00.000Z" },
    creadoEn: "2026-10-09T15:00:00.000Z",
    pagadaEn: null,
    saldo: 0,
    recordatorioLicencia: null,
    ...over,
  };
}

async function flush() {
  await act(async () => {});
  await act(async () => {});
}

async function abrir(pedido: Parameters<typeof abrirHojaCupo>[0] = { unidad: "VENTA", agotado: true }) {
  render(<HojaCupoHost />);
  await act(async () => abrirHojaCupo(pedido));
  await flush();
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.cupo = cupoEmprendedor({ ventas: 50, saldo: 0 });
  sesion.licencia = LICENCIA;
  vi.mocked(apiMonedero.paquetesCreditos).mockResolvedValue(CATALOGO);
});

afterEach(() => vi.useRealTimers());

describe("la hoja de comprar créditos", () => {
  it("sin pedido no dibuja nada", () => {
    const { container } = render(<HojaCupoHost />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("al bloquear, dice por qué y lista los paquetes en tres columnas", async () => {
    await abrir();
    const hoja = screen.getByRole("dialog", { name: "Llegaste a tus 50 ventas de hoy" });
    expect(hoja).toHaveTextContent("Te quedan 0 créditos, y cada venta fuera del cupo usa 1.");
    const fila = screen.getByRole("button", { name: "50 créditos por Bs 20" });
    expect(fila).toHaveTextContent("50 créditos");
    expect(fila).toHaveTextContent("Bs 20");
    expect(fila).toHaveTextContent("50 ventas o 25 citas");
    expect(screen.getByRole("button", { name: "20 créditos por Bs 10" })).toHaveTextContent("De emergencia");
  });

  it("para citas, el texto dice que cada cita usa 2", async () => {
    sesion.cupo = cupoEmprendedor({ citas: 25, saldo: 1 });
    await abrir({ unidad: "CITA", agotado: true });
    const hoja = screen.getByRole("dialog", { name: "Llegaste a tus 25 citas de hoy" });
    expect(hoja).toHaveTextContent("Te queda 1 crédito, y cada cita fuera del cupo usa 2.");
  });

  it("desde el chip, sin bloqueo, el título es «Comprar créditos» con el saldo", async () => {
    sesion.cupo = cupoEmprendedor({ ventas: 3, saldo: 240 });
    await abrir({ unidad: "VENTA" });
    expect(screen.getByRole("dialog", { name: "Comprar créditos" })).toHaveTextContent("Tu saldo: 240 créditos");
  });

  it("en gracia se puede comprar, con el recordatorio de la mensualidad arriba (D24)", async () => {
    sesion.licencia = { ...LICENCIA, situacion: "en_gracia", mensaje: "Tu licencia venció" };
    vi.mocked(apiMonedero.paquetesCreditos).mockResolvedValue({
      ...CATALOGO,
      recordatorioLicencia: "Tu mensualidad venció el 05/10: te quedan 2 días para pagarla.",
    });
    await abrir();
    expect(screen.getByRole("status")).toHaveTextContent("Tu mensualidad venció el 05/10: te quedan 2 días para pagarla.");
    expect(screen.getByRole("button", { name: "50 créditos por Bs 20" })).toBeEnabled();
  });

  it("si gasta de más en créditos se le sugiere el Básico (sólo con sugerirBasico)", async () => {
    await abrir();
    expect(screen.queryByText(/te conviene el plan Básico/)).not.toBeInTheDocument();
    cleanup();
    sesion.cupo = { ...cupoEmprendedor({ ventas: 50 }), sugerirBasico: true };
    await abrir();
    expect(screen.getByText(/te conviene el plan Básico/)).toBeInTheDocument();
  });

  it("suspendida no puede comprar: ni siquiera pide los paquetes", async () => {
    sesion.licencia = { ...LICENCIA, situacion: "suspendida", vigente: false };
    await abrir();
    expect(screen.getByRole("alert")).toHaveTextContent("está suspendida");
    expect(apiMonedero.paquetesCreditos).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /créditos por/ })).not.toBeInTheDocument();
  });

  it("si el backend dice que no puede comprar, se muestra el motivo sin botones", async () => {
    vi.mocked(apiMonedero.paquetesCreditos).mockResolvedValue({
      ...CATALOGO,
      puedeComprar: false,
      motivo: "Tu plan no usa créditos.",
    });
    await abrir();
    expect(screen.getByText("Tu plan no usa créditos.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /créditos por/ })).not.toBeInTheDocument();
  });

  it("un error al generar (QR no habilitado) se muestra y se puede elegir de nuevo", async () => {
    vi.mocked(apiMonedero.comprarCreditos).mockRejectedValue(
      Object.assign(new Error("El cobro por QR no está habilitado."), { status: 400, codigo: "QR_NO_HABILITADO" }),
    );
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    expect(screen.getByText("El cobro por QR no está habilitado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "50 créditos por Bs 20" })).toBeEnabled();
  });
});

describe("compra por QR y sondeo", () => {
  it("elige el paquete, muestra el QR y consulta cada 5 s hasta PAGADA", async () => {
    vi.useFakeTimers();
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(compra());
    vi.mocked(apiMonedero.compraCreditos)
      .mockResolvedValueOnce(compra({ qr: null }))
      .mockResolvedValueOnce(compra({ estado: "PAGADA", qr: null, saldo: 50, pagadaEn: "2026-10-09T15:01:00.000Z" }));
    await abrir();

    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    // Viaja el paquete, nunca el monto.
    expect(apiMonedero.comprarCreditos).toHaveBeenCalledWith(2);
    expect(screen.getByRole("img", { name: "Código QR para pagar los créditos" })).toHaveAttribute(
      "src",
      "data:image/png;base64,QR",
    );
    expect(screen.getByText("Bs 20")).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(SONDEO_MS));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledWith(77);
    // La consulta no trae la imagen: el QR sigue a la vista.
    expect(screen.getByRole("img", { name: "Código QR para pagar los créditos" })).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(SONDEO_MS));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Listo: +50 créditos")).toBeInTheDocument();
    // El saldo nuevo se aplica en el acto y después se pide el contador entero.
    expect(sesion.actualizarCupo).toHaveBeenCalledWith(
      expect.objectContaining({ creditos: { saldo: 50, congelado: false } }),
    );
    expect(sesion.refrescarCupo).toHaveBeenCalled();

    // Pagada, deja de preguntar.
    await act(async () => vi.advanceTimersByTime(SONDEO_MS * 3));
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Seguir vendiendo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("después de 60 consultas se pausa; «Ya pagué, verificar» pregunta de nuevo", async () => {
    vi.useFakeTimers();
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(compra());
    vi.mocked(apiMonedero.compraCreditos).mockResolvedValue(compra({ qr: null }));
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();

    await act(async () => vi.advanceTimersByTime(SONDEO_MS * (SONDEOS_ANTES_DE_PAUSAR + 5)));
    await flush();
    const hechas = vi.mocked(apiMonedero.compraCreditos).mock.calls.length;
    expect(hechas).toBe(SONDEOS_ANTES_DE_PAUSAR - 1);
    expect(screen.getByText(/tocá «Ya pagué» para confirmarlo/)).toBeInTheDocument();

    vi.mocked(apiMonedero.compraCreditos).mockResolvedValueOnce(compra({ estado: "PAGADA", saldo: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Ya pagué, verificar" }));
    await flush();
    expect(screen.getByText("Listo: +50 créditos")).toBeInTheDocument();
  });

  it("un 429 pausa el sondeo", async () => {
    vi.useFakeTimers();
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(compra());
    vi.mocked(apiMonedero.compraCreditos).mockRejectedValue(Object.assign(new Error("Demasiadas"), { status: 429 }));
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    await act(async () => vi.advanceTimersByTime(SONDEO_MS));
    await flush();
    await act(async () => vi.advanceTimersByTime(SONDEO_MS * 4));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/tocá «Ya pagué» para confirmarlo/)).toBeInTheDocument();
  });

  it("«Ya pagué» que también rebota con 429 no reanuda el sondeo", async () => {
    vi.useFakeTimers();
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(compra());
    vi.mocked(apiMonedero.compraCreditos).mockRejectedValue(Object.assign(new Error("Demasiadas"), { status: 429 }));
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    await act(async () => vi.advanceTimersByTime(SONDEO_MS));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Ya pagué, verificar" }));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(2);
    // Sigue el tope: preguntar sola cada 5 s sólo lo alarga.
    await act(async () => vi.advanceTimersByTime(SONDEO_MS * 4));
    await flush();
    expect(apiMonedero.compraCreditos).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/tocá «Ya pagué» para confirmarlo/)).toBeInTheDocument();
  });

  it("el recordatorio de gracia también llega con la compra", async () => {
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(
      compra({ recordatorioLicencia: "Recordá pagar la mensualidad: vence en 2 días." }),
    );
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    expect(screen.getByRole("status")).toHaveTextContent("Recordá pagar la mensualidad: vence en 2 días.");
  });

  it("Escape cierra sólo la hoja: lo de abajo no se entera", async () => {
    const deAbajo = vi.fn();
    document.addEventListener("keydown", deAbajo);
    await abrir();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deAbajo).not.toHaveBeenCalled();
    document.removeEventListener("keydown", deAbajo);
  });

  it("un segundo pedido con la hoja abierta (doble clic en Cobrar) no la reinicia ni pierde el QR", async () => {
    vi.mocked(apiMonedero.comprarCreditos).mockResolvedValue(compra());
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "50 créditos por Bs 20" }));
    await flush();
    expect(screen.getByRole("img", { name: "Código QR para pagar los créditos" })).toBeInTheDocument();
    await act(async () => abrirHojaCupo({ unidad: "VENTA", agotado: true }));
    await flush();
    expect(screen.getByRole("img", { name: "Código QR para pagar los créditos" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(apiMonedero.comprarCreditos).toHaveBeenCalledTimes(1);
  });

  it("el segundo clic de un doble clic (cae en el fondo) no la cierra", async () => {
    await abrir();
    const fondo = screen.getByRole("dialog").parentElement!;
    fireEvent.mouseDown(fondo);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
