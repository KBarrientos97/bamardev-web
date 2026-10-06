import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Promocion } from "../../lib/promociones/tipos";

/** La pantalla de promociones con la API simulada. */

const sesion = vi.hoisted(() => ({ features: ["promociones", "cupones"] as string[] }));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({ negocio: { nombre: "Pollería", features: sesion.features } }),
}));
vi.mock("../../lib/api", () => ({
  api: {
    getProductos: vi.fn().mockResolvedValue([{ id: 5, nombre: "Gaseosa", habilitado: true }]),
    getCategorias: vi.fn().mockResolvedValue([{ id: 2, nombre: "Pollos" }]),
  },
}));
vi.mock("../../lib/promociones/apiPromociones", () => ({
  apiPromociones: {
    listar: vi.fn(),
    crear: vi.fn(),
    editar: vi.fn(),
    estado: vi.fn(),
    reporte: vi.fn(),
    enlace: vi.fn(),
    anunciar: vi.fn(),
    cupones: vi.fn(),
    crearCupones: vi.fn(),
    anularCupon: vi.fn(),
    bajarCuponesCsv: vi.fn(),
  },
}));

import { apiPromociones } from "../../lib/promociones/apiPromociones";
import Promociones from "./Promociones";

const api = vi.mocked(apiPromociones);

function promo(cambios: Partial<Promocion> = {}): Promocion {
  return {
    id: 1,
    nombre: "2x1 los martes",
    descripcion: null,
    tipo: "NXM",
    disparo: "AUTOMATICA",
    alcance: "LINEA",
    valor: null,
    llevaN: 2,
    pagaM: 1,
    minimoCompra: null,
    topeDescuento: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    diasSemana: [2],
    horaDesde: null,
    horaHasta: null,
    usosMax: null,
    usosPorCliente: null,
    usos: 3,
    descontado: 75,
    acumulable: false,
    prioridad: 0,
    publica: true,
    slug: "2x1-los-martes",
    estado: "ACTIVA",
    estadoVisible: "ACTIVA",
    version: 1,
    productoIds: [],
    categoriaIds: [2],
    excluirProductoIds: [],
    cupones: 0,
    condiciones: ["2x1 en artículos seleccionados", "Sólo los martes"],
    urlPublica: "https://app-qa.bamardev.com/p/omar/promo/2x1-los-martes",
    creadoEn: "2026-10-06T00:00:00Z",
    ...cambios,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.features = ["promociones", "cupones"];
});

describe("Promociones", () => {
  it("lista las promociones con sus condiciones y sus usos", async () => {
    api.listar.mockResolvedValue([promo()]);
    render(<Promociones />);
    expect(await screen.findByText("2x1 los martes")).toBeInTheDocument();
    expect(screen.getByText("Sólo los martes")).toBeInTheDocument();
    expect(screen.getByText(/3 usos · descontado/)).toBeInTheDocument();
    // Pública y activa: se puede compartir.
    expect(screen.getByRole("button", { name: /Compartir/ })).toBeInTheDocument();
  });

  it("sin promociones ofrece plantillas; sin cupones en el plan, no la de código", async () => {
    sesion.features = ["promociones"];
    api.listar.mockResolvedValue([]);
    render(<Promociones />);
    expect(await screen.findByText("Todavía no hay promociones")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Happy hour" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cupón de bienvenida" })).not.toBeInTheDocument();
  });

  it("una plantilla precarga el editor y guarda lo que manda el formulario", async () => {
    api.listar.mockResolvedValue([]);
    api.crear.mockResolvedValue(promo({ id: 9, nombre: "Happy hour" }));
    render(<Promociones />);
    fireEvent.click(await screen.findByRole("button", { name: "Happy hour" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByDisplayValue("Happy hour")).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(api.crear).toHaveBeenCalled());
    expect(api.crear.mock.calls[0][0]).toMatchObject({
      nombre: "Happy hour",
      tipo: "PORCENTAJE",
      valor: 20,
      horaDesde: "15:00",
      horaHasta: "18:00",
      disparo: "AUTOMATICA",
    });
    expect(await screen.findByText(/Se creó/)).toBeInTheDocument();
  });

  it("pausar llama al backend con el estado nuevo", async () => {
    api.listar.mockResolvedValue([promo()]);
    api.estado.mockResolvedValue(promo({ estado: "PAUSADA" }));
    render(<Promociones />);
    fireEvent.click(await screen.findByRole("button", { name: "Pausar" }));
    await waitFor(() => expect(api.estado).toHaveBeenCalledWith(1, "PAUSADA"));
  });
});
