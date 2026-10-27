import type { Sede } from "./tipos";

/**
 * Lo puro de la pantalla de Sedes (C4/C5): validar las franjas de una sede
 * antes de mandarlas, ubicar la fila que el backend rechazó y armar los textos
 * chicos. Está aparte para probarlo sin pantalla.
 */

/** Una fila del editor de franjas (lo que se tipea, aún sin guardar). */
export interface FilaFranja {
  inicio: string;
  fin: string;
  /** Venía "de todas las sedes": al guardar queda copiada a esta sede. */
  todasLasSedes?: boolean;
}

const aMin = (h: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** El orden en que el backend numera las franjas: por inicio y, si empatan, por fin. */
function ordenIndices(filas: FilaFranja[]): number[] {
  return filas
    .map((_, i) => i)
    .sort((x, y) => (aMin(filas[x].inicio) ?? 0) - (aMin(filas[y].inicio) ?? 0) || (aMin(filas[x].fin) ?? 0) - (aMin(filas[y].fin) ?? 0));
}

export interface ProblemasFranjas {
  /** Los índices (de la lista tal como está en pantalla) de las filas con problema. */
  filas: Set<number>;
  /** Qué decir, una frase por problema. */
  mensajes: string[];
}

/**
 * Lo que el backend rechazaría: una franja sin hora, al revés (o de 0 minutos)
 * o que se pisa con otra. Se dice antes de mandar y se marca la fila.
 */
export function problemasDeLasFilas(filas: FilaFranja[]): ProblemasFranjas {
  const marcadas = new Set<number>();
  const mensajes: string[] = [];
  filas.forEach((f, i) => {
    const a = aMin(f.inicio);
    const b = aMin(f.fin);
    if (a == null || b == null) {
      marcadas.add(i);
      mensajes.push("Falta la hora de una franja.");
    } else if (a >= b) {
      marcadas.add(i);
      mensajes.push(`La franja ${f.inicio}–${f.fin} tiene que empezar antes de terminar.`);
    }
  });
  if (mensajes.length) return { filas: marcadas, mensajes };
  const orden = ordenIndices(filas);
  for (let k = 1; k < orden.length; k++) {
    const ant = filas[orden[k - 1]];
    const sig = filas[orden[k]];
    if (aMin(sig.inicio)! < aMin(ant.fin)!) {
      marcadas.add(orden[k - 1]);
      marcadas.add(orden[k]);
      mensajes.push(`Las franjas ${ant.inicio}–${ant.fin} y ${sig.inicio}–${sig.fin} se pisan.`);
    }
  }
  return { filas: marcadas, mensajes };
}

/**
 * Las filas que nombra un rechazo del backend (`FRANJAS_INVALIDAS` trae
 * `detalles` en texto: "La franja 2 tiene…", "Las franjas 08:00–10:00 y
 * 09:00–11:00 se pisan…"). Se buscan por número de franja (en el orden del
 * backend) o por las horas que mencionan.
 */
export function filasDeLosDetalles(detalles: string[], filas: FilaFranja[]): Set<number> {
  const marcadas = new Set<number>();
  const orden = ordenIndices(filas);
  for (const d of detalles) {
    const num = /La franja (\d+)/.exec(d);
    if (num) {
      const i = orden[Number(num[1]) - 1];
      if (i != null) marcadas.add(i);
    }
    for (const m of d.matchAll(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/g)) {
      filas.forEach((f, i) => {
        if (aMin(f.inicio) === aMin(m[1]) && aMin(f.fin) === aMin(m[2])) marcadas.add(i);
      });
    }
  }
  return marcadas;
}

/** La franja que sigue a la última, de 2 horas ("Agregar franja"). */
export function filaSiguiente(filas: FilaFranja[]): FilaFranja {
  const ultima = [...filas].sort((x, y) => (aMin(x.fin) ?? 0) - (aMin(y.fin) ?? 0)).at(-1);
  let inicio = ultima && aMin(ultima.fin) != null ? ultima.fin : "08:00";
  // Si la última ya termina a las 23:30 no queda lugar después: 23:30–23:30 no sirve (al
  // guardar decía "tiene que empezar antes de terminar"). Se propone la franja de la
  // mañana y quien agrega la ajusta; si se pisa con otra, la validación lo marca (ronda 2, B9).
  if ((aMin(inicio) ?? 0) >= 23 * 60 + 30) inicio = "08:00";
  const fin = Math.min((aMin(inicio) ?? 480) + 120, 23 * 60 + 30);
  const hh = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return { inicio: hh(aMin(inicio) ?? 480), fin: hh(fin) };
}

/** ¿Son las mismas franjas (en el mismo orden)? Para saber si hay algo sin guardar. */
export function mismasFilas(a: FilaFranja[], b: FilaFranja[]): boolean {
  return a.length === b.length && a.every((f, i) => f.inicio === b[i].inicio && f.fin === b[i].fin);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «2 aulas · 5 franjas · 3 grupos»: los conteos de la sede, uno por chip. */
export function conteosDeSede(s: Pick<Sede, "aulas" | "franjas" | "gruposVigentes">): string[] {
  return [plural(s.aulas, "aula", "aulas"), plural(s.franjas, "franja", "franjas"), plural(s.gruposVigentes, "grupo", "grupos")];
}

/** Los datos que una sede todavía no tiene cargados, para invitar a completarlos. */
export function datosQueFaltan(s: Pick<Sede, "direccion" | "telefono" | "horarioAtencion">): string[] {
  const falta: string[] = [];
  if (!s.direccion?.trim()) falta.push("la dirección");
  if (!s.telefono?.trim()) falta.push("el teléfono");
  if (!s.horarioAtencion?.trim()) falta.push("el horario de atención");
  return falta;
}
