import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsumosDeCita, FichaTecnica, FichasDeCliente } from "../../lib/belleza/apiExtras";

/**
 * Lo de la fase 4 dentro de la cita: los insumos que gastó (corregir lo
 * realmente usado) y la ficha técnica del cliente (fórmulas y fotos). Cada
 * bloque sale sólo con su feature y su permiso.
 */

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({}),
  useAuthOpcional: () => null,
}));

vi.mock("../../lib/belleza/apiExtras", () => ({
  apiExtras: {
    consumosDeCita: vi.fn(),
    ajustarConsumo: vi.fn(),
    agregarConsumo: vi.fn(),
    insumos: vi.fn(),
    fichasDeCita: vi.fn(),
    fichasDeCliente: vi.fn(),
    crearFicha: vi.fn(),
    editarFicha: vi.fn(),
    borrarFicha: vi.fn(),
    subirFoto: vi.fn(),
    borrarFoto: vi.fn(),
    fotoComoUrl: vi.fn(),
  },
}));

import { apiExtras } from "../../lib/belleza/apiExtras";
import { ExtrasCita } from "./ExtrasAgenda";

const FASE4 = ["consumo_servicio", "ficha_tecnica"];
const profesional = {
  rol: "PROFESIONAL" as const,
  permisos: ["consumo.ajustar", "fichatecnica.ver", "fichatecnica.editar"],
  permisosPropios: ["consumo.ajustar", "fichatecnica.ver", "fichatecnica.editar"],
};

const CONSUMOS: ConsumosDeCita = {
  citaId: 30,
  ventas: [{ id: 77, comprobante: "V-000012" }],
  consumos: [
    {
      id: 1,
      ventaId: 77,
      citaId: 30,
      servicioId: 100,
      servicio: "Tinte raíz",
      insumoId: 200,
      insumo: "Tinte 7.1",
      unidad: "g",
      recursoId: 7,
      recurso: "Ana",
      cantidadReceta: 60,
      cantidad: 60,
      costoUnitario: 0.5,
      costo: 30,
      ajustadoEn: null,
    },
  ],
};

const ficha = (over: Partial<FichaTecnica> = {}): FichaTecnica => ({
  id: 3,
  clienteId: 5,
  citaId: 30,
  recursoId: 7,
  recurso: "Ana",
  fecha: "2026-10-06T14:00:00Z",
  servicio: "Tinte raíz",
  formulas: [{ marca: "Igora", tono: "7.1", proporcion: "1:1,5", oxidante: "20 vol", tiempoMin: 35 }],
  nota: "Raíz con 30 % de canas",
  editable: true,
  fotos: [],
  ...over,
});

const FICHAS: FichasDeCliente = {
  citaId: 30,
  cliente: { id: 5, nombre: "Rosa Díaz" },
  fichas: [ficha(), ficha({ id: 2, citaId: 12, servicio: "Balayage", editable: false, fecha: "2026-08-01T14:00:00Z" })],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiExtras.consumosDeCita).mockResolvedValue(CONSUMOS);
  vi.mocked(apiExtras.fichasDeCita).mockResolvedValue(FICHAS);
});

async function montar(features = FASE4, usuario: object = profesional, rubro = "PELUQUERIA") {
  render(<ExtrasCita citaId={30} ctx={{ features, rubro, usuario }} />);
  await act(async () => {});
}

describe("insumos usados en la cita", () => {
  it("lista lo que gastó y corrige lo realmente usado", async () => {
    vi.mocked(apiExtras.ajustarConsumo).mockResolvedValue({ ...CONSUMOS.consumos[0], cantidad: 75 });
    await montar();
    const bloque = screen.getByRole("region", { name: "Insumos usados" });
    expect(within(bloque).getByText("Tinte 7.1")).toBeInTheDocument();
    expect(within(bloque).getByText(/receta 60 g/)).toBeInTheDocument();
    fireEvent.change(within(bloque).getByLabelText("Usado de Tinte 7.1"), { target: { value: "75" } });
    await act(async () => {
      fireEvent.click(within(bloque).getByText("Guardar"));
    });
    expect(apiExtras.ajustarConsumo).toHaveBeenCalledWith(1, 75);
  });

  it("antes de cobrar avisa que se descuentan al cobrar", async () => {
    vi.mocked(apiExtras.consumosDeCita).mockResolvedValue({ citaId: 30, ventas: [], consumos: [] });
    await montar();
    expect(screen.getByText("Los insumos de la receta se descuentan al cobrar la cita.")).toBeInTheDocument();
  });
});

describe("ficha técnica en la cita", () => {
  it("muestra la historia de color del cliente con la de esta cita marcada", async () => {
    await montar();
    const bloque = screen.getByRole("region", { name: "Ficha técnica" });
    // La misma fórmula en las dos visitas: la colorista repite lo que funcionó.
    expect(within(bloque).getAllByText("Igora 7.1 · 1:1,5 · 20 vol · 35 min")).toHaveLength(2);
    expect(within(bloque).getByText("Balayage")).toBeInTheDocument();
    expect(within(bloque).getByText(/esta cita/)).toBeInTheDocument();
    // Sólo la suya se edita.
    expect(within(bloque).getAllByLabelText("Editar fórmula")).toHaveLength(1);
  });

  it("carga una fórmula nueva ligada a la cita", async () => {
    vi.mocked(apiExtras.crearFicha).mockResolvedValue(ficha({ id: 9 }));
    await montar();
    fireEvent.click(screen.getByText("Fórmula"));
    fireEvent.change(screen.getByLabelText("Servicio"), { target: { value: "Retoque" } });
    fireEvent.change(screen.getByLabelText("Marca 1"), { target: { value: "Koleston" } });
    fireEvent.change(screen.getByLabelText("Tono 1"), { target: { value: "8.0" } });
    fireEvent.change(screen.getByLabelText("Tiempo 1"), { target: { value: "30" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Guardar"));
    });
    expect(apiExtras.crearFicha).toHaveBeenCalledWith(
      expect.objectContaining({
        clienteId: 5,
        citaId: 30,
        servicio: "Retoque",
        formulas: [expect.objectContaining({ marca: "Koleston", tono: "8.0", tiempoMin: 30 })],
      }),
    );
  });
});

describe("sin la feature o fuera de belleza", () => {
  it("no se dibuja nada ni se consulta nada", async () => {
    await montar([]);
    await montar(FASE4, profesional, "RESTAURANTE");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(apiExtras.consumosDeCita).not.toHaveBeenCalled();
    expect(apiExtras.fichasDeCita).not.toHaveBeenCalled();
  });

  it("sin el permiso, el bloque no sale", async () => {
    await montar(FASE4, { rol: "CAJERO", permisos: ["consumo.ajustar"], permisosPropios: [] });
    expect(screen.getByRole("region", { name: "Insumos usados" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ficha técnica" })).not.toBeInTheDocument();
  });
});
