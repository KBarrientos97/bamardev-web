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

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { id: 1, tipoNegocio: sesion.rubro, features: sesion.features },
    usuario: { id: 1, username: "recepcion", rol: "CAJERO" },
    incluye: (f: string) => sesion.features.includes(f),
  }),
}));

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
