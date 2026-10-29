import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Preinscripcion } from "../../lib/academia/tipos";

/**
 * E20 · Inscripciones online: las que pagan en el instituto, con sus fotos
 * (con candado) y la forma de pago que eligieron; "Cobrar e inscribir" es la
 * única acción a la vista y abre N5 con la forma de pago marcada.
 */

/** L9: la recepción a la que el administrador le dio `academia.fotos` desde Roles. */
const quien = vi.hoisted(() => ({ conFotos: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...s,
      usuario: { ...s.usuario, permisos: quien.conFotos ? [...s.usuario.permisos, "academia.fotos"] : s.usuario.permisos },
      puede: () => true,
    }),
  };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      preinscripciones: vi.fn(),
      descartar: vi.fn(),
      grupo: vi.fn(),
      ajustes: vi.fn(),
      alumno: vi.fn(),
      alumnos: vi.fn(),
      convertir: vi.fn(),
      fotoComoUrl: vi.fn(),
      revisarFotos: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ajustesDePrueba, fichaCamila, grupoDetalle } from "../../test/academiaFixtures";
import Preinscripciones from "./Preinscripciones";

const THIAGO: Preinscripcion = {
  id: 44,
  estado: "PREINSCRITA",
  alumno: { id: 61, apellidos: "Ortiz Rocha", nombres: "Thiago", telefono: "70099887", menor: false },
  tutor: null,
  grupo: { id: 7, nombre: "M-J 17:00–19:00", carrera: { id: 4, nombre: "Tatuaje" }, sede: { id: 1, nombre: "Central" } },
  turnoPreferido: null,
  mensaje: null,
  preinscritaEn: "2026-10-17T21:40:00.000Z",
  vieja: false,
  fotos: 3,
  planElegido: { id: 2, nombre: "Mes a mes", generado: "MES_A_MES" },
  pagoQr: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  quien.conFotos = false;
  vi.mocked(apiAcademia.preinscripciones).mockResolvedValue({ items: [THIAGO, { ...THIAGO, id: 45, fotos: 1 }], total: 2, page: 1, pageSize: 20 });
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba());
  vi.mocked(apiAcademia.alumno).mockResolvedValue({ ...fichaCamila(), fotos: [] });
});

async function montar() {
  render(
    <MemoryRouter>
      <Preinscripciones />
    </MemoryRouter>,
  );
  await act(async () => {});
}

describe("D3 · convertir sin las fotos", () => {
  it("pregunta, convierte con fotosPendientes y el aviso dice que quedó con las fotos pendientes", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: true }));
    vi.mocked(apiAcademia.convertir).mockResolvedValue({ id: 700, fotosPendientes: true, fotosFaltan: ["CI_ANVERSO", "CI_REVERSO"] } as never);
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar e inscribir" })[0]);
    await act(async () => {});
    const dialogo = screen.getByRole("dialog", { name: "Inscribir estudiante" });
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.convertir).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(within(dialogo).getByRole("region", { name: "Faltan fotos" })).getByRole("button", { name: "Inscribir sin fotos" }));
    });
    expect(apiAcademia.convertir).toHaveBeenCalledWith(44, expect.objectContaining({ fotosPendientes: true }), {});
    expect(screen.getByText(/Ortiz Rocha, Thiago quedó inscrito\. Quedó con las fotos pendientes \(carnet de adelante y carnet de atrás\)/)).toBeInTheDocument();
  });
});

describe("E20 · Inscripciones online", () => {
  it("sin QR del banco, todas pagan en el instituto, con sus fotos y la forma de pago", async () => {
    await montar();
    expect(screen.getByRole("heading", { name: "Inscripciones online" })).toBeInTheDocument();
    const bloque = screen.getByRole("region", { name: "Pagan en el instituto" });
    expect(screen.queryByRole("region", { name: "Pagaron con QR" })).not.toBeInTheDocument();
    expect(within(bloque).getByText("3 fotos subidas")).toBeInTheDocument();
    expect(within(bloque).getByText("Faltan 2 fotos")).toBeInTheDocument();
    expect(within(bloque).getAllByText("Mes a mes · falta cobrar")).toHaveLength(2);
  });

  it("Cobrar e inscribir abre la inscripción; descartar va en el menú", async () => {
    await montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Cobrar e inscribir" })[0]);
    await act(async () => {});
    expect(screen.getByRole("dialog", { name: "Inscribir estudiante" })).toBeInTheDocument();
    // La forma de pago que eligió en la página viene marcada.
    expect(screen.getByRole("radio", { name: /Cuotas/ })).toHaveAttribute("aria-checked", "true");
  });
});

describe("L9 · la recepción con el permiso de fotos las revisa desde acá", () => {
  beforeEach(() => {
    vi.mocked(apiAcademia.preinscripciones).mockResolvedValue({
      items: [{ ...THIAGO, tiposFotos: ["FOTO", "CI_ANVERSO", "CI_REVERSO"], estadoFotos: "POR_REVISAR" }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
    vi.mocked(apiAcademia.fotoComoUrl).mockImplementation(async (_id, tipo) => `blob:${tipo}`);
    vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
  });

  it("sin el permiso: los candados de siempre, sin pedir las imágenes", async () => {
    await montar();
    expect(screen.getByText("3 fotos subidas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Ver en grande/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /están bien/ })).not.toBeInTheDocument();
    expect(apiAcademia.fotoComoUrl).not.toHaveBeenCalled();
  });

  it("con el permiso: las miniaturas abren el visor y «Está bien» las aprueba", async () => {
    quien.conFotos = true;
    await montar();
    expect(screen.getByText("Fotos por revisar")).toBeInTheDocument();
    // El carnet entero en la miniatura.
    expect(screen.getByRole("img", { name: "Carnet, adelante" })).toHaveClass("object-contain");
    fireEvent.click(screen.getByRole("button", { name: "Ver en grande: Carnet, adelante de Ortiz Rocha, Thiago" }));
    const visor = screen.getByRole("dialog", { name: "Carnet, adelante · Ortiz Rocha, Thiago" });
    expect(within(visor).getByRole("img")).toHaveAttribute("src", "blob:CI_ANVERSO");
    fireEvent.click(within(visor).getByRole("button", { name: "Cerrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Las fotos de Ortiz Rocha, Thiago están bien" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(61, { ok: true });
    expect(screen.getByText("Fotos revisadas")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /están bien/ })).not.toBeInTheDocument();
  });

  it("«Algo no cuadra» pide el motivo y la deja observada", async () => {
    quien.conFotos = true;
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Algo no cuadra en las fotos de Ortiz Rocha, Thiago" }));
    const dialogo = screen.getByRole("dialog", { name: "Algo no cuadra en las fotos" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "El carnet no coincide" }));
    await act(async () => {
      fireEvent.click(within(dialogo).getByRole("button", { name: "Guardar motivo" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(61, { ok: false, observacion: "El carnet no coincide" });
    expect(screen.getByText("Fotos observadas")).toBeInTheDocument();
  });
});
