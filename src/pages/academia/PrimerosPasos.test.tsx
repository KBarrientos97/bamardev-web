import { act, cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";

/**
 * «Configuración rápida» (antes la tarjeta «Primeros pasos», C1; M1, 31-oct):
 * una pestaña de la Configuración del instituto con la lista de pasos. Se marca
 * sola y, con todo hecho, sigue ahí mostrando todo ✓ (es el único lugar).
 */

const sesion = vi.hoisted(() => ({ rol: "admin" as "admin" | "secretaria" | "docente", mostrador: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_ADMIN, SESION_SECRETARIA, SESION_DOCENTE } = await import("../../test/academiaFixtures");
  return {
    useAuth: () => {
      const base = sesion.rol === "secretaria" ? SESION_SECRETARIA : sesion.rol === "docente" ? SESION_DOCENTE : SESION_ADMIN;
      // Un plan con QR y PIN, y un administrador que puede cargar el uno y asignar el otro (R5).
      return {
        ...base,
        ...(sesion.mostrador
          ? {
              usuario: { ...base.usuario, permisos: [...base.usuario.permisos, "qr.configurar", "usuarios.administrar", "usuarios.asignar_pin"] },
              negocio: { ...base.negocio, features: [...base.negocio.features, "pago_qr_mixto", "autorizacion_pin", "usuarios"] },
            }
          : {}),
        puede: () => true,
      };
    },
  };
});

// `almacenes.administrar` ya no hace falta: las sedes salen de `GET /academia/sedes`. Si alguien
// volviera a pedir los almacenes, este mock lo delata (los tests miran que no se llame).
vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { ...real.api, getAlmacenes: vi.fn(), qrCobro: vi.fn(), getUsuario: vi.fn() } };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { sedes: vi.fn(), ajustes: vi.fn(), guardarAjustes: vi.fn(), carreras: vi.fn(), docentes: vi.fn(), grupos: vi.fn() },
  };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { api } from "../../lib/api";
import { avisarPrimerosPasos } from "../../lib/academia/primerosPasos";
import { ApiError } from "../../lib/api";
import PrimerosPasos from "./PrimerosPasos";

const sede = (extra: Record<string, unknown> = {}) => ({
  id: 1,
  nombre: "Central",
  direccion: "Av. Blanco 123",
  telefono: null,
  horarioAtencion: null,
  esPrincipal: true,
  aulas: 1,
  franjas: 5,
  gruposVigentes: 0,
  ...extra,
});

const curso = { id: 1, nombre: "Barbería", activa: true, precioModulo: 500, planes: [], materias: [{ id: 1, activa: true }] };

function cargarTodoHecho() {
  vi.mocked(apiAcademia.sedes).mockResolvedValue([sede()] as never);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ paginaPublicada: true }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([curso] as never);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([{ personalId: 1, nombre: "Marco", sedes: [], pctDocente: null, retencionPct: null, tieneLogin: true }]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [{ id: 1, cancelado: false, estado: "EN_CURSO" }], total: 1, page: 1, pageSize: 100 } as never);
}

/** Un instituto recién dado de alta: la sede "Central" sin dirección y nada más. */
function cargarVacio(ajustes: Parameters<typeof ajustesDePrueba>[0] = {}) {
  cargarTodoHecho();
  vi.mocked(apiAcademia.sedes).mockResolvedValue([sede({ direccion: null, franjas: 0, aulas: 0 })] as never);
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ paginaPublicada: false, ...ajustes }));
  vi.mocked(apiAcademia.carreras).mockResolvedValue([]);
  vi.mocked(apiAcademia.docentes).mockResolvedValue([]);
  vi.mocked(apiAcademia.grupos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
}

/** Con un paso hecho (el curso). */
function cargarParcial() {
  cargarVacio();
  vi.mocked(apiAcademia.carreras).mockResolvedValue([curso] as never);
}

async function montar() {
  render(
    <MemoryRouter>
      <PrimerosPasos />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const lista = () => screen.getByRole("list");
const barra = () => screen.getByRole("progressbar", { name: "Configuración rápida" });

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rol = "admin";
  sesion.mostrador = false;
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe("M1 · la pantalla «Configuración rápida»", () => {
  it("es una pantalla con la lista a la vista (no un botón con panel) y su progreso n de N", async () => {
    cargarParcial();
    await montar();
    expect(screen.getByRole("heading", { name: "Configuración rápida" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Configuración rápida/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(6);
    expect(barra()).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/1 de 6 listos/)).toBeInTheDocument();
  });

  it("incompleta: las casillas pendientes con su botón a la pantalla donde se hacen", async () => {
    cargarVacio();
    await montar();
    const l = lista();
    expect(within(l).getByRole("link", { name: /Ir a Sedes/ })).toHaveAttribute("href", "/configuracion/sedes");
    expect(within(l).getByRole("link", { name: /Cargar franjas/ })).toHaveAttribute("href", "/configuracion/sedes");
    expect(within(l).getByRole("link", { name: /Crear un curso/ })).toHaveAttribute("href", "/configuracion/carreras");
    expect(within(l).getByRole("link", { name: /Ir a Personal/ })).toHaveAttribute("href", "/personal");
    expect(within(l).getByRole("link", { name: /Abrir un grupo/ })).toHaveAttribute("href", "/academia/calendario");
    expect(within(l).getByRole("link", { name: /Ir a Mi página/ })).toHaveAttribute("href", "/mi-pagina");
  });

  it("parcial: lo hecho se marca solo y ya no pide botón; el resto sigue", async () => {
    cargarParcial();
    await montar();
    const l = lista();
    expect(within(l).getByText("Un curso con módulos y precio").parentElement).toHaveTextContent(/^Listo: /);
    expect(within(l).queryByRole("link", { name: /Crear un curso/ })).not.toBeInTheDocument();
    expect(within(l).getByRole("link", { name: /Ir a Sedes/ })).toBeInTheDocument();
  });

  it("completa: la pestaña NO se esconde, muestra todo ✓ y ningún botón de ir", async () => {
    cargarTodoHecho();
    await montar();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(6);
    expect(barra()).toHaveAttribute("aria-valuenow", "6");
    expect(screen.getByText(/¡Listo!/)).toBeInTheDocument();
    expect(within(lista()).queryByRole("link")).not.toBeInTheDocument();
  });

  it("no guarda nada en los ajustes (sin «Ya lo sé» ni apertura automática)", async () => {
    cargarVacio();
    await montar();
    expect(screen.queryByRole("button", { name: "Ya lo sé" })).not.toBeInTheDocument();
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
  });

  it("si no se pudo leer nada, lo dice en vez de mostrar una lista vacía", async () => {
    for (const f of [apiAcademia.sedes, apiAcademia.ajustes, apiAcademia.carreras, apiAcademia.docentes, apiAcademia.grupos]) {
      vi.mocked(f).mockRejectedValue(new Error("corte"));
    }
    await montar();
    expect(screen.getByText(/No se pudo leer el estado del instituto/)).toBeInTheDocument();
  });
});

describe("C1 · los pasos (se marcan solos con los datos)", () => {
  it("las sedes salen de /academia/sedes: no se piden los almacenes (no hace falta almacenes.administrar)", async () => {
    cargarVacio();
    await montar();
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(1);
    expect(api.getAlmacenes).not.toHaveBeenCalled();
  });

  it("con varias sedes, los pasos de sede y franjas abren la primera que falta", async () => {
    cargarVacio();
    // Ninguna tiene dirección ni franjas: cada paso abre la primera de la lista (la más a mano).
    vi.mocked(apiAcademia.sedes).mockResolvedValue([
      sede({ id: 4, nombre: "Base", direccion: null, franjas: 0 }),
      sede({ direccion: null, franjas: 0 }),
    ] as never);
    await montar();
    const l = lista();
    expect(within(l).getByRole("link", { name: /Ir a Sedes/ })).toHaveAttribute("href", "/configuracion/sedes?sede=4&ver=editar");
    expect(within(l).getByRole("link", { name: /Cargar franjas/ })).toHaveAttribute("href", "/configuracion/sedes?sede=4&ver=franjas");
  });

  it("la dirección de la sede se marca sola; las franjas, con el conteo de las sedes", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.sedes).mockResolvedValue([sede({ franjas: 0 })] as never);
    await montar();
    const l = lista();
    expect(within(l).queryByRole("link", { name: /Ir a Sedes/ })).not.toBeInTheDocument();
    expect(within(l).getByRole("link", { name: /Cargar franjas/ })).toBeInTheDocument();
  });

  it("un paso que no se pudo saber (un permiso que falta) no se muestra ni se da por hecho", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin permiso"));
    vi.mocked(apiAcademia.sedes).mockRejectedValue(new Error("Sin permiso"));
    await montar();
    // Sin las sedes caen los dos pasos que dependen de ellas (sede y franjas), y sin docentes el tercero.
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(3);
    expect(within(lista()).queryByText(/con acceso/)).not.toBeInTheDocument();
  });

  it("R3: cuando una pantalla avisa que guardó, la lista se vuelve a leer y marca sola lo que ya está", async () => {
    cargarVacio();
    await montar();
    expect(barra()).toHaveAttribute("aria-valuenow", "0");
    // El administrador cargó la dirección y las franjas de la sede sin salir de la pantalla.
    vi.mocked(apiAcademia.sedes).mockResolvedValue([sede()] as never);
    await act(async () => {
      avisarPrimerosPasos();
    });
    expect(barra()).toHaveAttribute("aria-valuenow", "2");
    expect(within(lista()).queryByRole("link", { name: /Cargar franjas/ })).not.toBeInTheDocument();
  });

  it("R3: al cambiar de ruta (misma lista, otra pestaña) se vuelve a leer, y los grupos se piden de a pocos", async () => {
    cargarVacio();
    let ir: (a: string) => void = () => {};
    function Nav() {
      const n = useNavigate();
      ir = n;
      return null;
    }
    render(
      <MemoryRouter initialEntries={["/configuracion/sedes"]}>
        <Nav />
        <PrimerosPasos />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(1);
    vi.mocked(apiAcademia.carreras).mockResolvedValue([curso] as never);
    await act(async () => {
      ir("/configuracion/carreras");
    });
    expect(apiAcademia.sedes).toHaveBeenCalledTimes(2);
    expect(barra()).toHaveAttribute("aria-valuenow", "1");
    expect(apiAcademia.grupos).toHaveBeenCalledWith({ pageSize: 10 });
  });

  it("un rol al que le falta el permiso de un dato (403) ve igual lo que sí puede ver", async () => {
    cargarTodoHecho();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new ApiError("Sin permiso", 403));
    await montar();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(5);
  });

  it("R5: con QR y PIN en el plan, suma «El QR de cobro cargado» y «Tu PIN de autorización» con su estado real", async () => {
    sesion.mostrador = true;
    cargarTodoHecho();
    vi.mocked(api.qrCobro).mockResolvedValue({ imagen: null, actualizadoEn: null });
    vi.mocked(api.getUsuario).mockResolvedValue({ id: 1, tienePin: false } as never);
    await montar();
    expect(barra()).toHaveAttribute("aria-valuenow", "6");
    expect(barra()).toHaveAttribute("aria-valuemax", "8");
    const l = lista();
    expect(within(l).getByRole("link", { name: /Cargar el QR/ })).toHaveAttribute("href", "/configuracion/qr-cobro");
    expect(within(l).getByRole("link", { name: /Poner mi PIN/ })).toHaveAttribute("href", "/usuarios");
    expect(api.getUsuario).toHaveBeenCalledWith(1);
  });

  it("R5: con el QR y el PIN ya puestos, esos pasos salen hechos y la lista queda completa", async () => {
    sesion.mostrador = true;
    cargarTodoHecho();
    vi.mocked(api.qrCobro).mockResolvedValue({ imagen: "data:image/png;base64,xx", actualizadoEn: null });
    vi.mocked(api.getUsuario).mockResolvedValue({ id: 1, tienePin: true } as never);
    await montar();
    expect(barra()).toHaveAttribute("aria-valuenow", "8");
    expect(screen.getByText(/¡Listo!/)).toBeInTheDocument();
  });

  it("R5: si no se pudo saber el QR ni el PIN (un permiso, un corte), esos pasos no se muestran", async () => {
    sesion.mostrador = true;
    cargarVacio();
    vi.mocked(api.qrCobro).mockRejectedValue(new Error("corte"));
    vi.mocked(api.getUsuario).mockRejectedValue(new ApiError("Sin permiso", 403));
    await montar();
    expect(within(lista()).getAllByRole("listitem")).toHaveLength(6);
  });

  it("R5: sin QR ni PIN en el plan no se pregunta nada", async () => {
    cargarVacio();
    await montar();
    expect(api.qrCobro).not.toHaveBeenCalled();
    expect(api.getUsuario).not.toHaveBeenCalled();
  });
});
