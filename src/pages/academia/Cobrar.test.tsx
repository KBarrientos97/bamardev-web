import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esperarDemora, relojDeLaDemora } from "../../test/demora";
import type { Venta } from "../../types";

/**
 * A1 · Cobrar a estudiante (22-oct): fuera del POS, en una pantalla. Con la
 * inscripción y el monto de "Inscribir y cobrar" sólo falta el medio de pago;
 * el monto se puede cambiar y se reparte por vencimiento; la venta es la de
 * siempre (líneas con `cuotaId`, quien paga, `clienteRequestId`), y sin caja
 * abierta se avisa y se ofrece abrirla. El cobro (efectivo) es la
 * `PantallaCobro` de verdad del POS.
 */

vi.mock("../../store/AuthContext", async () => {
  const { SESION_SECRETARIA: s } = await import("../../test/academiaFixtures");
  // Sin `pago_qr_mixto`: el cobro es en efectivo, como en un negocio sin QR.
  return { useAuth: () => ({ ...s, puede: () => true, incluye: () => false }) };
});

vi.mock("../../lib/academia/apiAcademia", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/academia/apiAcademia")>();
  return { ...real, apiAcademia: { cuotasPorCobrar: vi.fn(), carrito: vi.fn() } };
});

vi.mock("../../lib/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../lib/api")>();
  return { ...real, api: { cajaActual: vi.fn(), getFormasPago: vi.fn(), crearVenta: vi.fn() } };
});

// La apertura de verdad pide las sucursales; acá alcanza con que se ofrezca.
vi.mock("../pos/AperturaCaja", () => ({
  default: ({ onAbierta, sucursalInicial }: { onAbierta: () => void; sucursalInicial?: number | null }) => (
    <button onClick={onAbierta}>Abrir caja en {String(sucursalInicial)}</button>
  ),
}));

vi.mock("../pos/PantallaRecibo", () => ({
  default: ({ venta, etiquetaNueva }: { venta: Venta; etiquetaNueva?: string }) => (
    <div>
      <p>recibo {venta.id}</p>
      <p>pagó {venta.pagadorCuotas?.nombre ?? "el alumno"}</p>
      <p>{etiquetaNueva}</p>
    </div>
  ),
}));

import { ApiError, api } from "../../lib/api";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { inicialDeLaUrl, montoSugerido } from "../../lib/academia/cobroCuotas";
import Cobrar from "./Cobrar";

const CAJA = {
  caja: { id: 4, almacenId: 1, almacen: "Central", fechaApertura: "2026-10-22T12:00:00.000Z", montoApertura: 100 },
};

const CARRITO = {
  alumno: { id: 53, nombre: "Céspedes Molina, Joaquín" },
  pagadores: [
    { clienteId: 70, nombre: "Rosa Molina", rol: "TUTOR" as const, principal: true },
    { clienteId: 53, nombre: "Joaquín", rol: "ALUMNO" as const, principal: false },
  ],
  carrera: { id: 1, nombre: "Barbería" },
  // Como los manda el backend: el concepto de la cuota y, aparte, los módulos con su nombre (D6).
  lineas: [
    {
      productoId: 77,
      cuotaId: 906,
      descripcion: "Barbería · Cuota 3/3",
      saldo: 533,
      vence: "2026-10-17",
      vencida: false,
      materias: [{ id: 33, orden: 3, nombre: "Barba y color" }],
    },
    {
      productoId: 77,
      cuotaId: 905,
      descripcion: "Barbería · Cuota 2/3",
      saldo: 333,
      vence: "2026-09-17",
      vencida: true,
      materias: [{ id: 32, orden: 2, nombre: "Degradados" }],
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  relojDeLaDemora();
  vi.clearAllMocks();
  vi.mocked(api.cajaActual).mockResolvedValue(CAJA as never);
  vi.mocked(api.getFormasPago).mockResolvedValue([
    { id: 1, nombre: "Efectivo" },
    { id: 2, nombre: "QR" },
  ] as never);
  vi.mocked(apiAcademia.carrito).mockResolvedValue(CARRITO);
  vi.mocked(apiAcademia.cuotasPorCobrar).mockResolvedValue({
    alumnos: [
      {
        alumnoId: 53,
        inscripcionId: 103,
        nombre: "Céspedes Molina, Joaquín",
        codigo: "2026-0103",
        grupo: "Barbería · Sáb 08:00",
        sede: { id: 2, nombre: "Norte" },
        saldo: 866,
        vencido: true,
      },
    ],
  });
});

/** La dirección actual, para ver que queda el estudiante (QA 23-oct). */
function Direccion() {
  const l = useLocation();
  return <p data-testid="direccion">{l.search}</p>;
}

async function montar(ruta: string, state?: unknown) {
  render(
    <MemoryRouter initialEntries={[state ? { pathname: ruta.split("?")[0], search: `?${ruta.split("?")[1] ?? ""}`, state } : ruta]}>
      <Cobrar />
      <Direccion />
    </MemoryRouter>,
  );
  await act(async () => {});
  await act(async () => {});
}

async function pagarEnEfectivo(recibido: string) {
  fireEvent.change(screen.getByLabelText("Efectivo recibido"), { target: { value: recibido } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
  });
}

describe("A1 · cobrar a estudiante", () => {
  it("desde «Inscribir y cobrar»: el monto ya viene, se reparte por vencimiento y se cobra en efectivo", async () => {
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 61, total: 400, detalles: [], pagos: [] } as unknown as Venta);
    await montar("/academia/cobrar?inscripcion=103&monto=400&sede=2&sedeNombre=Norte");

    expect(apiAcademia.carrito).toHaveBeenCalledWith(103);
    // Sin volver a pedir el monto ni elegir módulos: lo acordado al inscribir.
    expect(screen.getByLabelText("Paga hoy")).toHaveValue("400");
    expect(screen.getByText("Grupo de Norte · se cobra en Central")).toBeInTheDocument();
    // Primero la vencida entera (333), el resto (67) como abono de la siguiente.
    const reparto = within(screen.getByRole("region", { name: "Cómo se reparte" }));
    const filas = reparto.getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Barbería · M2 Degradados");
    expect(filas[0]).toHaveTextContent("Bs 333");
    expect(filas[1]).toHaveTextContent("Barbería · M3 Barba y color");
    expect(filas[1]).toHaveTextContent("abono");

    await pagarEnEfectivo("500");

    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0];
    expect(cuerpo.detalles).toEqual([
      { productoId: 77, cantidad: 1, precio: 333, cuotaId: 905, montoCuota: 333 },
      { productoId: 77, cantidad: 1, precio: 67, cuotaId: 906, montoCuota: 67 },
    ]);
    expect(cuerpo.pagos).toEqual([{ formaPagoId: 1, monto: 400, recibido: 500 }]);
    // Paga el tutor principal: es el cliente de la venta.
    expect(cuerpo.clienteId).toBe(70);
    expect(cuerpo.tipoPedido).toBe("LOCAL");
    expect(cuerpo.clienteRequestId).toEqual(expect.any(String));
    expect(screen.getByText("recibo 61")).toBeInTheDocument();
    expect(screen.getByText("pagó Rosa Molina")).toBeInTheDocument();
    expect(screen.getByText("Cobrar a otro estudiante")).toBeInTheDocument();
  });

  it("D3: si se inscribió sin las fotos y se siguió a cobrar, el aviso queda a la vista", async () => {
    await montar("/academia/cobrar?inscripcion=103&monto=400", { aviso: "Quedó con las fotos pendientes: queda marcado «Faltan fotos» en su ficha." });
    expect(screen.getByText(/Quedó con las fotos pendientes/)).toBeInTheDocument();
  });

  it("D6: un carrito sin materias (backend anterior) deja el «Barbería · Cuota 2/3» del backend", async () => {
    vi.mocked(apiAcademia.carrito).mockResolvedValue({
      ...CARRITO,
      lineas: CARRITO.lineas.map(({ materias: _materias, ...l }) => l),
    });
    await montar("/academia/cobrar?inscripcion=103&monto=400");
    const filas = within(screen.getByRole("region", { name: "Cómo se reparte" })).getAllByRole("listitem");
    expect(filas[0]).toHaveTextContent("Barbería · Cuota 2/3");
    expect(filas[1]).toHaveTextContent("Barbería · Cuota 3/3");
  });

  it("el monto se cambia ahí: más que el saldo no deja confirmar, y lo nuevo se reparte otra vez", async () => {
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 62 } as unknown as Venta);
    await montar("/academia/cobrar?inscripcion=103&monto=400");
    fireEvent.change(screen.getByLabelText("Paga hoy"), { target: { value: "900" } });
    expect(screen.getByText(/Más que cero y hasta Bs 866/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar cobro/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Paga hoy"), { target: { value: "200" } });
    await pagarEnEfectivo("200");
    expect(vi.mocked(api.crearVenta).mock.calls[0][0].detalles).toEqual([
      { productoId: 77, cantidad: 1, precio: 200, cuotaId: 905, montoCuota: 200 },
    ]);
  });

  it("D2: el buscador es el de Estudiantes (mismo rótulo)", async () => {
    await montar("/academia/cobrar");
    expect(screen.getByLabelText("Buscar estudiante")).toHaveAttribute("placeholder", "Nombre, CI, código o teléfono");
  });

  it("buscando: propone lo vencido, deja elegir quién paga y avisa la otra sede", async () => {
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 63 } as unknown as Venta);
    await montar("/academia/cobrar");
    fireEvent.change(screen.getByLabelText("Buscar estudiante"), { target: { value: "cesp" } });
    await esperarDemora();
    const fila = screen.getByRole("button", { name: /Céspedes Molina, Joaquín/ });
    expect(fila).toHaveTextContent("Otra sede");
    await act(async () => {
      fireEvent.click(fila);
    });
    expect(screen.getByLabelText("Paga hoy")).toHaveValue("333");
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Quién paga" })).getByRole("radio", { name: /Joaquín/ }));
    await pagarEnEfectivo("333");
    const cuerpo = vi.mocked(api.crearVenta).mock.calls[0][0];
    expect(cuerpo.clienteId).toBe(53);
    expect(cuerpo.detalles).toHaveLength(1);
  });

  it("ronda 1 · D4: al borrar el texto con una búsqueda en vuelo, «Buscando…» se apaga", async () => {
    // La búsqueda no contesta nunca: el pedido queda en vuelo.
    vi.mocked(apiAcademia.cuotasPorCobrar).mockReturnValue(new Promise(() => undefined));
    await montar("/academia/cobrar");
    const buscador = screen.getByLabelText("Buscar estudiante");
    fireEvent.change(buscador, { target: { value: "cesp" } });
    await esperarDemora();
    expect(screen.getByText("Buscando…")).toBeInTheDocument();
    fireEvent.change(buscador, { target: { value: "" } });
    await esperarDemora();
    expect(screen.queryByText("Buscando…")).not.toBeInTheDocument();
  });

  it("desde Cobranza sin la inscripción (?alumno=&q=): lo busca y lo abre solo", async () => {
    await montar("/academia/cobrar?alumno=53&q=2026-0103");
    await esperarDemora();
    expect(apiAcademia.cuotasPorCobrar).toHaveBeenCalledWith("2026-0103");
    expect(apiAcademia.carrito).toHaveBeenCalledWith(103);
    expect(screen.getByLabelText("Paga hoy")).toBeInTheDocument();
  });

  it("sin caja abierta avisa y ofrece abrirla en la sede del grupo; abierta, sigue con el cobro", async () => {
    vi.mocked(api.cajaActual).mockResolvedValueOnce({ caja: null });
    await montar("/academia/cobrar?inscripcion=103&monto=400&sede=2&sedeNombre=Norte");
    expect(screen.getByRole("status")).toHaveTextContent("Para cobrar hace falta la caja abierta");
    expect(screen.queryByLabelText("Paga hoy")).not.toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja en 2" }));
    });
    await act(async () => {});
    expect(screen.getByLabelText("Paga hoy")).toHaveValue("400");
    expect(api.crearVenta).not.toHaveBeenCalled();
  });

  it("un reintento después de un corte manda el MISMO clienteRequestId: no cobra dos veces", async () => {
    vi.mocked(api.crearVenta)
      .mockRejectedValueOnce(Object.assign(new ApiError("Sin internet. Revisá la conexión del local.", 0), {}))
      .mockResolvedValueOnce({ id: 64 } as unknown as Venta);
    await montar("/academia/cobrar?inscripcion=103&monto=333");
    await pagarEnEfectivo("333");
    expect(screen.getByText(/Sin internet/)).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    });
    const [primero, segundo] = vi.mocked(api.crearVenta).mock.calls;
    expect(segundo[0].clienteRequestId).toBe(primero[0].clienteRequestId);
    expect(screen.getByText("recibo 64")).toBeInTheDocument();
  });

  it("si otra caja cobró la cuota en el medio, trae el saldo de hoy y lo dice", async () => {
    vi.mocked(api.crearVenta).mockRejectedValueOnce(
      Object.assign(new ApiError("La cuota ya no tiene ese saldo.", 400), { codigo: "CUOTA_SALDO" }),
    );
    await montar("/academia/cobrar?inscripcion=103&monto=333");
    await pagarEnEfectivo("333");
    expect(apiAcademia.carrito).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Las cuotas cambiaron mientras cobrabas/)).toBeInTheDocument();
  });
});

describe("lo que se lee de la dirección y el monto sugerido", () => {
  it("toma inscripción, monto y sede; lo que no es número no vale", () => {
    expect(inicialDeLaUrl(new URLSearchParams("inscripcion=103&monto=350&sede=2&sedeNombre=Norte"))).toEqual({
      inscripcionId: 103,
      alumnoId: undefined,
      monto: 350,
      q: undefined,
      sede: { id: 2, nombre: "Norte" },
    });
    expect(inicialDeLaUrl(new URLSearchParams("alumno=x&monto=-3")).monto).toBeUndefined();
  });

  it("lo acordado sin pasar el saldo; sin acuerdo, lo vencido", () => {
    expect(montoSugerido(CARRITO, 400)).toBe(400);
    expect(montoSugerido(CARRITO, 5000)).toBe(866);
    expect(montoSugerido(CARRITO)).toBe(333);
  });
});

describe("QA 23-oct · cobrar a estudiante", () => {
  it("la dirección queda con el estudiante elegido (un F5 no lo pierde) y sin el monto después de cobrar", async () => {
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 70 } as unknown as Venta);
    await montar("/academia/cobrar?alumno=53&q=2026-0103");
    await esperarDemora();
    expect(screen.getByTestId("direccion")).toHaveTextContent("?inscripcion=103&sede=2&sedeNombre=Norte");

    await montarDeNuevo("/academia/cobrar?inscripcion=103&monto=400");
    expect(screen.getByTestId("direccion")).toHaveTextContent("?inscripcion=103&monto=400");
    await pagarEnEfectivo("400");
    expect(screen.getByTestId("direccion")).toHaveTextContent("?inscripcion=103");
    expect(screen.getByTestId("direccion")).not.toHaveTextContent("monto");
  });

  it("efectivo recibido vacío: se toma el monto exacto, sin «no alcanza»", async () => {
    vi.mocked(api.crearVenta).mockResolvedValue({ id: 71 } as unknown as Venta);
    await montar("/academia/cobrar?inscripcion=103&monto=333");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Confirmar cobro/ }));
    });
    expect(screen.queryByText(/no alcanza/)).not.toBeInTheDocument();
    expect(vi.mocked(api.crearVenta).mock.calls[0][0].pagos).toEqual([{ formaPagoId: 1, monto: 333, recibido: 333 }]);
  });

  it("con dos cursos con deuda deja elegir cuál cobrar", async () => {
    vi.mocked(apiAcademia.cuotasPorCobrar).mockResolvedValue({
      alumnos: [
        { alumnoId: 53, inscripcionId: 103, nombre: "Céspedes Molina, Joaquín", codigo: "2026-0103", grupo: "Barbería · Sáb 08:00", sede: { id: 1, nombre: "Central" }, saldo: 866, vencido: true },
        { alumnoId: 53, inscripcionId: 118, nombre: "Céspedes Molina, Joaquín", codigo: "2026-0103", grupo: "Uñas · L-V 15:00", sede: { id: 1, nombre: "Central" }, saldo: 450, vencido: false },
      ],
    });
    await montar("/academia/cobrar?alumno=53&q=2026-0103");
    await esperarDemora();
    const selector = screen.getByRole("combobox", { name: "Inscripción a cobrar" });
    expect(selector.querySelectorAll("option")).toHaveLength(2);
    expect(apiAcademia.carrito).toHaveBeenLastCalledWith(103);
    await act(async () => {
      fireEvent.change(selector, { target: { value: "118" } });
    });
    expect(apiAcademia.carrito).toHaveBeenLastCalledWith(118);
    expect(screen.getByTestId("direccion")).toHaveTextContent("?inscripcion=118");
  });
});

/** Vuelve a montar la pantalla en otra dirección (lo que hace un F5 con la nueva). */
async function montarDeNuevo(ruta: string) {
  cleanup();
  await montar(ruta);
}
