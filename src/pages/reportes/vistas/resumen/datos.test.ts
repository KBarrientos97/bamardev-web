import { describe, expect, it } from "vitest";
import type { BillarReporteApi, CreditosApi, ResumenApi, SugerenciaApi } from "../../api";
import { consejos, detalleFecha, filasResumen, numeroWhatsapp, esMensual, horasDeJornada, partesVenta, pedidosPorCobrar, serie, textoResumen, tramoFlojo, tramoHoras } from "./datos";

const billar = (p: Partial<BillarReporteApi> = {}): BillarReporteApi => ({
  desde: 0,
  hasta: 0,
  jornadas: 7,
  tiempoBs: 4601,
  consumosBs: 5892,
  horas: 230,
  ocupacion: 0.41,
  porMesa: [],
  porHora: [],
  fijos: { vendidos: 0, monto: 0, conExcedente: 0, excedenteBs: 0 },
  rapidas: { cantidad: 30, bs: 872 },
  productos: [],
  auditoria: [],
  ...p,
});

const todoVisible = () => true;

describe("la serie del gráfico", () => {
  it("cada día lleva su comparación por posición, y sin anterior queda sin comparación", () => {
    const s = serie(
      [
        { etiqueta: "1 oct", monto: 100, fecha: "2026-10-01" },
        { etiqueta: "2 oct", monto: 200, fecha: "2026-10-02" },
      ],
      [{ etiqueta: "1 sep", monto: 80, fecha: "2026-09-01" }],
    );
    expect(s.map((p) => p.anterior)).toEqual([80, null]);
    expect(s[0].detalle).toBe("Jue 1 oct");
  });

  it("un mes se nombra entero, y sin fecha (backend anterior) se reconoce por la etiqueta", () => {
    expect(detalleFecha({ etiqueta: "oct", monto: 0, fecha: "2026-10" })).toBe("octubre 2026");
    expect(esMensual([{ etiqueta: "oct", monto: 0 }, { etiqueta: "nov", monto: 0 }])).toBe(true);
    expect(esMensual([{ etiqueta: "12 oct", monto: 0 }])).toBe(false);
  });
});

describe("de dónde vinieron las ventas, según el rubro", () => {
  it("el billar separa el tiempo de mesa, los consumos y la venta rápida", () => {
    expect(partesVenta("BILLAR", { billar: billar() }).map((p) => p.etiqueta)).toEqual(["Tiempo de mesa", "Consumos en mesa", "Venta rápida"]);
  });

  it("el restaurante separa el salón del delivery y deja afuera lo que está en cero", () => {
    const partes = partesVenta("RESTAURANTE", {
      composicion: { salon: 500, billar: 0, delivery: 200, recoger: 0, mostrador: 100, servicios: 0, productos: 800 },
    });
    expect(partes.map((p) => p.etiqueta)).toEqual(["Salón", "Delivery", "Mostrador"]);
  });

  it("una peluquería separa servicios y productos", () => {
    const partes = partesVenta("PELUQUERIA", {
      composicion: { salon: 0, billar: 0, delivery: 0, recoger: 0, mostrador: 900, servicios: 700, productos: 200 },
    });
    expect(partes).toEqual([
      { etiqueta: "Servicios", valor: 700 },
      { etiqueta: "Productos", valor: 200 },
    ]);
  });

  it("en el resto dice cómo te pagaron, de mayor a menor", () => {
    const partes = partesVenta("FARMACIA", {
      metodos: [
        { nombre: "QR", monto: 300, porcentaje: 30 },
        { nombre: "Efectivo", monto: 700, porcentaje: 70 },
      ],
    });
    expect(partes.map((p) => p.etiqueta)).toEqual(["Efectivo", "QR"]);
  });
});

describe("el tramo más flojo del billar", () => {
  it("las horas de un billar que abre a la tarde van de la tarde a la madrugada", () => {
    expect(horasDeJornada([0, 1, 16, 17, 22, 23])).toEqual([16, 17, 22, 23, 0, 1]);
  });

  it("encuentra el día y las cuatro horas con menos ocupación", () => {
    const calor = [16, 17, 18, 19, 20, 21].flatMap((hora) => [
      { dia: 1, hora, ocupacion: hora < 20 ? 0.15 : 0.6 },
      { dia: 4, hora, ocupacion: 0.7 },
    ]);
    expect(tramoFlojo(calor)).toMatchObject({ dia: 1, desde: 16, hasta: 20 });
    expect(tramoHoras(16, 20)).toBe("de 4 a 8 p. m.");
  });

  it("un día sin ninguna celda es un día cerrado y no cuenta como flojo", () => {
    const calor = [16, 17, 18, 19].map((hora) => ({ dia: 4, hora, ocupacion: 0.5 }));
    expect(tramoFlojo(calor)?.dia).toBe(4);
  });
});

describe("para tener en cuenta", () => {
  const sugerencia = (vendidas: number): SugerenciaApi => ({
    dias: 30,
    cobertura: 14,
    resumen: { articulos: 1, unidades: 1, inversion: 0, agotados: 1 },
    items: [
      {
        productoId: 1,
        nombre: "Cerveza Huari 620 ml",
        categoria: null,
        unidad: null,
        stock: 0,
        vencido: 0,
        stockMinimo: 0,
        vendidas,
        porDia: 2,
        alcanzaDias: 0,
        encargos: 0,
        sugerido: 28,
        motivo: "AGOTADO",
        costo: 5,
        subtotal: 140,
      },
    ],
  });

  it("avisa del agotado que más se vende y lleva a stock crítico", () => {
    const c = consejos({ ve: todoVisible, ventasDelta: null, contra: "la semana anterior", sugerencia: sugerencia(85) });
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ id: "agotado", a: "stock-critico" });
  });

  it("no avisa de lo que quien mira no puede abrir", () => {
    const c = consejos({ ve: (id) => id !== "stock-critico", ventasDelta: null, contra: "x", sugerencia: sugerencia(85) });
    expect(c).toHaveLength(0);
  });

  it("una mesa que deja mucho menos por hora que las demás se nombra", () => {
    const porMesa = [1, 2, 3, 8].map((n) => ({ mesaId: n, horas: 10, pct: 0.25, bsPorHoraAbierta: n === 8 ? 10 : 20 }));
    const c = consejos({ rubro: "BILLAR", ve: todoVisible, ventasDelta: null, contra: "x", billar: billar({ porMesa }) });
    expect(c[0]).toMatchObject({ id: "mesa-floja", a: "mesas" });
  });

  it("el fiado vencido se dice con su parte de lo que te deben", () => {
    const creditos = { resumen: { totalPorCobrar: 561, totalVencido: 458 } } as CreditosApi;
    const c = consejos({ ve: todoVisible, ventasDelta: null, contra: "x", creditos });
    expect(c[0].partes.join("")).toContain("82 %");
  });

  it("como mucho tres, y una variación chica de las ventas no es un aviso", () => {
    expect(consejos({ ve: todoVisible, ventasDelta: 0.05, contra: "x" })).toHaveLength(0);
    const muchos = consejos({
      ve: todoVisible,
      ventasDelta: -0.3,
      contra: "x",
      sugerencia: sugerencia(85),
      creditos: { resumen: { totalPorCobrar: 100, totalVencido: 50 } } as CreditosApi,
      ventasSinCosto: 40,
    });
    expect(muchos).toHaveLength(3);
  });
});

describe("el texto del resumen para WhatsApp", () => {
  it("dice las ventas con su flecha, el desglose, la ganancia y lo del rubro", () => {
    const t = textoResumen({
      negocio: "Billar Doble Banda",
      sucursal: "Principal",
      cual: "de la semana",
      rango: "02/10 – 08/10/2026",
      rubro: "BILLAR",
      ventas: 11364.75,
      ventasDelta: 0.13,
      contra: "la semana anterior",
      partes: partesVenta("BILLAR", { billar: billar() }),
      ganancia: 4681.55,
      billar: billar({ porMesa: [{ mesaId: 7, horas: 36.6, pct: 0.16 }] }),
      metodos: [
        { nombre: "Efectivo", monto: 6467, porcentaje: 59 },
        { nombre: "QR", monto: 3802, porcentaje: 36 },
      ],
      porCobrar: 561,
    });
    expect(t).toContain("Billar Doble Banda · Principal");
    expect(t).toContain("▲ 13 % vs. la semana anterior");
    expect(t).toContain("• Tiempo de mesa:");
    expect(t).toContain("Ganancia real:");
    expect(t).toContain("Mesa más usada: Mesa 7");
    expect(t).toContain("Fiado por cobrar:");
  });

  it("una pérdida se dice como pérdida, sin un menos delante", () => {
    const t = textoResumen({ negocio: "N", sucursal: "", cual: "del mes", rango: "x", ventas: 100, ventasDelta: null, contra: "x", partes: [], ganancia: -50 });
    expect(t).toMatch(/Pérdida: Bs 50/);
    expect(t).not.toContain("vs.");
  });

  it("un celular de Bolivia sin código lleva el 591 adelante", () => {
    expect(numeroWhatsapp("+591 70490686")).toBe("59170490686");
    expect(numeroWhatsapp("70490686")).toBe("59170490686");
    expect(numeroWhatsapp("")).toBe("");
  });
});

describe("los pedidos por cobrar (C2)", () => {
  // Desde el 16-oct los pedidos sin cobrar no suman en las ventas del
  // período: van aparte, y en todas partes se aclara que no están incluidos.
  const resumen = (p: Partial<ResumenApi> = {}): ResumenApi => ({
    ventas: 1000,
    ventasDeltaPct: null,
    ventasPeriodoAnterior: 0,
    finanzas: { ingresosBrutos: 1000, descuentos: 0, ingresosNetos: 1000, costoVenta: 400, utilidadBruta: 600, margenPct: 60, deltaUtilidadPct: null },
    tickets: { valor: 10, deltaPct: null },
    ticketPromedio: { valor: 100, deltaPct: null },
    unidades: { valor: 20, deltaPct: null },
    tendencia: [],
    ...p,
  });

  it("sólo cuentan si hay alguno; sin el campo (backend anterior) no hay nada", () => {
    expect(pedidosPorCobrar(resumen())).toBeNull();
    expect(pedidosPorCobrar(resumen({ porCobrar: { cantidad: 0, total: 0 } }))).toBeNull();
    expect(pedidosPorCobrar(resumen({ porCobrar: { cantidad: 2, total: 85 } }))).toEqual({ cantidad: 2, total: 85 });
  });

  it("el Excel los pone al lado de las ventas, diciendo que no suman", () => {
    const filas = filasResumen(resumen({ porCobrar: { cantidad: 3, total: 120.5 } }), null);
    expect(filas).toContainEqual(["Pedidos por cobrar (no suman en Ventas)", 3]);
    expect(filas).toContainEqual(["Monto por cobrar de esos pedidos (Bs)", 120.5]);
    // Las ventas siguen siendo las del backend, sin sumarles nada.
    expect(filas).toContainEqual(["Ventas (Bs)", 1000]);
  });

  it("sin pedidos pendientes el Excel queda como siempre", () => {
    const filas = filasResumen(resumen(), null);
    expect(filas.map(([c]) => c).some((c) => /cobrar/i.test(c))).toBe(false);
  });

  it("el texto de WhatsApp los nombra aparte del fiado", () => {
    const t = textoResumen({
      negocio: "N",
      sucursal: "",
      cual: "del mes",
      rango: "x",
      ventas: 100,
      ventasDelta: null,
      contra: "x",
      partes: [],
      porCobrar: 50,
      pedidosPorCobrar: { cantidad: 1, total: 40 },
    });
    expect(t).toContain("Fiado por cobrar: Bs 50");
    expect(t).toContain("1 pedido por cobrar: Bs 40 (no suma en Ventas)");
  });
});
