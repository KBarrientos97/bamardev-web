import { normalizar } from "../../lib/texto";

/**
 * Las piezas sin pantalla de la ficha farmacéutica del alta: los atajos que se
 * sugieren, cómo se guarda una droga compuesta y qué forma tiene un registro
 * sanitario. Van aparte del formulario para poder probarlas solas.
 */

/**
 * Las drogas más vendidas en una farmacia de barrio de Bolivia, bien escritas
 * (con sus tildes), para sugerirlas desde el primer medicamento que se carga.
 *
 * Sin esta lista los atajos dependían de lo que ya estuviera cargado, y en una
 * farmacia nueva no había nada: cada quien escribía "losartan", "Losartan" o
 * "LOSARTÁN", y la búsqueda por droga y los equivalentes (que agrupan por este
 * texto) los veían como tres remedios distintos. No es un vademécum: es lo que
 * se despacha todos los días; lo que no está se escribe igual.
 */
export const DROGAS_BASE: readonly string[] = [
  // Dolor, fiebre e inflamación
  "Paracetamol",
  "Ibuprofeno",
  "Diclofenaco",
  "Naproxeno",
  "Ketorolaco",
  "Metamizol",
  "Ácido acetilsalicílico",
  "Meloxicam",
  "Nimesulida",
  "Piroxicam",
  "Ketoprofeno",
  "Celecoxib",
  "Tramadol",
  "Codeína",
  "Orfenadrina",
  "Butilescopolamina",
  // Antibióticos
  "Amoxicilina",
  "Ácido clavulánico",
  "Ampicilina",
  "Penicilina benzatínica",
  "Azitromicina",
  "Claritromicina",
  "Eritromicina",
  "Cefalexina",
  "Cefadroxilo",
  "Cefixima",
  "Ceftriaxona",
  "Ciprofloxacino",
  "Levofloxacino",
  "Doxiciclina",
  "Sulfametoxazol",
  "Trimetoprima",
  "Nitrofurantoína",
  "Metronidazol",
  "Tinidazol",
  "Clindamicina",
  "Gentamicina",
  // Hongos, parásitos y virus
  "Fluconazol",
  "Ketoconazol",
  "Clotrimazol",
  "Miconazol",
  "Nistatina",
  "Terbinafina",
  "Albendazol",
  "Mebendazol",
  "Nitazoxanida",
  "Ivermectina",
  "Permetrina",
  "Aciclovir",
  "Oseltamivir",
  // Estómago
  "Omeprazol",
  "Esomeprazol",
  "Pantoprazol",
  "Lansoprazol",
  "Ranitidina",
  "Famotidina",
  "Metoclopramida",
  "Domperidona",
  "Ondansetrón",
  "Dimenhidrinato",
  "Loperamida",
  "Simeticona",
  "Hidróxido de aluminio",
  "Bisacodilo",
  "Sales de rehidratación oral",
  // Alergia y vías respiratorias
  "Loratadina",
  "Cetirizina",
  "Fexofenadina",
  "Clorfenamina",
  "Difenhidramina",
  "Ambroxol",
  "Bromhexina",
  "Acetilcisteína",
  "Dextrometorfano",
  "Guaifenesina",
  "Fenilefrina",
  "Salbutamol",
  "Budesonida",
  "Fluticasona",
  "Montelukast",
  // Corticoides
  "Prednisona",
  "Dexametasona",
  "Betametasona",
  "Hidrocortisona",
  // Presión, corazón, azúcar y tiroides
  "Enalapril",
  "Captopril",
  "Losartán",
  "Amlodipino",
  "Nifedipino",
  "Atenolol",
  "Propranolol",
  "Carvedilol",
  "Hidroclorotiazida",
  "Furosemida",
  "Espironolactona",
  "Atorvastatina",
  "Simvastatina",
  "Rosuvastatina",
  "Clopidogrel",
  "Metformina",
  "Glibenclamida",
  "Insulina",
  "Levotiroxina",
  // Sistema nervioso (varios son controlados)
  "Clonazepam",
  "Alprazolam",
  "Diazepam",
  "Lorazepam",
  "Fluoxetina",
  "Sertralina",
  "Amitriptilina",
  "Carbamazepina",
  "Ácido valproico",
  "Fenitoína",
  "Fenobarbital",
  "Gabapentina",
  "Pregabalina",
  "Risperidona",
  "Haloperidol",
  "Cafeína",
  // Vitaminas y minerales
  "Ácido fólico",
  "Sulfato ferroso",
  "Complejo B",
  "Vitamina C",
  "Vitamina D",
  "Cianocobalamina",
  "Calcio",
  "Zinc",
  // Hormonas y urología
  "Levonorgestrel",
  "Etinilestradiol",
  "Sildenafil",
  "Tadalafilo",
  "Tamsulosina",
  // Piel, ojos y primeros auxilios
  "Mupirocina",
  "Óxido de zinc",
  "Lidocaína",
  "Clorhexidina",
  "Povidona yodada",
];

/**
 * Las formas de siempre, para que "Comprimido" se escriba de una sola manera
 * desde el primer día (ver `DROGAS_BASE`: es el mismo problema). "Paquete" y
 * "Unidad" son para lo que no es remedio: un pañal, una mamadera.
 */
export const FORMAS_BASE: readonly string[] = [
  "Comprimido",
  "Comprimido recubierto",
  "Cápsula",
  "Tableta",
  "Jarabe",
  "Suspensión",
  "Gotas",
  "Solución",
  "Solución inyectable",
  "Ampolla",
  "Crema",
  "Pomada",
  "Gel",
  "Ungüento",
  "Óvulo",
  "Supositorio",
  "Sobre",
  "Polvo",
  "Inhalador",
  "Spray nasal",
  "Colirio",
  "Parche",
  "Loción",
  "Shampoo",
  "Paquete",
  "Unidad",
];

/** El tope de la columna `principioActivo` en el backend (`@MaxLength(120)`). */
export const LARGO_MAX_PRINCIPIOS = 120;

/**
 * Las drogas de un medicamento, de a una. Se guarda todo en la misma columna
 * (`principioActivo`) como texto, así que al editar hay que partirlo de vuelta.
 *
 * Se parte por coma, punto y coma y "+": lo que la web guarda ("Diclofenaco,
 * Paracetamol") y lo que se cargó a mano o desde el Excel antes de que hubiera
 * fichas ("Paracetamol + Cafeína"). Una droga repetida queda una sola vez.
 */
export function partirPrincipios(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const parte of texto.split(/[,;+]/)) {
    const limpia = parte.trim().replace(/\s+/g, " ");
    const clave = normalizar(limpia);
    if (!limpia || vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(limpia);
  }
  return salida;
}

/**
 * Cómo viaja: "Diclofenaco, Paracetamol". Con coma y espacio porque así se lee
 * en la ficha y en el mostrador, y porque el buscador del servidor encuentra
 * cada droga igual (busca "contiene").
 */
export function unirPrincipios(lista: readonly string[]): string {
  return lista.join(", ");
}

/**
 * Junta las sugerencias de varias fuentes en una sola lista, sin repetir.
 *
 * El orden es el de las fuentes —lo de este negocio primero, la lista base al
 * final—, porque al abrir el campo vacío lo que más sirve arriba es lo que esta
 * farmacia ya usa. La ESCRITURA, en cambio, la gana la lista base: si alguien
 * guardó "losartan", se sugiere "Losartán", que es como hay que dejarlo. Se
 * compara sin tildes ni mayúsculas.
 */
export function juntarSugerencias(
  fuentes: readonly (readonly (string | null | undefined)[] | null | undefined)[],
  base: readonly string[] = [],
): string[] {
  const bien = new Map(base.map((b) => [normalizar(b.trim()), b]));
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const lista of [...fuentes, base]) {
    // Lo del servidor no está garantizado por el tipo: un texto suelto se
    // recorrería letra por letra.
    if (!Array.isArray(lista)) continue;
    for (const crudo of lista) {
      // `typeof` y no sólo el `trim`: lo que llega del servidor o del
      // almacenamiento local no está garantizado por el tipo.
      if (typeof crudo !== "string") continue;
      const valor = crudo.trim().replace(/\s+/g, " ");
      const clave = normalizar(valor);
      if (!valor || vistos.has(clave)) continue;
      vistos.add(clave);
      salida.push(bien.get(clave) ?? valor);
    }
  }
  return salida;
}

/**
 * Lo que se ofrece para lo tecleado: primero lo que EMPIEZA así, después lo
 * que lo contiene en otro lado ("fol" → "Ácido fólico"). Sin tildes ni
 * mayúsculas, y sin lo que ya se eligió (`excluir`): ofrecer de nuevo una
 * droga que ya es ficha es invitar a repetirla.
 */
export function filtrarSugerencias(
  lista: readonly string[],
  tecleado: string,
  { excluir = [], tope = 50 }: { excluir?: readonly string[]; tope?: number } = {},
): string[] {
  const aguja = normalizar(tecleado.trim());
  const fuera = new Set(excluir.map((e) => normalizar(e.trim())));
  const empiezan: string[] = [];
  const contienen: string[] = [];
  for (const s of lista) {
    const n = normalizar(s);
    if (fuera.has(n)) continue;
    const donde = aguja ? n.indexOf(aguja) : 0;
    if (donde === 0) empiezan.push(s);
    else if (donde > 0) contienen.push(s);
  }
  return [...empiezan, ...contienen].slice(0, tope);
}

/**
 * Si lo tecleado ES una de las sugerencias, escrito de otra manera ("capsula",
 * "CÁPSULA"), la escritura de la lista; si no, lo tecleado tal cual. Así el
 * texto libre sigue siendo libre, y lo que ya existe no se carga dos veces.
 */
export function comoEnLaLista(tecleado: string, lista: readonly string[]): string {
  const limpio = tecleado.trim().replace(/\s+/g, " ");
  const clave = normalizar(limpio);
  if (!clave) return limpio;
  return lista.find((s) => normalizar(s) === clave) ?? limpio;
}

/**
 * El registro sanitario como lo imprime AGEMED: en mayúsculas y sin espacios
 * alrededor del guion ni de la barra ("nn - 12345 / 2024" → "NN-12345/2024").
 * Sólo ordena lo que se escribió: no inventa ni saca caracteres.
 */
export function limpiarRegistro(texto: string): string {
  return texto
    .trim()
    .toUpperCase()
    .replace(/\s*([-/])\s*/g, "$1")
    .replace(/\s+/g, " ");
}

/**
 * Si tiene la forma de un registro de AGEMED: letras, guion, número, barra y
 * año (NN-12345/2024 nacional, II-12345/2024 importado). Es una pista y no una
 * regla: los cosméticos traen otro formato (NSO) y hay registros viejos, así
 * que lo que no la tiene se guarda igual, con un aviso.
 */
export function registroConForma(texto: string): boolean {
  return /^[A-Z]{2,3}-\d{3,6}\/\d{2,4}$/.test(limpiarRegistro(texto));
}
