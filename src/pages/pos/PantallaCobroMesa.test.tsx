import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La pantalla de cobro cobrando una MESA del salón (SAL-01 / COB-12): la
 * propina de la mesa y, si cobra el mesero, el aviso del efectivo que se queda.
 * Y la guarda de lo que no puede cambiar: sin `cobroDeMesa` (el mostrador de
 * Omar, belleza, el instituto) el cobro es exactamente el de siempre.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string,
  features: ["pos", "salon", "pago_qr_mixto"] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, tipoNegocio: sesion.rubro, features: sesion.features },
      usuario: { id: 1, username: "caja", rol: "CAJERO", ...permisosDe("CAJERO") },
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

import PantallaCobro from "./PantallaCobro";

const FORMAS = [
  { id: 10, nombre: "Efectivo" },
  { id: 11, nombre: "QR" },
];

function montar(cobroDeMesa?: "caja" | "mesero", profesionales?: { id: number; nombre: string }[]) {
  const onConfirmar = vi.fn();
  render(
    <PantallaCobro
      total={52}
      formasPago={FORMAS}
      profesionales={profesionales}
      onAtras={() => {}}
      onConfirmar={onConfirmar}
      enviando={false}
      error=""
      cobroDeMesa={cobroDeMesa}
    />,
  );
  return onConfirmar;
}

const escribir = (etiqueta: RegExp, valor: string) =>
  fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });

async function confirmar() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  sesion.features = ["pos", "salon", "pago_qr_mixto"];
});

describe("cobrando una mesa desde la caja", () => {
  it("la propina viaja aparte y no toca el vuelto", async () => {
    // Ningún cobro de mesa de la web la pedía: Mi turno y Ventas por mesero
    // sólo veían las que se cargaban desde la app.
    const onConfirmar = montar("caja");
    expect(screen.getByLabelText(/Propina \(opcional\)/)).toBeInTheDocument();
    expect(screen.getByText("No entra al cajón: va al turno del mesero.")).toBeInTheDocument();

    escribir(/Efectivo recibido/, "60");
    escribir(/Propina \(opcional\)/, "5");
    // El vuelto sale de la cuenta, no de la cuenta más la propina: la propina
    // no es plata del cajón.
    expect(screen.getByText("Cambio").nextSibling).toHaveTextContent(/Bs\s8,00/);
    await confirmar();

    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 52, recibido: 60 }], {
      propinaMesa: 5,
    });
  });

  it("sin propina, llama como siempre (sólo los pagos)", async () => {
    const onConfirmar = montar("caja");
    escribir(/Efectivo recibido/, "52");
    await confirmar();
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 52, recibido: 52 }]);
  });

  it("la caja no ve el aviso de entrega: es del mesero que cobra", () => {
    montar("caja");
    expect(screen.queryByText(/Te quedás con/)).not.toBeInTheDocument();
  });

  it("una propina de más de Bs 100.000 se frena acá, en castellano", async () => {
    // El backend la rechaza con su mensaje de validación en inglés.
    const onConfirmar = montar("caja");
    escribir(/Efectivo recibido/, "52");
    escribir(/Propina \(opcional\)/, "150000");
    await confirmar();
    expect(onConfirmar).not.toHaveBeenCalled();
    expect(screen.getByText(/La propina no puede pasar de Bs\s100\.000,00/)).toBeInTheDocument();
  });
});

describe("guarda: sin cobroDeMesa el cobro es el de siempre", () => {
  it("el mostrador (Omar) no tiene propina de mesa ni aviso de entrega", async () => {
    const onConfirmar = montar();
    expect(screen.queryByLabelText(/Propina \(opcional\)/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Te quedás con/)).not.toBeInTheDocument();
    escribir(/Efectivo recibido/, "60");
    await confirmar();
    expect(onConfirmar).toHaveBeenCalledWith([{ formaPagoId: 10, monto: 52, recibido: 60 }]);
  });

  it("belleza sigue con sus propinas por profesional, sin la de la mesa", () => {
    sesion.rubro = "PELUQUERIA";
    sesion.features = ["pos", "propinas"];
    montar(undefined, [{ id: 3, nombre: "Ana" }]);
    expect(screen.getByText(/Ana/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Propina \(opcional\)/)).not.toBeInTheDocument();
  });
});
