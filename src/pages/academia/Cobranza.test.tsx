import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RespuestaCobranza } from "../../lib/academia/tipos";

/**
 * E8 · Cobranza: las pestañas son los indicadores, WhatsApp pide el mensaje
 * al backend (que deja anotado el recordatorio) y abre wa.me, y Cobrar lleva
 * al POS con la inscripción.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { cobranza: vi.fn(), recordatorio: vi.fn(), carreras: vi.fn(async () => []) },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import Cobranza from "./Cobranza";

const RESPUESTA: RespuestaCobranza = {
  totales: {
    vencido: 4320,
    vencidoCuotas: 9,
    vencidoAlumnos: 7,
    venceSemana: 1500,
    venceSemanaCuotas: 2,
    venceMes: 5000,
    venceMesCuotas: 14,
    cobradoMes: 21000,
  },
  items: [
    {
      inscripcionId: 103,
      alumno: { id: 53, nombre: "Céspedes Molina, Joaquín", codigo: "2026-0103" },
      contacto: { nombre: "Rosa Molina", telefono: "71234567", esTutor: true },
      grupo: { id: 7, nombre: "Barbería · L-V 10:00" },
      sede: { id: 2, nombre: "Norte" },
      cuotas: [
        { id: 905, numero: 2, concepto: "M2", materiaOrdenes: [2], monto: 533, pagado: 200, saldo: 333, vence: "2026-09-17", estado: "PARCIAL", vencida: true, diasAtraso: 12, ultimoRecordatorioEn: null, recordatorios: 0 },
      ],
      saldo: 333,
      diasAtraso: 12,
      ultimoRecordatorioEn: null,
      recordatorios: 0,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
};

function DondeEstoy() {
  const l = useLocation();
  return <p data-testid="destino">{`${l.pathname}${l.search}`}</p>;
}

async function montar(ruta = "/academia/cobranza") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/academia/cobranza" element={<Cobranza />} />
        <Route path="*" element={<DondeEstoy />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.cobranza).mockResolvedValue(RESPUESTA);
});

describe("E8 · cobranza", () => {
  it("arranca en Vencidas, con los totales y la fila del tutor", async () => {
    await montar();
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "vencidas", page: 1, pageSize: 20 }));
    expect(screen.getByRole("tab", { name: "Vencidas 9" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/7 estudiantes/)).toBeInTheDocument();
    expect(screen.getAllByText("Tutor: Rosa Molina · 71234567").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/abonó Bs\s?200,00 de Bs\s?533,00/).length).toBeGreaterThan(0);
  });

  it("la pestaña viene de la dirección (desde Hoy)", async () => {
    await montar("/academia/cobranza?tipo=por-vencer");
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "por-vencer" }));
  });

  it("WhatsApp registra el recordatorio y abre wa.me; la fila queda anotada", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({ telefono: "59171234567", texto: "Hola Rosa", url: "https://wa.me/59171234567?text=Hola%20Rosa" });
    await montar();
    await act(async () => {
      fireEvent.click(screen.getAllByRole("button", { name: "WhatsApp" })[0]);
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(905);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/59171234567?text=Hola%20Rosa", "_blank", "noopener,noreferrer");
    expect(screen.getAllByText(/Recordado recién/).length).toBeGreaterThan(0);
    abrir.mockRestore();
  });

  it("Cobrar lleva al POS con la inscripción y la sede del grupo", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar" })[0]);
    expect(screen.getByTestId("destino")).toHaveTextContent("/pos?inscripcion=103&sede=2&sedeNombre=Norte");
  });
});
