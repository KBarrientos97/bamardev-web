import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El cobro con lo de la fase 4 de belleza: pagar parte con un vale y anotar
 * la propina de cada profesional. Y lo que no puede cambiar: en un negocio
 * sin esas features (Omar) el cobro es exactamente el de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "PELUQUERIA" as string,
  features: ["pos", "pago_qr_mixto", "gift_cards", "propinas"] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: sesion.rubro, features: sesion.features },
      usuario: { id: 1, username: "recepcion", rol: "CAJERO", ...permisosDe("CAJERO") },
      incluye: (f: string) => sesion.features.includes(f),
    }),
  };
});

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: { consultarVale: vi.fn(), formaPagoVale: vi.fn() },
}));

vi.mock("../../components/QrCobro", () => ({
  QrParaCobrar: ({ onConfirmar }: { onConfirmar: () => void }) => (
    <button onClick={onConfirmar}>Ya llegó el QR</button>
  ),
}));

import { apiExtras } from "../../lib/belleza/apiExtras";
import PantallaCobro from "./PantallaCobro";

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];

function montar(
  onConfirmar = vi.fn(),
  profesionales?: { id: number; nombre: string }[],
  opc: { total?: number; onCredito?: (extra?: unknown) => void } = {},
) {
  render(
    <PantallaCobro
      total={opc.total ?? 200}
      formasPago={FORMAS}
      profesionales={profesionales}
      onAtras={() => {}}
      onConfirmar={onConfirmar}
      onCredito={opc.onCredito}
      enviando={false}
      error=""
    />,
  );
  return onConfirmar;
}

const VALE = {
  id: 5,
  codigo: "K7QM-2XPA",
  montoInicial: 200,
  saldo: 120,
  venceEn: null,
  estado: "USABLE" as const,
  beneficiario: null,
  comprador: null,
  nota: null,
  formaPago: "Efectivo",
  creadoEn: "2026-10-06T10:00:00Z",
  anuladaEn: null,
  motivoAnulacion: null,
};

const escribir = (etiqueta: string | RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "PELUQUERIA";
  sesion.features = ["pos", "pago_qr_mixto", "gift_cards", "propinas"];
  vi.mocked(apiExtras.formaPagoVale).mockResolvedValue({ id: 99, nombre: "Gift card" });
  vi.mocked(apiExtras.consultarVale).mockResolvedValue(VALE);
});

async function aplicarVale() {
  fireEvent.click(screen.getByText("Pagar con gift card"));
  escribir("Código del vale", "k7qm2xpa");
  await act(async () => {
    fireEvent.click(screen.getByText("Aplicar"));
  });
}

describe("cobro con gift card", () => {
  it("el vale cubre una parte y el resto se cobra en efectivo", async () => {
    const onConfirmar = montar();
    await aplicarVale();
    expect(apiExtras.consultarVale).toHaveBeenCalledWith("K7QM2XPA");
    expect(screen.getByText(/resta/)).toHaveTextContent(/resta Bs.80,00/);
    escribir("Efectivo recibido", "100");
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith([
      { formaPagoId: 99, monto: 120, giftCardCodigo: "K7QM-2XPA" },
      { formaPagoId: 10, monto: 80, recibido: 100 },
    ]);
  });

  it("si el vale alcanza, no pide efectivo ni QR", async () => {
    vi.mocked(apiExtras.consultarVale).mockResolvedValue({ ...VALE, saldo: 500 });
    const onConfirmar = montar();
    await aplicarVale();
    expect(screen.queryByLabelText(/Efectivo recibido/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith([
      { formaPagoId: 99, monto: 200, giftCardCodigo: "K7QM-2XPA" },
    ]);
  });

  it("un vale vencido no se aplica", async () => {
    vi.mocked(apiExtras.consultarVale).mockResolvedValue({
      ...VALE,
      estado: "VENCIDA",
      venceEn: "2026-01-31",
    });
    montar();
    await aplicarVale();
    expect(screen.getByText("El vale venció el 31/01/2026")).toBeInTheDocument();
    expect(screen.queryByText(/resta/)).not.toBeInTheDocument();
  });
});

describe("propinas al cobrar", () => {
  it("viajan aparte: el pago de la venta no cambia y el efectivo de la propina se recibe en mano", () => {
    const onConfirmar = montar(vi.fn(), [
      { id: 7, nombre: "Ana" },
      { id: 8, nombre: "Beto" },
    ]);
    escribir("Propina para Ana", "10");
    escribir("Propina para Beto", "5");
    // Beto la deja por QR.
    fireEvent.click(screen.getAllByText("QR").filter((b) => b.getAttribute("aria-pressed") != null)[1]);
    escribir(/Efectivo recibido/, "250");
    // Cambio: 250 − (200 de la venta + 10 de propina en efectivo).
    expect(screen.getByText(/Cambio/).nextElementSibling).toHaveTextContent(/40,00/);
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith(
      [{ formaPagoId: 10, monto: 200, recibido: 240 }],
      {
        propinas: [
          { recursoId: 7, monto: 10, formaPagoId: 10 },
          { recursoId: 8, monto: 5, formaPagoId: 11 },
        ],
      },
    );
  });

  it("sin profesionales en la venta, no hay propina", () => {
    montar();
    expect(screen.queryByText(/Propina/)).not.toBeInTheDocument();
  });

  it("QA PER-10: una sesión de paquete (total 0) pasa por acá sólo por la propina", () => {
    const onConfirmar = montar(vi.fn(), [{ id: 7, nombre: "Marta" }], { total: 0 });
    // Nada que cobrar: ni efectivo, ni QR, ni vale.
    expect(screen.queryByLabelText(/Efectivo recibido/)).not.toBeInTheDocument();
    expect(screen.queryByText("Pagar con gift card")).not.toBeInTheDocument();
    expect(screen.queryByText("Mixto")).not.toBeInTheDocument();
    escribir("Propina para Marta", "20");
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith([], {
      propinas: [{ recursoId: 7, monto: 20, formaPagoId: 10 }],
    });
  });

  it("pasar a fiado lleva las propinas anotadas", () => {
    const onCredito = vi.fn();
    montar(vi.fn(), [{ id: 7, nombre: "Ana" }], { onCredito });
    escribir("Propina para Ana", "10");
    fireEvent.click(screen.getByText("Vender a crédito (fiado)"));
    expect(onCredito).toHaveBeenCalledWith({
      propinas: [{ recursoId: 7, monto: 10, formaPagoId: 10 }],
    });
  });
});

describe("QA DIA-02: lo que se manda cobrar incluye las propinas", () => {
  const qrDe = (i: number) =>
    fireEvent.click(screen.getAllByText("QR").filter((b) => b.getAttribute("aria-pressed") != null)[i]);
  const metodo = (m: "QR" | "Mixto") =>
    fireEvent.click(screen.getAllByText(m).find((b) => b.closest("button")?.getAttribute("aria-pressed") == null)!);

  it("(a) por QR con propina por QR: se cobra la transferencia entera, la venta va sin ella", () => {
    const onConfirmar = montar(vi.fn(), [{ id: 7, nombre: "Carla" }], { total: 51 });
    escribir("Propina para Carla", "5");
    qrDe(0);
    metodo("QR");
    expect(screen.getByText(/Cobrá Bs.56,00 por QR/)).toBeInTheDocument();
    expect(screen.getByText(/incluye Bs.5,00 de propina/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ya llegó el QR"));
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 11, monto: 51 }], {
      propinas: [{ recursoId: 7, monto: 5, formaPagoId: 11 }],
    });
  });

  it("(b) mixto: el efectivo que falta incluye la propina en efectivo y el QR la suya", () => {
    const onConfirmar = montar(
      vi.fn(),
      [
        { id: 7, nombre: "Carla" },
        { id: 8, nombre: "Paola" },
      ],
      { total: 205 },
    );
    escribir("Propina para Carla", "5");
    escribir("Propina para Paola", "7");
    qrDe(1);
    metodo("Mixto");
    escribir(/Monto pagado por QR/, "100");
    expect(screen.getByText(/Falta cubrir Bs.110,00 \(incluye la propina\)/)).toBeInTheDocument();
    expect(screen.getByText(/Cobrá Bs.107,00 por QR/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ya llegó el QR"));
    escribir(/Efectivo recibido/, "120");
    // Cambio: 120 − (105 + 5 de propina).
    expect(screen.getByText(/Cambio/).nextElementSibling).toHaveTextContent(/10,00/);
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith(
      [
        { formaPagoId: 11, monto: 100 },
        { formaPagoId: 10, monto: 105, recibido: 115 },
      ],
      {
        propinas: [
          { recursoId: 7, monto: 5, formaPagoId: 10 },
          { recursoId: 8, monto: 7, formaPagoId: 11 },
        ],
      },
    );
  });

  it("(c) por QR con propina en efectivo: avisa que hay que recibirla aparte", () => {
    montar(vi.fn(), [{ id: 7, nombre: "Lucía" }], { total: 120 });
    escribir("Propina para Lucía", "8");
    metodo("QR");
    expect(screen.getByText(/Cobrá Bs.120,00 por QR/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/recibí Bs.8,00 de propina en efectivo/);
  });

  it("(d) sesión de paquete con propina: dice lo que se recibe y el botón lo suma", () => {
    montar(vi.fn(), [{ id: 7, nombre: "Sofía" }], { total: 0 });
    escribir("Propina para Sofía", "15");
    expect(screen.getByText(/Recibí Bs.15,00 de propina en efectivo/)).toBeInTheDocument();
    expect(screen.getByText(/Confirmar cobro/)).toHaveTextContent(/Bs.0,00 \+ Bs.15,00 de propina/);
  });
});

describe("un negocio sin estas features (Omar)", () => {
  it("el cobro es el de siempre: sin vale, sin propina, la misma llamada", () => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["pos", "pago_qr_mixto", "gift_cards", "propinas"];
    const onConfirmar = montar(vi.fn(), [{ id: 7, nombre: "Ana" }]);
    expect(screen.queryByText("Pagar con gift card")).not.toBeInTheDocument();
    expect(screen.queryByText(/Propina/)).not.toBeInTheDocument();
    escribir("Efectivo recibido", "200");
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 200, recibido: 200 }]);
    expect(onConfirmar.mock.calls[0]).toHaveLength(1);
  });
});

describe("pase oct: centavos en el cobro de Omar", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
    sesion.features = ["pos", "pago_qr_mixto"];
  });

  it("la sugerencia de efectivo 'justo' es el total, no un centavo más", () => {
    // Math.ceil(35.2 * 100) daba 3521: el chip decía Bs 35,21 y dejaba un
    // cambio de Bs 0,01 grabado como entregado.
    montar(vi.fn(), undefined, { total: 35.2 });
    expect(screen.getByRole("button", { name: /^Bs.35,20$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Bs.35,21$/ })).not.toBeInTheDocument();
  });

  it("mixto con un QR de tres decimales: los pagos van en centavos y suman el total", () => {
    const onConfirmar = montar(vi.fn(), undefined, { total: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Mixto" }));
    escribir(/Monto pagado por QR/, "33.335");
    fireEvent.click(screen.getByText("Ya llegó el QR"));
    escribir(/Efectivo recibido/, "70");
    fireEvent.click(screen.getByText(/Confirmar cobro/));
    const pagos = onConfirmar.mock.calls[0][0] as { monto: number }[];
    for (const p of pagos) expect(Math.round(p.monto * 100) / 100).toBe(p.monto);
    // El backend exige que la suma dé el total (al centavo).
    expect(Math.round(pagos.reduce((s, p) => s + p.monto, 0) * 100)).toBe(10000);
  });
});
