import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SalonPublicoApi } from "./apiTv";

/**
 * La TV pública del billar (`/tv/billar/<llave>`) con la API mockeada: la
 * llave buena (mesas, tiempos, sin nombres, sondeo), la anulada (mensaje y
 * sondeo lento, y deja de mostrar el salón), sin conexión (aviso que se va
 * solo al volver) y el enlace cortado.
 */

vi.mock("./apiTv", async (importOriginal) => {
  const real = await importOriginal<typeof import("./apiTv")>();
  return { ...real, apiTv: { salon: vi.fn() } };
});

import { apiTv, ErrorTv } from "./apiTv";
import RutasTv from "./TvBillar";

const LLAVE = "Qm9sYS1vY2hvLWVuLWxhLXRyb25lcmEx";
const AHORA = new Date("2026-10-13T23:00:00.000Z").getTime();
const MIN = 60_000;

function salon(extra: Partial<SalonPublicoApi> = {}): SalonPublicoApi {
  return {
    negocio: "Billar El Taco",
    moneda: "BOB",
    sucursal: "Principal",
    ahora: AHORA,
    avisos: [10, 5, 1],
    tipos: [
      {
        id: "pool",
        nombre: "Pool",
        tarifa: 20,
        fraccion: 15,
        tolerancia: 0,
        minimo: 0,
        paquetes: [{ min: 120, precio: 35 }],
        promos: [],
      },
    ],
    mesas: [
      { numero: 1, tipo: "pool", estado: "libre" },
      {
        numero: 2,
        tipo: "pool",
        estado: "abierta",
        sesion: {
          start: AHORA - 65 * MIN,
          pausedAt: null,
          pausedTotal: 0,
          prepago: null,
          prev: null,
          consumos: [],
          pagos: [],
        },
      },
      { numero: 3, tipo: "pool", estado: "reservada", reserva: { hora: AHORA + 120 * MIN } },
      { numero: 4, tipo: "pool", tarifaPropia: 30, estado: "libre" },
    ],
    ...extra,
  };
}

const salonMock = vi.mocked(apiTv.salon);

async function montar(ruta = `/tv/billar/${LLAVE}`) {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/tv/*" element={<RutasTv />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** Deja correr el reloj y las promesas que destraba. */
async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AHORA);
  salonMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TV pública del billar", () => {
  it("con la llave buena muestra las mesas, el tiempo y las tarifas, sin nombres, y se mantiene al día", async () => {
    salonMock.mockResolvedValue(salon());
    await montar();

    expect(salonMock).toHaveBeenCalledWith(LLAVE, undefined, expect.any(AbortSignal));
    expect(screen.getByRole("heading", { name: "Billar El Taco" })).toBeInTheDocument();
    expect(screen.getByText("2 mesas libres · pedila en caja")).toBeInTheDocument();
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();
    expect(screen.getByText("1:05:00")).toBeInTheDocument();
    expect(screen.getByText(/^Reservada para las /)).toBeInTheDocument();
    // La tarifa propia de la mesa, no la del tipo: es la que se cobra.
    expect(screen.getByText("Pool · Bs 30,00/h")).toBeInTheDocument();
    expect(screen.getByText(/Bs 20,00\/h · 2 h Bs 35,00/)).toBeInTheDocument();
    // Nada que lleve a la app.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(document.title).toBe("Billar El Taco · Mesas");

    // El cronómetro corre en la TV…
    await pasar(1_000);
    expect(screen.getByText("1:05:01")).toBeInTheDocument();
    // …y cada 10 s vuelve a preguntar: la mesa 1 se abrió en la caja.
    const abierta = salon();
    abierta.mesas[0] = { ...abierta.mesas[1], numero: 1 };
    salonMock.mockResolvedValue(abierta);
    await pasar(9_000);
    expect(salonMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("1 mesa libre · pedila en caja")).toBeInTheDocument();
  });

  it("pasa el local del enlace al backend", async () => {
    salonMock.mockResolvedValue(salon());
    await montar(`/tv/billar/${LLAVE}?sucursal=7`);
    expect(salonMock).toHaveBeenCalledWith(LLAVE, 7, expect.any(AbortSignal));
  });

  it("con la llave anulada lo dice, deja de mostrar el salón y pregunta despacio", async () => {
    salonMock.mockResolvedValueOnce(salon());
    await montar();
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();

    // El administrador generó otra: la vieja da 404.
    salonMock.mockRejectedValue(new ErrorTv("Esta pantalla no está habilitada", 404));
    await pasar(10_000);
    expect(screen.getByRole("heading", { name: "Esta pantalla ya no está habilitada" })).toBeInTheDocument();
    expect(screen.getByText(/Mesas de billar → Pantalla del salón/)).toBeInTheDocument();
    // Una TV cortada no puede seguir mostrando el salón congelado.
    expect(screen.queryByText("Mesa 2")).not.toBeInTheDocument();

    // Despacio: a los 10 s no vuelve a preguntar; al minuto sí (por si el
    // negocio recupera el billar).
    expect(salonMock).toHaveBeenCalledTimes(2);
    await pasar(10_000);
    expect(salonMock).toHaveBeenCalledTimes(2);
    await pasar(50_000);
    expect(salonMock).toHaveBeenCalledTimes(3);
  });

  it("sin conexión conserva las mesas, avisa, y se recupera sola", async () => {
    salonMock.mockResolvedValueOnce(salon());
    await montar();

    salonMock.mockRejectedValue(new ErrorTv("el servidor no responde", 0));
    await pasar(10_000);
    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent("Sin conexión con el servidor");
    expect(aviso).toHaveTextContent("el servidor no responde");
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();

    // Se espacia: el segundo reintento espera 20 s, no 10.
    await pasar(10_000);
    expect(salonMock).toHaveBeenCalledTimes(3);
    await pasar(10_000);
    expect(salonMock).toHaveBeenCalledTimes(3);

    // Vuelve la red: el navegador avisa y no espera la vuelta siguiente.
    salonMock.mockResolvedValue(salon());
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await pasar(0);
    expect(salonMock).toHaveBeenCalledTimes(4);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();
  });

  it("si la primera carga no llega, lo dice y reintenta sin que nadie toque", async () => {
    salonMock.mockRejectedValueOnce(new ErrorTv("sin internet", 0));
    await montar();
    expect(screen.getByText(/No se pudo conectar con el servidor/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("sin internet");

    salonMock.mockResolvedValue(salon());
    await pasar(10_000);
    expect(screen.getByRole("heading", { name: "Billar El Taco" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("Reintentar pregunta en el momento", async () => {
    salonMock.mockRejectedValueOnce(new ErrorTv("sin internet", 0));
    await montar();
    salonMock.mockResolvedValue(salon());
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await pasar(0);
    expect(salonMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Mesa 2")).toBeInTheDocument();
  });

  it("un enlace cortado no pregunta y dice que está incompleto", async () => {
    await montar("/tv/billar/Qm9sYS1v");
    expect(screen.getByRole("heading", { name: "Este enlace está incompleto" })).toBeInTheDocument();
    await montar("/tv/otra-cosa");
    expect(salonMock).not.toHaveBeenCalled();
  });
});
