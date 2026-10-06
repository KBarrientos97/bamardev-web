import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FilaCliente } from "../../lib/crm/apiCrm";

/** Clientes que no vuelven: la lista, el WhatsApp y la exportación. */

const sesion = vi.hoisted(() => ({ permisos: ["cliente.marketing"] as string[] }));
vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    negocio: { nombre: "Pollería Omar", features: ["clientes_retencion"] },
    usuario: { rol: "CAJERO", permisos: sesion.permisos },
  }),
}));
vi.mock("../../lib/crm/apiCrm", async (original) => ({
  ...(await original<typeof import("../../lib/crm/apiCrm")>()),
  apiCrm: {
    noVuelven: vi.fn(),
    clientes: vi.fn(),
    resumen: vi.fn(),
    marketing: vi.fn(),
    exportar: vi.fn(),
    exportaciones: vi.fn(),
  },
}));
vi.mock("../../lib/promociones/apiPromociones", () => ({
  apiPromociones: { listar: vi.fn().mockResolvedValue([]), enlace: vi.fn() },
}));

import { apiCrm } from "../../lib/crm/apiCrm";
import Retencion from "./Retencion";

const crm = vi.mocked(apiCrm);

function fila(c: Partial<FilaCliente>): FilaCliente {
  return {
    id: 1,
    nombre: "Beto Suárez",
    telefono: "71234567",
    whatsapp: "59171234567",
    visitas: 3,
    gastoTotal: 30,
    ticketMedio: 10,
    primeraVisita: null,
    ultimaVisita: null,
    diasSinVenir: 40,
    frecuenciaDias: 10,
    umbralDias: 15,
    segmento: "PERDIDO",
    marketingAcepta: true,
    contactable: true,
    ...c,
  };
}

const RESUMEN = { NUEVO: 1, FRECUENTE: 0, OCASIONAL: 0, EN_RIESGO: 0, PERDIDO: 2, SIN_VISITAS: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  sesion.permisos = ["cliente.marketing"];
  localStorage.clear();
  crm.noVuelven.mockResolvedValue({
    resumen: RESUMEN,
    clientes: [
      fila({}),
      fila({ id: 2, nombre: "Carla Vaca", whatsapp: null, contactable: false, marketingAcepta: null }),
    ],
  });
});

describe("Clientes que no vuelven", () => {
  it("WhatsApp sólo para quien aceptó promociones, con el mensaje armado", async () => {
    const abrir = vi.spyOn(window, "open").mockReturnValue(null);
    render(<Retencion />);
    expect(await screen.findByText("Beto Suárez")).toBeInTheDocument();
    expect(screen.getByText("Sin permiso para contactar")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /WhatsApp/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    const url = String(abrir.mock.calls[0][0]);
    expect(url.startsWith("https://wa.me/59171234567?text=")).toBe(true);
    expect(decodeURIComponent(url)).toContain("¡Hola Beto!");
    expect(decodeURIComponent(url)).toContain("Pollería Omar");
    expect(await screen.findByRole("button", { name: /Contactado/ })).toBeInTheDocument();
  });

  it("exportar sólo con el permiso sensible", async () => {
    const { unmount } = render(<Retencion />);
    await screen.findByText("Beto Suárez");
    expect(screen.queryByRole("button", { name: /Exportar CSV/ })).not.toBeInTheDocument();
    unmount();
    sesion.permisos = ["cliente.marketing", "cliente.exportar"];
    crm.exportar.mockResolvedValue(undefined);
    render(<Retencion />);
    fireEvent.click(await screen.findByRole("button", { name: /Exportar CSV/ }));
    expect(crm.exportar).toHaveBeenCalledWith({ lista: "NO_VUELVEN", dias: 60, modo: "RECURRENCIA" });
  });

  it("los segmentos piden su lista", async () => {
    crm.clientes.mockResolvedValue({ resumen: RESUMEN, clientes: [] });
    render(<Retencion />);
    fireEvent.click(await screen.findByRole("tab", { name: /Nuevos/ }));
    expect(crm.clientes).toHaveBeenCalledWith({ dias: 60, modo: "RECURRENCIA", segmento: "NUEVO" });
  });
});

describe("haceDias (QA DIA-05)", () => {
  it("nunca dice «hace -1 días»", async () => {
    const { haceDias } = await vi.importActual<typeof import("../../lib/crm/apiCrm")>("../../lib/crm/apiCrm");
    expect(haceDias(-1)).toBe("hoy");
    expect(haceDias(0)).toBe("hoy");
    expect(haceDias(1)).toBe("ayer");
    expect(haceDias(12)).toBe("hace 12 días");
    expect(haceDias(null)).toBe("—");
  });
});
