import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import type { Sede } from "../../../lib/academia/tipos";

/**
 * C4 · la pantalla de Sedes del instituto: lista con sus datos y conteos,
 * alta y edición, los rechazos del plan, y la sede única que se ve entera.
 * Con las franjas (C5) y las aulas adentro de cada sede.
 */

const quien = vi.hoisted(() => ({ configura: true, deSede: false }));

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN } = await import("../../../test/academiaFixtures");
  return {
    useAuth: () => ({
      ...SESION_ADMIN,
      usuario: {
        ...SESION_ADMIN.usuario,
        sucursalId: quien.deSede ? 1 : null,
        sucursal: quien.deSede ? "Central" : null,
        permisos: quien.configura ? SESION_ADMIN.usuario.permisos : ["academia.ver", "academia.grupos"],
      },
      puede: () => true,
    }),
  };
});

vi.mock("../../../lib/useSucursales", () => ({
  useSucursales: () => ({
    sucursales: [
      { id: 1, nombre: "Central" },
      { id: 2, nombre: "Base" },
    ],
  }),
}));

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      sedes: vi.fn(),
      crearSede: vi.fn(),
      editarSede: vi.fn(),
      franjasSede: vi.fn(),
      guardarFranjasSede: vi.fn(),
      franjasTipicas: vi.fn(),
      calendario: vi.fn(),
      aulas: vi.fn(),
      crearAula: vi.fn(),
      editarAula: vi.fn(),
      borrarAula: vi.fn(),
    },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import Sedes, { SedesConfig } from "./Sedes";

const sede = (id: number, nombre: string, extra: Partial<Sede> = {}): Sede => ({
  id,
  nombre,
  direccion: null,
  telefono: null,
  horarioAtencion: null,
  esPrincipal: false,
  aulas: 0,
  franjas: 0,
  gruposVigentes: 0,
  ...extra,
});

const CENTRAL = sede(1, "Central", {
  direccion: "Av. Blanco Galindo km 3",
  telefono: "4 4000000",
  horarioAtencion: "Lun a Vie 8:00–20:00",
  esPrincipal: true,
  aulas: 2,
  franjas: 5,
  gruposVigentes: 3,
});
const BASE = sede(2, "Base", { aulas: 1, franjas: 0, gruposVigentes: 0 });

async function montar(ruta = "/configuracion/sedes") {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <SedesConfig />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  quien.configura = true;
  quien.deSede = false;
  vi.mocked(apiAcademia.sedes).mockResolvedValue([CENTRAL, BASE]);
  vi.mocked(apiAcademia.franjasSede).mockImplementation(async (id) => ({
    sede: { id, nombre: id === 1 ? "Central" : "Base" },
    franjas: id === 1 ? [{ inicio: "08:00", fin: "10:00", todasLasSedes: false }] : [],
  }));
  vi.mocked(apiAcademia.calendario).mockResolvedValue({ sede: 1, meses: [], filas: [] } as never);
  vi.mocked(apiAcademia.aulas).mockResolvedValue([]);
});

describe("C4 · la lista de sedes", () => {
  it("cada sede con su dirección, teléfono, horario y los conteos de aulas, franjas y grupos", async () => {
    await montar();
    const fila = screen.getByRole("button", { name: "Abrir Central" }).closest("tr")!;
    expect(within(fila).getByText("Av. Blanco Galindo km 3")).toBeInTheDocument();
    expect(within(fila).getByText("4 4000000")).toBeInTheDocument();
    expect(within(fila).getByText("Lun a Vie 8:00–20:00")).toBeInTheDocument();
    for (const chip of ["2 aulas", "5 franjas", "3 grupos"]) expect(within(fila).getByText(chip)).toBeInTheDocument();
    expect(within(fila).getByText("Principal")).toBeInTheDocument();
    const base = screen.getByRole("button", { name: "Abrir Base" }).closest("tr")!;
    expect(within(base).getByText("1 aula")).toBeInTheDocument();
    expect(within(base).getByText("0 franjas")).toBeInTheDocument();
  });

  it("no habla de stock, depósitos ni precios por sucursal", async () => {
    await montar();
    expect(document.body.textContent).not.toMatch(/stock|Depósito|Precio en esta|Artículos guardados/i);
  });

  it("no pide los almacenes del inventario: sólo /academia/sedes", async () => {
    await montar();
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(1);
  });

  it("tocar una sede abre su panel con los datos, las franjas y las aulas; al cerrarlo se refrescan los conteos", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Central" }));
    await act(async () => {});
    const panel = screen.getByRole("complementary", { name: "Central" });
    expect(within(panel).getByText("Av. Blanco Galindo km 3")).toBeInTheDocument();
    expect(within(panel).getByRole("region", { name: /^Franjas horarias/ })).toBeInTheDocument();
    expect(within(panel).getByLabelText("Desde, franja 1")).toHaveValue("08:00");
    expect(within(panel).getByRole("region", { name: /^Aulas/ })).toBeInTheDocument();
    expect(apiAcademia.aulas).toHaveBeenCalledWith({ sede: 1 });
    expect(apiAcademia.franjasSede).toHaveBeenCalledWith(1);
    vi.mocked(apiAcademia.sedes).mockClear();
    fireEvent.click(within(panel).getByRole("button", { name: "Cerrar" }));
    await act(async () => {});
    expect(screen.queryByRole("complementary", { name: "Central" })).not.toBeInTheDocument();
    expect(apiAcademia.sedes).toHaveBeenCalled();
  });

  it("el menú ⋯ tiene «Editar datos» y «Franjas y aulas»", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar datos/ }));
    expect(screen.getByRole("complementary", { name: "Editar sede" })).toBeInTheDocument();
  });

  it("un enlace con ?sede=2&ver=franjas abre esa sede", async () => {
    await montar("/configuracion/sedes?sede=2&ver=franjas");
    expect(screen.getByRole("complementary", { name: "Base" })).toBeInTheDocument();
    expect(apiAcademia.franjasSede).toHaveBeenCalledWith(2);
  });

  it("un enlace con ?ver=editar abre el formulario de la sede", async () => {
    await montar("/configuracion/sedes?sede=2&ver=editar");
    expect(screen.getByRole("complementary", { name: "Editar sede" })).toBeInTheDocument();
    expect(screen.getByLabelText("Nombre")).toHaveValue("Base");
  });

  it("un corte al cargar se puede reintentar", async () => {
    vi.mocked(apiAcademia.sedes).mockRejectedValueOnce(new Error("Sin conexión"));
    await montar();
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(screen.getByRole("button", { name: "Abrir Central" })).toBeInTheDocument();
  });
});

describe("C4 · un instituto con una sola sede", () => {
  beforeEach(() => {
    vi.mocked(apiAcademia.sedes).mockResolvedValue([CENTRAL]);
  });

  it("se ve entera, sin una lista de una fila: datos, franjas y aulas a la vista", async () => {
    await montar();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir Central" })).not.toBeInTheDocument();
    expect(screen.getByText("Av. Blanco Galindo km 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Desde, franja 1")).toHaveValue("08:00");
    expect(screen.getByRole("region", { name: /^Aulas/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva sede" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar datos" })).toBeInTheDocument();
  });

  it("si le faltan datos lo invita a cargarlos, diciendo para qué", async () => {
    vi.mocked(apiAcademia.sedes).mockResolvedValue([sede(1, "Central", { esPrincipal: true })]);
    await montar();
    expect(screen.getByText(/Te falta cargar la dirección, el teléfono y el horario de atención/)).toBeInTheDocument();
  });

  it("?ver=editar abre el formulario aunque no haya lista", async () => {
    await montar("/configuracion/sedes?ver=editar");
    expect(screen.getByRole("complementary", { name: "Editar sede" })).toBeInTheDocument();
  });
});

describe("C4 · Nueva sede", () => {
  const abrirNueva = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Nueva sede" }));
    return screen.getByRole("complementary", { name: "Nueva sede" });
  };

  it("pide nombre, dirección, teléfono y horario (con ejemplo), y crea la sede sin mandar lo vacío", async () => {
    vi.mocked(apiAcademia.crearSede).mockResolvedValue(sede(3, "Norte", { direccion: "Calle 1" }));
    await montar();
    const panel = await abrirNueva();
    expect(within(panel).getByLabelText(/Horario de atención/)).toHaveAttribute("placeholder", "Lun a Vie 8:00–20:00, Sáb 8:00–13:00");
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: " Norte " } });
    fireEvent.change(within(panel).getByLabelText("Dirección"), { target: { value: "Calle 1" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Crear sede" }));
    });
    expect(apiAcademia.crearSede).toHaveBeenCalledWith({ nombre: "Norte", direccion: "Calle 1" });
    expect(screen.queryByRole("complementary", { name: "Nueva sede" })).not.toBeInTheDocument();
    expect(screen.getByText(/Norte quedó creada/)).toBeInTheDocument();
    // Recarga la lista y deja a mano sus franjas y aulas.
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(2);
  });

  it("sin nombre no llama al backend", async () => {
    await montar();
    const panel = await abrirNueva();
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Crear sede" }));
    });
    expect(apiAcademia.crearSede).not.toHaveBeenCalled();
    expect(within(panel).getByText(/Ponele un nombre/)).toBeInTheDocument();
  });

  it("CUPO_SEDES: muestra el mensaje del backend tal cual (dice cómo ampliar el plan)", async () => {
    const mensaje = "Tu plan incluye 2 sucursales. Para abrir otra, ampliá tu plan desde el panel.";
    vi.mocked(apiAcademia.crearSede).mockRejectedValue(new ApiError(mensaje, 409, { codigo: "CUPO_SEDES" }));
    await montar();
    const panel = await abrirNueva();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Norte" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Crear sede" }));
    });
    expect(within(panel).getByRole("alert")).toHaveTextContent(mensaje);
    // El panel sigue abierto con lo tipeado.
    expect(within(panel).getByLabelText("Nombre")).toHaveValue("Norte");
  });

  it("SEDE_REPETIDA: lo dice en el campo del nombre", async () => {
    vi.mocked(apiAcademia.crearSede).mockRejectedValue(new ApiError("Ya existe", 409, { codigo: "SEDE_REPETIDA" }));
    await montar();
    const panel = await abrirNueva();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Base" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Crear sede" }));
    });
    expect(within(panel).getByText("Ya tenés una sede con ese nombre.")).toBeInTheDocument();
  });

  it("SEDE_SOLO_ORGANIZACION: cierra el formulario y el botón «Nueva sede» desaparece", async () => {
    vi.mocked(apiAcademia.crearSede).mockRejectedValue(new ApiError("Sólo la organización", 403, { codigo: "SEDE_SOLO_ORGANIZACION" }));
    await montar();
    const panel = await abrirNueva();
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Norte" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Crear sede" }));
    });
    expect(screen.queryByRole("complementary", { name: "Nueva sede" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva sede" })).not.toBeInTheDocument();
  });

  it("quien está atado a una sede no ve «Nueva sede» (y sí puede editar la suya)", async () => {
    quien.deSede = true;
    vi.mocked(apiAcademia.sedes).mockResolvedValue([CENTRAL]);
    await montar();
    expect(screen.queryByRole("button", { name: "Nueva sede" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar datos" })).toBeInTheDocument();
  });

  it("quien no configura ve las sedes pero no crea ni edita", async () => {
    quien.configura = false;
    await montar();
    expect(screen.queryByRole("button", { name: "Nueva sede" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Central" }));
    expect(screen.queryByRole("menuitem", { name: /Editar datos/ })).not.toBeInTheDocument();
  });
});

describe("C4 · Editar los datos de una sede", () => {
  it("manda los cuatro datos; lo que se vació va como null para borrarlo", async () => {
    vi.mocked(apiAcademia.editarSede).mockResolvedValue({ ...CENTRAL, telefono: null });
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Central" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar datos/ }));
    const panel = screen.getByRole("complementary", { name: "Editar sede" });
    expect(within(panel).getByLabelText("Dirección")).toHaveValue("Av. Blanco Galindo km 3");
    fireEvent.change(within(panel).getByLabelText("Teléfono"), { target: { value: "  " } });
    fireEvent.change(within(panel).getByLabelText(/Horario de atención/), { target: { value: "Lun a Sáb 8:00–20:00" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    });
    expect(apiAcademia.editarSede).toHaveBeenCalledWith(1, {
      nombre: "Central",
      direccion: "Av. Blanco Galindo km 3",
      telefono: null,
      horarioAtencion: "Lun a Sáb 8:00–20:00",
    });
    expect(screen.getByText("Central se guardó.")).toBeInTheDocument();
  });

  it("SEDE_REPETIDA al renombrar: lo dice en el nombre y no cierra", async () => {
    vi.mocked(apiAcademia.editarSede).mockRejectedValue(new ApiError("Ya existe", 409, { codigo: "SEDE_REPETIDA" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar datos/ }));
    const panel = screen.getByRole("complementary", { name: "Editar sede" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Central" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    });
    expect(within(panel).getByText("Ya tenés una sede con ese nombre.")).toBeInTheDocument();
  });

  it("OTRA_SEDE u otro rechazo: muestra el mensaje del backend", async () => {
    vi.mocked(apiAcademia.editarSede).mockRejectedValue(new ApiError("Esa sede no es la tuya", 403, { codigo: "OTRA_SEDE" }));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Más acciones de Base" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar datos/ }));
    const panel = screen.getByRole("complementary", { name: "Editar sede" });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Guardar" }));
    });
    expect(within(panel).getByText("Esa sede no es la tuya")).toBeInTheDocument();
  });
});

describe("C4 · pieza suelta", () => {
  it("Sedes sin la página alrededor también se monta (la usa la pestaña)", async () => {
    render(
      <MemoryRouter>
        <Sedes />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.getByRole("heading", { name: "Sedes" })).toBeInTheDocument();
  });
});

describe("ronda 1 · W2 · los enlaces de «Primeros pasos» funcionan desde la propia pantalla de Sedes", () => {
  /** Un botón que navega a esta misma pantalla, como el paso «Cargar franjas». */
  function IrA({ ruta }: { ruta: string }) {
    const navigate = useNavigate();
    return <button onClick={() => navigate(ruta)}>ir a {ruta}</button>;
  }
  async function montarConEnlace(ruta: string) {
    render(
      <MemoryRouter initialEntries={["/configuracion/sedes"]}>
        <SedesConfig />
        <IrA ruta={ruta} />
      </MemoryRouter>,
    );
    await act(async () => {});
  }

  it("con varias sedes, ya dentro de la pantalla, ?sede=2&ver=franjas abre esa sede", async () => {
    await montarConEnlace("/configuracion/sedes?sede=2&ver=franjas");
    expect(screen.queryByRole("complementary", { name: "Base" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^ir a / }));
    });
    expect(screen.getByRole("complementary", { name: "Base" })).toBeInTheDocument();
  });

  it("con una sola sede, cada toque vuelve a bajar a las franjas", async () => {
    vi.mocked(apiAcademia.sedes).mockResolvedValue([CENTRAL]);
    const bajar = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = bajar;
    try {
      await montarConEnlace("/configuracion/sedes?sede=1&ver=franjas");
      bajar.mockClear();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^ir a / }));
      });
      expect(bajar).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^ir a / }));
      });
      expect(bajar).toHaveBeenCalledTimes(2);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });
});

describe("ronda 1 · W7 y W8 · conteos de la sede y Enter en el formulario", () => {
  it("W7: con una sola sede, cargar un aula refresca los conteos de la sede", async () => {
    vi.mocked(apiAcademia.sedes).mockResolvedValue([CENTRAL]);
    vi.mocked(apiAcademia.crearAula).mockResolvedValue({
      id: 9,
      almacenId: 1,
      sede: { id: 1, nombre: "Central" },
      nombre: "Aula 9",
      capacidad: null,
      activa: true,
      enUso: 0,
    } as never);
    await montar();
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Agregar la primera" }));
    const panel = screen.getByRole("complementary", { name: "Nueva aula" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Aula 9" } });
    await act(async () => {
      fireEvent.click(within(panel).getByRole("button", { name: "Agregar aula" }));
    });
    expect(apiAcademia.crearAula).toHaveBeenCalled();
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(2);
  });

  it("W8: el formulario de Nueva sede tiene su propio botón de envío, para que Enter guarde", async () => {
    vi.mocked(apiAcademia.crearSede).mockResolvedValue(sede(3, "Norte"));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Nueva sede" }));
    const panel = screen.getByRole("complementary", { name: "Nueva sede" });
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Norte" } });
    // Enter en un campo dispara el botón de envío del formulario: acá, ese clic.
    const envio = panel.querySelector('form button[type="submit"]') as HTMLButtonElement;
    expect(envio).not.toBeNull();
    await act(async () => {
      fireEvent.click(envio);
    });
    expect(apiAcademia.crearSede).toHaveBeenCalledWith({ nombre: "Norte" });
  });
});
