import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelControl } from "../../../lib/academia/tipos";

/**
 * N9 · Panel de control y E18 · Reportes: las fotos se revisan una tras otra
 * ("Está bien" o "Algo no cuadra" con motivo); "Para mirar" cambia de lista;
 * el resultado por sede suma lo que entra y resta lo que sale.
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN: s } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
});

vi.mock("../../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, getSucursales: vi.fn().mockResolvedValue([]) } };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { control: vi.fn(), reportes: vi.fn(), fotoComoUrl: vi.fn(), revisarFotos: vi.fn() } };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Control from "./Control";
import Reportes from "./Reportes";

const PANEL: PanelControl = {
  fotosPorRevisar: [
    { alumnoId: 60, nombre: "Ortiz Rocha, Thiago", ci: "14550221", fechaNacimiento: "2010-03-12", grupo: "Tatuaje · M-J", inscritoPor: "Online", inscritaEn: "2026-10-15T12:00:00.000Z" },
    { alumnoId: 61, nombre: "Suárez Peña, Daniela", ci: "7654321", fechaNacimiento: null, grupo: "Uñas · L-V", inscritoPor: "Lucía Vargas", inscritaEn: "2026-10-16T12:00:00.000Z" },
  ],
  asistenSinPagar: [{ alumno: { id: 52, nombre: "Bustillos Rek, Camila" }, grupo: "Barbería", asistencias: 6, estadoPago: "SIN_PAGAR", inscritoPor: "Lucía Vargas" }],
  pagaronNoVienen: [],
  descuentosConPin: [{ inscripcionId: 9, alumno: "Rivero Gil, Matías", descuento: "Beca 50 %", autorizadoPor: "Hugo Salinas", en: "2026-10-12T12:00:00.000Z" }],
  ventasAnuladas: [],
  inscripcionesPorUsuario: [{ usuario: "Lucía Vargas", sede: "Central", cantidad: 12, cobrado: 6000 }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.control).mockResolvedValue(PANEL);
  vi.mocked(apiAcademia.fotoComoUrl).mockResolvedValue("blob:x");
  vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
});

describe("N9 · Panel de control", () => {
  it("revisa las fotos una tras otra: está bien, y la siguiente con lo que no cuadra", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Revisar 2 fotos" }));
    await act(async () => {});
    let panel = screen.getByRole("complementary", { name: "Ortiz Rocha, Thiago" });
    expect(within(panel).getByText("14550221")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Está bien" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(60, { ok: true });
    panel = screen.getByRole("complementary", { name: "Suárez Peña, Daniela" });
    fireEvent.click(within(panel).getByRole("button", { name: "Algo no cuadra" }));
    fireEvent.change(within(panel).getByLabelText("¿Qué no cuadra?"), { target: { value: "La foto no coincide con el carnet" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar motivo" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenLastCalledWith(61, { ok: false, observacion: "La foto no coincide con el carnet" });
    expect(screen.getByRole("button", { name: "Fotos al día" })).toBeDisabled();
  });

  it("Para mirar: quien viene sin pagar, y los descuentos con PIN", async () => {
    render(
      <MemoryRouter>
        <Control />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByText("Bustillos Rek, Camila")).toBeInTheDocument();
    expect(screen.getByText("Sin pagar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Descuentos con PIN/ }));
    expect(screen.getByText("Beca 50 %")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Inscripciones por persona" })).toHaveTextContent("Lucía Vargas");
  });
});

describe("E18 · Reportes", () => {
  it("el resultado por sede, los activos por curso y la morosidad", async () => {
    vi.mocked(apiAcademia.reportes).mockResolvedValue({
      mes: "2026-10",
      porSede: [
        { sede: "Central", cobradoModulos: 31480, ventasProductos: 3940, sueldosDocentes: 7754, otrosGastos: 6200, resultado: 21466 },
        { sede: "Norte", cobradoModulos: 4300, ventasProductos: 620, sueldosDocentes: 0, otrosGastos: 2100, resultado: 2820 },
      ],
      activosPorCurso: [{ curso: "Tatuaje", activos: 18, cupo: 20 }],
      morosidad: { vencido: 5400, estudiantes: 12, pctEstudiantes: 14 },
      asistenciaPromedioPct: 88,
    });
    render(
      <MemoryRouter>
        <Reportes />
      </MemoryRouter>,
    );
    await act(async () => {});
    const resultado = screen.getByRole("region", { name: "Resultado por sede" });
    expect(within(resultado).getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
    expect(resultado).toHaveTextContent(/24\.286/);
    expect(resultado).toHaveTextContent(/− Bs\s?7\.754/);
    expect(screen.getByText("18 de 20 activos")).toBeInTheDocument();
    expect(screen.getByText("88 %")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Morosidad" })).toHaveTextContent(/5\.400/);
  });
});
