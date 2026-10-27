import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Feature, Venta } from "../../types";

/**
 * La "M" (mesa) y "LL" (llevar) al lado de cada producto del ticket.
 *
 * En bamardev-restaurant las marcas dependen SÓLO de que el pedido sea en el
 * local, como antes de que existiera el rubro farmacia: si el panel le saca
 * `mesa_llevar` a un restaurante, su ticket no puede cambiar por eso. En una
 * farmacia no hay mesas, así que ahí no salen nunca.
 */

const sesion = vi.hoisted(() => ({
  rubro: "RESTAURANTE" as string | undefined,
  features: [] as string[],
}));

vi.mock("../../store/AuthContext", async () => {
  const { puede } = await import("../../lib/permisos");
  return {
    useAuth: () => ({
      negocio: { nombre: "Negocio de prueba" },
      rubro: sesion.rubro,
      incluye: (c: Parameters<typeof puede>[1]) =>
        puede(
          { permisos: [], features: sesion.features as Feature[], rubro: sesion.rubro },
          c,
        ),
    }),
  };
});

vi.mock("../../lib/academia/apiAcademia", () => ({
  apiAcademia: { enlacePago: vi.fn(async () => ({ enlacePago: "https://app.bamardev.com/p/horizonte/pagar/K7Q2abcdef" })) },
}));

import { act } from "@testing-library/react";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import PantallaRecibo from "./PantallaRecibo";

function venta(datos: Partial<Venta> = {}): Venta {
  return {
    id: 7,
    comprobante: "T-0007",
    estado: "APROBADO",
    fecha: "2026-09-16T12:00:00",
    total: 80,
    detalles: [
      {
        productoId: 1,
        producto: "Pollo entero",
        cantidad: 1,
        precio: 60,
        subtotal: 60,
        nota: null,
        consumo: "MESA",
      },
      {
        productoId: 2,
        producto: "Gaseosa 2L",
        cantidad: 1,
        precio: 20,
        subtotal: 20,
        nota: null,
        consumo: "LLEVAR",
      },
    ],
    pagos: [],
    formasPago: [],
    tipoPedido: "LOCAL",
    estadoEntrega: null,
    prepagado: false,
    clienteNombre: null,
    clienteDireccion: null,
    clienteTelefono: null,
    tarifaEnvio: 0,
    minutosEstimados: null,
    notaPedido: null,
    entregadoEn: null,
    ...datos,
  } as Venta;
}

function dibujar(v: Venta) {
  render(<PantallaRecibo venta={v} onNuevaVenta={() => {}} onHistorial={() => {}} />);
}

beforeEach(() => {
  sesion.features = [];
});

describe("bamardev-restaurant: marcas de mesa y llevar en el ticket", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("un pedido en el local marca cada producto", () => {
    dibujar(venta());
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("LL")).toBeInTheDocument();
  });

  it("las marcas no dependen de que el plan traiga mesa_llevar", () => {
    sesion.features = ["pos", "caja"];
    dibujar(venta());
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("LL")).toBeInTheDocument();
  });

  it("un delivery no lleva marcas", () => {
    dibujar(venta({ tipoPedido: "DELIVERY" }));
    expect(screen.queryByText("M")).not.toBeInTheDocument();
  });
});

describe("farmacia: sin mesas, sin marcas", () => {
  it("un pedido en el local no marca nada", () => {
    sesion.rubro = "FARMACIA";
    dibujar(venta());
    expect(screen.queryByText("M")).not.toBeInTheDocument();
    expect(screen.queryByText("LL")).not.toBeInTheDocument();
  });
});

describe("belleza: un corte no se sirve en mesa (QA M-09)", () => {
  it.each(["PELUQUERIA", "BARBERIA", "SPA", "UNAS"])("%s: el ticket no marca M ni LL", (rubro) => {
    sesion.rubro = rubro;
    dibujar(venta());
    expect(screen.queryByText("M")).not.toBeInTheDocument();
    expect(screen.queryByText("LL")).not.toBeInTheDocument();
  });
});

describe("bamardev-restaurant: la mesa y quién la atendió", () => {
  beforeEach(() => {
    sesion.rubro = "RESTAURANTE";
  });

  it("cobrando una mesa dice la mesa y quién la atendió", () => {
    // Visto en QA: la caja cobraba M3 y el ticket salía como uno de
    // mostrador, sin mesa ni mesero.
    dibujar(
      venta({
        cajero: "Administrador",
        mesa: "M3",
        mesaNombre: "Mesa M3",
        mesero: "Mesero Auditoria",
      }),
    );
    expect(screen.getByText("Mesa:")).toBeInTheDocument();
    expect(screen.getByText("M3")).toBeInTheDocument();
    expect(screen.getByText("Atendió:")).toBeInTheDocument();
    expect(screen.getByText("Mesero Auditoria")).toBeInTheDocument();
    // El que cobró sigue siendo otro dato.
    expect(screen.getByText("Administrador")).toBeInTheDocument();
  });

  it("una venta de mostrador no inventa mesa ni mesero", () => {
    dibujar(venta({ cajero: "Administrador" }));
    expect(screen.queryByText("Mesa:")).not.toBeInTheDocument();
    expect(screen.queryByText("Atendió:")).not.toBeInTheDocument();
  });
});

describe("belleza: profesional y paquetes en el ticket (07-oct)", () => {
  beforeEach(() => {
    sesion.rubro = "PELUQUERIA";
    sesion.features = [];
  });

  const linea = (extra: Partial<NonNullable<Venta["detalles"]>[number]>) => ({
    productoId: 9,
    producto: "Corte",
    cantidad: 1,
    precio: 0,
    subtotal: 0,
    nota: null,
    consumo: "LLEVAR" as const,
    ...extra,
  });

  it("la sesión de un paquete dice cuál fue y cuántas quedan, y quién la hizo", () => {
    dibujar(
      venta({
        total: 0,
        detalles: [
          linea({
            recursoId: 3,
            recurso: "Carla",
            paquete: {
              tipo: "SESION",
              paqueteClienteId: 1,
              nombre: "10 masajes",
              desde: 3,
              hasta: 3,
              sesiones: 10,
              restantes: 7,
              ultimoDia: "2027-01-05",
              texto: "Sesión 3 de 10 · quedan 7",
            },
          }),
        ],
      }),
    );
    expect(screen.getByText("10 masajes: Sesión 3 de 10 · quedan 7")).toBeInTheDocument();
    expect(screen.getByText("Atendió: Carla")).toBeInTheDocument();
  });

  it("la venta del paquete dice cuántas sesiones trae y hasta cuándo vale", () => {
    dibujar(
      venta({
        total: 120,
        detalles: [
          linea({
            producto: "3 cortes",
            precio: 120,
            subtotal: 120,
            paquete: {
              tipo: "COMPRA",
              paqueteClienteId: 1,
              nombre: "3 cortes",
              sesiones: 3,
              items: [{ servicio: "Corte", sesiones: 3 }],
              ultimoDia: "2027-01-05",
              estado: "ACTIVO",
              texto: "3 sesiones · vale hasta el 05/01/2027",
            },
          }),
        ],
      }),
    );
    expect(screen.getByText("3 sesiones · vale hasta el 05/01/2027")).toBeInTheDocument();
  });

  it("sin profesional ni paquete, el renglón de siempre", () => {
    dibujar(venta({ detalles: [linea({ precio: 50, subtotal: 50 })], total: 50 }));
    expect(screen.queryByText(/Atendió: /)).not.toBeInTheDocument();
    expect(screen.queryByText(/sesi/i)).not.toBeInTheDocument();
  });
});

describe("QA PER-01: el efectivo recibido incluye la propina en efectivo", () => {
  beforeEach(() => {
    sesion.rubro = "BARBERIA";
  });

  it("el pago guarda lo de la venta; el papel dice lo que el cliente entregó", () => {
    // Corte de 35, propina de 5 en efectivo, el cliente dio 50: el pago de la
    // venta registra 45 recibidos (vuelto 10) y la propina va aparte.
    dibujar(
      venta({
        total: 35,
        detalles: [
          { productoId: 1, producto: "Corte", cantidad: 1, precio: 35, subtotal: 35, nota: null, consumo: "LLEVAR" },
        ],
        pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 35, recibido: 45, entregado: 10 }],
        cambio: 10,
        propinas: [{ recursoId: 3, recurso: "Nico", monto: 5, formaPago: "Efectivo" }],
      }),
    );
    expect(screen.getByText("Efectivo recibido").nextElementSibling).toHaveTextContent(/50,00/);
    expect(screen.getByText("(incluye la propina)")).toBeInTheDocument();
    expect(screen.getByText("Cambio entregado").nextElementSibling).toHaveTextContent(/10,00/);
    expect(screen.getByText(/Para Nico/)).toBeInTheDocument();
  });

  it("una reimpresión (sin `cambio`) toma el vuelto de los pagos", () => {
    dibujar(
      venta({
        total: 35,
        pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 35, recibido: 45, entregado: 10 }],
        propinas: [{ recursoId: 3, recurso: "Nico", monto: 5, formaPago: "Efectivo" }],
      }),
    );
    expect(screen.getByText("Cambio entregado").nextElementSibling).toHaveTextContent(/10,00/);
  });

  it("QA DIA-02: el monto QR es la transferencia entera, con la propina por QR", () => {
    dibujar(
      venta({
        total: 51,
        pagos: [{ formaPagoId: 11, formaPago: "QR", monto: 51 }],
        propinas: [{ recursoId: 3, recurso: "Carla", monto: 5, formaPago: "QR" }],
      }),
    );
    expect(screen.getByText("Monto QR").nextElementSibling).toHaveTextContent(/56,00/);
    expect(screen.getByText("(incluye la propina)")).toBeInTheDocument();
  });

  it("sin propinas, lo de siempre", () => {
    sesion.rubro = "RESTAURANTE";
    dibujar(venta({ pagos: [{ formaPagoId: 10, formaPago: "Efectivo", monto: 80, recibido: 100, entregado: 20 }], cambio: 20 }));
    expect(screen.getByText("Efectivo recibido").nextElementSibling).toHaveTextContent(/100,00/);
    expect(screen.queryByText("(incluye la propina)")).not.toBeInTheDocument();
  });
});

describe("E10: el recibo de las cuotas de un instituto", () => {
  it("cada cuota con lo que queda, el saldo del curso y la próxima cuota", () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        total: 750,
        cuotas: [
          {
            cuotaId: 902,
            concepto: "Barbería · Cuota 2",
            alumno: "Bustillos Rek, Camila",
            cobrado: 500,
            pagado: 500,
            saldo: 250,
            estado: "PARCIAL",
            saldoCurso: 783,
            proximaCuota: { vence: "2026-10-17", monto: 250 },
          },
        ],
      }),
    );
    const bloque = screen.getByLabelText("Cuotas");
    expect(bloque).toHaveTextContent("CUOTAS · BUSTILLOS REK, CAMILA");
    expect(bloque).toHaveTextContent(/Queda Bs\s?250,00/);
    expect(screen.getByText("SALDO DEL CURSO").nextElementSibling).toHaveTextContent(/783,00/);
    expect(bloque).toHaveTextContent(/Próxima cuota: Bs\s?250,00 el 17\/10\/2026/);
  });

  it("D6: con las materias que manda el backend (sin pedir el grupo), el renglón y la cuota dicen el módulo con su nombre", () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        total: 500,
        detalles: [{ productoId: 77, producto: "Barbería", cantidad: 1, precio: 500, subtotal: 500, nota: null, consumo: "LLEVAR", cuotaId: 902 }],
        cuotas: [
          {
            cuotaId: 902,
            concepto: "Cuota 2/3",
            numero: 2,
            totalCuotas: 3,
            carrera: "Barbería",
            materias: [{ id: 31, orden: 2, nombre: "Degradados" }],
            alumno: "Bustillos Rek, Camila",
            cobrado: 500,
            pagado: 500,
            saldo: 0,
            estado: "PAGADA",
            saldoCurso: 250,
            proximaCuota: null,
          },
        ],
      }),
    );
    expect(screen.getByText("Barbería · M2 Degradados")).toBeInTheDocument();
    expect(screen.getByLabelText("Cuotas")).toHaveTextContent("Cuota 2/3 · M2 Degradados");
  });

  it("D6: con los módulos, el renglón dice «Barbería · M2 Degradados» y la cuota su módulo", () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        total: 500,
        detalles: [{ productoId: 77, producto: "Barbería", cantidad: 1, precio: 500, subtotal: 500, nota: null, consumo: "LLEVAR", cuotaId: 902 }],
        cuotas: [
          {
            cuotaId: 902,
            concepto: "Cuota 2/3",
            modulos: "M2 Degradados",
            alumno: "Bustillos Rek, Camila",
            cobrado: 500,
            pagado: 500,
            saldo: 0,
            estado: "PAGADA",
            saldoCurso: 250,
            proximaCuota: null,
          },
        ],
      }),
    );
    expect(screen.getByText("Barbería · M2 Degradados")).toBeInTheDocument();
    expect(screen.getByLabelText("Cuotas")).toHaveTextContent("Cuota 2/3 · M2 Degradados");
  });

  it("con todo pagado lo dice, y sin cuotas el ticket es el de siempre", () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        cuotas: [
          { cuotaId: 1, concepto: "Cuota única", alumno: "Mateo", cobrado: 1360, pagado: 1360, saldo: 0, estado: "PAGADA", saldoCurso: 0, proximaCuota: null },
        ],
      }),
    );
    expect(screen.getByText("Curso pagado por completo.")).toBeInTheDocument();
  });

  it("el renglón dice qué cuota cobró y el bloque quién pagó, si fue el tutor", () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        total: 750,
        detalles: [
          { productoId: 77, producto: "Barbería y Peluquería", cantidad: 1, precio: 750, subtotal: 750, nota: null, consumo: "LLEVAR", cuotaId: 902 },
        ],
        cuotas: [
          { cuotaId: 902, concepto: "Cuota 2/2", alumno: "Céspedes Molina, Joaquín", cobrado: 750, pagado: 750, saldo: 0, estado: "PAGADA", saldoCurso: 0, proximaCuota: null },
        ],
        pagadorCuotas: { nombre: "Patricia Suárez", rol: "TUTOR" },
      }),
    );
    expect(screen.getByText("Cuota 2/2 · Barbería y Peluquería")).toBeInTheDocument();
    expect(screen.getByText("Pagó: Patricia Suárez (tutor)")).toBeInTheDocument();
  });

  it("al pie, el enlace del estado de cuenta de la inscripción (S3)", async () => {
    sesion.rubro = "ACADEMIA";
    dibujar(
      venta({
        cuotas: [
          { cuotaId: 1, concepto: "M2", alumno: "Camila", cobrado: 300, pagado: 300, saldo: 200, estado: "PARCIAL", saldoCurso: 700, proximaCuota: null },
        ],
        inscripcionCuotas: 102,
      }),
    );
    await act(async () => {});
    expect(screen.getByLabelText("Estado de cuenta")).toHaveTextContent("app.bamardev.com/p/horizonte/pagar/K7Q2abcdef");
  });

  it("cuota de otra sede: el enlace sale de la venta, sin pedirlo al endpoint que da OTRA_SEDE (B-14)", async () => {
    sesion.rubro = "ACADEMIA";
    vi.mocked(apiAcademia.enlacePago).mockClear();
    dibujar(
      venta({
        cuotas: [
          {
            cuotaId: 1,
            concepto: "M2",
            alumno: "Quiñones Vega",
            cobrado: 300,
            pagado: 300,
            saldo: 200,
            estado: "PARCIAL",
            saldoCurso: 500,
            proximaCuota: null,
            inscripcionId: 220,
            enlacePago: "https://app-qa.bamardev.com/p/academiaqa/pagar/AbCdEfGh12345678",
          },
        ],
        inscripcionCuotas: 220,
      }),
    );
    await act(async () => {});
    expect(screen.getByLabelText("Estado de cuenta")).toHaveTextContent("app-qa.bamardev.com/p/academiaqa/pagar/AbCdEfGh12345678");
    expect(apiAcademia.enlacePago).not.toHaveBeenCalled();
  });

  it("si la venta dice que no hay enlace (sin subdominio), no hay pie ni pedido", async () => {
    sesion.rubro = "ACADEMIA";
    vi.mocked(apiAcademia.enlacePago).mockClear();
    dibujar(
      venta({
        cuotas: [
          { cuotaId: 1, concepto: "M2", alumno: "Camila", cobrado: 300, pagado: 300, saldo: 200, estado: "PARCIAL", saldoCurso: 700, proximaCuota: null, inscripcionId: 102, enlacePago: null },
        ],
        inscripcionCuotas: 102,
      }),
    );
    await act(async () => {});
    expect(screen.queryByLabelText("Estado de cuenta")).not.toBeInTheDocument();
    expect(apiAcademia.enlacePago).not.toHaveBeenCalled();
  });
});
