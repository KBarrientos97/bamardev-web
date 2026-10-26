import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemSugerencia, SugerenciaCompra } from "../../types";

/**
 * La sugerencia de compra: qué pedir y por qué, con cantidades que el dueño
 * puede cambiar antes de imprimir el pedido.
 */

vi.mock("../../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: { id: 1, nombre: "Farmacia San Rafael" },
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: 917 },
    }),
  };
});

vi.mock("../../lib/api", () => ({
  api: { sugerenciaCompra: vi.fn(), getSucursales: vi.fn(async () => []) },
}));

import { api } from "../../lib/api";
import SugerenciaCompraPagina from "./SugerenciaCompra";

function item(over: Partial<ItemSugerencia>): ItemSugerencia {
  return {
    productoId: 1,
    nombre: "Ibuprofeno 400 mg",
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    laboratorio: "INTI",
    categoria: null,
    unidad: null,
    stock: 5,
    vencido: 0,
    stockMinimo: 10,
    vendidas: 30,
    porDia: 1,
    alcanzaDias: 5,
    encargos: 0,
    sugerido: 20,
    motivo: "BAJO_MINIMO",
    costo: 0.5,
    subtotal: 10,
    ...over,
  };
}

const respuesta = (items: ItemSugerencia[]): SugerenciaCompra => ({
  dias: 30,
  cobertura: 15,
  items,
  resumen: {
    articulos: items.length,
    unidades: items.reduce((a, i) => a + i.sugerido, 0),
    inversion: items.reduce((a, i) => a + i.subtotal, 0),
    agotados: items.filter((i) => i.motivo === "AGOTADO").length,
  },
});

const diclofenaco = item({
  productoId: 2,
  nombre: "Diclofenaco 50 mg",
  principioActivo: "Diclofenaco",
  laboratorio: "TERBOL",
  stock: 10,
  vencido: 10,
  vendidas: 0,
  porDia: 0,
  alcanzaDias: null,
  encargos: 2,
  sugerido: 2,
  motivo: "AGOTADO",
  costo: 3,
  subtotal: 6,
});

async function montar() {
  render(
    <MemoryRouter>
      <SugerenciaCompraPagina />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.sugerenciaCompra).mockResolvedValue(respuesta([diclofenaco, item({})]));
});

const tabla = () => screen.getByRole("table");
const fila = (nombre: string) => within(tabla()).getByText(nombre).closest("tr")!;

describe("la sugerencia", () => {
  it("dice qué pedir y por qué, sin contar lo vencido", async () => {
    await montar();
    expect(api.sugerenciaCompra).toHaveBeenCalledWith({ dias: 30, cobertura: 15, sucursalId: null });
    const diclo = fila("Diclofenaco 50 mg");
    expect(within(diclo).getByText("Agotado")).toBeInTheDocument();
    // Hay 10, pero vencidos: para vender, 0.
    expect(diclo).toHaveTextContent("0 u.+ 10 vencidos");
    expect(within(fila("Ibuprofeno 400 mg")).getByText("Bajo el mínimo")).toBeInTheDocument();
    expect(screen.getByText("Bs 16,00")).toBeInTheDocument();
  });

  it("la cantidad se cambia, y el total la sigue; 0 es no pedirlo", async () => {
    await montar();
    const campo = within(fila("Ibuprofeno 400 mg")).getByRole("textbox", {
      name: "Cantidad a pedir de Ibuprofeno 400 mg",
    });
    fireEvent.focus(campo);
    fireEvent.change(campo, { target: { value: "0" } });
    expect(within(fila("Ibuprofeno 400 mg")).getByText("sugerido 20")).toBeInTheDocument();
    expect(screen.getByText("1 artículo")).toBeInTheDocument();
    expect(screen.getAllByText("Bs 6,00").length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Volver a lo sugerido" }));
    });
    expect(screen.getByText("2 artículos")).toBeInTheDocument();
  });

  it("por laboratorio, para pedirle a cada droguería lo suyo", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Por laboratorio" }));
    });
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toEqual(["INTIBs 10,00", "TERBOLBs 6,00"]);
  });

  it("otros días de historia y de cobertura piden otra cuenta", async () => {
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "60 días" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "1 mes" }));
    });
    expect(api.sugerenciaCompra).toHaveBeenLastCalledWith({ dias: 60, cobertura: 30, sucursalId: null });
  });

  it("el ritmo de venta va sin ceros de más", async () => {
    // Salía "1,0 por día" (Kevin, 25-oct: sin ceros de más en las cantidades).
    vi.mocked(api.sugerenciaCompra).mockResolvedValue(
      respuesta([item({}), item({ productoId: 3, nombre: "Paracetamol 500 mg", porDia: 1.5, vendidas: 45 })]),
    );
    await montar();
    expect(within(fila("Ibuprofeno 400 mg")).getByText("1 por día")).toBeInTheDocument();
    expect(within(fila("Paracetamol 500 mg")).getByText("1,5 por día")).toBeInTheDocument();
  });

  it("el Excel lleva lo que hay redondeado a los decimales del stock, y sigue siendo número", async () => {
    // La resta 2,3 − 0,1 dejaba "2,1999999999999997" en la planilla.
    vi.mocked(api.sugerenciaCompra).mockResolvedValue(respuesta([item({ stock: 2.3, vencido: 0.1 })]));
    const bajado: { planilla?: Blob } = {};
    const original = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      bajado.planilla = b as Blob;
      return "blob:planilla";
    });
    URL.revokeObjectURL = vi.fn();
    // jsdom no navega: sin esto, el clic del enlace de descarga ensucia la salida.
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await montar();
      fireEvent.click(screen.getByRole("button", { name: /Exportar a Excel/ }));
      const texto = await bajado.planilla!.text();
      expect(texto).toContain('"Ibuprofeno 400 mg";"2,2";"0,1"');
      expect(texto).not.toContain("2,1999");
    } finally {
      URL.createObjectURL = original.crear;
      URL.revokeObjectURL = original.revocar;
      clic.mockRestore();
    }
  });

  it("si no hace falta nada, lo dice", async () => {
    vi.mocked(api.sugerenciaCompra).mockResolvedValue(respuesta([]));
    await montar();
    expect(screen.getByText("No hace falta pedir nada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Exportar a Excel/ })).toBeDisabled();
  });
});

describe("dentro de Reportes", () => {
  it("usa la sucursal de Reportes, avisa que el período de arriba no cuenta y conserva sus días y su Excel", async () => {
    render(
      <MemoryRouter>
        <SugerenciaCompraPagina embebido={{ sucursalId: 7 }} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(api.sugerenciaCompra).toHaveBeenLastCalledWith({ dias: 30, cobertura: 15, sucursalId: 7 });
    // El período de Reportes se sigue viendo arriba: sin el aviso, el dueño
    // elegía "Semana" y esperaba otra sugerencia.
    expect(screen.getByText(/no usa el período de arriba/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "60 días" }));
    });
    expect(api.sugerenciaCompra).toHaveBeenLastCalledWith({ dias: 60, cobertura: 15, sucursalId: 7 });
    expect(screen.getByRole("button", { name: /Exportar a Excel/ })).toBeEnabled();
  });
});
