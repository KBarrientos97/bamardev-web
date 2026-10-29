import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../lib/api";
import type { FranjasDeSede, ResultadoTipicas } from "../../../lib/academia/tipos";

/**
 * C5 · las franjas horarias de una sede: lista editable que se guarda con un
 * botón (el backend reemplaza la lista), «Usar las típicas» con su resumen, y
 * los rechazos del backend (franjas inválidas, guardado simultáneo).
 */

vi.mock("../../../store/AuthContext", async () => {
  const { SESION_ADMIN } = await import("../../../test/academiaFixtures");
  return { useAuth: () => ({ ...SESION_ADMIN, puede: () => true }) };
});

vi.mock("../../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../lib/academia/apiAcademia")>();
  return {
    ...real,
    apiAcademia: { franjasSede: vi.fn(), guardarFranjasSede: vi.fn(), franjasTipicas: vi.fn(), calendario: vi.fn() },
  };
});

import { apiAcademia } from "../../../lib/academia/apiAcademia";
import SedeFranjas from "./SedeFranjas";

const sede = { id: 1, nombre: "Central" };
const vista = (...f: [string, string, boolean?][]): FranjasDeSede => ({
  sede,
  franjas: f.map(([inicio, fin, todas]) => ({ inicio, fin, todasLasSedes: !!todas })),
});
const eco = async (_id: number, f: { inicio: string; fin: string }[]) => vista(...f.map((x) => [x.inicio, x.fin] as [string, string]));

const alCambiar = vi.fn();

async function montar(puedeEditar = true) {
  render(
    <MemoryRouter>
      <SedeFranjas sedeId={1} puedeEditar={puedeEditar} onCambio={alCambiar} />
    </MemoryRouter>,
  );
  await act(async () => {});
}

const cambiar = (etiqueta: string, valor: string) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
const guardar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar franjas" }));
  });
};
const tipicas = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Usar las típicas" }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiAcademia.franjasSede).mockResolvedValue(vista(["08:00", "10:00"], ["19:00", "21:00"]));
  vi.mocked(apiAcademia.guardarFranjasSede).mockImplementation(eco);
  vi.mocked(apiAcademia.calendario).mockResolvedValue({
    sede: 1,
    meses: ["2026-11"],
    filas: [
      {
        inicio: "19:00",
        fin: "21:00",
        esFranja: true,
        celdas: [{ mes: "2026-11", grupos: [{ grupoId: 7 }] }],
      },
    ],
  } as never);
});

describe("C5 · editar las franjas de la sede", () => {
  it("muestra las de la sede con su duración y cuántos grupos las usan", async () => {
    await montar();
    expect(screen.getByLabelText("Desde, franja 1")).toHaveValue("08:00");
    expect(screen.getByLabelText("Hasta, franja 2")).toHaveValue("21:00");
    expect(screen.getByText(/1 grupo$/)).toBeInTheDocument();
    expect(screen.getAllByText(/libre/)).toHaveLength(1);
    // Una franja con grupos no se quita.
    expect(screen.getByRole("button", { name: "Quitar franja 19:00–21:00" })).toBeDisabled();
  });

  it("editar una hora no guarda sola: avisa que hay cambios y el botón manda la lista completa", async () => {
    await montar();
    expect(screen.getByRole("button", { name: "Guardar franjas" })).toBeDisabled();
    cambiar("Hasta, franja 1", "11:00");
    expect(apiAcademia.guardarFranjasSede).not.toHaveBeenCalled();
    expect(screen.getByText(/cambios sin guardar/)).toBeInTheDocument();
    await guardar();
    expect(apiAcademia.guardarFranjasSede).toHaveBeenCalledWith(1, [
      { inicio: "08:00", fin: "11:00" },
      { inicio: "19:00", fin: "21:00" },
    ]);
    expect(screen.getByText("Franjas guardadas.")).toBeInTheDocument();
    expect(alCambiar).toHaveBeenCalled();
    expect(screen.queryByText(/cambios sin guardar/)).not.toBeInTheDocument();
  });

  it("agregar suma 2 horas después de la última; quitar saca la fila; descartar vuelve a lo guardado", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Agregar franja/ }));
    expect(screen.getByLabelText("Desde, franja 3")).toHaveValue("21:00");
    expect(screen.getByLabelText("Hasta, franja 3")).toHaveValue("23:00");
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" }));
    expect(screen.queryByLabelText("Desde, franja 3")).not.toBeInTheDocument();
    await guardar();
    expect(apiAcademia.guardarFranjasSede).toHaveBeenCalledWith(1, [
      { inicio: "19:00", fin: "21:00" },
      { inicio: "21:00", fin: "23:00" },
    ]);

    cambiar("Hasta, franja 1", "20:00");
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByLabelText("Hasta, franja 1")).toHaveValue("21:00");
  });

  it("quitar la última franja deja la guía de «sin franjas»", async () => {
    vi.mocked(apiAcademia.franjasSede).mockResolvedValue(vista(["08:00", "10:00"]));
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" }));
    expect(screen.getByText(/todavía no tiene franjas/)).toBeInTheDocument();
  });

  it("ronda 1 · W1: quitar todas las franjas se puede guardar (PUT []) o descartar", async () => {
    vi.mocked(apiAcademia.franjasSede).mockResolvedValue(vista(["08:00", "10:00"], ["10:00", "12:00"]));
    vi.mocked(apiAcademia.guardarFranjasSede).mockResolvedValue(vista());
    await montar();
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 10:00–12:00" }));
    // Sin filas pero con el cambio pendiente: Guardar y Descartar siguen ahí.
    expect(screen.getByText(/Quitaste todas: al guardar, queda sin ninguna/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descartar cambios" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByLabelText("Desde, franja 2")).toHaveValue("10:00");
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar franja 10:00–12:00" }));
    await guardar();
    expect(apiAcademia.guardarFranjasSede).toHaveBeenCalledWith(1, []);
  });

  it("una franja al revés o que se pisa no se manda: se marca la fila y se dice por qué", async () => {
    await montar();
    cambiar("Desde, franja 2", "09:00");
    await guardar();
    expect(apiAcademia.guardarFranjasSede).not.toHaveBeenCalled();
    expect(screen.getByText(/08:00–10:00 y 09:00–21:00 se pisan/)).toBeInTheDocument();
    expect(screen.getByLabelText("Desde, franja 1")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Desde, franja 2")).toHaveAttribute("aria-invalid", "true");

    cambiar("Desde, franja 2", "19:00");
    cambiar("Hasta, franja 1", "07:00");
    await guardar();
    expect(apiAcademia.guardarFranjasSede).not.toHaveBeenCalled();
    expect(screen.getByText(/tiene que empezar antes de terminar/)).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta, franja 1")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Hasta, franja 2")).not.toHaveAttribute("aria-invalid");
  });
});

describe("C5 · franjas vacías y «Usar las típicas»", () => {
  const TIPICAS: ResultadoTipicas = {
    ...vista(["08:00", "10:00"], ["10:00", "12:00"], ["14:00", "16:00"], ["16:00", "18:00"], ["19:00", "21:00"]),
    agregadas: [
      { inicio: "08:00", fin: "10:00" },
      { inicio: "10:00", fin: "12:00" },
    ],
    omitidas: [],
  };

  it("sin franjas hay una guía y el botón de las típicas está a mano", async () => {
    vi.mocked(apiAcademia.franjasSede).mockResolvedValue(vista());
    vi.mocked(apiAcademia.franjasTipicas).mockResolvedValue(TIPICAS);
    await montar();
    expect(screen.getByText(/todavía no tiene franjas/)).toBeInTheDocument();
    await tipicas();
    expect(apiAcademia.franjasTipicas).toHaveBeenCalledWith(1);
    expect(screen.getByLabelText("Desde, franja 5")).toHaveValue("19:00");
    const resumen = screen.getByRole("status", { name: "Resultado de las franjas típicas" });
    expect(resumen).toHaveTextContent("Se agregaron 2 franjas: 08:00–10:00, 10:00–12:00");
    expect(alCambiar).toHaveBeenCalled();
  });

  it("dice qué omitió y por qué: «Ya estaba» o «Se pisa con …»", async () => {
    vi.mocked(apiAcademia.franjasTipicas).mockResolvedValue({
      ...vista(["08:00", "09:30"], ["10:00", "12:00"], ["14:00", "16:00"]),
      agregadas: [{ inicio: "14:00", fin: "16:00" }],
      omitidas: [
        { inicio: "08:00", fin: "10:00", motivo: "SE_PISA", con: { inicio: "08:00", fin: "09:30" } },
        { inicio: "10:00", fin: "12:00", motivo: "YA_ESTA", con: { inicio: "10:00", fin: "12:00" } },
      ],
    });
    await montar();
    await tipicas();
    const resumen = within(screen.getByRole("status", { name: "Resultado de las franjas típicas" }));
    expect(resumen.getByText(/Se agregó 1 franja/)).toBeInTheDocument();
    expect(resumen.getByText("08:00–10:00 · Se pisa con 08:00–09:30")).toBeInTheDocument();
    expect(resumen.getByText("10:00–12:00 · Ya estaba")).toBeInTheDocument();
  });

  it("si no había nada que agregar lo dice, sin avisar a la lista de sedes", async () => {
    vi.mocked(apiAcademia.franjasTipicas).mockResolvedValue({
      ...TIPICAS,
      agregadas: [],
      omitidas: [{ inicio: "08:00", fin: "10:00", motivo: "YA_ESTA", con: { inicio: "08:00", fin: "10:00" } }],
    });
    await montar();
    await tipicas();
    expect(screen.getByText(/No había nada para agregar/)).toBeInTheDocument();
    expect(alCambiar).not.toHaveBeenCalled();
  });

  it("con cambios sin guardar las típicas esperan: no pisan lo que se está tipeando", async () => {
    await montar();
    cambiar("Hasta, franja 1", "11:00");
    expect(screen.getByRole("button", { name: "Usar las típicas" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByRole("button", { name: "Usar las típicas" })).toBeEnabled();
  });

  it("un error de las típicas se muestra y la lista queda como estaba", async () => {
    vi.mocked(apiAcademia.franjasTipicas).mockRejectedValue(new ApiError("Esa sede no existe", 404, { codigo: "SEDE_NO_EXISTE" }));
    await montar();
    await tipicas();
    expect(screen.getByText("Esa sede no existe")).toBeInTheDocument();
    expect(screen.getByLabelText("Desde, franja 1")).toHaveValue("08:00");
  });
});

describe("C5 · las «de todas las sedes»", () => {
  it("llevan su etiqueta y un texto que explica que al guardar quedan copiadas a la sede", async () => {
    vi.mocked(apiAcademia.franjasSede).mockResolvedValue(vista(["08:00", "10:00", true], ["14:00", "16:00"]));
    await montar();
    expect(screen.getAllByText("De todas las sedes")).toHaveLength(1);
    expect(screen.getByText(/quedan copiadas a esta sede/)).toBeInTheDocument();
    // Guardar las manda como cualquier otra: el backend las copia.
    cambiar("Hasta, franja 2", "17:00");
    await guardar();
    expect(apiAcademia.guardarFranjasSede).toHaveBeenCalledWith(1, [
      { inicio: "08:00", fin: "10:00" },
      { inicio: "14:00", fin: "17:00" },
    ]);
    // Ya guardadas, dejan de ser «de todas».
    expect(screen.queryByText("De todas las sedes")).not.toBeInTheDocument();
  });

  it("sin ninguna «de todas» no hay etiqueta ni texto", async () => {
    await montar();
    expect(screen.queryByText("De todas las sedes")).not.toBeInTheDocument();
    expect(screen.queryByText(/quedan copiadas/)).not.toBeInTheDocument();
  });
});

describe("C5 · rechazos del backend", () => {
  it("FRANJAS_INVALIDAS: muestra los detalles y resalta la fila que nombran", async () => {
    vi.mocked(apiAcademia.guardarFranjasSede).mockRejectedValue(
      new ApiError("x", 400, { codigo: "FRANJAS_INVALIDAS", detalles: ["Las franjas 08:00–10:00 y 07:00–09:00 se pisan en la misma sede."] }),
    );
    await montar();
    // Localmente la lista está bien (la validación del backend es la que rechaza): se cambia la hora de la 1.ª.
    cambiar("Desde, franja 1", "07:00");
    cambiar("Hasta, franja 1", "09:00");
    cambiar("Hasta, franja 2", "21:30");
    await guardar();
    expect(screen.getByText(/08:00–10:00 y 07:00–09:00 se pisan/)).toBeInTheDocument();
    // Ninguna fila coincide con 08:00–10:00 (ya no existe) pero sí con 07:00–09:00.
    expect(screen.getByLabelText("Desde, franja 1")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Desde, franja 2")).not.toHaveAttribute("aria-invalid");
    // Lo tipeado sigue ahí para corregirlo.
    expect(screen.getByLabelText("Hasta, franja 2")).toHaveValue("21:30");
  });

  it("FRANJAS_CAMBIARON: reintenta una vez solo con la misma lista y guarda", async () => {
    vi.mocked(apiAcademia.guardarFranjasSede)
      .mockRejectedValueOnce(new ApiError("Alguien más…", 409, { codigo: "FRANJAS_CAMBIARON" }))
      .mockImplementationOnce(eco);
    await montar();
    cambiar("Hasta, franja 1", "11:00");
    await guardar();
    const llamadas = vi.mocked(apiAcademia.guardarFranjasSede).mock.calls;
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1][1]).toEqual(llamadas[0][1]);
    expect(screen.getByText("Franjas guardadas.")).toBeInTheDocument();
  });

  it("FRANJAS_CAMBIARON dos veces seguidas: pide tocar Guardar de nuevo y conserva lo tipeado", async () => {
    vi.mocked(apiAcademia.guardarFranjasSede).mockRejectedValue(new ApiError("Alguien más…", 409, { codigo: "FRANJAS_CAMBIARON" }));
    await montar();
    cambiar("Hasta, franja 1", "11:00");
    await guardar();
    expect(apiAcademia.guardarFranjasSede).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Tocá Guardar de nuevo/)).toBeInTheDocument();
    expect(screen.getByLabelText("Hasta, franja 1")).toHaveValue("11:00");
    // Y se puede volver a intentar.
    vi.mocked(apiAcademia.guardarFranjasSede).mockImplementation(eco);
    await guardar();
    expect(screen.getByText("Franjas guardadas.")).toBeInTheDocument();
  });

  it("un corte de red al cargar se puede reintentar", async () => {
    vi.mocked(apiAcademia.franjasSede).mockRejectedValueOnce(new Error("Sin conexión"));
    await montar();
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(screen.getByLabelText("Desde, franja 1")).toBeInTheDocument();
  });
});

describe("C5 · quien no configura", () => {
  it("ve las franjas pero no puede editarlas ni cargar las típicas", async () => {
    await montar(false);
    expect(screen.getByLabelText("Desde, franja 1")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Guardar franjas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Usar las típicas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Quitar franja/ })).not.toBeInTheDocument();
  });
});

describe("ronda 2 · M5 · el uso de cada franja", () => {
  it("si no se pudo cargar el calendario, no se deja quitar una franja guardada y se puede reintentar", async () => {
    vi.mocked(apiAcademia.calendario).mockRejectedValueOnce(new Error("corte"));
    await montar();
    expect(screen.getByText(/No pudimos comprobar qué franjas tienen grupos/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Quitar franja 19:00–21:00" })).toBeDisabled();
    // Una franja recién agregada (sin guardar) no puede tener grupos: esa sí se quita.
    fireEvent.click(screen.getByRole("button", { name: "Agregar franja" }));
    expect(screen.getByRole("button", { name: "Quitar franja 21:00–23:00" })).toBeEnabled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    });
    expect(screen.queryByText(/No pudimos comprobar/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar franja 08:00–10:00" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Quitar franja 19:00–21:00" })).toBeDisabled();
  });

  it("la razón de una franja con grupos está a la vista (no sólo en el title)", async () => {
    await montar();
    expect(screen.getByText("· no se puede quitar")).toBeInTheDocument();
  });

  it("al guardar vuelve a pedir el calendario: los grupos por franja no quedan viejos", async () => {
    await montar();
    expect(apiAcademia.calendario).toHaveBeenCalledTimes(1);
    cambiar("Hasta, franja 1", "11:00");
    await guardar();
    expect(apiAcademia.calendario).toHaveBeenCalledTimes(2);
  });

  it("con cambios sin guardar, dice a la vista por qué «Usar las típicas» está apagado", async () => {
    await montar();
    cambiar("Hasta, franja 1", "11:00");
    expect(screen.getByRole("button", { name: "Usar las típicas" })).toBeDisabled();
    expect(screen.getByText(/guardalos o descartalos para usar las típicas/)).toBeInTheDocument();
  });
});

