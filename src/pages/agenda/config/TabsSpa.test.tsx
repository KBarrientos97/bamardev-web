import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recurso, Servicio } from "../../../lib/agenda/tiposConfigAgenda";

/**
 * Las pestañas del spa completo (agenda fase 3) en la configuración: tipos de
 * espacio, paquetes y consentimientos, con la API mockeada.
 */

vi.mock("../../../lib/agenda/apiSpa", () => ({
  apiSpa: {
    tiposEspacio: vi.fn(),
    crearTipoEspacio: vi.fn(),
    editarTipoEspacio: vi.fn(),
    paquetes: vi.fn(),
    crearPaquete: vi.fn(),
    editarPaquete: vi.fn(),
    plantillasConsentimiento: vi.fn(),
    configurarConsentimiento: vi.fn(),
  },
}));

import { apiSpa } from "../../../lib/agenda/apiSpa";
import TabConsentimientos from "./TabConsentimientos";
import TabEspacios from "./TabEspacios";
import TabPaquetes from "./TabPaquetes";

const MASAJE: Servicio = {
  id: 100,
  nombre: "Masaje relajante",
  categoriaId: null,
  categoria: null,
  precio: 150,
  duracionMin: 60,
  bufferMin: 15,
  reservableOnline: false,
  recursoIds: [],
  activo: true,
  requiereEspacioTipoId: 4,
};

const CABINA_1: Recurso = {
  id: 7,
  tipo: "ESPACIO",
  nombre: "Cabina 1",
  nombrePublico: null,
  color: "#7357B8",
  telefono: null,
  comisionPct: null,
  usuarioId: null,
  usuario: null,
  publicadoOnline: false,
  activo: true,
  orden: 1,
  sucursalIds: [1],
  servicioIds: [],
  tipoEspacioId: 4,
};

const montar = async (ui: React.ReactElement) => {
  render(ui);
  await act(async () => {});
};

beforeEach(() => vi.clearAllMocks());

describe("tipos de espacio", () => {
  it("lista los tipos con sus espacios y avisa los espacios sin tipo", async () => {
    vi.mocked(apiSpa.tiposEspacio).mockResolvedValue([
      { id: 4, nombre: "Cabina", activo: true, orden: 0, espacios: 1, servicios: 3 },
    ]);
    await montar(
      <TabEspacios recursos={[CABINA_1, { ...CABINA_1, id: 8, nombre: "Camilla vieja", tipoEspacioId: null }]} irA={vi.fn()} />,
    );
    expect(screen.getByText("Cabina")).toBeTruthy();
    expect(screen.getByText(/Cabina 1 · 3 servicios lo piden/)).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("Camilla vieja");
  });

  it("crea un tipo nuevo", async () => {
    vi.mocked(apiSpa.tiposEspacio).mockResolvedValue([]);
    vi.mocked(apiSpa.crearTipoEspacio).mockResolvedValue({
      id: 9,
      nombre: "Sillón de pedicura",
      activo: true,
      orden: 0,
      espacios: 0,
      servicios: 0,
    });
    await montar(<TabEspacios recursos={[]} irA={vi.fn()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo tipo/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByPlaceholderText("Cabina"), { target: { value: " Sillón de pedicura " } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiSpa.crearTipoEspacio).toHaveBeenCalledWith({ nombre: "Sillón de pedicura" });
  });
});

describe("paquetes", () => {
  it("arma un paquete con sus sesiones y lo manda", async () => {
    vi.mocked(apiSpa.paquetes).mockResolvedValue([]);
    vi.mocked(apiSpa.crearPaquete).mockResolvedValue({
      productoId: 50,
      nombre: "5 masajes",
      precio: 600,
      categoriaId: null,
      vigenciaDias: 90,
      activo: true,
      items: [{ servicioId: 100, servicio: "Masaje relajante", sesiones: 5 }],
    });
    await montar(<TabPaquetes servicios={[MASAJE]} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo paquete/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByPlaceholderText("5 masajes relajantes"), { target: { value: "5 masajes" } });
    fireEvent.change(within(dialogo).getByPlaceholderText("0.00"), { target: { value: "600" } });
    fireEvent.change(within(dialogo).getByLabelText("Servicio 1"), { target: { value: "100" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiSpa.crearPaquete).toHaveBeenCalledWith({
      nombre: "5 masajes",
      precio: 600,
      vigenciaDias: 90,
      items: [{ servicioId: 100, sesiones: 5 }],
    });
  });

  it("no deja repetir un servicio", async () => {
    vi.mocked(apiSpa.paquetes).mockResolvedValue([]);
    await montar(<TabPaquetes servicios={[MASAJE]} />);
    fireEvent.click(screen.getAllByRole("button", { name: /Nuevo paquete/ })[0]);
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByPlaceholderText("5 masajes relajantes"), { target: { value: "x" } });
    fireEvent.change(within(dialogo).getByPlaceholderText("0.00"), { target: { value: "1" } });
    fireEvent.change(within(dialogo).getByLabelText("Servicio 1"), { target: { value: "100" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: /Otro servicio/ }));
    fireEvent.change(within(dialogo).getByLabelText("Servicio 2"), { target: { value: "100" } });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiSpa.crearPaquete).not.toHaveBeenCalled();
    expect(within(dialogo).getByText(/está dos veces/)).toBeTruthy();
  });
});

describe("consentimientos", () => {
  it("prende la firma de un servicio con el texto sugerido", async () => {
    vi.mocked(apiSpa.plantillasConsentimiento).mockResolvedValue([
      {
        servicioId: 100,
        servicio: "Masaje relajante",
        requiere: false,
        texto: null,
        version: null,
        textoSugerido: "Declaro que… Masaje relajante…",
      },
    ]);
    vi.mocked(apiSpa.configurarConsentimiento).mockResolvedValue({
      servicioId: 100,
      servicio: "Masaje relajante",
      requiere: true,
      texto: "Declaro que… Masaje relajante…",
      version: 1,
      textoSugerido: "",
    });
    await montar(<TabConsentimientos />);
    expect(screen.getByText("Sin firma")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Configurar el consentimiento de Masaje/ }));
    const dialogo = screen.getByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    });
    expect(apiSpa.configurarConsentimiento).toHaveBeenCalledWith(100, {
      requiere: true,
      texto: "Declaro que… Masaje relajante…",
    });
  });
});
