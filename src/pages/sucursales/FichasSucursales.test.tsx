import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FichaSucursal } from "../../lib/pagina/tipos";

/** Configuración › Sucursales: la ficha única de cada sucursal (02-nov). */

const sesion = { rubro: "PELUQUERIA", features: ["pos"] as string[] | undefined };

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ rubro: sesion.rubro, vocabulario: null, negocio: { features: sesion.features } }),
}));

vi.mock("../../lib/pagina/apiPagina", () => ({
  apiPagina: {
    fichasSucursal: vi.fn(),
    guardarFichaSucursal: vi.fn(),
  },
}));

import { apiPagina } from "../../lib/pagina/apiPagina";
import FichasSucursales from "./FichasSucursales";

const HABILES = [1, 2, 3, 4, 5].map((dia) => ({ dia, desde: "09:00", hasta: "20:00" }));

function ficha(cambios: Partial<FichaSucursal> = {}): FichaSucursal {
  return {
    id: 10,
    nombre: "Centro",
    direccion: "Junín 245",
    telefono: null,
    esPrincipal: true,
    latitud: null,
    longitud: null,
    horarioSemanal: null,
    ...cambios,
  };
}

async function montar() {
  render(
    <MemoryRouter>
      <FichasSucursales />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const filaHorario = () => screen.getByRole("button", { name: /^Horario de Centro:/ });
const guardar = () => screen.getByRole("button", { name: "Guardar" });

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "PELUQUERIA";
  sesion.features = ["pos"];
  vi.mocked(apiPagina.fichasSucursal).mockResolvedValue([ficha()]);
});

describe("Configuración › Sucursales", () => {
  it("una ficha por sucursal: dirección, teléfono, ubicación y horario", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Datos de las sucursales" })).toBeInTheDocument();
    const f = screen.getByRole("region", { name: "Ficha de Centro" });
    expect(within(f).getByText("Principal")).toBeInTheDocument();
    expect(within(f).getByLabelText("Dirección de Centro")).toHaveValue("Junín 245");
    expect(within(f).getByRole("group", { name: "Ubicación en el mapa de Centro" })).toBeInTheDocument();
    expect(filaHorario()).toHaveTextContent("Sin horario cargado");
    // Sin cambios no hay nada que guardar.
    expect(guardar()).toBeDisabled();
  });

  it("guarda sólo lo que cambió, al toque", async () => {
    vi.mocked(apiPagina.guardarFichaSucursal).mockResolvedValue(ficha({ telefono: "33445566" }));
    await montar();
    fireEvent.change(screen.getByLabelText("Teléfono de Centro"), { target: { value: " 33445566 " } });
    fireEvent.click(guardar());
    await act(async () => {});
    expect(apiPagina.guardarFichaSucursal).toHaveBeenCalledWith(10, { telefono: "33445566" });
    expect(screen.getByText("Centro: guardada")).toBeInTheDocument();
    expect(guardar()).toBeDisabled();
  });

  it("quitar la ubicación manda las dos coordenadas en null", async () => {
    vi.mocked(apiPagina.fichasSucursal).mockResolvedValue([ficha({ latitud: -17.78, longitud: -63.18 })]);
    vi.mocked(apiPagina.guardarFichaSucursal).mockResolvedValue(ficha());
    await montar();
    expect(screen.getByText("Ubicación marcada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    fireEvent.click(guardar());
    await act(async () => {});
    expect(apiPagina.guardarFichaSucursal).toHaveBeenCalledWith(10, { latitud: null, longitud: null });
  });

  it("el horario se carga en el popup (copiar a días hábiles, corte, error) y se guarda", async () => {
    await montar();
    fireEvent.click(filaHorario());
    const d = screen.getByRole("dialog", { name: "Horario de Centro" });

    // Lunes 9 a 20, y lo mismo de martes a viernes.
    fireEvent.click(within(d).getByRole("switch", { name: "Lunes abierto" }));
    expect(within(d).getByLabelText("Lunes: abre")).toHaveValue("09:00");
    fireEvent.change(within(d).getByLabelText("Lunes: cierra"), { target: { value: "20:00" } });
    fireEvent.click(within(d).getByRole("button", { name: "Copiar a todos los días hábiles" }));
    expect(within(d).getByRole("switch", { name: "Viernes abierto" })).toHaveAttribute("aria-checked", "true");

    // El sábado arranca con las horas del viernes; cierra a la una.
    fireEvent.click(within(d).getByRole("switch", { name: "Sábado abierto" }));
    fireEvent.change(within(d).getByLabelText("Sábado: cierra"), { target: { value: "13:00" } });

    // Un corte el lunes que se pisa: el error va en el lunes y "Listo" no cierra.
    fireEvent.click(within(d).getByRole("button", { name: "Agregar corte el lunes" }));
    fireEvent.change(within(d).getByLabelText("Lunes: abre (después del corte)"), { target: { value: "12:00" } });
    expect(within(d).getByRole("alert")).toHaveTextContent("El lunes: los tramos 09:00-13:00 y 12:00-20:00 se pisan");
    fireEvent.click(within(d).getByRole("button", { name: "Listo" }));
    expect(screen.getByRole("dialog", { name: "Horario de Centro" })).toBeInTheDocument();
    fireEvent.click(within(d).getByRole("button", { name: "Quitar el segundo horario del lunes" }));
    fireEvent.change(within(d).getByLabelText("Lunes: cierra"), { target: { value: "20:00" } });
    fireEvent.click(within(d).getByRole("button", { name: "Listo" }));
    expect(filaHorario()).toHaveTextContent("Lun a vie 9:00–20:00 · Sáb 9:00–13:00 · Dom cerrado");

    const semana = [...HABILES, { dia: 6, desde: "09:00", hasta: "13:00" }];
    vi.mocked(apiPagina.guardarFichaSucursal).mockResolvedValue(ficha({ horarioSemanal: semana }));
    fireEvent.click(guardar());
    await act(async () => {});
    expect(apiPagina.guardarFichaSucursal).toHaveBeenCalledWith(10, { horarioSemanal: semana });
  });

  it("volver al horario guardado no deja nada para guardar; quitarlo manda null", async () => {
    vi.mocked(apiPagina.fichasSucursal).mockResolvedValue([ficha({ horarioSemanal: HABILES })]);
    vi.mocked(apiPagina.guardarFichaSucursal).mockResolvedValue(ficha());
    await montar();
    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("switch", { name: "Lunes abierto" }));
    fireEvent.click(screen.getByRole("button", { name: "Listo" }));
    expect(guardar()).toBeDisabled();

    fireEvent.click(filaHorario());
    fireEvent.click(screen.getByRole("button", { name: "Quitar horario" }));
    fireEvent.click(guardar());
    await act(async () => {});
    expect(apiPagina.guardarFichaSucursal).toHaveBeenCalledWith(10, { horarioSemanal: null });
  });

  it("el error del backend queda en la ficha y no pierde lo escrito", async () => {
    vi.mocked(apiPagina.guardarFichaSucursal).mockRejectedValue(new Error("El lunes: hasta 2 tramos por día"));
    await montar();
    fireEvent.change(screen.getByLabelText("Dirección de Centro"), { target: { value: "Junín 300" } });
    fireEvent.click(guardar());
    await act(async () => {});
    expect(screen.getByText("El lunes: hasta 2 tramos por día")).toBeInTheDocument();
    expect(screen.getByLabelText("Dirección de Centro")).toHaveValue("Junín 300");
  });

  it("con la página del negocio, dice que lo que se muestra se elige en Mi página", async () => {
    sesion.features = ["pos", "pagina_publica"];
    await montar();
    expect(screen.getByRole("link", { name: "Mi página" })).toHaveAttribute("href", "/mi-pagina");
  });
});
