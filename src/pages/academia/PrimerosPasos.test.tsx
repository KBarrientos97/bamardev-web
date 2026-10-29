import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba } from "../../test/academiaFixtures";

/**
 * L1 · «Configuración rápida» (antes la tarjeta «Primeros pasos», C1): un botón
 * con el anillo n/N que abre la lista en el panel lateral. Se marca sola,
 * desaparece al completarse (con un «¡Listo!» si se completó a la vista), se
 * oculta con «Ya lo sé» en todos los equipos, se abre sola una única vez con la
 * academia recién creada, y sólo la ve quien configura el instituto.
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

const CLAVE = "bamardev_primeros_pasos_20";

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

/** Con un paso hecho (el curso): el panel no se abre solo. */
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

const boton = () => screen.queryByRole("button", { name: /^Configuración rápida/ });
const panel = () => screen.queryByRole("complementary", { name: "Configuración rápida" });
/** Abre el panel (si no se abrió solo) y lo devuelve. */
function abrir() {
  if (!panel()) fireEvent.click(boton()!);
  return panel()!;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  sesion.rol = "admin";
  sesion.mostrador = false;
  vi.mocked(apiAcademia.guardarAjustes).mockResolvedValue(ajustesDePrueba());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe("L1 · el botón «Configuración rápida»", () => {
  it("con pasos pendientes es un botón con el anillo n/N (no una tarjeta); tocarlo abre la lista en el panel", async () => {
    cargarParcial();
    await montar();
    expect(screen.queryByRole("region", { name: "Primeros pasos" })).not.toBeInTheDocument();
    expect(boton()).toHaveAccessibleName("Configuración rápida: 1 de 6 listos");
    expect(boton()).toHaveTextContent("1/6");
    expect(panel()).not.toBeInTheDocument();
    fireEvent.click(boton()!);
    expect(boton()).toHaveAttribute("aria-expanded", "true");
    const p = panel()!;
    expect(within(p).getAllByRole("listitem")).toHaveLength(6);
    expect(within(p).getByRole("progressbar", { name: "Configuración rápida" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByText(/1 de 6 listos/)).toBeInTheDocument();
  });

  it("incompleta: las casillas pendientes con su botón a la pantalla donde se hacen", async () => {
    cargarVacio();
    await montar();
    const p = abrir();
    expect(within(p).getAllByRole("listitem")).toHaveLength(6);
    expect(within(p).getByRole("link", { name: /Ir a Sedes/ })).toHaveAttribute("href", "/configuracion/sedes");
    expect(within(p).getByRole("link", { name: /Cargar franjas/ })).toHaveAttribute("href", "/configuracion/sedes");
    expect(within(p).getByRole("link", { name: /Crear un curso/ })).toHaveAttribute("href", "/configuracion/carreras");
    expect(within(p).getByRole("link", { name: /Ir a Personal/ })).toHaveAttribute("href", "/personal");
    expect(within(p).getByRole("link", { name: /Abrir un grupo/ })).toHaveAttribute("href", "/academia/calendario");
    expect(within(p).getByRole("link", { name: /Ir a Mi página/ })).toHaveAttribute("href", "/mi-pagina");
  });

  it("«Ir a…» cierra el panel (si no, tapaba la pantalla a la que lleva)", async () => {
    cargarParcial();
    await montar();
    fireEvent.click(within(abrir()).getByRole("link", { name: /Ir a Sedes/ }));
    expect(panel()).not.toBeInTheDocument();
    expect(boton()).toBeInTheDocument();
  });

  it("parcial: lo hecho se marca solo y ya no pide botón; el resto sigue", async () => {
    cargarParcial();
    await montar();
    const p = abrir();
    expect(within(p).getByText("Un curso con módulos y precio").parentElement).toHaveTextContent(/^Listo: /);
    expect(within(p).queryByRole("link", { name: /Crear un curso/ })).not.toBeInTheDocument();
    expect(within(p).getByRole("link", { name: /Ir a Sedes/ })).toBeInTheDocument();
  });

  it("completa: no hay botón y lo recuerda, sin volver a pedir datos la próxima vez", async () => {
    cargarTodoHecho();
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("completo");
    // Al volver a entrar ni siquiera se consulta.
    cleanup();
    vi.mocked(apiAcademia.ajustes).mockClear();
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(apiAcademia.ajustes).not.toHaveBeenCalled();
  });

  it("si se completa con la pantalla abierta dice «¡Listo!» un momento y después el botón se va", async () => {
    cargarParcial();
    await montar();
    expect(boton()).toBeInTheDocument();
    vi.useFakeTimers();
    cargarTodoHecho();
    await act(async () => {
      avisarPrimerosPasos();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("status")).toHaveTextContent("¡Listo!");
    expect(boton()).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("completo");
  });
});

describe("L1 · «Ya lo sé» y la primera vez, en todos los equipos", () => {
  it("«Ya lo sé» (en el panel) oculta el botón, lo guarda en los ajustes del instituto y en este navegador", async () => {
    cargarParcial();
    await montar();
    fireEvent.click(within(abrir()).getByRole("button", { name: "Ya lo sé" }));
    expect(boton()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    await act(async () => {});
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ primerosPasosOcultos: true });
    expect(localStorage.getItem(CLAVE)).toBe("oculto");
    cleanup();
    await montar();
    expect(boton()).not.toBeInTheDocument();
  });

  it("dado en otro equipo (llega en los ajustes): no aparece y queda anotado acá", async () => {
    cargarVacio({ primerosPasosOcultos: true });
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(panel()).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("oculto");
  });

  it("con la academia recién creada (0 hechos) el panel se abre solo y lo anota en el backend", async () => {
    cargarVacio();
    await montar();
    expect(panel()).toBeInTheDocument();
    expect(apiAcademia.guardarAjustes).toHaveBeenCalledWith({ primerosPasosVistos: true });
  });

  it("si ya se abrió solo en otro equipo (primerosPasosVistos), no se abre solo: queda el botón", async () => {
    cargarVacio({ primerosPasosVistos: true });
    await montar();
    expect(panel()).not.toBeInTheDocument();
    expect(boton()).toBeInTheDocument();
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
  });

  it("aunque el guardado falle, en la misma sesión no se vuelve a abrir solo", async () => {
    vi.mocked(apiAcademia.guardarAjustes).mockRejectedValue(new Error("corte"));
    cargarVacio();
    await montar();
    expect(panel()).toBeInTheDocument();
    cleanup();
    await montar();
    expect(panel()).not.toBeInTheDocument();
    expect(boton()).toBeInTheDocument();
  });

  it("con algo hecho no se abre solo", async () => {
    cargarParcial();
    await montar();
    expect(panel()).not.toBeInTheDocument();
    expect(apiAcademia.guardarAjustes).not.toHaveBeenCalled();
  });

  it("si el navegador no deja guardar (modo privado), «Ya lo sé» igual lo oculta ahora y no rompe", async () => {
    cargarParcial();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    await montar();
    expect(boton()).toBeInTheDocument();
    fireEvent.click(within(abrir()).getByRole("button", { name: "Ya lo sé" }));
    expect(boton()).not.toBeInTheDocument();
  });

  it("la recepción y el docente no lo ven, ni se piden los datos", async () => {
    cargarVacio();
    for (const rol of ["secretaria", "docente"] as const) {
      sesion.rol = rol;
      await montar();
      expect(boton()).not.toBeInTheDocument();
      cleanup();
    }
    expect(apiAcademia.ajustes).not.toHaveBeenCalled();
    expect(apiAcademia.sedes).not.toHaveBeenCalled();
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
    const p = abrir();
    expect(within(p).getByRole("link", { name: /Ir a Sedes/ })).toHaveAttribute("href", "/configuracion/sedes?sede=4&ver=editar");
    expect(within(p).getByRole("link", { name: /Cargar franjas/ })).toHaveAttribute("href", "/configuracion/sedes?sede=4&ver=franjas");
  });

  it("la dirección de la sede se marca sola; las franjas, con el conteo de las sedes", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.sedes).mockResolvedValue([sede({ franjas: 0 })] as never);
    await montar();
    const p = abrir();
    expect(within(p).queryByRole("link", { name: /Ir a Sedes/ })).not.toBeInTheDocument();
    expect(within(p).getByRole("link", { name: /Cargar franjas/ })).toBeInTheDocument();
  });

  it("un paso que no se pudo saber (un permiso que falta) no se muestra ni se da por hecho", async () => {
    cargarVacio();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin permiso"));
    vi.mocked(apiAcademia.sedes).mockRejectedValue(new Error("Sin permiso"));
    await montar();
    const p = abrir();
    // Sin las sedes caen los dos pasos que dependen de ellas (sede y franjas), y sin docentes el tercero.
    expect(within(p).getAllByRole("listitem")).toHaveLength(3);
    expect(within(p).queryByText(/con acceso/)).not.toBeInTheDocument();
  });

  it("completa con un paso sin saber: no hay botón, pero no se la da por terminada para siempre", async () => {
    cargarTodoHecho();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new Error("Sin permiso"));
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it("R3: cuando una pantalla avisa que guardó, la lista se vuelve a leer y marca sola lo que ya está", async () => {
    cargarVacio();
    await montar();
    expect(boton()).toHaveAccessibleName("Configuración rápida: 0 de 6 listos");
    // El administrador cargó la dirección y las franjas de la sede sin salir de la pantalla.
    vi.mocked(apiAcademia.sedes).mockResolvedValue([sede()] as never);
    await act(async () => {
      avisarPrimerosPasos();
    });
    expect(boton()).toHaveAccessibleName("Configuración rápida: 2 de 6 listos");
    expect(within(abrir()).queryByRole("link", { name: /Cargar franjas/ })).not.toBeInTheDocument();
  });

  it("R3: al pasar de una pestaña a otra de la Configuración (misma lista, otra ruta) se vuelve a leer", async () => {
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
    expect(boton()).toHaveAccessibleName("Configuración rápida: 1 de 6 listos");
  });

  it("M4: lo que la pantalla ya cargó (ajustes y cursos) no se pide de nuevo, y los grupos se piden de a pocos", async () => {
    cargarVacio();
    render(
      <MemoryRouter>
        <PrimerosPasos ajustes={ajustesDePrueba({ paginaPublicada: false })} cursos={[curso] as never} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(apiAcademia.ajustes).not.toHaveBeenCalled();
    expect(apiAcademia.carreras).not.toHaveBeenCalled();
    // El curso que le pasó la pantalla cuenta.
    expect(boton()).toHaveAccessibleName("Configuración rápida: 1 de 6 listos");
    expect(apiAcademia.grupos).toHaveBeenCalledWith({ pageSize: 10 });
  });

  it("M4: un rol al que le falta el permiso de un dato (403) la completa igual con lo que sí ve, y lo recuerda", async () => {
    cargarTodoHecho();
    vi.mocked(apiAcademia.docentes).mockRejectedValue(new ApiError("Sin permiso", 403));
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("completo");
  });

  it("R5: con QR y PIN en el plan, suma «El QR de cobro cargado» y «Tu PIN de autorización» con su estado real", async () => {
    sesion.mostrador = true;
    cargarTodoHecho();
    vi.mocked(api.qrCobro).mockResolvedValue({ imagen: null, actualizadoEn: null });
    vi.mocked(api.getUsuario).mockResolvedValue({ id: 1, tienePin: false } as never);
    await montar();
    expect(boton()).toHaveAccessibleName("Configuración rápida: 6 de 8 listos");
    const p = abrir();
    expect(within(p).getByRole("link", { name: /Cargar el QR/ })).toHaveAttribute("href", "/configuracion/qr-cobro");
    expect(within(p).getByRole("link", { name: /Poner mi PIN/ })).toHaveAttribute("href", "/usuarios");
    expect(api.getUsuario).toHaveBeenCalledWith(1);
    // Con la lista a medias no se la da por completa.
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it("R5: con el QR y el PIN ya puestos, esos pasos salen hechos y la lista se completa", async () => {
    sesion.mostrador = true;
    cargarTodoHecho();
    vi.mocked(api.qrCobro).mockResolvedValue({ imagen: "data:image/png;base64,xx", actualizadoEn: null });
    vi.mocked(api.getUsuario).mockResolvedValue({ id: 1, tienePin: true } as never);
    await montar();
    expect(boton()).not.toBeInTheDocument();
    expect(localStorage.getItem(CLAVE)).toBe("completo");
  });

  it("R5: si no se pudo saber el QR ni el PIN (un permiso, un corte), esos pasos no se muestran ni traban la lista", async () => {
    sesion.mostrador = true;
    cargarVacio();
    vi.mocked(api.qrCobro).mockRejectedValue(new Error("corte"));
    vi.mocked(api.getUsuario).mockRejectedValue(new ApiError("Sin permiso", 403));
    await montar();
    expect(within(abrir()).getAllByRole("listitem")).toHaveLength(6);
  });

  it("R5: sin QR ni PIN en el plan no se pregunta nada", async () => {
    cargarVacio();
    await montar();
    expect(api.qrCobro).not.toHaveBeenCalled();
    expect(api.getUsuario).not.toHaveBeenCalled();
  });
});
