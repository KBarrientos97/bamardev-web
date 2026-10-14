/**
 * Lo que la app guarda en el celular para vender sin internet (PLAN-IOS F3):
 * una copia de lo que el POS necesita (caja, catálogo, formas de pago) y la
 * cola de ventas que esperan subir. Es el Room de Android, en IndexedDB.
 *
 * IndexedDB y no localStorage: un catálogo de 1.500 artículos pasa el medio
 * MB, localStorage tiene 5 MB para TODO el sitio y escribe bloqueando la
 * pantalla. En iPhone la app instalada tiene la misma cuota que Safari (hasta
 * el 60 % del disco, PLAN-IOS §3).
 *
 * La interfaz es chica a propósito: los tests (jsdom no trae IndexedDB) usan
 * `almacenEnMemoria` y prueban la misma lógica que corre en el teléfono.
 */
export interface Almacen {
  leer<T>(clave: string): Promise<T | undefined>;
  guardar<T>(clave: string, valor: T): Promise<void>;
  borrar(clave: string): Promise<void>;
  /** Todas las claves que empiezan con `prefijo`, con su valor. */
  listar<T>(prefijo: string): Promise<Array<[string, T]>>;
}

const BASE = "bamardev-offline";
const TABLA = "datos";

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  abierta ??= new Promise((ok, mal) => {
    const pedido = indexedDB.open(BASE, 1);
    pedido.onupgradeneeded = () => {
      if (!pedido.result.objectStoreNames.contains(TABLA)) pedido.result.createObjectStore(TABLA);
    };
    pedido.onsuccess = () => ok(pedido.result);
    pedido.onerror = () => {
      // Que el próximo intento vuelva a probar (modo privado, cuota llena).
      abierta = null;
      mal(pedido.error);
    };
  });
  return abierta;
}

function enTabla<T>(modo: IDBTransactionMode, hacer: (t: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrir().then(
    (db) =>
      new Promise<T>((ok, mal) => {
        const tx = db.transaction(TABLA, modo);
        const pedido = hacer(tx.objectStore(TABLA));
        // Se resuelve al CERRAR la transacción, no con el pedido: así una
        // venta encolada está escrita en disco cuando el cajero ve el ticket.
        tx.oncomplete = () => ok(pedido.result as T);
        tx.onerror = () => mal(tx.error);
        tx.onabort = () => mal(tx.error);
      }),
  );
}

export const almacenIndexedDb: Almacen = {
  leer: <T>(clave: string) => enTabla<T | undefined>("readonly", (t) => t.get(clave)),
  guardar: async (clave, valor) => {
    await enTabla("readwrite", (t) => t.put(valor, clave));
  },
  borrar: async (clave) => {
    await enTabla("readwrite", (t) => t.delete(clave));
  },
  // Claves y valores con un solo cursor, en una sola transacción: con dos
  // lecturas separadas, una venta que se sube en el medio desalineaba las
  // claves con los valores.
  listar: async <T>(prefijo: string) => {
    const db = await abrir();
    return new Promise<Array<[string, T]>>((ok, mal) => {
      const filas: Array<[string, T]> = [];
      const tx = db.transaction(TABLA, "readonly");
      const cursor = tx.objectStore(TABLA).openCursor(IDBKeyRange.bound(prefijo, `${prefijo}￿`));
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return;
        filas.push([String(c.key), c.value as T]);
        c.continue();
      };
      tx.oncomplete = () => ok(filas);
      tx.onerror = () => mal(tx.error);
    });
  },
};

/** El mismo contrato en memoria: tests y navegadores sin IndexedDB. */
export function almacenEnMemoria(): Almacen {
  const m = new Map<string, unknown>();
  // Copia profunda, como IndexedDB (structured clone): sin esto un test
  // podía modificar lo "guardado" a través del objeto que pasó.
  const copia = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
  return {
    leer: async (clave) => copia(m.get(clave)) as never,
    guardar: async (clave, valor) => {
      m.set(clave, copia(valor));
    },
    borrar: async (clave) => {
      m.delete(clave);
    },
    listar: async (prefijo) =>
      [...m.entries()]
        .filter(([c]) => c.startsWith(prefijo))
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([c, v]) => [c, copia(v)] as never),
  };
}
