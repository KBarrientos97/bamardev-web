import { describe, expect, it } from "vitest";
import { quitarFondo, type Pixeles } from "./quitarFondo";

type Rgba = [number, number, number, number];

const BLANCO: Rgba = [255, 255, 255, 255];
const NEGRO: Rgba = [0, 0, 0, 255];
const ROJO: Rgba = [200, 20, 20, 255];
const VACIO: Rgba = [0, 0, 0, 0];

/** Una imagen sintética: `pintar` dice el color de cada píxel. */
function imagen(ancho: number, alto: number, pintar: (x: number, y: number) => Rgba): Pixeles {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) data.set(pintar(x, y), (y * ancho + x) * 4);
  return { data, width: ancho, height: alto };
}

function pixel(p: Pixeles, x: number, y: number): Rgba {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

const dentro = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Un aro de `grosor` px alrededor del centro, con radio exterior `radio`. */
const enAro = (x: number, y: number, cx: number, cy: number, radio: number, grosor: number) => {
  const d = Math.hypot(x - cx, y - cy);
  return d <= radio && d > radio - grosor;
};

describe("quitarFondo (el logo en la TV, 9-nov)", () => {
  it("le saca el fondo blanco a un dibujo y recorta lo vacío de alrededor", () => {
    const p = imagen(200, 200, (x, y) => (dentro(x, y, 60, 70, 139, 129) ? ROJO : BLANCO));
    const r = quitarFondo(p);
    expect(r.tipo).toBe("quitado");
    expect(pixel(p, 0, 0)[3]).toBe(0);
    expect(pixel(p, 199, 199)[3]).toBe(0);
    expect(pixel(p, 100, 100)).toEqual(ROJO);
    if (r.tipo !== "quitado") return;
    // El dibujo mide 80×60: el recorte lo abraza con un margen chico.
    expect(r.recorte.x).toBeGreaterThan(50);
    expect(r.recorte.x).toBeLessThanOrEqual(60);
    expect(r.recorte.ancho).toBeLessThan(100);
    expect(r.recorte.alto).toBeLessThan(80);
  });

  it("el fondo negro del logo original también se saca", () => {
    // El de la pollería venía así: en la TV era un cuadrado negro sobre el rojo.
    const p = imagen(120, 120, (x, y) => (Math.hypot(x - 60, y - 60) < 40 ? ROJO : NEGRO));
    expect(quitarFondo(p).tipo).toBe("quitado");
    expect(pixel(p, 3, 3)[3]).toBe(0);
    expect(pixel(p, 60, 60)).toEqual(ROJO);
  });

  it("los cuadritos dibujados de un «PNG transparente» que no lo es cuentan como fondo", () => {
    // Los que se bajan de Google o salen de Gemini: un JPG con el damero
    // pintado. El tercer archivo de Kevin era así.
    const gris: Rgba = [204, 204, 204, 255];
    const p = imagen(160, 160, (x, y) => {
      if (Math.hypot(x - 80, y - 80) < 45) return ROJO;
      return (Math.floor(x / 10) + Math.floor(y / 10)) % 2 ? gris : BLANCO;
    });
    expect(quitarFondo(p).tipo).toBe("quitado");
    expect(pixel(p, 5, 5)[3]).toBe(0);
    expect(pixel(p, 15, 5)[3]).toBe(0);
    expect(pixel(p, 155, 100)[3]).toBe(0);
    expect(pixel(p, 80, 80)).toEqual(ROJO);
  });

  it("lo blanco de adentro del dibujo queda si un contorno lo encierra", () => {
    // El brillo blanco dentro del círculo del gallo: es parte del logo.
    const p = imagen(160, 160, (x, y) => (enAro(x, y, 80, 80, 60, 5) ? NEGRO : BLANCO));
    expect(quitarFondo(p).tipo).toBe("quitado");
    expect(pixel(p, 2, 2)[3]).toBe(0);
    expect(pixel(p, 80, 80)).toEqual(BLANCO);
    expect(pixel(p, 50, 80)).toEqual(BLANCO);
  });

  it("no se cuela por una rendija de dos píxeles en el contorno", () => {
    // En el logo de los cuadritos, el blanco de afuera tocaba el de adentro
    // del círculo por un hueco donde el círculo se junta con el cartel, y el
    // relleno se comía medio círculo.
    const p = imagen(160, 160, (x, y) => (enAro(x, y, 80, 80, 60, 5) && !(y >= 79 && y <= 80 && x > 120) ? NEGRO : BLANCO));
    quitarFondo(p);
    expect(pixel(p, 80, 80)).toEqual(BLANCO);
    expect(pixel(p, 100, 80)).toEqual(BLANCO);
  });

  it("una foto, con el borde de muchos colores, no se toca", () => {
    let semilla = 7;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % 256;
    };
    const p = imagen(100, 100, () => [azar(), azar(), azar(), 255]);
    const antes = p.data.slice();
    expect(quitarFondo(p).tipo).toBe("sin-cambios");
    expect(p.data).toEqual(antes);
  });

  it("un PNG que ya es transparente no se rellena: sólo se recorta", () => {
    // Un logo hecho para fondo oscuro, con letras blancas: la varita se las
    // comería. Ya viene sin fondo, no hay nada que sacar.
    const p = imagen(200, 200, (x, y) => (dentro(x, y, 50, 50, 149, 149) ? BLANCO : VACIO));
    const antes = p.data.slice();
    const r = quitarFondo(p);
    expect(r.tipo).toBe("ya-transparente");
    expect(p.data).toEqual(antes);
    if (r.tipo !== "ya-transparente") return;
    expect(r.recorte.x).toBeGreaterThan(40);
    expect(r.recorte.ancho).toBeLessThan(120);
  });

  it("si se iba a borrar casi todo, el logo se deja como vino", () => {
    // Un dibujo claro sobre blanco y sin contorno: lo que se borraba era el logo.
    const p = imagen(100, 100, (x, y) => (dentro(x, y, 50, 50, 51, 51) ? NEGRO : BLANCO));
    expect(quitarFondo(p).tipo).toBe("sin-cambios");
    expect(pixel(p, 0, 0)).toEqual(BLANCO);
  });

  it("borra las motas claras sueltas, pero no un punto chico del dibujo", () => {
    // El ruido del JPG quedaba como puntitos flotando en la TV y agrandaba el
    // recorte. Un punto negro (el de una i, un adorno) contrasta y queda.
    const mota: Rgba = [208, 208, 208, 255];
    const p = imagen(200, 200, (x, y) => {
      if (dentro(x, y, 60, 60, 139, 139)) return ROJO;
      if (dentro(x, y, 10, 10, 11, 11)) return mota;
      if (dentro(x, y, 180, 100, 182, 102)) return NEGRO;
      return BLANCO;
    });
    const r = quitarFondo(p);
    expect(pixel(p, 10, 10)[3]).toBe(0);
    expect(pixel(p, 181, 101)[3]).toBe(255);
    if (r.tipo !== "quitado") throw new Error(r.tipo);
    // La mota no estira el recorte hasta la esquina; el punto negro sí cuenta.
    expect(r.recorte.y).toBeGreaterThan(40);
    expect(r.recorte.x + r.recorte.ancho).toBeGreaterThan(182);
  });

  it("el borde suavizado no deja un halo blanco alrededor del dibujo", () => {
    // Opaco, el rosado del suavizado dibujaba una línea clara alrededor del
    // gallo sobre el rojo de la TV.
    const rosado: Rgba = [255, 200, 200, 255];
    const p = imagen(120, 120, (x, y) => {
      if (dentro(x, y, 40, 40, 79, 79)) return ROJO;
      if (dentro(x, y, 39, 39, 80, 80)) return rosado;
      return BLANCO;
    });
    quitarFondo(p);
    const [, g, , a] = pixel(p, 39, 60);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(200);
    expect(g).toBeLessThan(200);
  });

  it("el recorte no baja de 64 px por lado, que es lo que pide el backend", () => {
    const p = imagen(300, 300, (x, y) => (dentro(x, y, 135, 135, 164, 164) ? ROJO : BLANCO));
    const r = quitarFondo(p);
    if (r.tipo !== "quitado") throw new Error(r.tipo);
    expect(r.recorte.ancho).toBe(64);
    expect(r.recorte.alto).toBe(64);
    // Centrado sobre el dibujo, no pegado a una esquina.
    expect(r.recorte.x).toBeGreaterThan(110);
    expect(r.recorte.x).toBeLessThan(140);
  });

  it("con el lado mínimo de la foto de un plato (96 px), el recorte no baja de eso", () => {
    // El backend rechaza una foto de plato de menos de 96 px de lado: con el
    // mínimo del logo (64) la foto recortada no se podía subir.
    const p = imagen(300, 300, (x, y) => (dentro(x, y, 135, 135, 164, 164) ? ROJO : BLANCO));
    const r = quitarFondo(p, { ladoMinimo: 96 });
    if (r.tipo !== "quitado") throw new Error(r.tipo);
    expect(r.recorte.ancho).toBe(96);
    expect(r.recorte.alto).toBe(96);
  });
});

describe("quitarFondo: la foto de un plato (9-nov)", () => {
  /** Un plato de canto gris muy claro, con comida roja, sobre `fondo`. */
  const plato = (fondo: (x: number, y: number) => Rgba, canto: Rgba) =>
    imagen(240, 240, (x, y) => {
      const d = Math.hypot(x - 120, y - 120);
      if (d <= 85) return ROJO;
      if (d <= 100) return canto;
      return fondo(x, y);
    });
  const CANTO: Rgba = [238, 238, 238, 255];

  it("un plato blanco sobre blanco conserva el canto con la tolerancia según el ruido", () => {
    // Las fotos recortadas del celular sobre blanco: el canto del plato es un
    // gris apenas más oscuro que el fondo. Con la tolerancia del logo (42) la
    // varita se lo comía y en la TV el plato salía mordido.
    const conLaDelLogo = plato(() => BLANCO, CANTO);
    quitarFondo(conLaDelLogo);
    expect(pixel(conLaDelLogo, 215, 120)[3]).toBe(0);

    const p = plato(() => BLANCO, CANTO);
    const r = quitarFondo(p, { ladoMinimo: 96, tolerancia: "segun-ruido" });
    expect(r.tipo).toBe("quitado");
    // La orilla del canto queda a medias (puede ser el difuminado), no borrada.
    expect(pixel(p, 215, 120)[3]).toBeGreaterThan(100);
    // Más adentro, el canto entero, tal cual.
    expect(pixel(p, 208, 120)).toEqual(CANTO);
    expect(pixel(p, 120, 32)).toEqual(CANTO);
    expect(pixel(p, 5, 5)[3]).toBe(0);
  });

  it("el difuminado que deja el recorte del celular queda transparente a medias, no como aureola", () => {
    // La rampa del gris del plato al blanco (~20 px): opaca, era una aureola
    // blanca alrededor del plato sobre el rojo de la TV.
    const p = imagen(240, 240, (x, y) => {
      const d = Math.hypot(x - 120, y - 120);
      if (d <= 80) return ROJO;
      if (d >= 100) return BLANCO;
      const v = Math.round(200 + 55 * ((d - 80) / 20));
      return [v, v, v, 255];
    });
    const r = quitarFondo(p, { ladoMinimo: 96, tolerancia: "segun-ruido" });
    expect(r.tipo).toBe("quitado");
    const [rojo, , , alfa] = pixel(p, 215, 120); // ~241 de gris
    expect(alfa).toBeGreaterThan(40);
    expect(alfa).toBeLessThan(200);
    // Se le saca el blanco de encima: queda el gris del plato, no un blanco.
    expect(rojo).toBeLessThan(236);
    // Lo que ya es el plato (lejos del blanco) sigue opaco.
    expect(pixel(p, 202, 120)[3]).toBe(255);
  });

  it("con un fondo con ruido, la tolerancia crece y no quedan motas alrededor del plato", () => {
    const ruido = (x: number, y: number): Rgba => {
      const v = 255 - ((x * 7 + y * 13) % 15);
      return [v, v, v, 255];
    };
    const p = plato(ruido, [200, 200, 200, 255]);
    const r = quitarFondo(p, { ladoMinimo: 96, tolerancia: "segun-ruido" });
    expect(r.tipo).toBe("quitado");
    let quedan = 0;
    for (let y = 0; y < 240; y++) {
      for (let x = 0; x < 240; x++) if (Math.hypot(x - 120, y - 120) > 103 && pixel(p, x, y)[3] > 0) quedan++;
    }
    expect(quedan).toBe(0);
    expect(pixel(p, 215, 120)[3]).toBe(255);
  });
});

describe("quitarFondo: el borde de los platos por su forma (9-nov)", () => {
  // Kevin subió las fotos de la pollería (recortadas y puestas sobre blanco)
  // y los platos salían mordidos y con aureola: por color, un plato blanco
  // sobre blanco no se sabe dónde termina. Los íconos hechos con las mismas
  // fotos se veían bien porque se recortaron por la forma del plato.
  const PLATO: Rgba = [225, 225, 225, 255];
  const CASI_BLANCO: Rgba = [253, 253, 253, 255];
  const comoPlato = { ladoMinimo: 96, tolerancia: "segun-ruido" as const, platos: true };

  /** Un plato con tres mordiscos en el canto, del color del fondo. */
  const mordido = () =>
    imagen(300, 300, (x, y) => {
      const d = Math.hypot(x - 150, y - 150);
      if (d <= 60) return ROJO;
      const grados = ((Math.atan2(y - 150, x - 150) * 180) / Math.PI + 360) % 360;
      const enMordida = [0, 120, 240].some((a) => Math.min(Math.abs(grados - a), 360 - Math.abs(grados - a)) <= 3);
      if (d <= 90) return enMordida && d >= 78 ? CASI_BLANCO : PLATO;
      return BLANCO;
    });

  it("los mordiscos del canto se rellenan y lo de afuera del plato se va", () => {
    const sinForma = mordido();
    quitarFondo(sinForma, { ladoMinimo: 96, tolerancia: "segun-ruido" });
    expect(pixel(sinForma, 230, 150)[3]).toBe(0);

    const p = mordido();
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 230, 150)[3]).toBe(255);
    expect(pixel(p, 234, 150)[3]).toBeGreaterThan(100);
    expect(pixel(p, 150, 65)).toEqual(PLATO);
    expect(pixel(p, 245, 150)[3]).toBe(0);
  });

  it("lo que asoma del plato (una papa) queda, y el hueco de al lado no se rellena", () => {
    const p = imagen(300, 300, (x, y) => {
      const d = Math.hypot(x - 150, y - 150);
      if (x >= 220 && x <= 275 && Math.abs(y - 150) <= 4) return [230, 190, 60, 255];
      if (d <= 60) return ROJO;
      if (d <= 80) return PLATO;
      return BLANCO;
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 262, 150)).toEqual([230, 190, 60, 255]);
    expect(pixel(p, 245, 160)[3]).toBe(0);
  });

  it("el pollo que asoma no estira el plato: la cuña de al lado no se rellena de blanco", () => {
    // Con el contorno convexo el plato llegaba hasta el muslo que salía del
    // plato y la cuña entre el muslo y el canto salía blanca sobre la TV
    // (Kevin, 9-nov).
    const POLLO: Rgba = [170, 90, 40, 255];
    const p = imagen(300, 300, (x, y) => {
      if (Math.hypot(x - 85, y - 215) <= 22) return POLLO;
      const d = Math.hypot(x - 150, y - 150);
      if (d <= 55) return ROJO;
      if (d <= 80) return PLATO;
      return BLANCO;
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 75, 187)[3]).toBe(0);
    expect(pixel(p, 108, 226)[3]).toBe(0);
    expect(pixel(p, 70, 215)).toEqual(POLLO);
    expect(pixel(p, 150, 74)).toEqual(PLATO);
  });

  it("un plato cuadrado conserva las esquinas y se le rellenan los mordiscos", () => {
    // Un plato cuadrado no es una elipse: buscando sólo elipses quedaba sin
    // plato (con el mordisco) o con una elipse metida que le cortaba las
    // esquinas. El que no es redondo va por el contorno de su canto.
    const p = imagen(300, 300, (x, y) => {
      const dx = Math.max(0, Math.abs(x - 150) - 75);
      const dy = Math.max(0, Math.abs(y - 150) - 75);
      const afuera = Math.hypot(dx, dy) > 15;
      if (afuera) return BLANCO;
      if (Math.hypot(x - 150, y - 150) <= 50) return ROJO;
      // Un mordisco en el canto de la derecha, del color del fondo.
      if (x >= 232 && Math.abs(y - 150) <= 4) return CASI_BLANCO;
      return PLATO;
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 66, 66)).toEqual(PLATO);
    expect(pixel(p, 234, 234)).toEqual(PLATO);
    expect(pixel(p, 234, 150)[3]).toBe(255);
    expect(pixel(p, 250, 150)[3]).toBe(0);
  });

  it("el fondo que quedó encerrado entre tres platos que se tocan se va", () => {
    // La varita entra sólo desde el borde de la foto: el blanco del medio
    // quedaba como un triángulo blanco entre los platos.
    const centros = [
      [100, 100],
      [216, 100],
      [158, 200],
    ];
    const p = imagen(320, 300, (x, y) => {
      for (const [cx, cy] of centros) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= 35) return ROJO;
        if (d <= 60) return PLATO;
      }
      return BLANCO;
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 158, 133)[3]).toBe(0);
    expect(pixel(p, 100, 45)).toEqual(PLATO);
  });

  it("dos platos que se tocan no se rellenan entre ellos", () => {
    // Juntos, el contorno convexo de los dos tapaba de blanco el hueco de
    // arriba y de abajo de donde se tocan: cada uno es su elipse.
    const p = imagen(320, 300, (x, y) => {
      for (const cx of [90, 230]) {
        const d = Math.hypot(x - cx, y - 150);
        if (d <= 40) return ROJO;
        if (d <= 70) return PLATO;
      }
      return BLANCO;
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("quitado");
    expect(pixel(p, 160, 128)[3]).toBe(0);
    expect(pixel(p, 90, 85)).toEqual(PLATO);
  });

  it("una foto sobre la mesa (fondo con reflejos) queda como vino, para salir enmarcada", () => {
    // La varita dejaba pedazos de la mesa de acero pegados al plato.
    const p = imagen(300, 300, (x, y) => {
      const d = Math.hypot(x - 150, y - 150);
      if (d <= 60) return ROJO;
      if (d <= 90) return [240, 240, 240, 255];
      const v = 150 + Math.round(20 * Math.sin(x * 0.7 + y * 1.3) * Math.cos(y * 0.9));
      return [v, v + 5, v + 10, 255];
    });
    expect(quitarFondo(p, comoPlato).tipo).toBe("sin-cambios");
  });
});
