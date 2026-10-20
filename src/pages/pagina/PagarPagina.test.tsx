import { act, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EstadoCuentaPublico } from "../../lib/academia/tipos";

/**
 * P6 · Pagar: el estado de cuenta del enlace que manda la recepción. Lo
 * próximo a pagar, el QR fijo del instituto si lo tiene (o "pagá en el
 * instituto"), y nada de carnet, teléfono ni apellidos.
 */

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({ pagina: { nombre: "CCTP Horizonte", color: { clave: "INDIGO", hex: "#3B42A9" } }, error: null }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { estadoCuenta: vi.fn() } };
});

import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import PagarPagina from "./PagarPagina";

const ESTADO: EstadoCuentaPublico = {
  instituto: { nombre: "CCTP Horizonte", logoUrl: null, telefono: "70000000" },
  alumno: { nombres: "Camila" },
  curso: "Barbería",
  grupo: { nombre: "L-M-V 09:00", sede: "Central" },
  cuotas: [
    { concepto: "M1 · Corte clásico", monto: 500, pagado: 500, saldo: 0, vence: "2026-09-10", vencida: false, estado: "PAGADA" },
    { concepto: "M2 · Degradados", monto: 500, pagado: 0, saldo: 500, vence: "2026-10-10", vencida: true, estado: "PENDIENTE" },
  ],
  proxima: { concepto: "M2 · Degradados", saldo: 500, vence: "2026-10-10", vencida: true },
  saldoTotal: 500,
  qr: { tipo: "FIJO", imagenUrl: "https://cdn.test/qr.png" },
};

async function montar() {
  render(
    <MemoryRouter initialEntries={["/p/horizonte/pagar/K7Q2abcdef"]}>
      <Routes>
        <Route path="/p/:subdominio/pagar/:token" element={<PagarPagina />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => vi.clearAllMocks());

describe("P6 · Pagar", () => {
  it("saluda, dice cuánto y cuándo venció, y muestra el QR fijo del instituto", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue(ESTADO);
    await montar();
    expect(apiAcademiaPublica.estadoCuenta).toHaveBeenCalledWith("horizonte", "K7Q2abcdef");
    expect(screen.getByRole("heading", { name: "Hola, Camila" })).toBeInTheDocument();
    expect(screen.getByText("Venció el 10-oct")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /QR de CCTP Horizonte/ })).toHaveAttribute("src", "https://cdn.test/qr.png");
    expect(screen.getByRole("region", { name: "Tu estado de cuenta" })).toHaveTextContent("Pagado");
  });

  it("sin QR configurado, pagá en el instituto", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockResolvedValue({ ...ESTADO, qr: null });
    await montar();
    expect(screen.getByText("Pagá en el instituto")).toBeInTheDocument();
  });

  it("un enlace que no existe no muestra nada del estudiante", async () => {
    vi.mocked(apiAcademiaPublica.estadoCuenta).mockRejectedValue(new ErrorPublico("No existe", 404));
    await montar();
    expect(screen.getByText("Este enlace no existe o ya no está activo")).toBeInTheDocument();
  });
});
