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

vi.mock("../../lib/pagina/usePaginaPublica", () => ({
  usePaginaPublica: () => ({
    pagina: {
      subdominio: "horizonte",
      nombre: "CCTP Horizonte",
      color: { clave: "INDIGO", hex: "#3B42A9" },
      destacado: null,
      botones: [{ id: 1, tipo: "WHATSAPP", etiqueta: "WhatsApp", url: "https://wa.me/59170000000", icono: null }],
      redes: [],
    },
    error: null,
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

  it("no avanza sin los datos ni sin las 3 fotos, y envía todo en el multipart", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // Paso 2: los datos como en el carnet; menor → tutor.
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Carnet de identidad"), { target: { value: "14550221" } });
    fireEvent.change(screen.getByLabelText("Apellidos"), { target: { value: "Rojas Lima" } });
    fireEvent.change(screen.getByLabelText("Nombres"), { target: { value: "Thiago" } });
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "2011-03-12" } });
    fireEvent.change(screen.getByLabelText("WhatsApp"), { target: { value: "77788990" } });
    expect(screen.getByText(/datos de tu madre, padre o tutor/)).toBeInTheDocument();
    expect(screen.getByText(/Falta los datos de tu tutor/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Nombre del tutor"), { target: { value: "Ana Lima" } });
    fireEvent.change(screen.getByLabelText("Su WhatsApp"), { target: { value: "77788991" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    // Paso 3: las fotos.
    expect(screen.getByRole("heading", { name: "Tus fotos" })).toBeInTheDocument();
    expect(screen.getByText("Faltan 3 fotos")).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText("Fecha de nacimiento"), { target: { value: "2000-01-01" } });
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
