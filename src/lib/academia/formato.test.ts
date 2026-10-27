import { describe, expect, it } from "vitest";
import {
  calendarioConDescuento,
  datosDeLaBusqueda,
  diasTexto,
  edadDe,
  fechaCorta,
  fechaFinSugerida,
  horarioGrupo,
  nombreAlumno,
  nombreDe,
  nombresDe,
  problemasDelPlan,
  textoCubre,
  textoModulos,
  textoModulosDeCuota,
  textoVence,
  totalCalendario,
} from "./formato";
import type { PlanPago } from "./tipos";

describe("cómo se cuenta un grupo", () => {
  it("los días seguidos van como rango, uno solo con su nombre y los sueltos por letra", () => {
    expect(diasTexto([1, 2, 3, 4, 5])).toBe("L-V");
    expect(diasTexto([6])).toBe("Sáb");
    expect(diasTexto([2, 4])).toBe("Ma J");
    // El domingo va al final de la semana, no al principio.
    expect(diasTexto([0, 6])).toBe("S D");
    expect(diasTexto([])).toBe("");
  });

  it("el horario junta días y horas, y las fechas cortas son día-mes", () => {
    expect(horarioGrupo({ dias: [1, 2, 3, 4, 5], horaInicio: "10:00", horaFin: "12:00" })).toBe("L-V 10:00–12:00");
    expect(fechaCorta("2026-11-03")).toBe("03-nov");
    expect(fechaCorta(null)).toBe("—");
  });

  it("el alumno como en el centralizador y las referencias que vienen como texto u objeto", () => {
    expect(nombreAlumno({ apellidos: "Bustillos Rek", nombres: "Camila" })).toBe("Bustillos Rek, Camila");
    expect(nombreDe({ id: 1, nombre: "Central" })).toBe("Central");
    expect(nombreDe("Norte")).toBe("Norte");
    expect(nombreDe(null)).toBe("");
  });

  it("el fin sugerido cuenta sólo los días de clase", () => {
    // 120 h a 2 h por día = 60 clases de lunes a viernes: 12 semanas.
    const r = fechaFinSugerida("2026-11-02", [1, 2, 3, 4, 5], 2, 120);
    expect(r?.clases).toBe(60);
    expect(r?.fin).toBe("2027-01-22");
    expect(fechaFinSugerida("", [1], 2, 10)).toBeNull();
  });

  it("la edad cumplida, o null si la fecha no sirve", () => {
    const hoy = new Date(2026, 9, 15);
    expect(edadDe("2011-03-12", hoy)).toBe(15);
    expect(edadDe("2008-10-16", hoy)).toBe(17);
    expect(edadDe("2008-10-15", hoy)).toBe(18);
    expect(edadDe("no", hoy)).toBeNull();
  });
});

describe("el calendario de un plan", () => {
  const materias = [
    { orden: 1, activa: true },
    { orden: 2, activa: true },
    { orden: 3, activa: true },
  ];

  it("dice qué cubre y cuándo vence cada cuota", () => {
    expect(textoCubre([2, 3])).toBe("M2–M3");
    expect(textoCubre([1, 3])).toBe("M1, M3");
    expect(textoVence({ tipo: "INSCRIPCION" })).toBe("al inscribirse");
    expect(textoVence({ tipo: "INICIO_MATERIA", materiaOrden: 2 })).toBe("al empezar M2");
  });

  it("avisa lo mismo que el 400 PLAN_INVALIDO del backend", () => {
    expect(
      problemasDelPlan(
        [
          { n: 1, monto: 750, vence: { tipo: "INSCRIPCION" }, cubre: [1] },
          { n: 2, monto: 750, vence: { tipo: "INICIO_MATERIA", materiaOrden: 2 }, cubre: [2, 3] },
        ],
        materias,
      ),
    ).toEqual([]);
    const problemas = problemasDelPlan(
      [
        { n: 1, monto: 0, vence: { tipo: "INSCRIPCION" }, cubre: [1, 2] },
        { n: 2, monto: 100, vence: { tipo: "DIAS", dias: 30 }, cubre: [2] },
      ],
      materias,
    );
    expect(problemas).toContain("La cuota 1 necesita un monto mayor que cero.");
    expect(problemas).toContain("M2 está en 2 cuotas: tiene que estar en una sola.");
    expect(problemas).toContain("M3 no está en ninguna cuota.");
  });

  it("la cuota que no cubre nada lo dice con el vocabulario del instituto", () => {
    const vacia = [{ n: 1, monto: 100, vence: { tipo: "INSCRIPCION" as const }, cubre: [] }];
    expect(problemasDelPlan(vacia, [], "cursos")).toContain("La cuota 1 no cubre nada: marcá qué cursos paga.");
    expect(problemasDelPlan(vacia, [])).toContain("La cuota 1 no cubre nada: marcá qué módulos paga.");
  });

  it("el descuento se reparte entre las cuotas y la suma da el total", () => {
    const plan: PlanPago = {
      id: 1,
      nombre: "Cuotas",
      orden: 1,
      activo: true,
      total: 1500,
      baseDocente: {},
      calendario: [
        { n: 1, monto: 750, vence: { tipo: "INSCRIPCION" }, cubre: [1] },
        { n: 2, monto: 750, vence: { tipo: "INICIO_MATERIA", materiaOrden: 2 }, cubre: [2, 3] },
      ],
    };
    const beca = calendarioConDescuento(plan, "BECA", true, 50);
    expect(beca.total).toBe(750);
    expect(beca.descuento).toBe(750);
    expect(beca.cuotas.map((c) => c.monto)).toEqual([375, 375]);
    const promo = calendarioConDescuento(plan, "PROMOCION", false, 100);
    expect(promo.total).toBe(1400);
    expect(totalCalendario(promo.cuotas)).toBe(1400);
    expect(Math.round(promo.pct * 100) / 100).toBe(6.67);
    expect(calendarioConDescuento(plan, "", true, 50).total).toBe(1500);
  });

  const plan2: PlanPago = {
    id: 2,
    nombre: "Cuotas",
    orden: 1,
    activo: true,
    total: 1500,
    baseDocente: {},
    calendario: [
      { n: 1, monto: 750, vence: { tipo: "INICIO_MATERIA", materiaOrden: 2 }, cubre: [2] },
      { n: 2, monto: 750, vence: { tipo: "INSCRIPCION" }, cubre: [1] },
    ],
  };

  it("bug 19: con beca del 100 % no hay cuotas (el backend no crea ninguna de Bs 0)", () => {
    const r = calendarioConDescuento(plan2, "BECA", true, 100);
    expect(r.total).toBe(0);
    expect(r.cuotas).toEqual([]);
  });

  it("bug 19: sin vencimiento conserva el orden del plan y renumera las vivas", () => {
    const r = calendarioConDescuento(plan2, "", true, 0);
    expect(r.cuotas.map((c) => [c.n, c.monto])).toEqual([[1, 750], [2, 750]]);
  });

  it("bug 19: con vencimiento, la primera es la que vence antes y no la que figura primero en el plan", () => {
    const vence = (c: { n: number }) => (c.n === 1 ? "2026-12-10" : "2026-10-27");
    const r = calendarioConDescuento(plan2, "", true, 0, vence);
    expect(r.cuotas.map((c) => c.cubre)).toEqual([[1], [2]]);
    // El número es el de la cuota que crea el backend (orden del plan), no la posición.
    expect(r.cuotas.map((c) => c.n)).toEqual([2, 1]);
  });

  it("bug 19: a igual vencimiento manda el orden del plan", () => {
    const r = calendarioConDescuento(plan2, "", true, 0, () => "2026-10-27");
    expect(r.cuotas.map((c) => c.n)).toEqual([1, 2]);
  });
});

describe("precio del curso en modo simple", () => {
  it("3 módulos de Bs 500 con 10 %: 1.350, ahorra 150, cada módulo vale 450", async () => {
    const { precioCurso } = await import("./formato");
    expect(precioCurso(500, 3, 10)).toEqual({ lista: 1500, completo: 1350, ahorro: 150, porModuloCompleto: 450 });
    expect(precioCurso(600, 3, 0).ahorro).toBe(0);
    expect(precioCurso(500, 0, 10).porModuloCompleto).toBe(0);
  });
});

describe("nota en letras", () => {
  it("como en el centralizador", async () => {
    const { numeroEnLetras } = await import("./formato");
    expect(numeroEnLetras(76)).toBe("setenta y seis");
    expect(numeroEnLetras(51)).toBe("cincuenta y uno");
    expect(numeroEnLetras(22)).toBe("veintidós");
    expect(numeroEnLetras(40)).toBe("cuarenta");
    expect(numeroEnLetras(100)).toBe("cien");
    expect(numeroEnLetras(101)).toBe("");
  });
});

describe("A4 · precio final del pago completo", () => {
  it("manda sobre el %: 1.300 de 1.500 equivale a 13,33 %", async () => {
    const { descuentoEquivalente, precioCurso, textoPct } = await import("./formato");
    expect(precioCurso(500, 3, 10, 1300)).toEqual({ lista: 1500, completo: 1300, ahorro: 200, porModuloCompleto: 1300 / 3 });
    expect(precioCurso(500, 3, 10, null).completo).toBe(1350);
    expect(descuentoEquivalente(1500, 1300)).toBe(13.33);
    expect(descuentoEquivalente(0, 1300)).toBe(0);
    expect(textoPct(13.33)).toBe("13,33");
    expect(textoPct(20)).toBe("20");
  });
});

describe("A5 · la frase del pago al docente", () => {
  it("por % o por monto fijo", async () => {
    const { textoPagoDocente } = await import("./formato");
    const p = { docente: "docente", alumno: "estudiante", materia: "módulo" };
    expect(textoPagoDocente("PORCENTAJE", 20, null, p)).toBe("El docente cobra el 20 % de lo que paga cada estudiante por el módulo.");
    expect(textoPagoDocente(undefined, 20, null, p)).toMatch(/el 20 %/);
    expect(textoPagoDocente("MONTO", 20, 90, p)).toBe("El docente cobra Bs 90,00 por cada estudiante que pagó el módulo completo.");
  });
});

describe("venceCuota (regla del backend, QA 23-oct)", () => {
  it("INICIO_MATERIA: el día que empieza el módulo o hoy si ya empezó; INSCRIPCION hoy; DIAS hoy + días", async () => {
    const { venceCuota } = await import("./formato");
    const desde = (o: number) => ({ 1: "2026-11-10", 2: "2026-12-10" })[o as 1 | 2];
    expect(venceCuota({ tipo: "INICIO_MATERIA", materiaOrden: 1 }, desde, "2026-10-23")).toBe("2026-11-10");
    expect(venceCuota({ tipo: "INICIO_MATERIA", materiaOrden: 1 }, desde, "2026-11-15")).toBe("hoy");
    expect(venceCuota({ tipo: "INICIO_MATERIA" }, desde, "2026-10-23", 2)).toBe("2026-12-10");
    expect(venceCuota({ tipo: "INICIO_MATERIA", materiaOrden: 5 }, desde, "2026-10-23")).toBeNull();
    expect(venceCuota({ tipo: "INSCRIPCION" }, desde, "2026-10-23")).toBe("hoy");
    expect(venceCuota({ tipo: "DIAS", dias: 30 }, desde, "2026-10-23")).toBe("2026-11-22");
  });
});

describe("ronda 1 · F7 · un módulo sin nombre propio no sale como «M1 Módulo 1»", () => {
  it("omite el nombre cuando es el genérico «Módulo N» y lo deja cuando es propio", () => {
    const nombres = { 1: "Módulo 1", 2: "Degradados", 3: "módulo 3", 4: "Modulo 4" };
    expect(textoModulos([1], nombres)).toBe("M1");
    expect(textoModulos([1, 2], nombres)).toBe("M1 y M2 Degradados");
    expect(textoModulos([3], nombres)).toBe("M3");
    expect(textoModulos([4], nombres)).toBe("M4");
    expect(textoModulosDeCuota({ materiaOrdenes: [1], materias: [{ orden: 1, nombre: "Módulo 1" }] })).toBe("M1");
    // La regla es por la palabra «Módulo» entera: «Modulado fino» es un nombre propio.
    expect(textoModulos([5], { 5: "Modulado fino" })).toBe("M5 Modulado fino");
  });
});

describe("ronda 2 · B5 · sólo el «Módulo N» genérico se oculta", () => {
  it("«Módulo avanzado de corte» es un nombre propio y se conserva", () => {
    expect(textoModulos([1], { 1: "Módulo avanzado de corte" })).toBe("M1 Módulo avanzado de corte");
    expect(textoModulos([2], { 2: "Módulo 2 avanzado" })).toBe("M2 Módulo 2 avanzado");
    expect(textoModulos([3], { 3: "Módulo 3" })).toBe("M3");
    expect(textoModulos([4], { 4: "  módulo4 " })).toBe("M4");
  });
});

describe("ronda 2 · R9 · qué se carga en «Nuevo estudiante» con lo buscado", () => {
  it("un CI plausible va al carnet; un celular no; un nombre va a Apellidos", () => {
    expect(datosDeLaBusqueda("14550221")).toEqual({ ci: "14550221" });
    expect(datosDeLaBusqueda(" 6642881 ")).toEqual({ ci: "6642881" });
    expect(datosDeLaBusqueda("71234567")).toEqual({});
    expect(datosDeLaBusqueda("65432109")).toEqual({});
    expect(datosDeLaBusqueda("12345")).toEqual({});
    expect(datosDeLaBusqueda("Pérez Ana")).toEqual({ apellidos: "Pérez Ana" });
    expect(datosDeLaBusqueda("")).toEqual({});
  });
});

describe("D6 · los módulos de una cuota con su nombre", () => {
  it("nombresDe arma {orden: nombre} con el detalle del grupo", () => {
    const m = (orden: number, nombre: string) => ({ materia: { id: orden, orden, nombre } }) as never;
    expect(nombresDe([m(1, "Corte clásico"), m(2, "Degradados")])).toEqual({ 1: "Corte clásico", 2: "Degradados" });
    expect(nombresDe(undefined)).toEqual({});
  });

  it("la cuota dice «M2 Degradados» con sus materias y «M2–M3» sin ellas", () => {
    expect(textoModulosDeCuota({ materiaOrdenes: [2], materias: [{ orden: 2, nombre: "Degradados" }] })).toBe("M2 Degradados");
    expect(textoModulosDeCuota({ materiaOrdenes: [2, 3] })).toBe("M2–M3");
    expect(textoModulosDeCuota({ materiaOrdenes: [2, 3], materias: [] })).toBe("M2–M3");
  });
});
