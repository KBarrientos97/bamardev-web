import type { ReactNode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Producto } from "../../types";
import type { Carrito } from "./useCarrito";

/**
 * El POS con varias cajas abiertas (13-nov): el admin de una organización con
 * 2+ sucursales tiene una caja en cada una y salta de una a otra desde el POS.
 * El cajero atado a una sede y todo negocio de un local siguen viendo
 * exactamente lo de siempre: sin selector.
 */

const sesion = vi.hoisted(() => ({
  /** `null` = organización; un número = atado a esa sede. */
  sucursalId: null as number | null,
  sucursalesActivas: 2 as number | undefined,
  features: ["pos", "caja", "multi_almacen"] as string[],
  /** Las cajas abiertas del usuario, una por sede (el servidor de mentira). */
  cajas: [] as { id: number; almacenId: number; almacen: string }[],
  /** Si el navegador dice "sin conexión". */
}));

vi.mock("../../store/AuthContext", async () => {
  const { permisosDe } = await import("../../test/sesiones");
  return {
    useAuth: () => ({
      negocio: {
        id: 1,
        nombre: "Prueba",
        tipoNegocio: "RESTAURANTE",
        features: sesion.features,
        sucursalesActivas: sesion.sucursalesActivas,
      },
      usuario: {
        id: 1,
        username: "caja",
        rol: "CAJERO",
        sucursalId: sesion.sucursalId,
        ...permisosDe("CAJERO"),
      },
      rubro: "RESTAURANTE",
      vocabulario: undefined,
      incluye: () => true,
      puede: () => true,
      cupo: undefined,
      licencia: null,
      actualizarCupo: vi.fn(),
      refrescarCupo: vi.fn(async () => {}),
    }),
  };
});

/** La sede activa que dejó el selector, leída como la lee `api` (mismo almacenamiento). */
const sedeGuardada = () => Number(localStorage.getItem("bamardev.caja.sede:1:1")) || null;

vi.mock("../../lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    // Como el servidor: con la cabecera, la caja de esa sede; sin ella, la más reciente.
    cajaActual: vi.fn(async () => {
      const sede = sedeGuardada();
      const caja = sede ? sesion.cajas.find((c) => c.almacenId === sede) : sesion.cajas[sesion.cajas.length - 1];
      return {
        caja: caja
          ? { ...caja, fechaApertura: "2026-11-13T12:00:00.000Z", montoApertura: 100, estado: "ABIERTA" }
          : null,
      };
    }),
    cajasAbiertas: vi.fn(async () => ({
      cajas: sesion.cajas.map((c) => ({
        id: c.id,
        almacenId: c.almacenId,
        almacen: { id: c.almacenId, nombre: c.almacen },
        fechaApertura: "2026-11-13T12:00:00.000Z",
      })),
    })),
    getSucursales: vi.fn(async () => [
      { id: 38, nombre: "Las Brisas", activo: true, tipo: "SUCURSAL", esPrincipal: true },
      { id: 39, nombre: "Plazuela Fátima", activo: true, tipo: "SUCURSAL", esPrincipal: false },
      { id: 40, nombre: "Cementerio General", activo: true, tipo: "SUCURSAL", esPrincipal: false },
      { id: 35, nombre: "Depósito", activo: true, tipo: "DEPOSITO", esPrincipal: false },
    ]),
    getProductos: vi.fn(async () => [
      { id: 7, nombre: "Arroz clásico", precio: 20, tipoProducto: "ALMACENABLE", stockTotal: 50, habilitado: true, componentes: [] },
    ]),
    getCategorias: vi.fn(async () => []),
    getFormasPago: vi.fn(async () => []),
    getRepartidores: vi.fn(async () => []),
    mesasPorCobrar: vi.fn(async () => []),
    entregasMesero: vi.fn(async () => null),
    crearVenta: vi.fn(async () => ({ id: 50 })),
  },
}));

vi.mock("../../lib/apiMonedero", () => ({
  apiMonedero: { paquetesCreditos: vi.fn(), comprarCreditos: vi.fn(), compraCreditos: vi.fn() },
}));
vi.mock("../../lib/agenda/apiConfigAgenda", () => ({ apiConfigAgenda: { recursos: vi.fn(async () => []) } }));
vi.mock("../../lib/agenda/apiAgenda", () => ({
  apiAgenda: { hoy: vi.fn(async () => ({ citas: [] })), carrito: vi.fn() },
  mensajeDe: (_e: unknown, d: string) => d,
}));
// La lista del Desplegable en la compu (no la hoja del celular).
vi.mock("../../lib/agenda/useEsCelular", () => ({ useConsultaMedia: () => false }));

// La venta: la cabecera (donde vive el selector) y un botón para armar el carrito.
vi.mock("./PantallaVenta", () => ({
  default: (props: { carrito: Carrito; cabecera?: ReactNode; productos: Producto[]; onCobrar: () => void }) => (
    <div>
      {props.cabecera}
      <p>en el carrito: {props.carrito.lineas.length}</p>
      <button onClick={() => props.carrito.agregar(props.productos[0])}>agregar arroz</button>
      <button onClick={props.onCobrar}>ir a cobrar</button>
    </div>
  ),
}));
// El cobro: paga justo el total.
vi.mock("./PantallaCobro", () => ({
  default: (props: { total: number; onConfirmar: (p: unknown[]) => void }) => (
    <button onClick={() => props.onConfirmar([{ formaPagoId: 1, monto: props.total }])}>pagar {props.total}</button>
  ),
}));
vi.mock("./PantallaRecibo", () => ({ default: () => <p>recibo</p> }));
// La apertura: dice qué sede propone y deja abrir en la que se le indique.
vi.mock("./AperturaCaja", () => ({
  default: (props: { sucursalInicial?: number | null; onAbierta: (c: { almacenId: number }) => void }) => (
    <div>
      <p>abrir caja en la sede {String(props.sucursalInicial)}</p>
      <button onClick={() => props.onAbierta({ almacenId: props.sucursalInicial ?? 38 })}>abrir ahora</button>
    </div>
  ),
}));

import { api } from "../../lib/api";
import Pos from "./Pos";

async function montar() {
  render(
    <MemoryRouter initialEntries={["/pos"]}>
      <Pos />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

const BRISAS = { id: 101, almacenId: 38, almacen: "Las Brisas" };
const PLAZUELA = { id: 102, almacenId: 39, almacen: "Plazuela Fátima" };

/** El botón de la pastilla de sede en la cabecera del POS. */
const pastilla = () => screen.queryByRole("button", { name: /^Sucursal/ });

async function abrirLista() {
  await act(async () => {
    fireEvent.click(pastilla()!);
  });
  return screen.getByRole("listbox");
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  sesion.sucursalId = null;
  sesion.sucursalesActivas = 2;
  sesion.features = ["pos", "caja", "multi_almacen"];
  sesion.cajas = [];
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

describe("quién ve el selector de sede en el POS", () => {
  it("el admin de organización con 2+ sucursales: la pastilla con la sede de la caja", async () => {
    sesion.cajas = [BRISAS];
    await montar();
    expect(pastilla()).toHaveTextContent("Las Brisas");
  });

  it("el cajero atado a una sede: sin selector (ve su caja y nada más)", async () => {
    sesion.sucursalId = 38;
    sesion.cajas = [BRISAS];
    await montar();
    expect(pastilla()).toBeNull();
    // Su sede sale como siempre, de la caja, como etiqueta.
    expect(api.cajasAbiertas).not.toHaveBeenCalled();
    expect(api.getSucursales).not.toHaveBeenCalled();
  });

  it("un negocio con una sola sucursal activa: sin selector", async () => {
    sesion.sucursalesActivas = 1;
    sesion.cajas = [BRISAS];
    await montar();
    expect(pastilla()).toBeNull();
    expect(api.cajasAbiertas).not.toHaveBeenCalled();
  });

  it("sin multi_almacen (regla 4: un local): sin selector aunque haya más sucursales cargadas", async () => {
    sesion.features = ["pos", "caja"];
    sesion.cajas = [BRISAS];
    await montar();
    expect(pastilla()).toBeNull();
  });
});

describe("el selector dice quién tiene caja y deja saltar", () => {
  it("lista las sucursales (sin depósitos) con «Caja abierta» o «Sin caja»", async () => {
    sesion.cajas = [BRISAS];
    await montar();
    const lista = await abrirLista();
    const opciones = within(lista).getAllByRole("option");
    expect(opciones.map((o) => o.textContent)).toEqual([
      expect.stringContaining("Las Brisas (principal)"),
      expect.stringContaining("Plazuela Fátima"),
      expect.stringContaining("Cementerio General"),
    ]);
    expect(opciones[0]).toHaveTextContent("Caja abierta");
    expect(opciones[1]).toHaveTextContent("Sin caja");
    expect(opciones[2]).toHaveTextContent("Sin caja");
  });

  it("al arrancar la sede de la caja más reciente pasa a ser la activa (el resto de las pantallas la siguen)", async () => {
    sesion.cajas = [BRISAS];
    await montar();
    expect(sedeGuardada()).toBe(38);
  });

  it("elegir una sede que ya tiene caja pasa a su caja", async () => {
    sesion.cajas = [BRISAS, PLAZUELA];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    expect(pastilla()).toHaveTextContent("Las Brisas");
    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Plazuela Fátima/ }));
    });
    await act(async () => {});
    expect(sedeGuardada()).toBe(39);
    expect(pastilla()).toHaveTextContent("Plazuela Fátima");
    expect(screen.queryByText(/abrir caja en la sede/)).toBeNull();
  });

  it("elegir una sede SIN caja muestra «Abrir caja» con esa sede ya puesta", async () => {
    sesion.cajas = [BRISAS];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Cementerio General/ }));
    });
    await act(async () => {});
    expect(screen.getByText("abrir caja en la sede 40")).toBeInTheDocument();
    // Y con una caja abierta en otra sede, se puede volver a ella desde ahí.
    expect(pastilla()).toBeInTheDocument();
  });

  it("al abrir la caja en la sede elegida, esa pasa a ser la activa", async () => {
    sesion.cajas = [BRISAS];
    localStorage.setItem("bamardev.caja.sede:1:1", "39");
    await montar();
    expect(screen.getByText("abrir caja en la sede 39")).toBeInTheDocument();
    sesion.cajas = [BRISAS, PLAZUELA];
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "abrir ahora" }));
    });
    await act(async () => {});
    expect(sedeGuardada()).toBe(39);
    expect(pastilla()).toHaveTextContent("Plazuela Fátima");
  });

  it("sin caja abierta en NINGUNA sede, «Abrir caja» queda como siempre: sin selector aparte", async () => {
    sesion.cajas = [];
    await montar();
    expect(screen.getByText("abrir caja en la sede null")).toBeInTheDocument();
    expect(pastilla()).toBeNull();
  });
});

describe("cambiar de sede con una venta a medias", () => {
  it("con carrito pregunta antes y, al confirmar, lo vacía y cambia", async () => {
    sesion.cajas = [BRISAS, PLAZUELA];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "agregar arroz" }));
    });
    expect(screen.getByText("en el carrito: 1")).toBeInTheDocument();

    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Plazuela Fátima/ }));
    });
    // Todavía no cambió nada: pregunta.
    expect(screen.getByText(/Tenés 1 producto en el carrito/)).toBeInTheDocument();
    expect(sedeGuardada()).toBe(38);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Vaciar y cambiar" }));
    });
    await act(async () => {});
    expect(sedeGuardada()).toBe(39);
    expect(screen.getByText("en el carrito: 0")).toBeInTheDocument();
  });

  it("cancelar deja todo como estaba", async () => {
    sesion.cajas = [BRISAS, PLAZUELA];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "agregar arroz" }));
    });
    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Plazuela Fátima/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    });
    expect(sedeGuardada()).toBe(38);
    expect(screen.getByText("en el carrito: 1")).toBeInTheDocument();
  });

  it("con el carrito vacío cambia directo, sin preguntar", async () => {
    sesion.cajas = [BRISAS, PLAZUELA];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Plazuela Fátima/ }));
    });
    await act(async () => {});
    expect(screen.queryByText(/Se vacía al cambiar/)).toBeNull();
    expect(sedeGuardada()).toBe(39);
  });
});

describe("sin conexión", () => {
  it("a una sede sin datos guardados no se salta: avisa y se queda donde está", async () => {
    sesion.cajas = [BRISAS];
    localStorage.setItem("bamardev.caja.sede:1:1", "38");
    await montar();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    await abrirLista();
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Plazuela Fátima/ }));
    });
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Sin conexión");
    expect(sedeGuardada()).toBe(38);
    expect(pastilla()).toHaveTextContent("Las Brisas");
  });
});

describe("la venta dice a qué caja va", () => {
  async function cobrarUnArroz() {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "agregar arroz" }));
    });
    fireEvent.click(screen.getByRole("button", { name: "ir a cobrar" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "pagar 20" }));
    });
  }

  it("con varias sedes el cuerpo lleva el almacenId de la caja (la cola lo sube tiempo después)", async () => {
    sesion.cajas = [BRISAS, PLAZUELA];
    localStorage.setItem("bamardev.caja.sede:1:1", "39");
    await montar();
    expect(api.getProductos).toHaveBeenCalledWith(false, 39);
    await cobrarUnArroz();
    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0] as { almacenId?: number };
    expect(cuerpo.almacenId).toBe(39);
  });

  it("el cajero atado manda el cuerpo de siempre, sin almacenId", async () => {
    sesion.sucursalId = 38;
    sesion.cajas = [BRISAS];
    await montar();
    await cobrarUnArroz();
    expect(vi.mocked(api.crearVenta).mock.calls[0][0]).not.toHaveProperty("almacenId");
  });
});
