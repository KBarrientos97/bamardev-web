import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RespuestaCobranza } from "../../lib/academia/tipos";

/**
 * N7 · Cobranza: las pestañas son los indicadores (con cuánto y cuántos),
 * "Enviar QR" abre el panel y "Abrir WhatsApp" pide al backend el mensaje con
 * el enlace de pago (que deja anotado el recordatorio) y abre wa.me. Para
 * varios, "1 de N · Siguiente". Cobrar lleva a "Cobrar a estudiante" (A1) con la inscripción.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { cobranza: vi.fn(), recordatorio: vi.fn(), carreras: vi.fn(async () => []), ajustes: vi.fn(async () => null) },
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
    parciales: 333,
    parcialesCuotas: 1,
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
    {
      inscripcionId: 102,
      alumno: { id: 52, nombre: "Bustillos Rek, Camila", codigo: "2026-0102" },
      contacto: { nombre: "Camila", telefono: "75512340", esTutor: false },
      grupo: { id: 7, nombre: "Barbería · L-V 10:00" },
      sede: { id: 1, nombre: "Central" },
      cuotas: [
        { id: 902, numero: 2, concepto: "M2", materiaOrdenes: [2], monto: 500, pagado: 0, saldo: 500, vence: "2026-10-10", estado: "PENDIENTE", vencida: true, diasAtraso: 6, ultimoRecordatorioEn: "2026-10-13T12:00:00.000Z", recordatorios: 1 },
      ],
      saldo: 500,
      diasAtraso: 6,
      ultimoRecordatorioEn: "2026-10-13T12:00:00.000Z",
      recordatorios: 1,
    },
  ],
  total: 2,
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

describe("N7 · cobranza", () => {
  it("arranca en Vencidas: las pestañas dicen cuánto y cuántos, y la fila del tutor", async () => {
    await montar();
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "vencidas", page: 1, pageSize: 20 }));
    // Los indicadores son los filtros: tarjetas-botón, la elegida con aria-pressed.
    const filtros = screen.getByRole("group", { name: "Filtrar deudas" });
    expect(within(filtros).getByRole("button", { name: /Vencidas Bs\s?4\.320,00 · 9/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(filtros).getByRole("button", { name: /Abonos a medias Bs\s?333,00 · 1/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByText(/tutor Rosa Molina/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/abonó Bs\s?200,00 de Bs\s?533,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("sin recordar").length).toBeGreaterThan(0);
  });

  it("U4: sin chips de antigüedad ni selector de curso, y la lista va de la deuda más vieja a la más nueva", async () => {
    // Con 2 cursos antes aparecía el selector; ahora no se pide ni la lista de cursos.
    vi.mocked(apiAcademia.carreras).mockResolvedValue([
      { id: 1, nombre: "Barbería" },
      { id: 2, nombre: "Tatuaje" },
    ] as never);
    await montar();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    // U1: el "⋯" tenía sólo opciones "Pronto"; vacío, desaparece.
    expect(screen.queryByRole("button", { name: /Más acciones de cobranza/ })).not.toBeInTheDocument();
    expect(screen.queryByText("1–7 días")).not.toBeInTheDocument();
    expect(screen.queryByText("Más de 30")).not.toBeInTheDocument();
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.not.objectContaining({ antiguedad: expect.anything() }));
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.not.objectContaining({ carreraId: expect.anything() }));
    // El backend ordena por días de atraso (la más vieja arriba) y la pantalla respeta ese orden.
    const nombres = screen.getAllByText(/Céspedes Molina|Bustillos Rek/).map((n) => n.textContent ?? "");
    expect(nombres.findIndex((n) => /Céspedes/.test(n))).toBeLessThan(nombres.findIndex((n) => /Bustillos/.test(n)));
  });

  it("la pestaña viene de la dirección (desde Hoy)", async () => {
    await montar("/academia/cobranza?tipo=por-vencer");
    expect(apiAcademia.cobranza).toHaveBeenCalledWith(expect.objectContaining({ tipo: "por-vencer" }));
  });

  it("Enviar QR abre el panel; Abrir WhatsApp pide el mensaje con el enlace, abre wa.me y lo anota", async () => {
    const abrir = vi.spyOn(window, "open").mockImplementation(() => null);
    vi.mocked(apiAcademia.recordatorio).mockResolvedValue({
      telefono: "59171234567",
      texto: "Hola Rosa, pagá acá: https://app.bamardev.com/p/horizonte/pagar/K7Q2",
      url: "https://wa.me/59171234567?text=Hola",
      enlacePago: "https://app.bamardev.com/p/horizonte/pagar/K7Q2",
    });
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    const panel = screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" });
    expect(within(panel).getByText(/Rosa Molina \(tutor\)/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Abrir WhatsApp" }));
    });
    expect(apiAcademia.recordatorio).toHaveBeenCalledWith(905);
    expect(abrir).toHaveBeenCalledWith("https://wa.me/59171234567?text=Hola", "_blank", "noopener,noreferrer");
    expect(within(panel).getByText(/pagar\/K7Q2/)).toBeInTheDocument();
    // La URL larga se corta dentro del globo en vez de salirse (QA ronda 2, B-20).
    expect(within(panel).getByText(/pagar\/K7Q2/).className).toContain("break-all");
    expect(within(panel).getByRole("status")).toHaveTextContent("Anotado: recordado hoy");
    abrir.mockRestore();
  });

  it("varios marcados se recorren de a uno: 1 de 2 · Siguiente", async () => {
    vi.spyOn(window, "open").mockImplementation(() => null);
    await montar();
    expect(screen.getByRole("button", { name: "Enviar QR a los marcados" })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Marcar todos los de esta página" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Enviar QR a 2 marcados" }));
    expect(screen.getByText("1 de 2")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Céspedes Molina, Joaquín" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente ›" }));
    expect(screen.getByText("2 de 2")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Bustillos Rek, Camila" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Terminar" }));
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("Cobrar, desde el panel, lleva a Cobrar a estudiante con la inscripción y la sede del grupo", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviar QR" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar?inscripcion=103&sede=2&sedeNombre=Norte");
  });

  it("QA 23-oct: Cobrar también en la fila, sin abrir el panel", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar a Céspedes Molina, Joaquín" })[0]);
    expect(screen.getByTestId("destino")).toHaveTextContent("/academia/cobranza/cobrar?inscripcion=103&sede=2&sedeNombre=Norte");
  });

  it("26-oct: Cobrar ya no está aparte en el menú; arriba se cobra a cualquiera, esté o no en la lista", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Cobrar a un estudiante" }));
    expect(screen.getByTestId("destino")).toHaveTextContent(/^\/academia\/cobranza\/cobrar$/);
  });
});
