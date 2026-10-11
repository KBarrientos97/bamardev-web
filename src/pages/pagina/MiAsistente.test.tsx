import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResumenAsistente } from "../../lib/chat/apiAsistente";

vi.mock("../../lib/chat/apiAsistente", () => ({
  apiAsistente: {
    resumen: vi.fn(),
    crearPregunta: vi.fn(),
    editarPregunta: vi.fn(),
    borrarPregunta: vi.fn(),
    descartarConsulta: vi.fn(),
    marcarLeido: vi.fn(),
    borrarMensaje: vi.fn(),
  },
}));

import { apiAsistente } from "../../lib/chat/apiAsistente";
import MiAsistente from "./MiAsistente";

/** "Mi asistente": lo que el dueño ve y hace con el chat de su página. */

const RESUMEN: ResumenAsistente = {
  preguntas: [{ id: 1, pregunta: "¿Aceptan QR?", palabrasClave: "qr, tarjeta", respuesta: "Sí, QR y efectivo.", orden: 0 }],
  sinRespuesta: [{ id: 7, texto: "tienen parqueo", veces: 12, ultimaVez: "2026-10-11T12:00:00.000Z" }],
  mensajes: [
    { id: 3, nombre: "Ana Pérez", telefono: "70012345", mensaje: "¿Atienden el domingo?", leido: false, creadoEn: "2026-10-11T13:00:00.000Z" },
  ],
  noLeidos: 1,
  uso: {
    mes: { conversaciones: 87, mensajes: 240, sinRespuesta: 20, conHoras: 31, mensajesDejados: 4 },
    dias: [],
  },
};

async function abrir() {
  render(
    <MemoryRouter>
      <MiAsistente />
    </MemoryRouter>,
  );
  await act(async () => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAsistente.resumen).mockResolvedValue(RESUMEN);
});

describe("Mi asistente", () => {
  it("muestra el uso del mes, los mensajes, lo que no entendió y las preguntas", async () => {
    await abrir();
    expect(screen.getByText("87")).toBeInTheDocument();
    expect(screen.getByText("220")).toBeInTheDocument();
    expect(screen.getAllByText("1 sin leer").length).toBeGreaterThan(0);
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "70012345" })).toHaveAttribute("href", "https://wa.me/59170012345");
    expect(screen.getByText("«tienen parqueo»")).toBeInTheDocument();
    expect(screen.getByText("12 veces")).toBeInTheDocument();
    expect(screen.getByText("¿Aceptan QR?")).toBeInTheDocument();
  });

  it("«Enseñarle» convierte lo que no entendió en pregunta frecuente", async () => {
    vi.mocked(apiAsistente.crearPregunta).mockResolvedValue({ ...RESUMEN.preguntas[0]!, id: 2 });
    await abrir();
    fireEvent.click(screen.getByRole("button", { name: "Enseñarle" }));
    expect(screen.getByLabelText("Pregunta")).toHaveValue("tienen parqueo");
    fireEvent.change(screen.getByLabelText("Respuesta"), { target: { value: "Sí, en la puerta." } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    });
    expect(apiAsistente.crearPregunta).toHaveBeenCalledWith({
      pregunta: "tienen parqueo",
      palabrasClave: "",
      respuesta: "Sí, en la puerta.",
    });
    expect(apiAsistente.resumen).toHaveBeenCalledTimes(2);
  });

  it("marca leído y descarta", async () => {
    vi.mocked(apiAsistente.marcarLeido).mockResolvedValue(undefined);
    vi.mocked(apiAsistente.descartarConsulta).mockResolvedValue(undefined);
    await abrir();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Marcar leído" }));
    });
    expect(apiAsistente.marcarLeido).toHaveBeenCalledWith(3);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Descartar «tienen parqueo»" }));
    });
    expect(apiAsistente.descartarConsulta).toHaveBeenCalledWith(7);
  });
});
