import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Credito, CreditoDetalle, FormaPago } from "../types";

/**
 * Cuentas por cobrar (Créditos): el listado, el detalle con los recibos de
 * cada pago y el cobro de un abono, en paridad con la app.
 */

vi.mock("../store/AuthContext", () => ({
  useAuth: () => ({
    usuario: {
      id: 1,
      username: "omar",
      nombre: "Omar",
      rol: "ADMIN",
      // Cobra sin caja: así la página no pregunta por la caja abierta.
      permisos: ["credito.cobrar_sin_caja"],
      permisosPropios: [],
    },
    negocio: { id: 1, nombre: "Pollos Omar", features: [] },
    incluye: () => true,
  }),
}));

vi.mock("../lib/useSucursales", () => ({
  useSucursales: () => ({ sucursalId: null, elegir: false, valorChip: "", opciones: [], alElegir: () => {} }),
}));

vi.mock("../components/QrCobro", () => ({
  QrParaCobrar: (p: { onConfirmar: () => void }) => <button onClick={p.onConfirmar}>ya llegó el QR</button>,
}));

vi.mock("../lib/compartirTicket", () => ({ compartirComoImagen: vi.fn() }));

vi.mock("../lib/api", () => ({
  // El catch del abono pregunta `instanceof ApiError` y lee el código.
  ApiError: class ApiError extends Error {
    codigo?: string;
    constructor(mensaje: string, _status?: number, extra?: Record<string, unknown>) {
      super(mensaje);
      this.codigo = extra?.codigo as string | undefined;
    }
  },
  api: {
    getCreditos: vi.fn(),
    getClientesCredito: vi.fn(async () => []),
    getFormasPago: vi.fn(),
    cajaActual: vi.fn(async () => ({ caja: null })),
    getCredito: vi.fn(),
    registrarAbono: vi.fn(),
    actualizarLimiteCredito: vi.fn(),
  },
}));

import { ApiError, api } from "../lib/api";
import Creditos from "./Creditos";

const FORMAS = [
  { id: 1, nombre: "Efectivo" },
  { id: 2, nombre: "QR" },
] as FormaPago[];

const local = (mes: number, dia: number, hora = 15) => new Date(2026, mes - 1, dia, hora).toISOString();

/** Bs 135 fiados, Bs 35 de adelanto y un abono de Bs 50: debe Bs 50 y vence en 5 días. */
const ROSA: Credito = {
  id: 7,
  codigo: "CR00007",
  ventaId: 90,
  comprobante: "V-000123",
  fechaVenta: local(10, 20),
  clienteId: 5,
  clienteNombre: "Rosa Mamani",
  clienteTelefono: null,
  montoTotal: 135,
  adelanto: 35,
  pagado: 85,
  saldo: 50,
  fechaCompromiso: local(11, 2, 23),
  estado: "ABONADO",
  vencido: false,
  diasAtraso: 0,
  diasParaVencer: 5,
};

/** Vence en 8 días: fuera de "Vencen pronto". */
const JUAN: Credito = {
  ...ROSA,
  id: 8,
  codigo: "CR00008",
  clienteId: 6,
  clienteNombre: "Juan Pérez",
  adelanto: 0,
  pagado: 0,
  montoTotal: 40,
  saldo: 40,
  estado: "PENDIENTE",
  diasParaVencer: 8,
};

const DETALLE_ROSA: CreditoDetalle = {
  ...ROSA,
  nota: "Paga el 5",
  clienteNota: "Paga los viernes",
  registradoPor: "Omar",
  detalles: [
    { producto: "Pollo entero", cantidad: 2, precio: 60, subtotal: 120 },
    { producto: "Gaseosa 2L", cantidad: 1, precio: 15, subtotal: 15 },
  ],
  pagos: [{ id: 11, monto: 50, formaPago: "Efectivo", fecha: local(10, 22), usuario: "Caja 1" }],
};

async function montar() {
  render(
    <MemoryRouter>
      <Creditos />
    </MemoryRouter>,
  );
  await act(async () => {});
}

/** El valor de una fila del papel. */
function valorDe(contenedor: HTMLElement, etiqueta: string): string | null {
  return within(contenedor).getByText(etiqueta).closest("div")!.querySelector("dd")!.textContent;
}

const tarjeta = (cliente: string) => screen.getByText(cliente).closest("li")!;

async function abrirAbono(cliente = "Rosa Mamani") {
  fireEvent.click(within(tarjeta(cliente)).getByRole("button", { name: "Registrar abono" }));
  await act(async () => {});
  return screen.getByRole("dialog", { name: "Registrar abono" });
}

async function cobrar(formulario: HTMLElement) {
  await act(async () => {
    fireEvent.click(within(formulario).getByRole("button", { name: "Cobrar" }));
  });
}

/** El `clienteRequestId` de cada abono mandado, en orden. */
const idsMandados = () =>
  vi.mocked(api.registrarAbono).mock.calls.map(([, cuerpo]) => cuerpo.clienteRequestId);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getCreditos).mockResolvedValue([ROSA, JUAN]);
  vi.mocked(api.getFormasPago).mockResolvedValue(FORMAS);
  vi.mocked(api.getCredito).mockResolvedValue(DETALLE_ROSA);
});

describe("BUG-finanzas-8: el aviso de vencimiento usa el mismo umbral que «Vencen pronto»", () => {
  it("una cuenta que vence en 5 días lleva su marca; una de 8, no", async () => {
    // Antes la marca salía con 3 días o menos y el filtro trae hasta 7: la
    // cuenta de 5 días aparecía en "Vencen pronto" sin ninguna marca.
    await montar();
    expect(within(tarjeta("Rosa Mamani")).getByText("Vence en 5 d")).toBeInTheDocument();
    expect(within(tarjeta("Juan Pérez")).queryByText(/Vence en/)).not.toBeInTheDocument();
  });

  describe("sin los días del backend", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("los cuenta como él, truncando: con 14 horas por delante «vence hoy»", async () => {
      // El respaldo pasó de redondear para arriba a truncar, como
      // `calcularVencimiento`. Con `ceil`, la cuenta que vence hoy a las 23:59
      // (le quedan 14 horas) decía "Vence en 1 d", y la de 5 días y 14 horas,
      // "Vence en 6 d": otra marca que la del filtro. Las cuentas de arriba
      // traen los días del backend y nunca pasan por este cálculo.
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 9, 28, 10, 0));
      const sinDias: Credito = { ...ROSA, diasAtraso: undefined, diasParaVencer: undefined };
      // El compromiso es a las 23:59:59 del día pactado, como lo guarda el backend.
      const compromiso = (mes: number, dia: number) => new Date(2026, mes - 1, dia, 23, 59, 59).toISOString();
      vi.mocked(api.getCreditos).mockResolvedValue([
        { ...sinDias, id: 20, clienteNombre: "Ana Quispe", fechaCompromiso: compromiso(10, 28) },
        { ...sinDias, id: 21, clienteNombre: "Luis Choque", fechaCompromiso: compromiso(11, 2) },
      ]);
      await montar();
      expect(within(tarjeta("Ana Quispe")).getByText("Vence hoy")).toBeInTheDocument();
      expect(within(tarjeta("Luis Choque")).getByText("Vence en 5 d")).toBeInTheDocument();
    });
  });
});

describe("BUG-finanzas-11: en Créditos, Enter busca", () => {
  it("escribir el nombre y apretar Enter pide la búsqueda al backend", async () => {
    await montar();
    const buscador = screen.getByPlaceholderText("Buscar por cliente o código (CR00007)");
    fireEvent.change(buscador, { target: { value: " rosa " } });
    await act(async () => {
      fireEvent.keyDown(buscador, { key: "Enter", code: "Enter" });
    });
    expect(api.getCreditos).toHaveBeenLastCalledWith(expect.objectContaining({ q: "rosa" }));
  });
});

describe("el detalle de la cuenta", () => {
  async function abrirDetalle() {
    await montar();
    fireEvent.click(within(tarjeta("Rosa Mamani")).getByText("Rosa Mamani"));
    await act(async () => {});
    return screen.getByRole("dialog", { name: "Detalle del crédito" });
  }

  it("BUG-finanzas-9: muestra la nota de la cuenta Y la del cliente", async () => {
    // Se mostraba `nota || clienteNota`: con las dos, la del cliente no se veía.
    const detalle = await abrirDetalle();
    expect(within(detalle).getByText("Nota de la cuenta")).toBeInTheDocument();
    expect(within(detalle).getByText("Paga el 5")).toBeInTheDocument();
    expect(within(detalle).getByText("Nota del cliente")).toBeInTheDocument();
    expect(within(detalle).getByText("Paga los viernes")).toBeInTheDocument();
  });

  it("C-01 / CRE-6: cada pago tiene su recibo, el adelanto primero", async () => {
    const detalle = await abrirDetalle();
    expect(within(detalle).getByText("Pagos (2)")).toBeInTheDocument();
    const recibos = within(detalle).getAllByRole("button", { name: /^Recibo/ });
    expect(recibos.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Recibo del adelanto de Bs 35,00 del 20/10/2026",
      "Recibo del abono de Bs 50,00 del 22/10/2026",
    ]);

    fireEvent.click(recibos[1]);
    const recibo = screen.getByRole("dialog", { name: "Recibo de pago" });
    expect(valorDe(recibo, "Abono recibido")).toBe("Bs 50,00");
    expect(valorDe(recibo, "Forma de pago")).toBe("Efectivo");
    expect(valorDe(recibo, "Pagado hasta acá")).toBe("Bs 85,00");
    expect(valorDe(recibo, "Saldo pendiente")).toBe("Bs 50,00");
    expect(within(recibo).getByText("Cobró: Caja 1 · ¡Gracias!")).toBeInTheDocument();
  });

  it("una cuenta anulada no da recibos", async () => {
    vi.mocked(api.getCredito).mockResolvedValue({ ...DETALLE_ROSA, estado: "ANULADO" });
    const detalle = await abrirDetalle();
    expect(within(detalle).queryAllByRole("button", { name: /^Recibo/ })).toHaveLength(0);
  });

  it("CRE-5: el comprobante sale del detalle con lo que se llevó y los abonos", async () => {
    const detalle = await abrirDetalle();
    fireEvent.click(within(detalle).getByRole("button", { name: "Comprobante" }));
    const papel = screen.getByRole("dialog", { name: "Comprobante de crédito" });
    expect(within(papel).getByText("2 × Pollo entero")).toBeInTheDocument();
    expect(valorDe(papel, "Abonos recibidos (1)")).toBe("-Bs 50,00");
    expect(valorDe(papel, "Saldo a pagar")).toBe("Bs 50,00");
  });

  it("CRE-7: saldada (aunque queden centavos de redondeo), ofrece la constancia y no el compromiso", async () => {
    vi.mocked(api.getCredito).mockResolvedValue({ ...DETALLE_ROSA, saldo: 0.004, estado: "PAGADO" });
    const detalle = await abrirDetalle();
    expect(within(detalle).queryByRole("button", { name: "Comprobante" })).not.toBeInTheDocument();
    fireEvent.click(within(detalle).getByRole("button", { name: "Constancia" }));
    expect(screen.getByRole("dialog", { name: "Constancia de cuenta saldada" })).toBeInTheDocument();
  });
});

describe("el abono", () => {
  it("BUG-finanzas-7: el recibo de después del abono dice la forma de pago", async () => {
    vi.mocked(api.registrarAbono).mockResolvedValue({ ...DETALLE_ROSA, saldo: 30, pagado: 105 });
    await montar();
    const formulario = await abrirAbono();
    fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
    await cobrar(formulario);

    const recibo = screen.getByRole("dialog", { name: "Recibo de pago" });
    expect(valorDe(recibo, "Abono recibido")).toBe("Bs 20,00");
    expect(valorDe(recibo, "Forma de pago")).toBe("Efectivo");
    // El saldo es el que devolvió el backend.
    expect(valorDe(recibo, "Saldo pendiente")).toBe("Bs 30,00");
    expect(valorDe(recibo, "Pagado hasta acá")).toBe("Bs 105,00");
  });

  it("BUG-finanzas-7: en un mixto el recibo dice qué parte entró por QR", async () => {
    vi.mocked(api.registrarAbono).mockResolvedValue({ ...DETALLE_ROSA, saldo: 0, pagado: 135, estado: "PAGADO" });
    await montar();
    const formulario = await abrirAbono();
    fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "50" } });
    fireEvent.change(within(formulario).getByLabelText(/Forma de pago/), { target: { value: "__mixto__" } });
    fireEvent.change(within(formulario).getByLabelText("Cuánto paga por QR"), { target: { value: "20" } });
    fireEvent.click(within(formulario).getByRole("button", { name: "ya llegó el QR" }));
    await cobrar(formulario);

    expect(api.registrarAbono).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        pagos: [
          { monto: 30, formaPagoId: 1 },
          { monto: 20, formaPagoId: 2 },
        ],
      }),
    );
    const recibo = screen.getByRole("dialog", { name: "Recibo de pago" });
    expect(valorDe(recibo, "Forma de pago")).toBe("Efectivo + QR");
    expect(valorDe(recibo, "· Efectivo")).toBe("Bs 30,00");
    expect(valorDe(recibo, "· QR")).toBe("Bs 20,00");
    expect(within(recibo).getByText("*** DEUDA CANCELADA ***")).toBeInTheDocument();
  });

  describe("BUG-cobro-4: el abono manda su clave para que el backend no lo registre dos veces", () => {
    it("el reintento después de un error manda la MISMA clave", async () => {
      // Un 504 del proxy con el POST ya grabado: sin clave, el reintento
      // registraba el abono dos veces y el saldo del cliente bajaba de más.
      vi.mocked(api.registrarAbono)
        .mockRejectedValueOnce(new Error("El servidor tardó demasiado en responder"))
        .mockResolvedValueOnce({ ...DETALLE_ROSA, saldo: 30 });
      await montar();
      const formulario = await abrirAbono();
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      expect(within(formulario).getByText("El servidor tardó demasiado en responder")).toBeInTheDocument();
      await cobrar(formulario);

      const [primero, segundo] = idsMandados();
      expect(typeof primero).toBe("string");
      expect(primero).not.toBe("");
      expect(segundo).toBe(primero);
    });

    it("cerrar el modal y volver a abrirlo para reintentar sigue siendo el mismo cobro", async () => {
      vi.mocked(api.registrarAbono)
        .mockRejectedValueOnce(new Error("Sin conexión"))
        .mockResolvedValueOnce({ ...DETALLE_ROSA, saldo: 30 });
      await montar();
      let formulario = await abrirAbono();
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      fireEvent.click(within(formulario).getByRole("button", { name: "Cancelar" }));

      formulario = await abrirAbono();
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      const [primero, segundo] = idsMandados();
      expect(segundo).toBe(primero);
    });

    it("otro monto es otro cobro, y después de uno registrado el siguiente estrena clave", async () => {
      vi.mocked(api.registrarAbono)
        .mockRejectedValueOnce(new Error("Sin conexión"))
        .mockResolvedValue({ ...DETALLE_ROSA, saldo: 25 });
      await montar();
      const formulario = await abrirAbono();
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      // Con otro monto, la misma clave haría que el backend devolviera el
      // abono anterior como si fuera éste.
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "25" } });
      await cobrar(formulario);
      fireEvent.click(within(screen.getByRole("dialog", { name: "Recibo de pago" })).getByRole("button", {
        name: "Cerrar",
      }));

      const otro = await abrirAbono();
      fireEvent.change(within(otro).getByLabelText("Monto del abono"), { target: { value: "25" } });
      await cobrar(otro);

      const [primero, segundo, tercero] = idsMandados();
      expect(segundo).not.toBe(primero);
      expect(tercero).not.toBe(segundo);
    });

    it("el abono de otra cuenta en el medio no le hace perder la clave al que quedó pendiente", async () => {
      // Revisión del 28-oct: la clave era una sola para toda la página. El
      // abono de Rosa daba un 504 con el POST ya grabado, se cobraba a Juan
      // (otra cuenta: clave nueva, y al salir bien otra más) y al volver a Rosa
      // con el mismo monto salía una clave nueva: el backend grababa su abono
      // dos veces.
      vi.mocked(api.registrarAbono)
        .mockRejectedValueOnce(new Error("El servidor tardó demasiado en responder"))
        .mockResolvedValueOnce({ ...JUAN, saldo: 30, pagado: 10 })
        .mockResolvedValueOnce({ ...DETALLE_ROSA, saldo: 30, pagado: 105 });
      await montar();
      let formulario = await abrirAbono("Rosa Mamani");
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      fireEvent.click(within(formulario).getByRole("button", { name: "Cancelar" }));

      formulario = await abrirAbono("Juan Pérez");
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "10" } });
      await cobrar(formulario);
      fireEvent.click(within(screen.getByRole("dialog", { name: "Recibo de pago" })).getByRole("button", {
        name: "Cerrar",
      }));

      formulario = await abrirAbono("Rosa Mamani");
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);

      expect(vi.mocked(api.registrarAbono).mock.calls.map(([id]) => id)).toEqual([7, 8, 7]);
      const [rosa, juan, rosaOtraVez] = idsMandados();
      expect(juan).not.toBe(rosa);
      expect(rosaOtraVez).toBe(rosa);
    });

    it("si el backend dice que la clave ya se usó en otra cuenta, el próximo intento estrena una", async () => {
      vi.mocked(api.registrarAbono)
        .mockRejectedValueOnce(
          new ApiError("Ese cobro ya se registró en otra cuenta: cerrá el cobro y volvé a intentarlo.", 400, {
            codigo: "CLAVE_USADA",
          }),
        )
        .mockResolvedValueOnce({ ...DETALLE_ROSA, saldo: 30 });
      await montar();
      const formulario = await abrirAbono();
      fireEvent.change(within(formulario).getByLabelText("Monto del abono"), { target: { value: "20" } });
      await cobrar(formulario);
      await cobrar(formulario);
      const [primero, segundo] = idsMandados();
      expect(segundo).not.toBe(primero);
    });
  });
});
