import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ajustesDePrueba, fichaCamila, grupoDetalle } from "../../test/academiaFixtures";

/**
 * E5 · Inscribir: alumno nuevo con tutor si es menor, el plan con su
 * calendario, la beca o promoción con PIN sobre el tope, y el grupo lleno que
 * se confirma y se reintenta.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  return { useAuth: () => ({ ...s, puede: () => true }) };
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

function cargarNuevo(fechaNacimiento: string) {
  fireEvent.click(within(panel()).getByRole("button", { name: "Nuevo estudiante" }));
  fireEvent.change(within(panel()).getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
  fireEvent.change(within(panel()).getByLabelText("Apellidos"), { target: { value: "Céspedes Molina" } });
  fireEvent.change(within(panel()).getByLabelText("Nombres"), { target: { value: "Joaquín" } });
  fireEvent.change(within(panel()).getByLabelText(/Fecha de nacimiento/), { target: { value: fechaNacimiento } });
}

beforeEach(() => {
  vi.clearAllMocks();
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
    cargarNuevo("2011-03-12");
    expect(within(panel()).getByText(/Tutor · obligatorio/)).toBeInTheDocument();
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    // El calendario del plan a la vista, sin renglón de matrícula.
    expect(within(panel()).getAllByText(/M2–M3 · al empezar M2/).length).toBeGreaterThan(0);
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
    cargarNuevo("2000-01-01");
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
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Aplicar otro descuento o beca" }));
    fireEvent.click(within(panel()).getByRole("button", { name: "Beca" }));
    fireEvent.change(within(panel()).getByLabelText("Descuento"), { target: { value: "50" } });
    fireEvent.change(within(panel()).getByLabelText("Motivo"), { target: { value: "Situación económica" } });
    expect(within(panel()).getByText(/Total del curso/).parentElement).toHaveTextContent(/680/);
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    const pin = screen.getByRole("dialog", { name: "Autorización del encargado" });
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
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    const confirmar = screen.getByRole("dialog", { name: "El grupo está lleno" });
    expect(confirmar).toHaveTextContent("Tiene 30 inscritos y el cupo es de 30");
    await act(async () => {
      fireEvent.click(within(confirmar).getByRole("button", { name: "Inscribir igual" }));
    });
    expect(apiAcademia.inscribir).toHaveBeenLastCalledWith(expect.objectContaining({ confirmarSobreCupo: true }), {});
    expect(onInscrito).toHaveBeenCalledWith({ inscripcion: { id: 556 }, cobrar: false });
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

  it("un CI que ya es de otro ofrece buscarlo en vez de crearlo otra vez", async () => {
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(
      new ApiError("Ese carnet ya es de otra persona del negocio.", 409, { codigo: "CI_DUPLICADO" }),
    );
    await montar();
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).getByRole("alert")).toHaveTextContent("Ese carnet ya es de otra persona del negocio.");
    fireEvent.click(within(panel()).getByRole("button", { name: "Buscarlo" }));
    expect(within(panel()).getByLabelText("Buscar estudiante")).toHaveValue("14550221");
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
      fireEvent.click(within(screen.getByRole("dialog", { name: "El grupo está lleno" })).getByRole("button", { name: "Inscribir igual" }));
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
    cargarNuevo("2000-01-01");
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
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("button", { name: /Inscribir y cobrar/ }));
    expect(within(pie()).getByRole("alert")).toHaveTextContent("Elegí cómo paga.");
    expect(apiAcademia.inscribir).not.toHaveBeenCalled();
    fireEvent.click(within(panel()).getByRole("radio", { name: /Cuotas/ }));
    expect(within(pie()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un adelanto negativo se marca en el campo y no inscribe; uno válido viaja al cobro", async () => {
    await montar();
    cargarNuevo("2000-01-01");
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
    cargarNuevo("2000-01-01");
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

  it("sin las 3 el botón dice cuántas faltan y no inscribe; con las 3 viajan en el pedido", async () => {
    await montar();
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    expect(within(panel()).getByRole("button", { name: "Faltan 3 fotos" })).toBeDisabled();
    expect(within(panel()).getByText("Fotos: 0 de 3")).toBeInTheDocument();
    await act(async () => subir("FOTO"));
    await act(async () => subir("CI_ANVERSO"));
    expect(within(panel()).getByRole("button", { name: "Falta 1 foto" })).toBeDisabled();
    await act(async () => subir("CI_REVERSO"));
    expect(within(panel()).getByText("Las 3 fotos")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    const fotos = vi.mocked(apiAcademia.inscribir).mock.calls[0][1]!;
    expect(Object.keys(fotos).sort()).toEqual(["CI_ANVERSO", "CI_REVERSO", "FOTO"]);
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
  });

  it("el 400 FOTOS_REQUERIDAS marca las que faltan", async () => {
    vi.mocked(apiAcademia.inscribir).mockRejectedValueOnce(
      new ApiError("Faltan fotos", 400, { codigo: "FOTOS_REQUERIDAS", faltan: ["CI_REVERSO"] }),
    );
    await montar();
    cargarNuevo("2000-01-01");
    fireEvent.click(within(panel()).getByRole("radio", { name: /Completo/ }));
    for (const t of ["FOTO", "CI_ANVERSO", "CI_REVERSO"]) await act(async () => subir(t));
    await act(async () => {
      fireEvent.click(within(panel()).getByRole("button", { name: "Inscribir sin cobrar" }));
    });
    expect(within(panel()).getByText(/Falta 1 foto: sacalas/)).toBeInTheDocument();
  });
});
