import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba, fichaCamila, grupoDetalle, PLAN_COMPLETO, PLAN_CUOTAS } from "../../test/academiaFixtures";

/**
 * E5 · Inscribir: alumno nuevo con tutor si es menor, el plan con su
 * calendario, la beca o promoción con PIN sobre el tope, y el grupo lleno que
 * se confirma y se reintenta.
 */

/** Quién inscribe: la secretaría (por defecto) o el admin, que aprueba fotos (A3). */
const quien = vi.hoisted(() => ({ admin: false }));

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA, SESION_ADMIN } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...(quien.admin ? SESION_ADMIN : SESION_SECRETARIA), puede: () => true }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: {
      grupo: vi.fn(),
      grupos: vi.fn(),
      ajustes: vi.fn(),
      alumnos: vi.fn(),
      inscribir: vi.fn(),
      convertir: vi.fn(),
      alumno: vi.fn(),
      revisarFotos: vi.fn(),
    },
  };
});

// El canvas no existe en jsdom: la foto "achicada" es el mismo archivo.
vi.mock("../../lib/academia/fotos", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/fotos")>();
  return { ...real, prepararFoto: vi.fn(async (f: File) => new Blob([f], { type: "image/webp" })) };
});

import { apiAcademia } from "../../lib/academia/apiAcademia";
import { ApiError } from "../../lib/api";
import Inscribir from "./Inscribir";

const onInscrito = vi.fn();

async function montar() {
  render(
    <MemoryRouter>
      <Inscribir grupoInicial={{ id: 7, nombre: "Barbería · L-V 10:00" }} onCerrar={vi.fn()} onInscrito={onInscrito} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const panel = () => screen.getByRole("dialog", { name: "Inscribir estudiante" });

/**
 * "Nuevo estudiante" sólo aparece cuando la búsqueda no encuentra a nadie (D2):
 * se busca primero (como en el mostrador, para no cargar a alguien repetido) y
 * recién entonces se pide la ficha nueva.
 */
async function cargarNuevo(fechaNacimiento: string) {
  fireEvent.change(within(panel()).getByLabelText("Buscar estudiante"), { target: { value: "14550221" } });
  fireEvent.click(await within(panel()).findByRole("button", { name: "Nuevo estudiante" }));
  fireEvent.change(within(panel()).getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
  fireEvent.change(within(panel()).getByLabelText("Apellidos"), { target: { value: "Céspedes Molina" } });
  fireEvent.change(within(panel()).getByLabelText("Nombres"), { target: { value: "Joaquín" } });
  fireEvent.change(within(panel()).getByLabelText(/Fecha de nacimiento/), { target: { value: fechaNacimiento } });
}

beforeEach(() => {
  vi.clearAllMocks();
  quien.admin = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T14:00:00.000Z"));
  vi.spyOn(window, "open").mockImplementation(() => null);
  vi.mocked(apiAcademia.grupo).mockResolvedValue(grupoDetalle());
  vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: false }));
  vi.mocked(apiAcademia.alumnos).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 6 });
  vi.mocked(apiAcademia.inscribir).mockResolvedValue({ id: 555 } as never);
  vi.mocked(apiAcademia.alumno).mockResolvedValue({ ...fichaCamila(), fotos: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("E5 · inscribir", () => {
  it("un menor pide el tutor; con él, inscribe con el plan elegido", async () => {
    await montar();
    await cargarNuevo("2011-03-12");
    expect(within(panel()).getByText(/Tutor · obligatorio/)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    // El calendario del plan a la vista, sin renglón de matrícula.
    // D6: el módulo con su nombre, como habla el instituto.
    expect(within(panel()).getAllByText(/M2 Degradados y M3 Barba y color · al empezar M2/).length).toBeGreaterThan(0);
    fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    expect(within(panel()).getByText(/Es menor: falta el tutor/)).toBeInTheDocument();
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();

    fireEvent.change(within(panel()).getByLabelText("Nombre del tutor"), { target: { value: "Rosa Molina" } });
    fireEvent.change(within(panel()).getByLabelText("WhatsApp"), { target: { value: "71234567" } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith({
      alumno: {
        ci: "14550221",
        ciExpedido: "SC",
        apellidos: "Céspedes Molina",
        nombres: "Joaquín",
        fechaNacimiento: "2011-03-12",
      },
      tutor: { nombre: "Rosa Molina", telefono: "71234567", parentesco: "Madre" },
      grupoId: 7,
      planPagoId: 2,
    }, {});
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: false });
    // La bienvenida va al tutor y le habla del estudiante (QA ronda 2, B-19).
    const url = vi.mocked(window.open).mock.calls[0][0] as string;
    const texto = decodeURIComponent(url.split("text=")[1]);
    expect(texto).toMatch(/^Hola Rosa Molina, Joaquín ya está inscrito\/a en .+\. Empieza el /);
    expect(texto).not.toContain("Empezás");
  });

  it("si el backend manda la bienvenida, va la suya; con null no se abre WhatsApp", async () => {
    vi.mocked(apiAcademia.inscribir).mockResolvedValueOnce({
      id: 555,
      bienvenida: { telefono: "71234567", aTutor: true, texto: "Hola Rosa", url: "https://wa.me/59171234567?text=Hola%20Rosa" },
    } as never);
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(window.open).toHaveBeenCalledWith("https://wa.me/59171234567?text=Hola%20Rosa", "_blank", "noopener,noreferrer");

    vi.mocked(window.open).mockClear();
    vi.mocked(apiAcademia.inscribir).mockResolvedValueOnce({ id: 556, bienvenida: null } as never);
    fireEvent.change(within(panel()).getByLabelText("Teléfono (opcional)"), { target: { value: "71234567" } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(window.open).not.toHaveBeenCalled();
  });

  it("una beca sobre el tope pide el PIN de quien autoriza y viaja con él", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Aplicar otro descuento o beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Beca" }));
    fireEvent.change(within(panel()).getByLabelText("Descuento"), { target: { value: "50" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Situación económica" } });
    expect(within(panel()).getByText(/Total del curso/).parentElement).toHaveTextContent(/680/);
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    // El PIN se pide en el pie del alta, no en un diálogo encima.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const pin = within(panel()).getByRole("region", { name: "Autorización del encargado" });
    fireEvent.change(within(pin).getByLabelText("Usuario del encargado"), { target: { value: "rosa" } });
    fireEvent.change(within(pin).getByLabelText("PIN"), { target: { value: "1234" } });
    await act(async () => {
      fireEvent.click(within(pin).getByRole("button", { name: "Autorizar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith(
      expect.objectContaining({
        planPagoId: 1,
        descuento: { tipo: "BECA", pct: 50, motivo: "Situación económica", autorizador: { username: "rosa", pin: "1234" } },
      }),
      {},
    );
    // Paga hoy todo lo que queda del pago completo con la beca.
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: true, montoHoy: 680 });
  });

  it("el grupo lleno se confirma y se reintenta con confirmarSobreCupo", async () => {
    vi.mocked(apiAcademia.inscribir)
      .mockRejectedValueOnce(new ApiError("Grupo lleno", 409, { codigo: "GRUPO_LLENO", inscritos: 30, cupo: 30 }))
      .mockResolvedValueOnce({ id: 556 } as never);
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    // Junto al botón, dentro del alta: sin un diálogo encima.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const confirmar = within(panel()).getByRole("region", { name: "El grupo está lleno" });
    expect(confirmar).toHaveTextContent("Tiene 30 inscritos y el cupo es de 30");
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Inscribir igual" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenLastCalledWith(expect.objectContaining({ confirmarSobreCupo: true }), {});
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 556 }, cobrar: false });
  });

  it("el PIN en el pie valida antes de mandar, y cancelarlo vuelve a los botones sin inscribir", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Aplicar otro descuento o beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Beca" }));
    fireEvent.change(within(panel()).getByLabelText("Descuento"), { target: { value: "50" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Situación económica" } });
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    const pin = within(panel()).getByRole("region", { name: "Autorización del encargado" });
    // Mientras se pide, los botones de inscribir no están: un solo camino.
    expect(within(panel()).queryByRole("button", { name: "Inscribir sin cobrar" })).not.toBeInTheDocument();
    fireEvent.change(within(pin).getByLabelText("PIN"), { target: { value: "12" } });
    fireEvent.click(within(pin).getByRole("button", { name: "Autorizar" }));
    expect(within(pin).getByText("El PIN son 4 dígitos.")).toBeInTheDocument();
    fireEvent.change(within(pin).getByLabelText("PIN"), { target: { value: "1234" } });
    fireEvent.click(within(pin).getByRole("button", { name: "Autorizar" }));
    expect(within(pin).getByText("Poné el usuario del encargado que autoriza.")).toBeInTheDocument();
    fireEvent.click(within(pin).getByRole("button", { name: "Cancelar" }));
    expect(within(panel()).queryByRole("region", { name: "Autorización del encargado" })).not.toBeInTheDocument();
    expect(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" })).toBeInTheDocument();
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
  });

  it("el 403 DESCUENTO_REQUIERE_AUTORIZACION pide el PIN en el pie y reintenta con quien autorizó", async () => {
    vi.mocked(apiAcademia.inscribir)
      .mockRejectedValueOnce(new ApiError("Hace falta autorización", 403, { codigo: "DESCUENTO_REQUIERE_AUTORIZACION" }))
      .mockResolvedValueOnce({ id: 557 } as never);
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: false, topePromoSinPinPct: 100 }));
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Aplicar otro descuento o beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Promoción" }));
    fireEvent.change(within(panel()).getByLabelText("Descuento"), { target: { value: "10" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Promo de inicio" } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const pin = within(panel()).getByRole("region", { name: "Autorización del encargado" });
    fireEvent.change(within(pin).getByLabelText("Usuario del encargado"), { target: { value: "rosa" } });
    fireEvent.change(within(pin).getByLabelText("PIN"), { target: { value: "4826" } });
    await act(async () => {
      fireEvent.click(within(pin).getByRole("button", { name: "Autorizar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenLastCalledWith(
      expect.objectContaining({
        descuento: { tipo: "PROMOCION", pct: 10, motivo: "Promo de inicio", autorizador: { username: "rosa", pin: "4826" } },
      }),
      {},
    );
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 557 }, cobrar: false });
  });

  it("el grupo lleno se puede cancelar y cambiar algo lo saca", async () => {
    vi.mocked(apiAcademia.inscribir).mockRejectedValue(new ApiError("Grupo lleno", 409, { codigo: "GRUPO_LLENO", inscritos: 30, cupo: 30 }));
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    const lleno = within(panel()).getByRole("region", { name: "El grupo está lleno" });
    fireEvent.click(within(lleno).getByRole("button", { name: "Cancelar" }));
    expect(within(panel()).queryByRole("region", { name: "El grupo está lleno" })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).getByRole("region", { name: "El grupo está lleno" })).toBeInTheDocument();
    // Otro plan: lo de "lleno" era del pedido anterior.
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    expect(within(panel()).queryByRole("region", { name: "El grupo está lleno" })).not.toBeInTheDocument();
    expect(apiAcademia.inscribir).toHaveBeenCalledTimes(2);
  });

  it("un alumno ya cargado sin tutor: el 400 TUTOR_REQUERIDO muestra el bloque del tutor", async () => {
    vi.mocked(apiAcademia.alumnos).mockResolvedValue({
      items: [
        { id: 60, codigo: "2026-0140", apellidos: "Rojas Lima", nombres: "Thiago", ci: "1", telefono: null, grupoActual: null, plan: null, saldo: 0, vencido: false, ultimaAsistencia: null, estado: "ACTIVA" },
      ],
      total: 1,
      page: 1,
      pageSize: 6,
    });
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(new ApiError("Falta el tutor", 400, { codigo: "TUTOR_REQUERIDO" }));
    vi.useRealTimers();
    await montar();
    fireEvent.change(within(panel()).getByLabelText("Buscar estudiante"), { target: { value: "Thiago" } });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });
    fireEvent.click(await within(panel()).findByRole("button", { name: /Rojas Lima, Thiago/ }));
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenCalledWith(expect.objectContaining({ alumnoId: 60 }), {});
    expect(within(panel()).getByText(/Tutor · obligatorio/)).toBeInTheDocument();
  });

  it("D2: «Nuevo estudiante» sale sólo cuando la búsqueda no encuentra a nadie", async () => {
    vi.mocked(apiAcademia.alumnos).mockResolvedValueOnce({
      items: [
        { id: 60, codigo: "2026-0140", apellidos: "Rojas Lima", nombres: "Thiago", ci: "1", telefono: null, grupoActual: null, plan: null, saldo: 0, vencido: false, ultimaAsistencia: null, estado: "ACTIVA" },
      ],
      total: 1,
      page: 1,
      pageSize: 6,
    });
    vi.useRealTimers();
    await montar();
    const buscador = within(panel()).getByLabelText("Buscar estudiante");
    expect(buscador).toHaveAttribute("placeholder", "Nombre, CI, código o teléfono");
    // Sin haber buscado, no hay "Nuevo": primero se busca, para no repetir fichas.
    expect(within(panel()).queryByRole("button", { name: "Nuevo estudiante" })).not.toBeInTheDocument();
    const esperar = () =>
      act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });
    // Con resultados, tampoco.
    fireEvent.change(buscador, { target: { value: "Thiago" } });
    await esperar();
    expect(await within(panel()).findByRole("button", { name: /Rojas Lima, Thiago/ })).toBeInTheDocument();
    expect(within(panel()).queryByRole("button", { name: "Nuevo estudiante" })).not.toBeInTheDocument();
    // Sin resultados (el mock por defecto devuelve vacío), aparece.
    fireEvent.change(buscador, { target: { value: "Nadie Conocido" } });
    await esperar();
    expect(await within(panel()).findByRole("button", { name: "Nuevo estudiante" })).toBeInTheDocument();
    expect(within(panel()).getByText(/No hay nadie con «Nadie Conocido»/)).toBeInTheDocument();
  });

  it("un CI que ya es de otro ofrece buscarlo en vez de crearlo otra vez", async () => {
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(
      new ApiError("Ese carnet ya es de otra persona del negocio.", 409, { codigo: "CI_DUPLICADO" }),
    );
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Ese carnet ya es de otra persona del negocio.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Buscarlo" }));
    expect(within(panel()).getByLabelText("Buscar estudiante")).toHaveValue("14550221");
  });

  it("D3: una preinscripción sin fotos se convierte con fotosPendientes después de preguntar", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: true }));
    vi.mocked(apiAcademia.convertir).mockResolvedValue({ id: 601, fotosPendientes: true } as never);
    render(
      <MemoryRouter>
        <Inscribir
          preinscripcion={{
            id: 46,
            alumno: { id: 63, apellidos: "Ortiz Rocha", nombres: "Thiago", telefono: "70099887", menor: false },
            tutor: null,
            grupo: { id: 7, nombre: "Barbería · L-V 10:00", carrera: "Barbería", sede: "Central" },
            turnoPreferido: null,
            mensaje: null,
            preinscritaEn: "2026-10-14T12:00:00.000Z",
            vieja: false,
          }}
          onCerrar={vi.fn()}
          onInscrito={onInscrito}
        />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.convertir).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(within(panel()).getByRole("region", { name: "Faltan fotos" })).getByRole("button", { name: "Inscribir sin fotos" }));
    });
    expect(apiAcademia.convertir).toHaveBeenLastCalledWith(46, expect.objectContaining({ planPagoId: 1, fotosPendientes: true }), {});
  });

  it("una preinscripción de un menor sin tutor se convierte con el tutor y, lleno, con confirmarSobreCupo", async () => {
    vi.mocked(apiAcademia.convertir)
      .mockRejectedValueOnce(new ApiError("Grupo lleno", 409, { codigo: "GRUPO_LLENO", inscritos: 30, cupo: 30 }))
      .mockResolvedValueOnce({ id: 600 } as never);
    render(
      <MemoryRouter>
        <Inscribir
          preinscripcion={{
            id: 44,
            alumno: { id: 61, apellidos: "Rojas Lima", nombres: "Thiago", telefono: "77788990", menor: true },
            tutor: null,
            grupo: { id: 7, nombre: "Barbería · L-V 10:00", carrera: "Barbería", sede: "Central" },
            turnoPreferido: null,
            mensaje: null,
            preinscritaEn: "2026-10-14T12:00:00.000Z",
            vieja: false,
          }}
          onCerrar={vi.fn()}
          onInscrito={onInscrito}
        />
      </MemoryRouter>,
    );
    await act(async () => {});
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.change(within(panel()).getByLabelText("Nombre del tutor"), { target: { value: "Ana Lima" } });
    fireEvent.change(within(panel()).getByLabelText("WhatsApp"), { target: { value: "77788991" } });
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    await act(async () => {
      fireEvent.click(within(within(panel()).getByRole("region", { name: "El grupo está lleno" })).getByRole("button", { name: "Inscribir igual" }));
    });
    expect(apiAcademia.convertir).toHaveBeenLastCalledWith(44, {
      planPagoId: 1,
      tutor: { nombre: "Ana Lima", telefono: "77788991", parentesco: "Madre" },
      confirmarSobreCupo: true,
    }, {});
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 600 }, cobrar: false });
  });

  it("la preinscripción online de un menor que ya trajo tutor: la bienvenida dice \"al tutor\" (QA ronda 2, N-9)", async () => {
    render(
      <MemoryRouter>
        <Inscribir
          preinscripcion={{
            id: 45,
            alumno: { id: 62, apellidos: "Vaca Rojas", nombres: "Mateo", telefono: null, menor: true },
            tutor: { nombre: "Ramiro Vaca", telefono: "70011223", parentesco: "Padre" },
            grupo: { id: 7, nombre: "Barbería · L-V 10:00", carrera: "Barbería", sede: "Central" },
            turnoPreferido: null,
            mensaje: null,
            preinscritaEn: "2026-10-14T12:00:00.000Z",
            vieja: false,
          }}
          onCerrar={vi.fn()}
          onInscrito={onInscrito}
        />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(within(panel()).getByRole("checkbox", { name: "Enviar bienvenida por WhatsApp al tutor" })).toBeChecked();
  });

  it("paga hoy: la primera cuota por defecto, o un adelanto que llega al POS", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    expect(within(panel()).getByRole("button", { name: /Inscribir y cobrar Bs\s?750/ })).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("button", { name: "Otro monto" }));
    fireEvent.change(within(panel()).getByLabelText(/Monto del adelanto/), { target: { value: "300" } });
    expect(within(panel()).getByRole("region", { name: "Resumen" })).toHaveTextContent(/Queda de saldo\s*Bs\s?1\.200/);
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar Bs\s?300/ }));
    });
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: true, montoHoy: 300 });
  });
});

describe("E5 · inscribir: los errores se ven y el adelanto se valida (QA ronda 2, B-15 y B-16)", () => {
  const pie = () => panel().querySelector("footer")!;

  it("lo que falta sale junto al botón y se va al corregirlo", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    expect(within(pie()).getByRole("alert")).toHaveTextContent("Elegí cómo paga.");
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    expect(within(pie()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un adelanto negativo se marca en el campo y no inscribe; uno válido viaja al cobro", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Otro monto" }));
    const monto = within(panel()).getByLabelText("Monto del adelanto (Bs)");
    fireEvent.change(monto, { target: { value: "-50" } });
    expect(within(panel()).getByText("Tiene que ser más de Bs 0.")).toBeInTheDocument();
    expect(monto).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
    expect(within(pie()).getByRole("alert")).toHaveTextContent("Lo que paga hoy: tiene que ser más de Bs 0.");
    fireEvent.change(monto, { target: { value: "100" } });
    expect(within(panel()).queryByText("Tiene que ser más de Bs 0.")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    });
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: true, montoHoy: 100 });
  });

  it("un descuento en Bs mayor que el curso se marca y no inscribe", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Aplicar otro descuento o beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Bs" }));
    const campo = within(panel()).getByLabelText("Descuento");
    fireEvent.change(campo, { target: { value: "99999" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Prueba" } });
    expect(within(panel()).getByText(/No puede pasar el precio del curso/)).toBeInTheDocument();
    // El resumen no aplica el descuento inválido: nada de "Beca 100 %, total Bs 0" (QA ronda 2, N-6).
    const resumen = within(panel()).getByRole("region", { name: "Resumen" });
    expect(resumen).not.toHaveTextContent(/Beca/);
    const precio = resumen.querySelector("dd")?.textContent;
    expect(within(resumen).getByText("Total del curso").nextElementSibling?.textContent).toBe(precio);
    expect(within(resumen).getByText("Total del curso").nextElementSibling).not.toHaveTextContent(/^Bs\s?0,00$/);
    // Con un monto válido, sí.
    fireEvent.change(campo, { target: { value: "100" } });
    expect(resumen).toHaveTextContent(/Beca/);
    fireEvent.change(campo, { target: { value: "99999" } });
    fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
  });
});

describe("N5 · las 3 fotos obligatorias", () => {
  beforeEach(() => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: true }));
  });

  const subir = (tipo: string) =>
    fireEvent.change(screen.getByTestId("subir-" + tipo), { target: { files: [new File(["x"], tipo + ".jpg", { type: "image/jpeg" })] } });

  it("el requisito dice cuántas fotos van; con las 3 viajan en el pedido, sin preguntar ni marcar pendientes", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    expect(within(panel()).getByText(/Fotos: 0 de 3/)).toBeInTheDocument();
    await act(async () => subir("FOTO"));
    await act(async () => subir("CI_ANVERSO"));
    expect(within(panel()).getByText(/Fotos: 2 de 3/)).toBeInTheDocument();
    await act(async () => subir("CI_REVERSO"));
    expect(within(panel()).getByText("Las 3 fotos")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).queryByRole("region", { name: "Faltan fotos" })).not.toBeInTheDocument();
    const [pedido, fotos] = vi.mocked(apiAcademia.inscribir).mock.calls[0];
    expect(Object.keys(fotos!).sort()).toEqual(["CI_ANVERSO", "CI_REVERSO", "FOTO"]);
    expect(pedido).not.toHaveProperty("fotosPendientes");
  });

  it("D3: con fotos pendientes los botones siguen activos; al tocarlos pregunta y «Cargar las fotos» no manda nada", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => subir("FOTO"));
    expect(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" })).toBeEnabled();
    expect(within(panel()).getByRole("button", { name: /^Inscribir y cobrar/ })).toBeEnabled();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    const pregunta = within(panel()).getByRole("region", { name: "Faltan fotos" });
    expect(pregunta).toHaveTextContent("Faltan 2 fotos.");
    expect(pregunta).toHaveTextContent("el estudiante queda con «Faltan fotos» y aparece en el Panel de control");
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
    fireEvent.click(within(pregunta).getByRole("button", { name: "Cargar las fotos" }));
    expect(within(panel()).queryByRole("region", { name: "Faltan fotos" })).not.toBeInTheDocument();
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
  });

  it("D3: «Inscribir sin fotos» manda fotosPendientes y, al cobrar, sigue de largo con el monto", async () => {
    vi.mocked(apiAcademia.inscribir).mockResolvedValue({ id: 555, fotosPendientes: true, fotosFaltan: ["CI_ANVERSO", "CI_REVERSO"] } as never);
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    await act(async () => subir("FOTO"));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar Bs\s?750/ }));
    });
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(within(panel()).getByRole("region", { name: "Faltan fotos" })).getByRole("button", { name: "Inscribir sin fotos" }));
    });
    const [pedido, fotos] = vi.mocked(apiAcademia.inscribir).mock.calls[0];
    expect(pedido).toMatchObject({ fotosPendientes: true });
    expect(Object.keys(fotos!)).toEqual(["FOTO"]);
    expect(onInscrito).toHaveBeenCalledWith({
      inscripcion: { id: 555, fotosPendientes: true, fotosFaltan: ["CI_ANVERSO", "CI_REVERSO"] },
      cobrar: true,
      montoHoy: 750,
    });
  });

  it("D3: con el ajuste apagado no hay fotos, ni pregunta, ni fotosPendientes", async () => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: false }));
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    expect(within(panel()).queryByText(/Fotos obligatorias/)).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).queryByRole("region", { name: "Faltan fotos" })).not.toBeInTheDocument();
    expect(vi.mocked(apiAcademia.inscribir).mock.calls[0][0]).not.toHaveProperty("fotosPendientes");
  });

  it("un estudiante ya cargado con sus fotos no tiene que sacarlas otra vez", async () => {
    vi.mocked(apiAcademia.alumno).mockResolvedValue({
      ...fichaCamila(),
      fotos: (["FOTO", "CI_ANVERSO", "CI_REVERSO"] as const).map((tipo) => ({ tipo, subidaEn: "2026-08-17", revisadaEn: null, revisadaPor: null, observacion: null })),
    });
    render(
      <MemoryRouter>
        <Inscribir grupoInicial={{ id: 7, nombre: "Barbería" }} alumnoInicial={{ id: 52, nombre: "Bustillos Rek, Camila" }} onCerrar={vi.fn()} onInscrito={onInscrito} />
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(within(panel()).getAllByText("Ya cargada")).toHaveLength(3);
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    expect(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" })).toBeEnabled();
    expect(within(panel()).getByText("Las 3 fotos")).toBeInTheDocument();
  });

  it("el 400 FOTOS_REQUERIDAS marca las que faltan", async () => {
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(
      new ApiError("Faltan fotos", 400, { codigo: "FOTOS_REQUERIDAS", faltan: ["CI_REVERSO"] }),
    );
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    for (const t of ["FOTO", "CI_ANVERSO", "CI_REVERSO"]) await act(async () => subir(t));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).getByText(/Falta 1 foto: sacalas/)).toBeInTheDocument();
  });
});

describe("A2 · inscribir en menos pasos", () => {
  it("el paso 4 es «Plan de pago» con «Mes a mes» ya elegido, y el resumen dice que faltan los datos", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(
      grupoDetalle({
        planesOfrecidos: [
          { ...PLAN_COMPLETO, generado: "COMPLETO" },
          { ...PLAN_CUOTAS, nombre: "Mes a mes", generado: "MES_A_MES" },
        ],
      }),
    );
    await montar();
    expect(within(panel()).getByRole("heading", { name: /Plan de pago/ })).toBeInTheDocument();
    expect(within(panel()).queryByText(/Forma de pago/)).not.toBeInTheDocument();
    expect(within(panel()).getByRole("radio", { name: /Mes a mes/ })).toHaveAttribute("aria-checked", "true");
    // Sin nada escrito no dice "Datos completos" (UX 2b).
    const requisitos = within(panel()).getByRole("list", { name: "Requisitos" });
    expect(requisitos).toHaveTextContent("Faltan los datos");
    await cargarNuevo("2000-01-01");
    expect(requisitos).toHaveTextContent("Datos completos");
    // "Paga hoy" es la única pregunta por el monto: va tal cual al cobro.
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar Bs\s?750/ }));
    });
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 555 }, cobrar: true, montoHoy: 750 });
  });
});

describe("A3 · las fotos que revisa quien las aprueba", () => {
  beforeEach(() => {
    vi.mocked(apiAcademia.ajustes).mockResolvedValue(ajustesDePrueba({ fotosObligatorias: true }));
    vi.mocked(apiAcademia.inscribir).mockResolvedValue({ id: 555, alumnoId: 61 } as never);
    vi.mocked(apiAcademia.revisarFotos).mockResolvedValue({});
  });

  const subirLas3 = async () => {
    for (const tipo of ["FOTO", "CI_ANVERSO", "CI_REVERSO"]) {
      await act(async () =>
        fireEvent.change(screen.getByTestId("subir-" + tipo), {
          target: { files: [new File(["x"], tipo + ".jpg", { type: "image/jpeg" })] },
        }),
      );
    }
  };

  it("con academia.fotos el check viene marcado y al inscribir quedan aprobadas", async () => {
    quien.admin = true;
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await subirLas3();
    expect(within(panel()).getByRole("checkbox", { name: /Revisé las 3 fotos/ })).toBeChecked();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.revisarFotos).toHaveBeenCalledWith(61, { ok: true });
    expect(onInscrito).toHaveBeenCalled();
  });

  it("si lo desmarca, siguen por revisar", async () => {
    quien.admin = true;
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await subirLas3();
    fireEvent.click(within(panel()).getByRole("checkbox", { name: /Revisé las 3 fotos/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.revisarFotos).not.toHaveBeenCalled();
  });

  it("la recepción (sin academia.fotos) no ve el check: el camino de siempre", async () => {
    await montar();
    await cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await subirLas3();
    expect(within(panel()).queryByRole("checkbox", { name: /Revisé las 3 fotos/ })).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(apiAcademia.revisarFotos).not.toHaveBeenCalled();
  });
});

describe("QA 23-oct · vencimientos de «Mes a mes» como los calcula el backend", () => {
  it("con el grupo que empieza el 10-nov, la primera vence el 10-nov y no «hoy»", async () => {
    const base = grupoDetalle();
    vi.mocked(apiAcademia.grupo).mockResolvedValue(
      grupoDetalle({
        fechaInicio: "2026-11-10",
        materiasGrupo: base.materiasGrupo.map((m, i) => ({ ...m, desde: ["2026-11-10", "2026-12-10", "2027-01-10"][i] })),
        planesOfrecidos: [
          {
            ...PLAN_CUOTAS,
            nombre: "Mes a mes",
            generado: "MES_A_MES",
            calendario: [1, 2, 3].map((o) => ({ n: o, monto: 500, vence: { tipo: "INICIO_MATERIA" as const, materiaOrden: o }, cubre: [o] })),
          },
        ],
      }),
    );
    await montar();
    const plan = within(panel()).getByRole("radio", { name: /Mes a mes/ });
    expect(plan).toHaveTextContent("M1 10-nov · M2 10-dic · M3 10-ene");
    expect(plan).not.toHaveTextContent("M1 hoy");
  });

  it("con el módulo ya empezado, «hoy»", async () => {
    vi.mocked(apiAcademia.grupo).mockResolvedValue(
      grupoDetalle({
        planesOfrecidos: [
          {
            ...PLAN_CUOTAS,
            nombre: "Mes a mes",
            generado: "MES_A_MES",
            calendario: [2, 3].map((o) => ({ n: o - 1, monto: 500, vence: { tipo: "INICIO_MATERIA" as const, materiaOrden: o }, cubre: [o] })),
          },
        ],
      }),
    );
    await montar();
    expect(within(panel()).getByRole("radio", { name: /Mes a mes/ })).toHaveTextContent("M2 hoy · M3 17-oct");
  });
});
