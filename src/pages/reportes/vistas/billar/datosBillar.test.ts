import { describe, expect, it } from "vitest";
import type { BillarReporteApi } from "../../api";
import {
  armarCalor,
  deltaPuntos,
  filasMesas,
  filasPaquetes,
  filasPromos,
  hayDetallePorMesa,
  horaEje,
  horaFloja,
  horaPico,
  horasEnJornada,
  mejorDia,
  mesaMasUsada,
  nombrePaquete,
  ocupacionAnterior,
  parteFijo,
  puntosOcupacion,
  sesionesLibres,
  tarjetasTipo,
  textoDescuento,
} from "./datosBillar";

/** Un reporte del billar como lo manda un backend anterior al rediseño: sin ninguno de los campos nuevos. */
function reporte(over: Partial<BillarReporteApi> = {}): BillarReporteApi {
  return {
    desde: 0,
    hasta: 0,
    jornadas: 7,
    tiempoBs: 1000,
    consumosBs: 500,
    horas: 100,
    ocupacion: 0.41,
    porMesa: [],
    porHora: [],
    fijos: { vendidos: 0, monto: 0, conExcedente: 0, excedenteBs: 0 },
    rapidas: { cantidad: 0, bs: 0 },
    productos: [],
    auditoria: [],
    ...over,
  };
}

const horas = (...pares: [number, number][]) => pares.map(([hora, ocupacion]) => ({ hora, ocupacion }));

describe("las horas del billar", () => {
  it("las columnas y el eje dicen la hora corta, de 12 en 12", () => {
    expect([16, 23, 0, 1, 12].map(horaEje)).toEqual(["4p", "11p", "12a", "1a", "12p"]);
  });

  it("un billar que cierra de madrugada se lee desde que abre, no desde la medianoche", () => {
    expect(horasEnJornada([0, 1, 16, 17, 23, 16])).toEqual([16, 17, 23, 0, 1]);
  });
});

describe("el mapa de calor", () => {
  const porHora = horas([16, 0.1], [22, 0.8], [0, 0.3]);

  it("las columnas son sólo las horas con juego, en el orden de la jornada", () => {
    const m = armarCalor(
      [
        { dia: 4, hora: 22, ocupacion: 0.88 },
        { dia: 4, hora: 0, ocupacion: 0.3 },
        { dia: 5, hora: 16, ocupacion: 0.1 },
      ],
      porHora,
      true,
    );
    expect(m?.columnas).toEqual(["4p", "10p", "12a"]);
    expect(m?.filas).toEqual(["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]);
    // Viernes (dia 4) a las 22 está; el viernes a las 16 no vino: queda en blanco, no en cero.
    expect(m?.valores[4]).toEqual([null, 0.88, 0.3]);
  });

  it("si el backend manda la grilla entera con ceros, las horas en cero no se vuelven columnas", () => {
    const grilla = [0, 1, 2, 3, 4, 5, 6].flatMap((dia) =>
      Array.from({ length: 24 }, (_, hora) => ({ dia, hora, ocupacion: hora === 22 ? 0.5 : 0 })),
    );
    expect(armarCalor(grilla, [], true)?.horas).toEqual([22]);
  });

  it("con menos de una semana van sólo los días que hubo, no seis filas vacías", () => {
    const m = armarCalor([{ dia: 2, hora: 21, ocupacion: 0.4 }], horas([21, 0.4]), false);
    expect(m?.filas).toEqual(["Mié"]);
  });

  it("sin celdas (backend anterior o período sin juego) no hay mapa", () => {
    expect(armarCalor([], porHora, true)).toBeNull();
    expect(armarCalor([{ dia: 9, hora: 30, ocupacion: 1 }], [], true)).toBeNull();
  });

  it("el mejor día promedia su fila con las horas sin juego en cero", () => {
    // Un lunes con un torneo de dos horas no le gana a un sábado lleno toda la
    // noche: promediando sólo las celdas con dato, el lunes daba 90 %.
    const m = armarCalor(
      [
        { dia: 0, hora: 21, ocupacion: 0.9 },
        { dia: 0, hora: 22, ocupacion: 0.9 },
        ...[18, 19, 20, 21, 22, 23].map((hora) => ({ dia: 5, hora, ocupacion: 0.6 })),
      ],
      [],
      true,
    );
    const mejor = mejorDia(m!);
    expect(mejor?.dia).toBe("Sáb");
    expect(mejor?.promedio).toBeCloseTo(0.6);
  });

  it("con un solo día con datos no hay mejor día que elegir", () => {
    const m = armarCalor([{ dia: 2, hora: 21, ocupacion: 0.4 }], horas([21, 0.4]), true);
    expect(mejorDia(m!)).toBeNull();
  });
});

describe("la hora pico y la floja", () => {
  it("la pico es la más llena y la floja la más vacía, en el orden de la jornada", () => {
    const porHora = horas([0, 0.3], [16, 0.13], [22, 0.69], [23, 0.69]);
    expect(horaPico(porHora)).toEqual({ hora: 22, ocupacion: 0.69 });
    expect(horaFloja(porHora)).toEqual({ hora: 16, ocupacion: 0.13 });
  });

  it("sin juego no hay pico, y con una hora sola no hay floja (sería la misma)", () => {
    expect(horaPico(horas([20, 0]))).toBeNull();
    expect(horaFloja(horas([20, 0.5]))).toBeNull();
    expect(horaFloja(horas([20, 0.5], [21, 0.5]))).toBeNull();
  });
});

describe("la curva por hora contra el período anterior", () => {
  it("cada hora con la del anterior; una hora que entonces no se jugó queda sin punto, no en cero", () => {
    const puntos = puntosOcupacion(horas([0, 0.25], [22, 0.7]), horas([22, 0.6]));
    expect(puntos.map((p) => [p.etiqueta, p.valor, p.anterior])).toEqual([
      ["10p", 0.7, 0.6],
      ["12a", 0.25, null],
    ]);
    expect(puntos[0].detalle).toBe("10 p. m.");
  });

  it("sin anterior (backend viejo) no hay línea punteada", () => {
    expect(puntosOcupacion(horas([22, 0.7]), undefined)[0].anterior).toBeNull();
  });

  it("la ocupación del anterior no se compara si entonces no se jugó", () => {
    // El backend manda 0 cuando no hubo juego: contra ese 0 todo salía "+41 pts".
    const anterior = { ocupacion: 0, horas: 0, tiempoBs: 0, consumosBs: 0, rapidasBs: 0, sesiones: 0, porHora: [], porMesa: [] };
    expect(ocupacionAnterior(reporte({ anterior }))).toBeNull();
    expect(ocupacionAnterior(reporte())).toBeNull();
    expect(ocupacionAnterior(reporte({ anterior: { ...anterior, horas: 80, ocupacion: 0.37 } }))).toBe(0.37);
  });

  it("la diferencia va en puntos, no en porcentaje", () => {
    expect(deltaPuntos(0.41, 0.37)).toBeCloseTo(4);
    expect(deltaPuntos(0.41, null)).toBeNull();
  });
});

describe("rendimiento por mesa", () => {
  const conDetalle = reporte({
    porMesa: [
      { mesaId: 5, horas: 34.5, pct: 0.2, tipo: "Pool", sesiones: 22, tiempoBs: 641, consumosBs: 980, total: 1621, ocupacion: 0.49, bsPorHoraAbierta: 23 },
      { mesaId: 7, horas: 36.6, pct: 0.21, tipo: "Carambola", sesiones: 24, tiempoBs: 850, consumosBs: 884, total: 1734, ocupacion: 0.52, bsPorHoraAbierta: 25 },
      { mesaId: 8, horas: 15.9, pct: 0.09, tipo: "Pool", sesiones: 11, tiempoBs: 295, consumosBs: 401, total: 696, ocupacion: 0.23, bsPorHoraAbierta: 10 },
    ],
    anterior: {
      ocupacion: 0.37,
      horas: 90,
      tiempoBs: 0,
      consumosBs: 0,
      rapidasBs: 0,
      sesiones: 40,
      porHora: [],
      porMesa: [
        { mesaId: 7, total: 1355, horas: 30 },
        { mesaId: 5, total: 1621, horas: 30 },
      ],
    },
  });

  it("las mesas van de la que más dejó a la que menos, con su flecha contra el anterior", () => {
    const filas = filasMesas(conDetalle);
    expect(filas.map((f) => f.mesaId)).toEqual([7, 5, 8]);
    expect(filas[0].delta).toBeCloseTo((1734 - 1355) / 1355);
    expect(filas[1].delta).toBe(0);
    expect(hayDetallePorMesa(filas)).toBe(true);
  });

  it("una mesa que no se jugó en el anterior no tiene flecha: contra cero no hay porcentaje", () => {
    expect(filasMesas(conDetalle)[2]).toMatchObject({ mesaId: 8, totalAnterior: null, delta: null });
  });

  it("la mesa activa que nadie jugó va al final, marcada, con su flecha si antes sí se jugó", () => {
    // Sin las paradas la mesa que nadie usó no aparecía en la tabla, y es la
    // que el dueño tiene que ver.
    const parada = { mesaId: 9, horas: 0, pct: 0, tipo: "Pool", sesiones: 0, tiempoBs: 0, consumosBs: 0, total: 0, ocupacion: 0, bsPorHoraAbierta: 0 };
    const filas = filasMesas({
      ...conDetalle,
      // La 8 se jugó: si viniera repetida entre las paradas no se duplica.
      mesasParadas: [parada, { ...parada, mesaId: 8 }],
      anterior: { ...conDetalle.anterior!, porMesa: [...conDetalle.anterior!.porMesa, { mesaId: 9, total: 300, horas: 5 }] },
    });
    expect(filas.map((f) => [f.mesaId, f.parada])).toEqual([
      [7, false],
      [5, false],
      [8, false],
      [9, true],
    ]);
    expect(filas[3].delta).toBe(-1);
  });

  it("con un backend anterior (sin lo cobrado por mesa) se ordenan por horas y no hay detalle que mostrar", () => {
    const filas = filasMesas(
      reporte({
        porMesa: [
          { mesaId: 2, horas: 10, pct: 0.3 },
          { mesaId: 1, horas: 20, pct: 0.7 },
        ],
      }),
    );
    expect(filas.map((f) => f.mesaId)).toEqual([1, 2]);
    expect(filas[0]).toMatchObject({ total: null, ocupacion: null, delta: null });
    expect(hayDetallePorMesa(filas)).toBe(false);
  });

  it("la mesa más usada es la de más horas", () => {
    expect(mesaMasUsada(conDetalle.porMesa)?.mesaId).toBe(7);
    expect(mesaMasUsada([])).toBeNull();
  });

  it("los tipos de mesa van del que más dejó al que menos; sin el dato, ninguno", () => {
    const r = reporte({
      porTipo: [
        { tipo: "Carambola", mesas: 2, horas: 69.1, tiempoBs: 1606, consumosBs: 1739, total: 3346, bsPorHoraAbierta: 24 },
        { tipo: "Pool", mesas: 6, horas: 161, tiempoBs: 3000, consumosBs: 4147, total: 7147, bsPorHoraAbierta: 17 },
      ],
    });
    expect(tarjetasTipo(r).map((t) => t.tipo)).toEqual(["Pool", "Carambola"]);
    expect(tarjetasTipo(reporte())).toEqual([]);
  });
});

describe("tiempo fijo", () => {
  it("la parte de las sesiones con tiempo fijo; sin el total de sesiones no se sabe", () => {
    expect(parteFijo(56, 147)).toBeCloseTo(56 / 147);
    expect(parteFijo(56, undefined)).toBeNull();
    expect(parteFijo(0, 0)).toBeNull();
  });

  it("las sesiones libres: las que manda el backend, o todas menos las de tiempo fijo", () => {
    const fijos = { vendidos: 56, monto: 0, conExcedente: 0, excedenteBs: 0 };
    expect(sesionesLibres(reporte({ fijos, libres: 91, sesiones: 147 }))).toBe(91);
    expect(sesionesLibres(reporte({ fijos, sesiones: 147 }))).toBe(91);
    expect(sesionesLibres(reporte({ fijos }))).toBeNull();
  });

  it("los paquetes se nombran por su duración", () => {
    expect([60, 120, 90, 45].map(nombrePaquete)).toEqual(["1 hora", "2 horas", "1 h 30 min", "45 min"]);
  });

  it("con pocas duraciones van todas, de la más corta a la más larga", () => {
    const filas = filasPaquetes([
      { minutos: 120, cantidad: 25, monto: 900 },
      { minutos: 60, cantidad: 17, monto: 340 },
      { minutos: 180, cantidad: 10, monto: 500 },
    ]);
    expect(filas.map((f) => [f.etiqueta, f.cantidad])).toEqual([
      ["1 hora", 17],
      ["2 horas", 25],
      ["3 horas", 10],
    ]);
  });

  it("con muchas duraciones quedan las más vendidas y el resto va junto en Otra cantidad", () => {
    const filas = filasPaquetes([
      { minutos: 60, cantidad: 17, monto: 340 },
      { minutos: 120, cantidad: 25, monto: 900 },
      { minutos: 180, cantidad: 10, monto: 500 },
      { minutos: 240, cantidad: 3, monto: 200 },
      { minutos: 300, cantidad: 1, monto: 90 },
    ]);
    expect(filas.map((f) => [f.etiqueta, f.cantidad, f.monto])).toEqual([
      ["1 hora", 17, 340],
      ["2 horas", 25, 900],
      ["3 horas", 10, 500],
      ["Otra cantidad", 4, 290],
    ]);
  });

  it("la misma duración partida en dos se junta, y lo que no se vendió no va", () => {
    const filas = filasPaquetes([
      { minutos: 60, cantidad: 10, monto: 200 },
      { minutos: 60, cantidad: 7, monto: 140 },
      { minutos: 120, cantidad: 0, monto: 0 },
    ]);
    expect(filas).toEqual([{ etiqueta: "1 hora", minutos: 60, cantidad: 17, monto: 340 }]);
  });
});

describe("las promociones", () => {
  const promos = [
    { nombre: "Martes de pool", pct: 15, tipo: "Pool", usos: 0, descuentoBs: 0, minutosPromedio: 0 },
    { nombre: "Promo 3 h o más", pct: 10, tipo: "Pool", usos: 12, descuentoBs: 80.73, minutosPromedio: 202 },
  ];

  it("van de la más usada a la menos, comparadas con lo que juegan los que no la usan", () => {
    const filas = filasPromos(promos, 94);
    expect(filas.map((p) => p.nombre)).toEqual(["Promo 3 h o más", "Martes de pool"]);
    expect(filas[0]).toMatchObject({ conPromo: 202, sinPromo: 94 });
  });

  it("una promo que nadie usó no tiene duración: no es 0:00 h", () => {
    expect(filasPromos(promos, 94)[1].conPromo).toBeNull();
  });

  it("sin sesiones sin promo (o sin el dato) no hay con qué comparar", () => {
    expect(filasPromos(promos, 0)[0].sinPromo).toBeNull();
    expect(filasPromos(promos, undefined)[0].sinPromo).toBeNull();
  });

  it("el chip del descuento lleva el signo menos y la coma", () => {
    expect(textoDescuento(10)).toBe("−10 %");
    expect(textoDescuento(12.5)).toBe("−12,5 %");
  });
});
