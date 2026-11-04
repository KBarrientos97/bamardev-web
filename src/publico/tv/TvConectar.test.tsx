import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La TV del restaurante en `/tv` (Kevin, 4-nov): muestra un código, y cuando
 * el encargado lo escribe en el celular abre la pantalla elegida. Las
 * pantallas en sí son las del enlace de siempre: acá se reemplazan por un
 * cartel que dice cuál se abrió y con qué llave.
 */

vi.mock("./apiTv", async (importOriginal) => {
  const real = await importOriginal<typeof import("./apiTv")>();
  return { ...real, apiTv: { televisorNuevo: vi.fn(), televisor: vi.fn() } };
});
vi.mock("./TvTickets", () => ({
  PantallaConLlave: ({ llave, sucursalId }: { llave: string; sucursalId?: number }) => (
    <p>
      tickets {llave} {sucursalId}
    </p>
  ),
}));
vi.mock("./TvMenu", () => ({
  PantallaMenuTv: ({ llave, numero }: { llave: string; numero: number }) => (
    <p>
      menu {numero} {llave}
    </p>
  ),
}));
vi.mock("./pantalla", () => ({ useAlDia: () => undefined, useMantenerEncendida: () => undefined }));

import { apiTv, ErrorTv } from "./apiTv";
import TvConectar from "./TvConectar";

const nuevo = vi.mocked(apiTv.televisorNuevo);
const estado = vi.mocked(apiTv.televisor);
const SECRETO = "c2VjcmV0by1kZS1sYS10di1kZS1wcnVlYmEx";
const LLAVE = "Qm9sYS1vY2hvLWVuLWxhLXRyb25lcmEx";
const esperando = { estado: "ESPERANDO" as const, codigo: "K7P4QX", venceEn: Date.now() + 900_000 };
const conTickets = {
  estado: "CONECTADA" as const,
  nombre: "TV 1",
  muestra: "TICKETS" as const,
  menu: null,
  sucursalId: 4,
  llave: LLAVE,
};

/** Deja correr las promesas y los relojes de la TV. */
async function pasar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("la TV conectada con código (/tv)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nuevo.mockReset();
    estado.mockReset();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/tv");
  });
  afterEach(() => vi.useRealTimers());

  it("recién prendida pide un código, lo muestra en grande y se guarda su secreto", async () => {
    nuevo.mockResolvedValue({ ...esperando, secreto: SECRETO });
    render(<TvConectar />);
    await pasar(0);

    expect(screen.getByText("K7P 4QX")).toBeInTheDocument();
    expect(screen.getByText(/Conectar una TV/)).toBeInTheDocument();
    // En el navegador y en la dirección: algunas TVs borran lo guardado al
    // apagarse, pero reabren la última página.
    expect(window.localStorage.getItem("bamardev.tv.televisor")).toBe(SECRETO);
    expect(window.location.search).toBe(`?tv=${SECRETO}`);
  });

  it("al conectarla desde el celular abre la de tickets sola, con la llave y el local", async () => {
    window.localStorage.setItem("bamardev.tv.televisor", SECRETO);
    estado.mockResolvedValueOnce(esperando).mockResolvedValue(conTickets);
    render(<TvConectar />);
    await pasar(0);
    expect(screen.getByText("K7P 4QX")).toBeInTheDocument();
    expect(nuevo).not.toHaveBeenCalled();

    await pasar(3_000);
    expect(screen.getByText(`tickets ${LLAVE} 4`)).toBeInTheDocument();
    expect(estado).toHaveBeenLastCalledWith(SECRETO);
  });

  it("si desde el celular le ponen el menú, cambia sin tocarla", async () => {
    window.history.replaceState(null, "", `/tv?tv=${SECRETO}`);
    estado.mockResolvedValueOnce(conTickets).mockResolvedValue({ ...conTickets, muestra: "MENU", menu: 2 });
    render(<TvConectar />);
    await pasar(0);
    expect(screen.getByText(`tickets ${LLAVE} 4`)).toBeInTheDocument();

    // Conectada pregunta cada 20 s, no cada 3.
    await pasar(3_000);
    expect(estado).toHaveBeenCalledTimes(1);
    await pasar(17_000);
    expect(screen.getByText(`menu 2 ${LLAVE}`)).toBeInTheDocument();
  });

  it("desconectada, olvida su secreto y muestra otro código", async () => {
    window.localStorage.setItem("bamardev.tv.televisor", SECRETO);
    estado.mockRejectedValue(new ErrorTv("Esta TV no está conectada", 404));
    nuevo.mockResolvedValue({ ...esperando, codigo: "MN2WQR", secreto: "b3Ryby1zZWNyZXRvLWRlLWxhLXR2LW51ZXZhMQ" });
    render(<TvConectar />);
    await pasar(0);
    await pasar(0);

    expect(screen.getByText("MN2 WQR")).toBeInTheDocument();
    expect(window.localStorage.getItem("bamardev.tv.televisor")).toBe("b3Ryby1zZWNyZXRvLWRlLWxhLXR2LW51ZXZhMQ");
  });

  it("sin servidor, una TV conectada sigue mostrando lo suyo", async () => {
    window.localStorage.setItem("bamardev.tv.televisor", SECRETO);
    estado.mockResolvedValueOnce(conTickets).mockRejectedValue(new ErrorTv("el servidor no responde", 0));
    render(<TvConectar />);
    await pasar(0);
    await pasar(20_000);

    expect(screen.getByText(`tickets ${LLAVE} 4`)).toBeInTheDocument();
    expect(nuevo).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("bamardev.tv.televisor")).toBe(SECRETO);
  });
});
