import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CursoPublico } from "../../lib/academia/tipos";

/**
 * P2 y P3 · Inscribirme (ronda 2): 4 pasos —curso y horario, datos como en el
 * carnet (y el tutor si es menor), las 3 fotos y la forma de pago— y la
 * confirmación con el primer pago. Sin captcha en el test (el build no trae
 * la site key).
 */

/** La página sin publicar: `GET /publico/pagina/<sub>` da 404 (QA 23-oct). */
const paginaMock = vi.hoisted(() => ({ error: null as string | null }));

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({
    pagina: paginaMock.error ? null : {
      subdominio: "horizonte",
      nombre: "CCTP Horizonte",
      color: { clave: "INDIGO", hex: "#3B42A9" },
      destacado: null,
      botones: [{ id: 1, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170000000", icono: null }],
      redes: [],
    },
    error: paginaMock.error,
  }),
}));

vi.mock("../../lib/academia/apiPublica", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiPublica")>();
  return { ...real, apiAcademiaPublica: { cursos: vi.fn(), preinscribir: vi.fn() } };
});

import { apiAcademiaPublica, ErrorPublico } from "../../lib/academia/apiPublica";
import InscribirmePagina from "./InscribirmePagina";

// El canvas no existe en jsdom: la foto "achicada" es el mismo archivo.
vi.mock("../../lib/academia/fotos", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/fotos")>();
  return { ...real, prepararFoto: vi.fn(async (f: File) => new Blob([f], { type: "image/webp" })) };
});

const CURSO: CursoPublico = {
  id: 3,
  nombre: "Barbería y Peluquería",
  descripcion: null,
  horasTotales: 120,
  fotoUrl: null,
  materias: ["Corte clásico", "Degradados", "Barba y color"],
  desde: 500,
  precioModulo: 500,
  precioCompleto: 1350,
  ahorro: 150,
  modulos: ["Corte clásico", "Degradados", "Barba y color"],
  planes: [
    { id: 1, nombre: "Mes a mes", generado: "MES_A_MES" },
    { id: 2, nombre: "Pago completo", generado: "COMPLETO" },
  ],
  grupos: [
    { id: 21, sede: { id: 1, nombre: "Central" }, dias: [1, 2, 3, 4, 5], horaInicio: "19:00", horaFin: "21:00", fechaInicio: "2026-11-03", cuposLibres: 16 },
    { id: 22, sede: { id: 2, nombre: "Norte" }, dias: [6], horaInicio: "08:00", horaFin: "12:00", fechaInicio: "2026-11-08", cuposLibres: 8 },
  ],
};

async function montar(grupo = 22) {
  render(
    <MemoryRouter initialEntries={[`/p/horizonte/inscribirme/${grupo}`]}>
      <Routes>
        <Route path="/p/:subdominio/inscribirme/:grupoId" element={<InscribirmePagina />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  paginaMock.error = null;
  vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([CURSO]);
  vi.mocked(apiAcademiaPublica.preinscribir).mockResolvedValue({
    ok: true,
    grupo: { nombre: "Barbería · Sáb 08:00", sede: "Norte", fechaInicio: "2026-11-08", direccion: "Av. Banzer, 4.º anillo" },
  });
});

describe("P2 · Inscribirme en 4 pasos", () => {
  it("paso 1: viene elegido el horario del enlace, con los módulos y el precio", async () => {
    await montar();
    expect(screen.getByText(/Paso 1 de 4/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "¿Qué querés estudiar?" })).toBeInTheDocument();
    expect(screen.getByText("Barbería y Peluquería · 3 módulos")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Sábado/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Lunes a viernes/ })).toHaveAttribute("aria-checked", "false");
  });

  it("no avanza sin los datos, y con las 3 fotos las envía todas en el multipart", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // Paso 2: los datos como en el carnet; menor → tutor.
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Rojas Lima" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Thiago" } });
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento (opcional)"), { target: { value: "2011-03-12" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    expect(screen.getByText(/datos de tu madre, padre o tutor/)).toBeInTheDocument();
    // "Faltan", no "Falta los datos" (QA ronda 2, B-29).
    expect(screen.getByText(/Faltan los datos de tu tutor/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del tutor"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("Su WhatsApp"), { target: { value: "77788991" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // Paso 3: las fotos.
    expect(screen.getByRole("heading", { name: "Tus fotos" })).toBeInTheDocument();
    // M4: faltan, pero no bloquean.
    expect(screen.getByText(/Faltan 3 fotos\. Podés seguir sin ellas/)).toBeInTheDocument();
    for (const t of ["FOTO", "CI_ANVERSO", "CI_REVERSO"]) {
      await act(async () => {
        fireEvent.change(screen.getByTestId("subir-" + t), { target: { files: [new File(["x"], t + ".jpg", { type: "image/jpeg" })] } });
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // Paso 4: la forma de pago, con lo que ahorra.
    expect(screen.getByRole("radio", { name: /Pago completo/ })).toHaveTextContent("Ahorrás Bs 150");
    fireEvent.click(screen.getByRole("radio", { name: /Pago completo/ }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    const [sub, input, fotos] = vi.mocked(apiAcademiaPublica.preinscribir).mock.calls[0];
    expect(sub).toBe("horizonte");
    expect(input).toEqual(
      expect.objectContaining({
        grupoId: 22,
        ci: "14550221",
        ciExpedido: "SC",
        fechaNacimiento: "2011-03-12",
        tutor: { nombre: "Ana Lima", telefono: "77788991" },
        planPagoId: 2,
        privacidad: true,
      }),
    );
    expect(Object.keys(fotos ?? {}).sort()).toEqual(["CI_ANVERSO", "CI_REVERSO", "FOTO"]);
    // P3: la confirmación con el primer pago y dónde pagarlo.
    expect(screen.getByRole("heading", { name: "¡Listo, Thiago!" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tu primer pago" })).toHaveTextContent(/Bs 1\.350/);
    expect(screen.getByRole("region", { name: "Tu primer pago" })).toHaveTextContent(/Av\. Banzer/);
    // Con las 3 fotos, no hay nada que traer.
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    // M5: se puede pagar ahora mismo, con el carnet.
    expect(screen.getByRole("link", { name: "Pagar mi inscripción" })).toHaveAttribute("href", "/p/horizonte/mi-cuenta");
    expect(screen.getByText("Quedaste preinscrito. Para asegurar tu cupo, pagá lo que corresponde.")).toBeInTheDocument();
  });

  async function llenarDatosYSeguir() {
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Paz" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento (opcional)"), { target: { value: "2000-01-01" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  }

  it("M4: las fotos son opcionales: se puede seguir sin ninguna y se envía sin ellas", async () => {
    await montar();
    await llenarDatosYSeguir();
    expect(screen.getByRole("heading", { name: "Tus fotos" })).toBeInTheDocument();
    expect(screen.queryByText(/Son obligatorias/)).not.toBeInTheDocument();
    const seguir = screen.getByRole("button", { name: "Seguir sin fotos" });
    expect(seguir).toBeEnabled();
    fireEvent.click(seguir);
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    const [, , fotos] = vi.mocked(apiAcademiaPublica.preinscribir).mock.calls[0];
    expect(Object.keys(fotos ?? {})).toEqual([]);
    // El aviso final: el cupo se asegura pagando, y las fotos que faltan se traen o se mandan.
    expect(screen.getByRole("heading", { name: "¡Listo, Ana!" })).toBeInTheDocument();
    expect(screen.getByText("Quedaste preinscrito. Para asegurar tu cupo, pagá lo que corresponde.")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(
      "No subiste foto, carnet de adelante y carnet de atrás. Traé esas fotos cuando vengas a pagar o mandalas por WhatsApp",
    );
  });

  it("Derick, 04-nov: el paso de pago avisa que se puede asegurar el cupo con una parte", async () => {
    vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([
      { ...CURSO, grupos: [CURSO.grupos[0], { ...CURSO.grupos[1], adelantoDesde: 300 }] },
    ]);
    await montar();
    await llenarDatosYSeguir();
    fireEvent.click(screen.getByRole("button", { name: "Seguir sin fotos" }));
    expect(screen.getByRole("note")).toHaveTextContent("¿No podés pagar todo ahora? Asegurás tu cupo pagando una parte, desde Bs 300.");
    expect(screen.getByText("Después de enviar podés pagar desde esta página, todo o una parte, o en el instituto.")).toBeInTheDocument();
  });

  it("sin adelanto, el paso de pago no lo menciona", async () => {
    await montar();
    await llenarDatosYSeguir();
    fireEvent.click(screen.getByRole("button", { name: "Seguir sin fotos" }));
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    expect(screen.getByText("Después de enviar podés pagar desde esta página o en el instituto.")).toBeInTheDocument();
  });

  it("M4: con algunas fotos, el aviso final nombra sólo las que faltan", async () => {
    await montar();
    await llenarDatosYSeguir();
    await act(async () => {
      fireEvent.change(screen.getByTestId("subir-FOTO"), { target: { files: [new File(["x"], "f.jpg", { type: "image/jpeg" })] } });
    });
    // Con una subida, el botón vuelve a ser «Siguiente».
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    const [, , fotos] = vi.mocked(apiAcademiaPublica.preinscribir).mock.calls[0];
    expect(Object.keys(fotos ?? {})).toEqual(["FOTO"]);
    expect(screen.getByRole("note")).toHaveTextContent("No subiste carnet de adelante y carnet de atrás.");
  });

  it("si el backend dice que faltan fotos, vuelve al paso de las fotos", async () => {
    vi.mocked(apiAcademiaPublica.preinscribir).mockRejectedValueOnce(
      new ErrorPublico("Faltan fotos", 400, "FOTOS_REQUERIDAS", { faltan: ["CI_REVERSO"] }),
    );
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Paz" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento (opcional)"), { target: { value: "2000-01-01" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    for (const t of ["FOTO", "CI_ANVERSO", "CI_REVERSO"]) {
      await act(async () => {
        fireEvent.change(screen.getByTestId("subir-" + t), { target: { files: [new File(["x"], t + ".jpg", { type: "image/jpeg" })] } });
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    expect(screen.getByRole("heading", { name: "Tus fotos" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Falta 1 foto");
  });
});

describe("la página sin publicar (QA 23-oct)", () => {
  it("dice lo mismo que /p/<sub> en vez de quedar en blanco, aunque los cursos carguen", async () => {
    paginaMock.error = "Esta página no está disponible";
    await montar();
    expect(screen.getByRole("heading", { name: "Esta página no está disponible" })).toBeInTheDocument();
  });
});

describe("L4 · la fecha de nacimiento (28-oct)", () => {
  it("una fecha futura se dice en el campo, no deja seguir y no pide tutor como «menor»", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Rojas Lima" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Thiago" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    const fecha = screen.getByLabelText(/Fecha de nacimiento/);
    expect(fecha).toHaveAttribute("min");
    expect(fecha).toHaveAttribute("max");
    fireEvent.change(fecha, { target: { value: "2099-05-01" } });
    expect(fecha).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText(/La fecha de nacimiento no puede ser posterior a hoy/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Sos menor de edad/)).not.toBeInTheDocument();
    expect(screen.queryByText(/datos de tu madre, padre o tutor/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    // De más de 100 años, tampoco.
    fireEvent.change(fecha, { target: { value: "1900-01-01" } });
    expect(screen.getAllByText(/más de 100 años/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    // Bien escrita, sigue.
    fireEvent.change(fecha, { target: { value: "2000-01-01" } });
    expect(fecha).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  });
});

describe("M5 · un grupo lleno ya no recibe preinscripciones", () => {
  const LLENO: CursoPublico = {
    ...CURSO,
    grupos: [
      { ...CURSO.grupos[0], cuposLibres: 0 },
      { ...CURSO.grupos[1], cuposLibres: 8 },
    ],
  };

  it("no se puede elegir: se ve «lleno» y el botón avisa que se comunique con la academia", async () => {
    vi.mocked(apiAcademiaPublica.cursos).mockResolvedValue([LLENO]);
    await montar(21);
    const lleno = screen.getByRole("radio", { name: /Lunes a viernes/ });
    expect(lleno).toHaveAttribute("aria-disabled", "true");
    expect(lleno).toHaveTextContent("lleno");
    // El del enlace estaba lleno: no se puede seguir con ése.
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(screen.getByText(/Ese grupo está lleno, comunicate con la academia/)).toBeInTheDocument();
    // Tocar el lleno no lo elige; el otro sí.
    fireEvent.click(lleno);
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /Sábado/ }));
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
  });

  it("si se llenó mientras completaba, el servidor lo dice y vuelve a elegir horario", async () => {
    vi.mocked(apiAcademiaPublica.preinscribir).mockRejectedValueOnce(
      new ErrorPublico("El grupo está lleno, comunicate con la academia.", 409, "GRUPO_LLENO"),
    );
    await montar();
    await llenarDatosYSeguirM5();
    fireEvent.click(screen.getByRole("button", { name: "Seguir sin fotos" }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    expect(screen.getByRole("heading", { name: "¿Qué querés estudiar?" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("El grupo está lleno, comunicate con la academia");
  });

  async function llenarDatosYSeguirM5() {
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Paz" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento (opcional)"), { target: { value: "2000-01-01" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  }
});

describe("la fecha de nacimiento es opcional (03-nov)", () => {
  it("sin la fecha se sigue y se envía sin ella: «Pagar mi inscripción» entra sólo con el carnet", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Paz" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Ana" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    expect(screen.queryByText(/Falta.*fecha de nacimiento/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir sin fotos" }));
    fireEvent.click(screen.getByRole("checkbox"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Enviar inscripción" }));
    });
    const [, input] = vi.mocked(apiAcademiaPublica.preinscribir).mock.calls[0];
    expect(input).not.toHaveProperty("fechaNacimiento");
    expect(input).not.toHaveProperty("edad");
    expect(screen.getByRole("heading", { name: "¡Listo, Ana!" })).toBeInTheDocument();
  });
});
