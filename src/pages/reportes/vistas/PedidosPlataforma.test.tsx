import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PedidoPlataforma, ReportePedidosPlataforma } from "../../../lib/pedidosPlataforma/tipos";
import { ContextoReporte, type DatosReporte } from "../contexto";
import PedidosPlataforma from "./PedidosPlataforma";

vi.setConfig({ testTimeout: 60_000 });

/**
 * Reportes › Yango / PedidosYa con el precio de la app (22-nov,
 * CONTRATO-plataformas-supervision-reportes §3 y §4): «Por producto» va al
 * precio de la app y cierra con «Descuentos», y el resumen impreso dice el
 * descuento y la nota de cada pedido debajo de su N°.
 */

const reporte = vi.hoisted(() => vi.fn());

vi.mock("../../../lib/api", async (original) => {
  const real = await original<typeof import("../../../lib/api")>();
  return { ...real, api: { ...real.api, reportePedidosPlataforma: (...a: unknown[]) => reporte(...a) } };
});

vi.mock("../../../store/AuthContext", () => ({
  useAuth: () => ({
    rubro: "RESTAURANTE",
    usuario: { id: 1, username: "admin", nombre: "Admin Demo", permisos: ["plataformas.ver"] },
    negocio: { alias: "demo", nombre: "Negocio Demo", features: ["pedidos_pedidosya"] },
  }),
}));

const DATOS: DatosReporte = {
  periodo: { preset: "mes", desde: "2026-11-01", hasta: "2026-11-22" },
  comparacion: { desde: "2026-10-01", hasta: "2026-10-22", contra: "", leyenda: "" },
  rango: { desde: "2026-11-01", hasta: "2026-11-22" },
  rangoAnterior: { desde: "2026-10-01", hasta: "2026-10-22" },
  sucursalNombre: "",
  registrarExportacion: () => {},
  veReporte: () => false,
};

const pedido = (id: number, extra: Partial<PedidoPlataforma>): PedidoPlataforma => ({
  id,
  clienteRequestId: `r-${id}`,
  plataforma: "PEDIDOS_YA",
  codigoExterno: `N${id}`,
  fecha: "2026-11-20T15:00:00.000Z",
  almacen: { id: 1, nombre: "Principal" },
  usuario: { id: 2, nombre: "Cajera Demo" },
  cajaId: 1,
  total: 0,
  sinStock: false,
  anuladoEn: null,
  motivoAnulacion: null,
  detalles: [],
  ...extra,
});

/** Dos vivos (A con descuento y nota, B sólo con descuento) y uno anulado con los dos. */
const CON_DESCUENTOS: ReportePedidosPlataforma = {
  plataforma: "PEDIDOS_YA",
  periodo: {
    indice: 0,
    desde: "2026-11-19T04:00:00.000Z",
    hasta: "2026-11-26T04:00:00.000Z",
    pagaEl: "2026-11-27",
    enCurso: true,
    etiqueta: "jue 19 al mié 25 de nov",
  },
  cantidad: 2,
  subtotal: 125,
  descuentos: 12,
  total: 113,
  anulados: { cantidad: 1, total: 37 },
  porDia: [{ fecha: "2026-11-20", cantidad: 2, total: 113 }],
  porProducto: [
    { productoId: 1, nombre: "Brasa económico", cantidad: 3, total: 60 },
    { productoId: 2, nombre: "Pique para compartir", cantidad: 1, total: 40 },
    { productoId: 3, nombre: "Gaseosa 1.5L", cantidad: 2, total: 25 },
  ],
  porSucursal: [{ almacenId: 1, nombre: "Principal", cantidad: 2, total: 113 }],
  pedidos: [
    pedido(31, { total: 73, subtotal: 80, descuento: 7, observaciones: "sin ají, extra servilletas y el cliente pide que lo dejen en portería" }),
    pedido(32, { total: 40, subtotal: 45, descuento: 5, observaciones: null }),
    pedido(33, {
      total: 37,
      subtotal: 40,
      descuento: 3,
      observaciones: "cargado dos veces",
      anuladoEn: "2026-11-20T16:00:00.000Z",
      motivoAnulacion: "Error al cargar",
    }),
  ],
};

function montar() {
  return render(
    <MemoryRouter>
      <ContextoReporte.Provider value={DATOS}>
        <PedidosPlataforma />
      </ContextoReporte.Provider>
    </MemoryRouter>,
  );
}

/** «Bs 60,00» → 60. */
const plata = (t: string | null | undefined) => Number((t ?? "").replace(/[^\d,]/g, "").replace(",", "."));

beforeEach(() => {
  reporte.mockReset();
  reporte.mockResolvedValue(CON_DESCUENTOS);
});
afterEach(cleanup);

describe("«Por producto» con descuentos de la app", () => {
  it("cierra con «Descuentos −Bs X» y productos − descuentos = el Total", async () => {
    montar();
    const titulo = await screen.findByText("Por producto");
    const bloque = titulo.closest("section")!;
    const lista = bloque.querySelector(".card")!;
    const filas = Array.from(lista.children) as HTMLElement[];
    expect(filas).toHaveLength(4);
    const ultima = filas.at(-1)!;
    expect(ultima).toHaveTextContent("Descuentos");
    expect(ultima).toHaveTextContent(/−Bs\s12,00/);
    expect(ultima).not.toHaveTextContent(/unidad/);

    const productos = filas.slice(0, 3).map((f) => plata(f.querySelector(".text-right p")?.textContent));
    expect(productos).toEqual([60, 40, 25]);
    // La tarjeta «Total» (la de arriba, no la tabla del papel) dice el neto.
    const kpi = Array.from(document.querySelectorAll(".card")).find((c) => c.querySelector("p span")?.textContent === "Total")!;
    const total = plata(kpi.querySelector("p + p")?.textContent);
    expect(total).toBe(113);
    expect(kpi).toHaveTextContent(/Descuentos: Bs\s12,00/);
    expect(productos.reduce((s, n) => s + n, 0) - 12).toBe(total);
  });

  it("sin descuentos (o un backend viejo que no los manda) la lista queda como siempre", async () => {
    const { descuentos: _d, subtotal: _s, ...viejo } = CON_DESCUENTOS;
    reporte.mockResolvedValue({ ...viejo, total: 125, pedidos: [] });
    montar();
    const bloque = (await screen.findByText("Por producto")).closest("section")!;
    expect(bloque.querySelector(".card")!.children).toHaveLength(3);
    expect(bloque).not.toHaveTextContent("Descuentos");
  });
});

describe("la lista de pedidos en pantalla", () => {
  it("el descuento y la nota del anulado van tachados como lo que llevaba; los del vivo, no", async () => {
    montar();
    await screen.findByText("Por producto");
    const lista = screen.getAllByText("Pedidos").find((e) => e.tagName === "H3")!.closest("section")!;
    const vivo = within(lista).getByText(/^Descuento Bs\s7,00$/);
    expect(vivo).not.toHaveClass("line-through");
    expect(within(lista).getByText(/^Obs\.: sin ají, extra servilletas/)).not.toHaveClass("line-through");
    expect(within(lista).getByText(/^Descuento Bs\s3,00$/)).toHaveClass("line-through");
    expect(within(lista).getByText("Obs.: cargado dos veces")).toHaveClass("line-through");
    expect(within(lista).getByText("Anulado: Error al cargar")).not.toHaveClass("line-through");
  });
});

describe("el resumen impreso: el descuento y la nota de cada pedido", () => {
  const filaDe = (container: HTMLElement, n: string) => {
    const papel = container.querySelector(".resumen-plataforma") as HTMLElement;
    const celda = within(papel).getByText(n).closest("td")!;
    return { celda, fila: celda.closest("tr")! };
  };

  it("debajo del N°: «Descuento Bs X» y «Obs.: …», cada uno en su renglón y sólo si existe", async () => {
    const { container } = montar();
    await screen.findByText("Por producto");
    const a = filaDe(container, "N31");
    const extras = Array.from(a.celda.querySelectorAll(".extra")).map((e) => e.textContent);
    expect(extras).toHaveLength(2);
    expect(extras[0]).toMatch(/^Descuento Bs\s7,00$/);
    expect(extras[1]).toBe("Obs.: sin ají, extra servilletas y el cliente pide que lo dejen en portería");
    // El total de la fila es el neto.
    expect(a.fila.querySelector(".num")).toHaveTextContent(/Bs\s73,00/);

    const b = filaDe(container, "N32");
    expect(Array.from(b.celda.querySelectorAll(".extra")).map((e) => e.textContent)).toEqual([expect.stringMatching(/^Descuento Bs\s5,00$/)]);
  });

  it("en un anulado, el descuento y la nota van tachados como el resto; la marca no", async () => {
    const { container } = montar();
    await screen.findByText("Por producto");
    const c = filaDe(container, "N33");
    const extras = Array.from(c.celda.querySelectorAll(".extra"));
    expect(extras).toHaveLength(2);
    for (const e of extras) expect(e.querySelector(".tachado")).not.toBeNull();
    expect(c.celda.querySelector(".marca")).toHaveTextContent("Anulado: Error al cargar");
    expect(c.celda.querySelector(".marca .tachado")).toBeNull();
  });
});
