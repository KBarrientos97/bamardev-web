/**
 * El monto que teclea el cajero, escrito como se escribe en Bolivia: punto de
 * miles y coma de centavos ("2.258,90").
 *
 * El campo numérico de siempre (`Input` + `parsearMonto`) pasa la coma a punto
 * y lee con `Number()`, que no conoce el punto de miles. En el cierre de caja
 * (QA de Kevin, 17-oct-2026):
 * - "2.258,90" llegaba como "2.258.90", que no es un número, y el cierre decía
 *   "El efectivo contado no puede ser negativo";
 * - "1.000" se leía como Bs 1, sin ningún aviso;
 * - "225890" eran Bs 225.890 y el campo no lo mostraba: se notaba recién por
 *   un sobrante de Bs 223.631,10.
 *
 * Las reglas:
 * - La coma es la de los centavos: una sola, con dos cifras como mucho.
 * - El punto es de miles, salvo el último cuando lleva una o dos cifras detrás
 *   ("2.258.90", "50.50"): un grupo de miles tiene siempre tres, así que eso
 *   sólo pueden ser centavos. Es el punto del teclado numérico, y hay quien lo
 *   usa para los centavos.
 * - Mientras se teclea, los miles se separan solos ("2258" → "2.258"): un
 *   "225890" se ve como "225.890" antes de cerrar. Al salir del campo queda
 *   escrito entero ("2.258,90"), como lo muestra el resto de la pantalla.
 *
 * No reemplaza a `parsearMonto`, que también lee cantidades: en "0.125" kg las
 * tres cifras después del punto son decimales, no miles.
 */

/** Lo que se entendió de un texto. */
interface Lectura {
  /** Las cifras de la parte entera, sin ceros adelante; "" si no hay. */
  entero: string;
  /** El separador de los centavos como se tecleó, o `null` si no hay. */
  separador: "," | "." | null;
  /** Cero, una o dos cifras. */
  centavos: string;
}

/** Sólo lo que puede ser parte de un monto: "Bs 1.500" → "1.500". Sin signo: es plata contada. */
function soloMonto(texto: string): string {
  return texto.replace(/[^\d.,]/g, "");
}

function sinCerosAdelante(cifras: string): string {
  return cifras.replace(/^0+(?=\d)/, "");
}

function agruparMiles(cifras: string): string {
  return cifras.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function esCifra(c: string | undefined): boolean {
  return c !== undefined && c >= "0" && c <= "9";
}

/**
 * `null` si el texto no se puede leer como un monto: dos comas, o un punto o
 * una tercera cifra después de la coma.
 *
 * Con `puntosDeMiles` todo punto es de miles, aunque lleve dos cifras detrás.
 * Es lo que pasa al borrar una cifra de "22.589": queda "22.89", y ese punto
 * es el de los miles de antes, no unos centavos que nadie tecleó.
 */
function interpretar(limpio: string, puntosDeMiles: boolean): Lectura | null {
  const partes = limpio.split(",");
  if (partes.length > 2) return null;
  if (partes.length === 2) {
    const [antes, despues] = partes;
    if (despues.includes(".") || despues.length > 2) return null;
    return { entero: sinCerosAdelante(antes.replace(/\./g, "")), separador: ",", centavos: despues };
  }
  const ultimo = limpio.lastIndexOf(".");
  if (ultimo < 0 || puntosDeMiles || limpio.length - ultimo - 1 >= 3) {
    return { entero: sinCerosAdelante(limpio.replace(/\./g, "")), separador: null, centavos: "" };
  }
  return {
    entero: sinCerosAdelante(limpio.slice(0, ultimo).replace(/\./g, "")),
    separador: ".",
    centavos: limpio.slice(ultimo + 1),
  };
}

function escribir(l: Lectura): string {
  return agruparMiles(l.entero) + (l.separador ? l.separador + l.centavos : "");
}

/** Sin una sola cifra no hay monto: una coma o un punto sueltos todavía no dicen nada. */
function valor(l: Lectura): number | null {
  if (l.entero === "" && l.centavos === "") return null;
  return Number(`${l.entero || "0"}.${l.centavos || "0"}`);
}

/** Lo que vale el texto del campo; `null` si está vacío o no se entiende. */
export function leerMonto(texto: string | null | undefined): number | null {
  const l = interpretar(soloMonto(texto ?? ""), false);
  return l ? valor(l) : null;
}

/**
 * Una tecla (o algo pegado) en el campo. `previo` es lo que mostraba, `nuevo`
 * lo que dejó el navegador y `cursor` dónde quedó el cursor. Devuelve qué
 * mostrar y dónde poner el cursor. Lo que no se puede leer (una tercera cifra
 * de centavos, otra coma) no entra: queda el texto de antes.
 */
export function editarMonto(
  previo: string,
  nuevo: string,
  cursor: number,
): { texto: string; cursor: number } {
  // Qué cambió: lo que difiere entre el texto de antes y el de ahora.
  let inicio = 0;
  while (inicio < previo.length && inicio < nuevo.length && previo[inicio] === nuevo[inicio]) inicio++;
  let fin = 0;
  while (
    fin < previo.length - inicio &&
    fin < nuevo.length - inicio &&
    previo[previo.length - 1 - fin] === nuevo[nuevo.length - 1 - fin]
  ) {
    fin++;
  }
  const insertado = nuevo.slice(inicio, nuevo.length - fin);
  const borrado = previo.slice(inicio, previo.length - fin);
  const anterior = interpretar(soloMonto(previo), false);

  let editado = nuevo;
  let pos = cursor;
  // Borrar un punto de miles no sirve: se vuelve a agrupar, reaparece y el
  // cursor queda trabado detrás de él. Se borra la cifra de antes, que es lo
  // que quería quien apretó "borrar" ahí.
  if (
    insertado === "" &&
    borrado === "." &&
    anterior &&
    inicio > 0 &&
    inicio < agruparMiles(anterior.entero).length
  ) {
    editado = previo.slice(0, inicio - 1) + previo.slice(inicio + 1);
    pos = inicio - 1;
  }

  // Un punto que ya estaba sólo pasa a ser de centavos si se tecleó uno.
  const puntosDeMiles = !anterior?.separador && !/[.,]/.test(insertado);
  const lectura = interpretar(soloMonto(editado), puntosDeMiles);
  if (!lectura) return { texto: previo, cursor: inicio };
  const texto = escribir(lectura);
  return { texto, cursor: ubicarCursor(editado, pos, texto, lectura) };
}

/**
 * El cursor queda con las mismas cifras a su derecha que antes (y la coma, si
 * estaba ahí). Se cuenta desde el final porque lo que se reescribe —los puntos
 * de miles, un cero de adelante— está a la izquierda de donde casi siempre se
 * teclea.
 */
function ubicarCursor(nuevo: string, cursor: number, texto: string, l: Lectura): number {
  const sepNuevo =
    l.separador === "," ? nuevo.indexOf(",") : l.separador === "." ? nuevo.lastIndexOf(".") : -1;
  let aLaDerecha = 0;
  for (let i = Math.max(0, cursor); i < nuevo.length; i++) {
    if (i === sepNuevo || esCifra(nuevo[i])) aLaDerecha++;
  }
  const sepTexto = l.separador ? agruparMiles(l.entero).length : -1;
  let pos = texto.length;
  let contadas = 0;
  while (pos > 0 && contadas < aLaDerecha) {
    pos--;
    if (pos === sepTexto || esCifra(texto[pos])) contadas++;
  }
  return pos;
}

/**
 * Al salir del campo: el monto escrito entero, con sus dos centavos, como lo
 * muestra el resto de la pantalla ("2.258" → "2.258,00", "50.5" → "50,50").
 * Así no queda duda de qué punto es de miles. Vacío si no hay monto.
 */
export function completarMonto(texto: string): string {
  const l = interpretar(soloMonto(texto), false);
  if (!l) return texto;
  if (valor(l) === null) return "";
  return agruparMiles(l.entero || "0") + "," + l.centavos.padEnd(2, "0");
}

/** Un monto calculado (el conteo de billetes) escrito como lo deja el campo. */
export function montoParaEditar(monto: number): string {
  const centavos = Math.round(Math.abs(monto) * 100);
  return (
    agruparMiles(String(Math.floor(centavos / 100))) + "," + String(centavos % 100).padStart(2, "0")
  );
}
