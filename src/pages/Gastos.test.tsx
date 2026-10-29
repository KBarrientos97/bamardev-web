import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoriaGasto, Gasto, PlantillaGasto, ResumenGastos } from "../types";

/**
 * Las dos pantallas de gastos de bamardev-restaurant (y de todo rubro que no
 * sea farmacia): con margen como el resto de la app, cada gasto en su tarjeta,
 * lo vencido en rojo, y Gastos automáticos con su botón para volver.
 *
 * Antes usaban `bg-fondo-1` y `text-rojo`, dos clases que no existen: las
 * filas no tenían fondo y "Venció hace 8 días" salía gris.
 */

// La pantalla entera con un popup encima, y varios pasos por test: corridos
// solos tardan 1 a 2 s, pero con la suite completa en paralelo pasaban los 5 s
// y fallaban por tiempo, no por lo que prueban.
vi.setConfig({ testTimeout: 60_000 });

/** El rubro de la sesión: Gastos automáticos se arma distinto en la farmacia. */
const sesion = vi.hoisted(() => ({ rubro: "RESTAURANTE" as string | undefined }));

vi.mock("../store/AuthContext", async () => {
  // Los permisos de la plantilla de ese rol: la pantalla decide sólo con ellos.
  const { permisosDe } = await import("../test/sesiones");
  return {
    useAuth: () => ({
      usuario: { rol: "ADMIN", ...permisosDe("ADMIN"), sucursalId: null },
      rubro: sesion.rubro,
    }),
  };
});

vi.mock("../lib/api", () => ({
  api: {
    getResumenGastos: vi.fn(),
    getGastos: vi.fn(),
    getCategoriasGasto: vi.fn(async () => []),
    getSucursales: vi.fn(async () => []),
    getPlantillasGasto: vi.fn(),
    actualizarPlantillaGasto: vi.fn(),
    crearGasto: vi.fn(),
    actualizarGasto: vi.fn(),
    pagarGasto: vi.fn(),
    deshacerUltimoPagoGasto: vi.fn(),
    eliminarGasto: vi.fn(async () => ({ mensaje: "Gasto eliminado" })),
    crearCategoriaGasto: vi.fn(),
    actualizarCategoriaGasto: vi.fn(),
    eliminarCategoriaGasto: vi.fn(),
  },
}));

import { api } from "../lib/api";
import Gastos from "./Gastos";
import GastosFijos from "./GastosFijos";

const luz: Gasto = {
  id: 2,
  concepto: "Luz · DELAPAZ",
  categoria: "LUZ",
  categoriaNombre: "Luz",
  tipoCosto: "FIJO",
  monto: 420,
  pagado: 0,
  saldo: 420,
  estado: "PENDIENTE",
  fecha: "2026-09-12",
  fechaVencimiento: "2026-09-18",
  vencido: true,
  diasAtraso: 8,
  diasParaVencer: 0,
  metodoPago: null,
  beneficiario: null,
  nota: null,
  sucursalId: null,
  sucursal: null,
  recurrente: false,
  numeroFactura: null,
  nit: null,
};

const resumen: ResumenGastos = {
  total: 420,
  pagado: 0,
  pendiente: 420,
  vencido: 420,
  cantidad: 1,
  cantidadPendientes: 1,
  cantidadVencidos: 1,
  cantidadPagados: 0,
  ventasPeriodo: 8575,
};

const alquiler: PlantillaGasto = {
  id: 1,
  concepto: "Alquiler del local",
  categoria: "ALQUILER",
  categoriaNombre: "Alquiler",
  frecuencia: "MENSUAL",
  diaDelMes: 1,
  monto: 3500,
  activa: true,
  motivoPausa: null,
  beneficiario: null,
  nota: null,
  sucursalId: null,
  sucursal: null,
  proximaCarga: "2026-10-01",
  ultimaCarga: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  sesion.rubro = "RESTAURANTE";
  vi.mocked(api.getResumenGastos).mockResolvedValue(resumen);
  vi.mocked(api.getGastos).mockResolvedValue([luz]);
  vi.mocked(api.getPlantillasGasto).mockResolvedValue([alquiler]);
});

function abrir(pantalla: React.ReactNode) {
  const { container } = render(<MemoryRouter>{pantalla}</MemoryRouter>);
  return container.firstElementChild as HTMLElement;
}

describe("Gastos operativos", () => {
  it("tiene margen, cada gasto es una tarjeta y lo vencido sale en rojo", async () => {
    const raiz = abrir(<Gastos />);
    expect(raiz.className).toMatch(/\bp-4\b/);
    const vence = await screen.findByText(/Venció hace 8 días/);
    expect(vence.className).toContain("text-danger-text");
    expect(vence.closest("li")!.className).toMatch(/(^| )card( |$)/);
  });

  it("sobre las ventas da la proporción con coma, sin alarma en un mes normal", async () => {
    abrir(<Gastos />);
    // 420 de 8.575: el mismo número que antes, ahora con la coma de acá.
    const valor = await screen.findByText("4,9%");
    expect(valor.className).toContain("text-texto");
    expect(screen.getByText(/Ventas Bs 8.?575,00/)).toBeInTheDocument();
    // Con uno solo, en singular: decía "1 gastos" y "1 vencidos".
    expect(screen.getByText("1 gasto")).toBeInTheDocument();
    expect(screen.getByText(/^1 vencido · Bs 420,00$/)).toBeInTheDocument();
  });

  it("un mes que gastó más de lo que vendió dice el porcentaje real, en rojo", async () => {
    // El bug: se cortaba en 100 y este mes decía "100.0%", que se lee como
    // "se gastó lo vendido y nada más" justo cuando el negocio pierde plata.
    vi.mocked(api.getResumenGastos).mockResolvedValue({ ...resumen, total: 3000, ventasPeriodo: 1000 });
    abrir(<Gastos />);
    const valor = await screen.findByText("300,0%");
    expect(valor.className).toContain("text-danger-text");
    expect(screen.getByText(/Más que lo vendido \(Bs 1.?000,00\)/)).toBeInTheDocument();
    expect(screen.queryByText(/100[.,]0%/)).not.toBeInTheDocument();
  });

  it("sin ventas en el período no inventa un porcentaje", async () => {
    vi.mocked(api.getResumenGastos).mockResolvedValue({ ...resumen, ventasPeriodo: 0 });
    abrir(<Gastos />);
    expect(await screen.findByText("Sin ventas en el período")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

/** Una fecha a `dias` de hoy, en `yyyy-MM-dd`: el aviso mira desde hoy. */
function enDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("lo que se debe de meses anteriores", () => {
  it("se avisa arriba de la lista y Ver cuáles pide los atrasados", async () => {
    // El bug: el resumen es por mes, y una luz del mes pasado sin pagar no
    // aparecía en ningún lado mirando este mes.
    vi.mocked(api.getResumenGastos).mockResolvedValue({
      ...resumen,
      atrasado: { cantidad: 2, saldo: 650, vencidos: 1 },
    });
    abrir(<Gastos />);
    const aviso = await screen.findByRole("region", { name: "Gastos de meses anteriores" });
    expect(aviso).toHaveTextContent(/2 gastos de meses anteriores sin pagar · Bs 650,00/);
    expect(aviso).toHaveTextContent("1 ya venció");
    expect(screen.getByRole("button", { name: "De meses anteriores" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ver cuáles" }));
    });
    expect(vi.mocked(api.getGastos)).toHaveBeenLastCalledWith(
      expect.objectContaining({ filtro: "ATRASADOS" }),
    );
    // Mientras se los mira, el aviso sobra.
    expect(screen.queryByRole("region", { name: "Gastos de meses anteriores" })).not.toBeInTheDocument();
  });

  it("al día, la pantalla queda como siempre: sin aviso ni chip", async () => {
    abrir(<Gastos />);
    await screen.findByText(/Venció hace 8 días/);
    expect(screen.queryByRole("region", { name: "Gastos de meses anteriores" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "De meses anteriores" })).not.toBeInTheDocument();
  });
});

describe("el aviso de los gastos automáticos", () => {
  it("dice lo que se va a cargar solo, aunque todavía no sea un gasto", async () => {
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([
      { ...alquiler, proximaCarga: enDias(5) },
      { ...alquiler, id: 2, concepto: "Luz", monto: null, proximaCarga: enDias(10) },
      { ...alquiler, id: 3, concepto: "Seguro", activa: false, proximaCarga: null },
    ]);
    abrir(<Gastos />);
    const aviso = await screen.findByRole("region", { name: "Próximos gastos automáticos" });
    expect(aviso).toHaveTextContent("Alquiler del local");
    expect(aviso).toHaveTextContent(/Bs 3.?500,00/);
    expect(aviso).toHaveTextContent("A confirmar");
    // La pausada no se va a cargar: no se anuncia.
    expect(aviso).not.toHaveTextContent("Seguro");
    // Es un aviso, no un gasto: la lista sigue teniendo sólo la luz vencida.
    expect(screen.getAllByRole("listitem").filter((li) => li.closest("section") == null)).toHaveLength(1);
  });

  it("sin nada que se venga, no aparece", async () => {
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([]);
    abrir(<Gastos />);
    await screen.findByText(/Venció hace 8 días/);
    expect(screen.queryByRole("region", { name: "Próximos gastos automáticos" })).not.toBeInTheDocument();
  });
});

describe("Gastos automáticos", () => {
  it("tiene margen y un botón para volver a Gastos operativos", async () => {
    const raiz = abrir(<GastosFijos />);
    expect(raiz.className).toMatch(/\bp-4\b/);
    expect(screen.getByRole("link", { name: "Volver a Gastos operativos" })).toHaveAttribute(
      "href",
      "/gastos",
    );
    const fila = (await screen.findByText("Alquiler del local")).closest("li")!;
    expect(fila.className).toMatch(/(^| )card( |$)/);
  });
});

// ── Lo que se hace con un gasto ─────────────────────────────────────────────

const catalogo: CategoriaGasto[] = [
  { codigo: "ALQUILER", nombre: "Alquiler", propia: false, tipoCosto: "FIJO" },
  { codigo: "LUZ", nombre: "Luz", propia: false, tipoCosto: "FIJO" },
  { codigo: "GAS", nombre: "Gas", propia: false, tipoCosto: "VARIABLE" },
];

/** Cargado con "Ya lo pagué": el caso típico del error que hay que deshacer. */
const alquilerPagado: Gasto = {
  ...luz,
  id: 7,
  concepto: "Alquiler del local",
  categoria: "ALQUILER",
  categoriaNombre: "Alquiler",
  monto: 1000,
  pagado: 1000,
  saldo: 0,
  estado: "PAGADO",
  fechaVencimiento: null,
  vencido: false,
  diasAtraso: 0,
  metodoPago: "EFECTIVO",
};

/** Un sueldo pagado en dos veces: 500 de adelanto y 300 después. */
const sueldoParcial: Gasto = {
  ...luz,
  id: 8,
  concepto: "Sueldo de Juan",
  categoria: "SUELDOS",
  categoriaNombre: "Sueldos",
  monto: 1500,
  pagado: 800,
  saldo: 700,
  estado: "PARCIAL",
  fechaVencimiento: null,
  vencido: false,
  diasAtraso: 0,
  metodoPago: "EFECTIVO",
};

async function tocar(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

/** La tarjeta de un gasto, para tocar SUS botones y no los de otra fila. */
async function fila(concepto: string) {
  return (await screen.findByText(concepto)).closest("li")!;
}

describe("deshacer el último pago (G-01)", () => {
  it("un gasto saldado lo ofrece en su fila, y pregunta antes de borrar el pago", async () => {
    // El bug: deshacer vivía sólo en "Registrar pago", que se esconde con el
    // gasto saldado. Marcar "Ya lo pagué" por error no tenía salida.
    vi.mocked(api.getGastos).mockResolvedValue([alquilerPagado]);
    vi.mocked(api.deshacerUltimoPagoGasto).mockResolvedValue({ ...alquilerPagado, pagado: 0, saldo: 1000, estado: "PENDIENTE" });
    abrir(<Gastos />);
    const tarjeta = await fila("Alquiler del local");
    expect(within(tarjeta).queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();

    await tocar(within(tarjeta).getByRole("button", { name: "Deshacer el último pago" }));
    const dialogo = screen.getByRole("dialog", { name: "Deshacer el último pago" });
    expect(dialogo).toHaveTextContent(/pagado hasta hoy Bs 1.?000,00 de Bs 1.?000,00/);
    expect(dialogo).toHaveTextContent(/Se borra sólo el último pago registrado/);
    expect(api.deshacerUltimoPagoGasto).not.toHaveBeenCalled();

    const pedidos = vi.mocked(api.getGastos).mock.calls.length;
    await tocar(within(dialogo).getByRole("button", { name: "Sí, deshacer" }));
    expect(api.deshacerUltimoPagoGasto).toHaveBeenCalledTimes(1);
    expect(api.deshacerUltimoPagoGasto).toHaveBeenCalledWith(7);
    expect(screen.getByText("Alquiler del local: se deshizo el último pago")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // La lista y los números se vuelven a pedir: el gasto ya no está pagado.
    expect(vi.mocked(api.getGastos).mock.calls.length).toBeGreaterThan(pedidos);
  });

  it("sin nada pagado no hay nada que deshacer", async () => {
    abrir(<Gastos />);
    const tarjeta = await fila("Luz · DELAPAZ");
    expect(within(tarjeta).queryByRole("button", { name: "Deshacer el último pago" })).not.toBeInTheDocument();
  });

  it("un doble clic en «Sí, deshacer» borra un solo pago", async () => {
    // El endpoint no es idempotente: cada llamada borra el último pago que
    // encuentra, y sobre un sueldo pagado en dos veces se iba también el adelanto.
    vi.mocked(api.getGastos).mockResolvedValue([sueldoParcial]);
    let contestar!: (g: Gasto) => void;
    vi.mocked(api.deshacerUltimoPagoGasto).mockImplementation(
      () => new Promise((resolver) => (contestar = resolver)),
    );
    abrir(<Gastos />);
    await tocar(within(await fila("Sueldo de Juan")).getByRole("button", { name: "Deshacer el último pago" }));
    const si = screen.getByRole("button", { name: "Sí, deshacer" });
    await act(async () => {
      fireEvent.click(si);
      fireEvent.click(si);
    });
    expect(api.deshacerUltimoPagoGasto).toHaveBeenCalledTimes(1);
    await act(async () => contestar({ ...sueldoParcial, pagado: 500, saldo: 1000 }));
  });

  it("si el backend no deja, el error se lee en el mismo diálogo", async () => {
    vi.mocked(api.getGastos).mockResolvedValue([alquilerPagado]);
    vi.mocked(api.deshacerUltimoPagoGasto).mockRejectedValue(new Error("Ese gasto no tiene pagos que deshacer."));
    abrir(<Gastos />);
    await tocar(within(await fila("Alquiler del local")).getByRole("button", { name: "Deshacer el último pago" }));
    await tocar(screen.getByRole("button", { name: "Sí, deshacer" }));
    const dialogo = screen.getByRole("dialog", { name: "Deshacer el último pago" });
    expect(dialogo).toHaveTextContent("Ese gasto no tiene pagos que deshacer.");
    expect(within(dialogo).getByRole("button", { name: "Sí, deshacer" })).toBeEnabled();
  });
});

describe("registrar pago (BUG-finanzas-4)", () => {
  it("deshacer no dice el total como si fuera el último pago: lo pagado va aparte, y pregunta", async () => {
    // El bug: decía "Deshacer el último pago de Bs 800" sobre un sueldo pagado
    // 500 + 300, y lo que se borraba eran los 300.
    vi.mocked(api.getGastos).mockResolvedValue([sueldoParcial]);
    vi.mocked(api.deshacerUltimoPagoGasto).mockResolvedValue({ ...sueldoParcial, pagado: 500, saldo: 1000 });
    abrir(<Gastos />);
    await tocar(within(await fila("Sueldo de Juan")).getByRole("button", { name: "Registrar pago" }));
    const panel = screen.getByRole("dialog", { name: "Registrar pago" });
    expect(panel).toHaveTextContent(/Pagado hasta hoy Bs 800,00/);
    expect(panel).not.toHaveTextContent(/Deshacer el último pago de/);

    await tocar(within(panel).getByRole("button", { name: "Deshacer el último pago" }));
    expect(api.deshacerUltimoPagoGasto).not.toHaveBeenCalled();
    const pregunta = screen.getByRole("dialog", { name: "Deshacer el último pago" });
    expect(pregunta).toHaveTextContent(/si se pagó en partes, queda lo anterior/);

    await tocar(within(pregunta).getByRole("button", { name: "Sí, deshacer" }));
    expect(api.deshacerUltimoPagoGasto).toHaveBeenCalledWith(8);
  });

  it("«No, dejarlo» vuelve al pago sin borrar nada", async () => {
    vi.mocked(api.getGastos).mockResolvedValue([sueldoParcial]);
    abrir(<Gastos />);
    await tocar(within(await fila("Sueldo de Juan")).getByRole("button", { name: "Registrar pago" }));
    const panel = screen.getByRole("dialog", { name: "Registrar pago" });
    await tocar(within(panel).getByRole("button", { name: "Deshacer el último pago" }));
    await tocar(screen.getByRole("button", { name: "No, dejarlo" }));
    expect(screen.getByRole("dialog", { name: "Registrar pago" })).toBeInTheDocument();
    expect(api.deshacerUltimoPagoGasto).not.toHaveBeenCalled();
  });
});

describe("eliminar un gasto (G-02)", () => {
  it("pregunta, dice que se van sus pagos, y recién ahí lo borra", async () => {
    // El bug: en esta pantalla no había cómo sacar un gasto cargado dos veces,
    // que inflaba el total del mes y restaba de más en el Estado de resultado.
    vi.mocked(api.getGastos).mockResolvedValue([alquilerPagado]);
    abrir(<Gastos />);
    const tarjeta = await fila("Alquiler del local");

    await tocar(within(tarjeta).getByRole("button", { name: "Eliminar Alquiler del local" }));
    let dialogo = screen.getByRole("dialog", { name: "¿Eliminar este gasto?" });
    expect(dialogo).toHaveTextContent(/Se borra el gasto y sus pagos registrados \(Bs 1.?000,00 pagados\)/);
    await tocar(within(dialogo).getByRole("button", { name: "No, dejarlo" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.eliminarGasto).not.toHaveBeenCalled();

    await tocar(within(tarjeta).getByRole("button", { name: "Eliminar Alquiler del local" }));
    dialogo = screen.getByRole("dialog", { name: "¿Eliminar este gasto?" });
    await tocar(within(dialogo).getByRole("button", { name: "Sí, eliminar" }));
    expect(api.eliminarGasto).toHaveBeenCalledWith(7);
    expect(screen.getByText("Alquiler del local: eliminado")).toBeInTheDocument();
  });
});

describe("editar no deja bajar el monto por debajo de lo pagado (G-04)", () => {
  async function editar(gasto: Gasto, monto: string) {
    vi.mocked(api.getGastos).mockResolvedValue([gasto]);
    abrir(<Gastos />);
    await tocar(within(await fila(gasto.concepto)).getByRole("button", { name: "Editar" }));
    const form = screen.getByRole("dialog", { name: "Editar gasto" });
    fireEvent.change(within(form).getByLabelText("Monto (Bs)"), { target: { value: monto } });
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    return form;
  }

  it("frena con lo que ya se pagó y no manda nada", async () => {
    // El bug: un alquiler de 1.000 pagado y corregido a 600 quedaba "Total 600
    // / Pagado 1.000", y lo pagado de más se comía el pendiente del mes.
    const form = await editar(alquilerPagado, "600");
    expect(form).toHaveTextContent(/Ya se pagaron Bs 1.?000,00: deshacé el pago antes de bajar el monto/);
    expect(api.actualizarGasto).not.toHaveBeenCalled();
  });

  it("un gasto que ya quedó roto, sin tocar el monto, no habla de bajarlo", async () => {
    // El PATCH viejo dejó gastos "Total 600 / Pagado 1.000". Corregirle sólo
    // el concepto frenaba con "antes de bajar el monto", que nadie tocó.
    const roto: Gasto = { ...alquilerPagado, monto: 600, pagado: 1000, saldo: 0 };
    const form = await editar(roto, "600");
    expect(form).toHaveTextContent(/quedó con más pagado \(Bs 1.?000,00\) que su monto \(Bs 600,00\)/);
    expect(form).not.toHaveTextContent(/antes de bajar el monto/);
    expect(api.actualizarGasto).not.toHaveBeenCalled();
  });

  it("subirlo sí se guarda", async () => {
    vi.mocked(api.actualizarGasto).mockResolvedValue({ ...alquilerPagado, monto: 1200 });
    await editar(alquilerPagado, "1.200");
    expect(api.actualizarGasto).toHaveBeenCalledWith(7, expect.objectContaining({ monto: 1200 }));
  });

  it("bajarlo justo hasta lo pagado sí se guarda: queda saldado", async () => {
    // El borde que la regla deja pasar a propósito, igual que el backend: un
    // sueldo de 1.500 con 800 pagados corregido a 800 queda saldado, no "de
    // menos". Una comparación con >= o sin tolerancia frenaría esa corrección.
    vi.mocked(api.actualizarGasto).mockResolvedValue({ ...sueldoParcial, monto: 800, saldo: 0, estado: "PAGADO" });
    await editar(sueldoParcial, "800");
    expect(api.actualizarGasto).toHaveBeenCalledWith(8, expect.objectContaining({ monto: 800 }));
    expect(screen.queryByText(/Ya se pagaron/)).not.toBeInTheDocument();
  });

  it("si el backend lo rechaza igual (otro pagó mientras tanto), se ve su mensaje", async () => {
    // El 400 MONTO_MENOR_A_PAGADO del backend: la pantalla creía que no había
    // nada pagado, pero entre que se abrió y se guardó entró un pago.
    const mensaje =
      "Ya se pagaron Bs 300,00 de este gasto: deshacé el pago antes de bajar el monto a Bs 100,00.";
    vi.mocked(api.actualizarGasto).mockRejectedValue(new Error(mensaje));
    const form = await editar(luz, "100");
    expect(api.actualizarGasto).toHaveBeenCalled();
    expect(form).toHaveTextContent(mensaje);
  });
});

describe("categorías desde el formulario del gasto (G-03)", () => {
  async function nuevoGastoConConcepto() {
    vi.mocked(api.getCategoriasGasto).mockResolvedValue(catalogo);
    abrir(<Gastos />);
    await fila("Luz · DELAPAZ");
    await tocar(screen.getByRole("button", { name: /Nuevo gasto/ }));
    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    fireEvent.change(within(form).getByLabelText("Concepto"), { target: { value: "Banda del sábado" } });
    await tocar(within(form).getByRole("button", { name: /Crear o corregir categorías/ }));
  }

  it("se crea una, queda elegida y lo que ya estaba escrito sigue ahí", async () => {
    const musica: CategoriaGasto = {
      codigo: "MUSICA_EN_VIVO",
      nombre: "Música en vivo",
      propia: true,
      tipoCosto: "VARIABLE",
    };
    vi.mocked(api.crearCategoriaGasto).mockResolvedValue(musica);
    await nuevoGastoConConcepto();
    const panel = screen.getByRole("dialog", { name: "Categorías de gasto" });
    await tocar(within(panel).getByRole("button", { name: /Nueva categoría/ }));
    fireEvent.change(within(panel).getByLabelText("Nombre"), { target: { value: "Música en vivo" } });
    await tocar(within(panel).getByRole("radio", { name: /^Variable/ }));
    await tocar(within(panel).getByRole("button", { name: "Crear y elegir" }));

    expect(api.crearCategoriaGasto).toHaveBeenCalledWith({ nombre: "Música en vivo", tipoCosto: "VARIABLE" });
    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    expect(within(form).getByLabelText("Concepto")).toHaveValue("Banda del sábado");
    expect(within(form).getByLabelText("Categoría")).toHaveDisplayValue("Música en vivo (Variable)");
  });

  it("Escape en el panel vuelve al gasto, no lo cierra", async () => {
    // Cerrar todo tiraba lo escrito, que es justo lo que el panel tiene que cuidar.
    await nuevoGastoConConcepto();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    expect(within(form).getByLabelText("Concepto")).toHaveValue("Banda del sábado");
  });

  it("corregir el tipo de una del pack se ve en el desplegable sin recargar la página", async () => {
    vi.mocked(api.actualizarCategoriaGasto).mockResolvedValue({ ...catalogo[2], tipoCosto: "FIJO" });
    await nuevoGastoConConcepto();
    const panel = screen.getByRole("dialog", { name: "Categorías de gasto" });
    await tocar(within(panel).getByRole("button", { name: "Variable: corregir si Gas es fijo o variable" }));
    await tocar(within(panel).getByRole("button", { name: /^Fijo/ }));
    expect(api.actualizarCategoriaGasto).toHaveBeenCalledWith("GAS", { tipoCosto: "FIJO" });
    await tocar(within(panel).getByRole("button", { name: "Volver al gasto" }));
    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    expect(within(form).getByRole("option", { name: "Gas (Fijo)" })).toBeInTheDocument();
    expect(api.getCategoriasGasto).toHaveBeenCalledTimes(1);
  });
});

describe("categorías desde Gastos automáticos (G-03)", () => {
  async function nuevaRegla() {
    vi.mocked(api.getCategoriasGasto).mockResolvedValue(catalogo);
    abrir(<GastosFijos />);
    await screen.findByText("Alquiler del local");
    await tocar(screen.getByRole("button", { name: /Nuevo gasto automático/ }));
    return screen.getByRole("dialog", { name: "Nuevo gasto automático" });
  }

  it("su formulario también deja crear o corregir categorías, y vuelve a la regla", async () => {
    const form = await nuevaRegla();
    await tocar(within(form).getByRole("button", { name: /Crear o corregir categorías/ }));
    const panel = screen.getByRole("dialog", { name: "Categorías de gasto" });
    expect(within(panel).getByRole("button", { name: /Nueva categoría/ })).toBeInTheDocument();
    await tocar(within(panel).getByRole("button", { name: "Volver al gasto automático" }));
    expect(screen.getByRole("dialog", { name: "Nuevo gasto automático" })).toBeInTheDocument();
  });

  it("en la farmacia su formulario queda como estaba, sin el panel", async () => {
    // Guarda: la farmacia administra sus categorías desde su pantalla de
    // gastos, y este formulario no tiene por qué cambiarle.
    sesion.rubro = "FARMACIA";
    const form = await nuevaRegla();
    expect(within(form).getByLabelText("Categoría")).toHaveDisplayValue("Elegí una categoría");
    expect(within(form).queryByRole("button", { name: /Crear o corregir categorías/ })).not.toBeInTheDocument();
  });
});

describe("retirar la categoría que el gasto ya tenía (G-03)", () => {
  const musica: CategoriaGasto = {
    codigo: "MUSICA_EN_VIVO",
    nombre: "Música en vivo",
    propia: true,
    tipoCosto: "VARIABLE",
  };

  beforeEach(() => {
    vi.mocked(api.getCategoriasGasto).mockResolvedValue([...catalogo, musica]);
  });

  /** Desde el formulario abierto: el panel, el lápiz de «Música en vivo», quitarla y volver. */
  async function retirarMusica(volver: string) {
    await tocar(screen.getByRole("button", { name: /Crear o corregir categorías/ }));
    const panel = screen.getByRole("dialog", { name: "Categorías de gasto" });
    await tocar(within(panel).getByRole("button", { name: "Editar Música en vivo" }));
    await tocar(within(panel).getByRole("button", { name: /Quitar de la lista/ }));
    expect(api.eliminarCategoriaGasto).toHaveBeenCalledWith("MUSICA_EN_VIVO");
    await tocar(within(panel).getByRole("button", { name: volver }));
  }

  it("el gasto la conserva: se ve, se puede volver a elegir y se guarda con ella", async () => {
    // El bug: retirarla vaciaba el desplegable y Guardar frenaba con "Elegí
    // una categoría". Para corregirle la nota a la banda había que cambiarle
    // la categoría, aunque el panel dice que los gastos que la usan no se tocan.
    const banda: Gasto = {
      ...luz,
      id: 9,
      concepto: "Banda del sábado",
      categoria: "MUSICA_EN_VIVO",
      categoriaNombre: "Música en vivo",
      tipoCosto: "VARIABLE",
      monto: 600,
      saldo: 600,
      fechaVencimiento: null,
      vencido: false,
      diasAtraso: 0,
    };
    vi.mocked(api.getGastos).mockResolvedValue([banda]);
    vi.mocked(api.actualizarGasto).mockResolvedValue(banda);
    abrir(<Gastos />);
    await tocar(within(await fila("Banda del sábado")).getByRole("button", { name: "Editar" }));
    await retirarMusica("Volver al gasto");

    const form = screen.getByRole("dialog", { name: "Editar gasto" });
    const desplegable = within(form).getByLabelText("Categoría");
    expect(desplegable).toHaveDisplayValue("Música en vivo (ya no se ofrece)");
    // Cambiada por error, la que tenía no se pierde.
    fireEvent.change(desplegable, { target: { value: "LUZ" } });
    fireEvent.change(desplegable, { target: { value: "MUSICA_EN_VIVO" } });
    expect(desplegable).toHaveDisplayValue("Música en vivo (ya no se ofrece)");

    fireEvent.change(within(form).getByLabelText("Nota (opcional)"), { target: { value: "Llega a las 21" } });
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    expect(api.actualizarGasto).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ categoria: "MUSICA_EN_VIVO", nota: "Llega a las 21" }),
    );
  });

  it("en un gasto nuevo, retirar la que se había elegido pide elegir otra", async () => {
    // La excepción es sólo para la que el gasto ya tenía: uno nuevo no tiene
    // por qué nacer en una categoría que se acaba de retirar.
    abrir(<Gastos />);
    await fila("Luz · DELAPAZ");
    await tocar(screen.getByRole("button", { name: /Nuevo gasto/ }));
    fireEvent.change(
      within(screen.getByRole("dialog", { name: "Nuevo gasto" })).getByLabelText("Categoría"),
      { target: { value: "MUSICA_EN_VIVO" } },
    );
    await retirarMusica("Volver al gasto");

    const form = screen.getByRole("dialog", { name: "Nuevo gasto" });
    expect(within(form).getByLabelText("Categoría")).toHaveDisplayValue("Elegí una categoría");
    expect(within(form).queryByRole("option", { name: /ya no se ofrece/ })).not.toBeInTheDocument();
  });

  it("una regla de Gastos automáticos también la conserva", async () => {
    const regla: PlantillaGasto = {
      ...alquiler,
      id: 4,
      concepto: "Banda de los sábados",
      categoria: "MUSICA_EN_VIVO",
      categoriaNombre: "Música en vivo",
    };
    vi.mocked(api.getPlantillasGasto).mockResolvedValue([regla]);
    vi.mocked(api.actualizarPlantillaGasto).mockResolvedValue(regla);
    abrir(<GastosFijos />);
    const tarjeta = (await screen.findByText("Banda de los sábados")).closest("li")!;
    await tocar(within(tarjeta).getByRole("button", { name: "Editar" }));
    await retirarMusica("Volver al gasto automático");

    const form = screen.getByRole("dialog", { name: "Editar gasto automático" });
    expect(within(form).getByLabelText("Categoría")).toHaveDisplayValue("Música en vivo (ya no se ofrece)");
    await tocar(within(form).getByRole("button", { name: "Guardar" }));
    expect(api.actualizarPlantillaGasto).toHaveBeenCalledWith(
      4,
      expect.objectContaining({ categoria: "MUSICA_EN_VIVO" }),
    );
  });
});
