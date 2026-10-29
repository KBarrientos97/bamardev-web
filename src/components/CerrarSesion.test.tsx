import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Caja } from "../types";

/**
 * CAJA-3 / USR-08: en el restaurante no se cierra sesión con la caja abierta,
 * como en la app (`VentasActivity.logout`). La caja es de quien la abrió: al
 * volver a entrar, aunque fuera al otro día, seguía vendiendo en el mismo
 * turno y el arqueo mezclaba los dos días.
 *
 * Y lo que no puede pasar: que el aviso deje al cajero encerrado. Si no se
 * puede saber si hay caja (sin internet, un error, la licencia), se sale.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string,
  permisos: ["caja.operar", "ventas.vender"] as string[],
  logout: vi.fn(),
  cola: [] as { estado: string }[],
  sinSenal: false,
}));

vi.mock("../store/AuthContext", async () => {
  const { puedeVer } = await import("../lib/permisos");
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { id: 7, nombre: "Ana", username: "ana", rol: "CAJERO", rolNombre: "Cajera", permisos: sesion.permisos },
      negocio: { id: 3, nombre: "Pollería" },
      licencia: null,
      cupo: null,
      logout: sesion.logout,
      rubro: sesion.rubro,
      // El menú del Layout se arma con los permisos de un cajero.
      puede: (s: Parameters<typeof puedeVer>[1]) =>
        puedeVer({ ...permisosDe("CAJERO"), features: [], rubro: sesion.rubro }, s),
    }),
  };
});

vi.mock("../lib/api", async (original) => {
  const real = await original<typeof import("../lib/api")>();
  return { ...real, api: { ...real.api, cajaActual: vi.fn() } };
});

// La cola de ventas cobradas sin internet (la app del iPhone).
vi.mock("../lib/offline/cola", async (original) => ({
  ...(await original<typeof import("../lib/offline/cola")>()),
  useColaOffline: () => sesion.cola,
  sinSenal: () => sesion.sinSenal,
}));

// Lo del billar que corre de fondo sondea el tablero: acá no hace falta.
vi.mock("../pages/billar/DeFondo", () => ({ default: () => null }));

import { api } from "../lib/api";
import { cajaAbiertaAlSalir, useCerrarSesion } from "./CerrarSesion";
import Layout from "./Layout";

/** El botón del menú, con el aviso al lado: lo mismo que hace el Layout. */
function Menu({ antesDeAvisar }: { antesDeAvisar?: () => void }) {
  const s = useCerrarSesion({ antesDeAvisar });
  return (
    <>
      <button onClick={() => void s.pedir()} disabled={s.revisando}>
        {s.revisando ? "Revisando tu caja…" : "Cerrar sesión"}
      </button>
      {s.dialogo}
    </>
  );
}

/** El POS, para ver con qué pedido llega. */
function Pos() {
  const { state } = useLocation();
  return <p>POS {JSON.stringify(state)}</p>;
}

function montar(antesDeAvisar?: () => void) {
  render(
    <MemoryRouter initialEntries={["/inventario"]}>
      <Routes>
        <Route path="/inventario" element={<Menu antesDeAvisar={antesDeAvisar} />} />
        <Route path="/pos" element={<Pos />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function salir() {
  await act(async () => {
    fireEvent.click(screen.getByText("Cerrar sesión"));
  });
}

const CAJA_ABIERTA = { caja: { id: 5, estado: "ABIERTA" } as Caja };

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  sesion.permisos = ["caja.operar", "ventas.vender"];
  sesion.cola = [];
  sesion.sinSenal = false;
  vi.mocked(api.cajaActual).mockResolvedValue({ caja: null });
});

describe("restaurante: con la caja abierta no se cierra sesión", () => {
  it("no sale: dice por qué y lleva al cierre de caja", async () => {
    vi.mocked(api.cajaActual).mockResolvedValue(CAJA_ABIERTA);
    const cerrarCajon = vi.fn();
    montar(cerrarCajon);
    await salir();
    expect(sesion.logout).not.toHaveBeenCalled();
    const aviso = screen.getByRole("dialog", { name: "Caja abierta" });
    expect(aviso).toHaveTextContent(
      "No podés cerrar sesión con la caja abierta. Primero cerrá la caja: si no, el turno de hoy se mezcla con el de mañana.",
    );
    // El cajón del celular se cierra antes: si no, queda encima del aviso.
    expect(cerrarCajon).toHaveBeenCalled();
    fireEvent.click(within(aviso).getByText("Ir al cierre de caja"));
    expect(screen.getByText('POS {"pantalla":"cierre"}')).toBeInTheDocument();
    expect(sesion.logout).not.toHaveBeenCalled();
  });

  it("«Cancelar» cierra el aviso y la sesión sigue", async () => {
    vi.mocked(api.cajaActual).mockResolvedValue(CAJA_ABIERTA);
    montar();
    await salir();
    fireEvent.click(within(screen.getByRole("dialog")).getByText("Cancelar"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sesion.logout).not.toHaveBeenCalled();
  });

  it("sin caja abierta sale, como siempre", async () => {
    montar();
    await salir();
    expect(api.cajaActual).toHaveBeenCalledTimes(1);
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });

  it("si no se puede saber (un error, la licencia vencida), deja salir: un candado que no abre deja al cajero atrapado", async () => {
    vi.mocked(api.cajaActual).mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    montar();
    await salir();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });

  it("sin señal ni pregunta al servidor: sale", async () => {
    sesion.sinSenal = true;
    montar();
    await salir();
    expect(api.cajaActual).not.toHaveBeenCalled();
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });

  it("con ventas sin subir, el aviso de la caja también lo dice", async () => {
    vi.mocked(api.cajaActual).mockResolvedValue(CAJA_ABIERTA);
    sesion.cola = [{ estado: "PENDIENTE" }, { estado: "ERROR" }, { estado: "RECHAZADA" }];
    montar();
    await salir();
    // Las rechazadas no cuentan: ya no van a subir.
    expect(screen.getByRole("dialog", { name: "Caja abierta" })).toHaveTextContent(
      "Además, hay 2 ventas cobradas sin internet que todavía no subieron: suben solas cuando vuelva la conexión",
    );
  });

  it("sin caja pero con una venta sin subir: lo dice y deja salir igual", async () => {
    sesion.cola = [{ estado: "PENDIENTE" }];
    montar();
    await salir();
    const aviso = screen.getByRole("dialog", { name: "Ventas sin subir" });
    expect(aviso).toHaveTextContent(
      "Hay 1 venta cobrada sin internet que todavía no subió. Si cerrás sesión queda guardada en este equipo y sube recién cuando vuelvas a entrar con tu usuario y haya internet.",
    );
    expect(sesion.logout).not.toHaveBeenCalled();
    fireEvent.click(within(aviso).getByText("Cerrar sesión igual"));
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });

  it("quien no opera caja (el repartidor) no pregunta por ninguna caja", async () => {
    sesion.permisos = ["entregas.realizar"];
    montar();
    await salir();
    expect(api.cajaActual).not.toHaveBeenCalled();
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });
});

describe("los demás rubros salen como siempre", () => {
  it.each(["BILLAR", "PELUQUERIA", "FARMACIA", "ACADEMIA"])(
    "%s: un toque y sale, sin preguntar por la caja",
    async (rubro) => {
      sesion.rubro = rubro;
      sesion.cola = [{ estado: "PENDIENTE" }];
      vi.mocked(api.cajaActual).mockResolvedValue(CAJA_ABIERTA);
      montar();
      await salir();
      expect(api.cajaActual).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(sesion.logout).toHaveBeenCalledTimes(1);
    },
  );
});

describe("cajaAbiertaAlSalir", () => {
  it("dice si el servidor la tiene abierta", async () => {
    vi.mocked(api.cajaActual).mockResolvedValueOnce(CAJA_ABIERTA).mockResolvedValueOnce({ caja: null });
    expect(await cajaAbiertaAlSalir()).toBe(true);
    expect(await cajaAbiertaAlSalir()).toBe(false);
  });

  it("si el servidor tarda demasiado no se sabe, y no se espera los 20 s del pedido", async () => {
    vi.mocked(api.cajaActual).mockReturnValue(new Promise(() => {}));
    expect(await cajaAbiertaAlSalir(10)).toBeNull();
  });
});

describe("en la app: el «Cerrar sesión» del menú pasa por el aviso", () => {
  function app() {
    render(
      <MemoryRouter initialEntries={["/pos"]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<p>pantalla</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  }

  it("restaurante con la caja abierta: no sale, y el aviso va fuera del menú", async () => {
    vi.mocked(api.cajaActual).mockResolvedValue(CAJA_ABIERTA);
    app();
    const menu = screen.getByRole("navigation");
    await act(async () => {
      fireEvent.click(within(menu).getByText("Cerrar sesión"));
    });
    expect(sesion.logout).not.toHaveBeenCalled();
    // Dentro del menú quedaba encerrado en el cajón del celular, que se mueve
    // con `transform`.
    expect(menu).not.toContainElement(screen.getByRole("dialog", { name: "Caja abierta" }));
  });

  it("billar: sale con un toque, como siempre", async () => {
    sesion.rubro = "BILLAR";
    app();
    await act(async () => {
      fireEvent.click(within(screen.getByRole("navigation")).getByText("Cerrar sesión"));
    });
    expect(api.cajaActual).not.toHaveBeenCalled();
    expect(sesion.logout).toHaveBeenCalledTimes(1);
  });
});
