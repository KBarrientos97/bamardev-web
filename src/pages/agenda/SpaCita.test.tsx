import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/api";
import { cita } from "../../test/agendaFixtures";

/**
 * El detalle de la cita con el spa completo (fase 3): la cabina y la pose de
 * cada servicio, el aviso del consentimiento que falta (con la firma ahí
 * mismo), el saldo de paquetes y "Atender igual" cuando falta la firma.
 */

const sesion = vi.hoisted(() => ({
  features: ["agenda", "consentimientos", "paquetes"] as string[],
  permisos: ["agenda.ver", "cliente.ver_salud", "cliente.editar_salud"] as string[],
}));

vi.mock("../../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: { id: 3, username: "recepcion", rol: "CAJERO", permisos: sesion.permisos },
    negocio: { id: 1, nombre: "Spa Lavanda", tipoNegocio: "SPA", features: sesion.features },
    puede: () => false,
  }),
}));

vi.mock("../../lib/agenda/apiAgenda", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiAgenda")>();
  return { ...real, apiAgenda: { cita: vi.fn(), cambiarEstado: vi.fn() } };
});

vi.mock("../../lib/agenda/apiSpa", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/agenda/apiSpa")>();
  return {
    ...real,
    apiSpa: {
      pendientesDeCita: vi.fn(),
      paquetesDelCliente: vi.fn(),
      firmar: vi.fn(),
      atenderSinConsentimiento: vi.fn(),
      saludDelCliente: vi.fn(),
      guardarFichaSalud: vi.fn(),
    },
  };
});

// El lienzo no se dibuja en jsdom: se simula una firma.
vi.mock("./FirmaEnPantalla", () => ({
  default: ({ onCambio }: { onCambio: (f: string | null) => void }) => (
    <button type="button" onClick={() => onCambio("data:image/png;base64,AAAA")}>
      simular firma
    </button>
  ),
}));

import { apiAgenda } from "../../lib/agenda/apiAgenda";
import { apiSpa } from "../../lib/agenda/apiSpa";
import DetalleCita from "./DetalleCita";

const CON_CABINA = cita({
  lineas: [
    {
      ...cita().lineas[0],
      servicio: "Masaje relajante",
      servicioId: 100,
      espacioId: 7,
      espacio: "Cabina 1",
      poseDesde: "2026-10-21T14:15:00.000Z",
      poseHasta: "2026-10-21T14:30:00.000Z",
    },
  ],
});

const FALTA = { servicioId: 100, servicio: "Masaje relajante", version: 2, texto: "Acepto el masaje." };

async function abrir(c = CON_CABINA, onCambio = vi.fn()) {
  vi.mocked(apiAgenda.cita).mockResolvedValue(c);
  render(
    <MemoryRouter>
      <DetalleCita cita={c} sucursal="Centro" onClose={vi.fn()} onCambio={onCambio} />
    </MemoryRouter>,
  );
  await act(async () => {});
  return onCambio;
}

beforeEach(() => {
  vi.clearAllMocks();
  // El día de las citas de prueba, a las 11:00 de La Paz: después de su
  // inicio. Desde la ronda 1 de QA (M-08) la hora decide qué se ofrece y
  // "Atender" no sale en un día que no llegó.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-21T15:00:00.000Z"));
  sesion.features = ["agenda", "consentimientos", "paquetes"];
  sesion.permisos = ["agenda.ver", "cliente.ver_salud", "cliente.editar_salud"];
  vi.mocked(apiSpa.pendientesDeCita).mockResolvedValue({ faltan: [FALTA] });
  vi.mocked(apiSpa.paquetesDelCliente).mockResolvedValue([
    {
      id: 3,
      nombre: "5 masajes",
      compradoEn: "2026-10-01T15:00:00.000Z",
      venceEn: "2027-01-01T04:00:00.000Z",
      ultimoDia: "2026-12-31",
      estado: "ACTIVO",
      vencido: false,
      ventaId: 40,
      items: [{ servicioId: 100, servicio: "Masaje relajante", sesiones: 5, usadas: 2, restantes: 3 }],
    },
  ]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("detalle de la cita del spa", () => {
  it("muestra la cabina, la pose y el saldo del paquete", async () => {
    await abrir();
    expect(screen.getByText(/con Carla R\. · Cabina 1/)).toBeTruthy();
    expect(screen.getByText("Pose 10:15 – 10:30: queda libre")).toBeTruthy();
    expect(screen.getByText(/quedan 3 de Masaje relajante/)).toBeTruthy();
  });

  it("avisa el consentimiento que falta y se firma ahí mismo", async () => {
    vi.mocked(apiSpa.firmar).mockResolvedValue({ id: 1, servicioId: 100, version: 2, firmadoEn: "x" });
    await abrir();
    expect(screen.getByRole("alert").textContent).toContain("Masaje relajante");
    fireEvent.click(screen.getByRole("button", { name: "Firmar ahora" }));
    const dialogo = screen.getByRole("dialog", { name: /Consentimiento/ });
    expect(within(dialogo).getByText("Acepto el masaje.")).toBeTruthy();
    const firmar = within(dialogo).getByRole("button", { name: "Firmar" }) as HTMLButtonElement;
    expect(firmar.disabled).toBe(true);
    fireEvent.click(within(dialogo).getByRole("button", { name: "simular firma" }));
    vi.mocked(apiSpa.pendientesDeCita).mockResolvedValue({ faltan: [] });
    await act(async () => {
      fireEvent.click(firmar);
    });
    expect(apiSpa.firmar).toHaveBeenCalledWith({
      clienteId: 5,
      servicioId: 100,
      citaId: 1,
      firmante: "Rosa Mamani",
      firma: "data:image/png;base64,AAAA",
      version: 2,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("S2SEG-18: la recepción (ve salud, no la edita) ve el aviso pero no toma la firma", async () => {
    sesion.permisos = ["agenda.ver", "cliente.ver_salud"];
    await abrir();
    expect(screen.getByRole("alert").textContent).toContain("Masaje relajante");
    expect(screen.queryByRole("button", { name: "Firmar ahora" })).toBeNull();
  });

  it("atender sin la firma pide confirmación y queda como 'atender igual'", async () => {
    vi.mocked(apiAgenda.cambiarEstado).mockRejectedValue(
      new ApiError("Falta el consentimiento", 409, { codigo: "CONSENTIMIENTO_FALTANTE", faltan: [FALTA] }),
    );
    vi.mocked(apiSpa.atenderSinConsentimiento).mockResolvedValue({ ...CON_CABINA, estado: "EN_ATENCION" });
    const onCambio = await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Atender" }));
    });
    expect(screen.getByText(/No firmó el consentimiento de Masaje relajante/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Atender igual" }));
    });
    expect(apiSpa.atenderSinConsentimiento).toHaveBeenCalledWith(1);
    expect(onCambio).toHaveBeenCalledWith(expect.objectContaining({ estado: "EN_ATENCION" }));
  });

  it("sin las features no pide nada ni muestra nada", async () => {
    sesion.features = ["agenda"];
    await abrir();
    expect(apiSpa.pendientesDeCita).not.toHaveBeenCalled();
    expect(apiSpa.paquetesDelCliente).not.toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  describe("DIA-06: la ficha de salud desde la cita del profesional", () => {
    beforeEach(() => {
      vi.mocked(apiSpa.saludDelCliente).mockResolvedValue({ ficha: null, firmados: [] });
      vi.mocked(apiSpa.guardarFichaSalud).mockResolvedValue({} as never);
    });

    it("la terapeuta la completa desde el detalle de su cita", async () => {
      vi.mocked(apiAgenda.cita).mockResolvedValue(CON_CABINA);
      render(
        <MemoryRouter>
          <DetalleCita cita={CON_CABINA} modo="profesional" onClose={vi.fn()} onCambio={vi.fn()} />
        </MemoryRouter>,
      );
      await act(async () => {});
      expect(screen.getByText("Salud y consentimientos")).toBeTruthy();
      expect(screen.getByText("Sin ficha de salud todavía.")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Completar/ }));
      const dialogo = screen.getByRole("dialog", { name: /Ficha de salud/ });
      fireEvent.change(within(dialogo).getByLabelText("Medicamentos"), { target: { value: "Ibuprofeno" } });
      await act(async () => {
        fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar" }));
      });
      expect(apiSpa.guardarFichaSalud).toHaveBeenCalledWith(
        CON_CABINA.cliente.id,
        expect.objectContaining({ medicamentos: "Ibuprofeno" }),
      );
    });

    it("sin editar salud la ve pero no la completa; la recepción no la ve en el detalle", async () => {
      sesion.permisos = ["agenda.ver", "cliente.ver_salud"];
      vi.mocked(apiAgenda.cita).mockResolvedValue(CON_CABINA);
      const { unmount } = render(
        <MemoryRouter>
          <DetalleCita cita={CON_CABINA} modo="profesional" onClose={vi.fn()} onCambio={vi.fn()} />
        </MemoryRouter>,
      );
      await act(async () => {});
      expect(screen.getByText("Salud y consentimientos")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Completar/ })).toBeNull();
      unmount();
      await abrir();
      expect(screen.queryByText("Salud y consentimientos")).toBeNull();
    });
  });
});
