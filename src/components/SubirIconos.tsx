import { useEffect, useRef, useState } from "react";
import { apiIconos, type IconoPropio } from "../lib/apiIconos";
import { LARGO_NOMBRE_ICONO, nombreDesdeArchivo } from "../lib/iconosPropios";
import { LADO_ICONO, prepararIcono } from "../lib/pagina/imagen";
import { Icon } from "./Icon";
import { Boton, Campo, Input, Modal } from "./ui";

/** Cuántas imágenes se suben por tanda (el servidor sólo cuida el tope total). */
export const MAX_POR_TANDA = 10;

/** Lo que aceptan el selector de archivos y el backend. */
export const TIPOS_ICONO = "image/png,image/jpeg,image/webp";

type Preparada =
  | { estado: "espera" }
  | { estado: "preparando" }
  | { estado: "lista"; blob: Blob; url: string | null; fondoQuitado: boolean; yaSinFondo: boolean }
  | { estado: "error"; mensaje: string };

type Subida = { estado: "pendiente" } | { estado: "subiendo" } | { estado: "ok" } | { estado: "error"; mensaje: string };

interface Item {
  id: string;
  archivo: File;
  nombre: string;
  sacarFondo: boolean;
  /** Sube con cada cambio del interruptor: el resultado de un pedido viejo se descarta. */
  version: number;
  prep: Preparada;
  subida: Subida;
}

const mensaje = (e: unknown, defecto: string) => (e instanceof Error && e.message ? e.message : defecto);

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** La vista previa local; sin `URL.createObjectURL` (jsdom) no hay y no se libera nada. */
const crearUrl = (blob: Blob) => (typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null);
const liberarUrl = (url: string) => {
  if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
};

let contador = 0;

/**
 * Los primeros archivos que entran en la tanda (`maximo`, contando los que ya
 * hay) y, si sobran, el aviso de por qué se dejaron afuera.
 */
function tomar(lista: File[], yaHay: number, maximo: number): { items: Item[]; aviso: string } {
  const lugar = Math.max(0, maximo - yaHay);
  const primeras = plural(lugar, "se tomó la primera", `se tomaron las primeras ${lugar}`);
  const aviso =
    lista.length <= lugar
      ? ""
      : maximo < MAX_POR_TANDA
        ? `Sólo queda lugar para ${maximo} ${plural(maximo, "ícono", "íconos")} más: ${primeras}.`
        : `Se pueden subir hasta ${MAX_POR_TANDA} por vez: ${primeras}.`;
  const items: Item[] = lista.slice(0, lugar).map((archivo) => ({
    id: `icono-${++contador}`,
    archivo,
    nombre: nombreDesdeArchivo(archivo.name),
    sacarFondo: true,
    version: 0,
    prep: { estado: "espera" },
    subida: { estado: "pendiente" },
  }));
  return { items, aviso };
}

/**
 * Subir íconos propios («Mis íconos», 16-nov): hasta 10 fotos por vez, cada
 * una con su vista previa YA procesada (como va a quedar), su nombre y el
 * «Sacarle el fondo». Se suben de a una, en fila: si una falla, las demás
 * siguen y la fallida queda con su error y «Reintentar». Cuando todas quedaron
 * guardadas, vuelve sola al selector.
 *
 * Abre con los archivos ya elegidos (el selector abre el explorador al tocar
 * «Subir»); acá se pueden agregar otros mientras quede lugar.
 */
export default function SubirIconos({
  archivos,
  libres,
  onSubido,
  onCerrar,
}: {
  /** Los que eligió al tocar «Subir». */
  archivos: File[];
  /** Cuántos más puede tener el negocio antes del tope (sin contar los de esta tanda). */
  libres: number;
  /** Cada ícono que quedó guardado, apenas se guarda: el selector lo muestra enseguida. */
  onSubido: (icono: IconoPropio) => void;
  onCerrar: () => void;
}) {
  const maximo = Math.max(0, Math.min(MAX_POR_TANDA, libres));
  const [inicial] = useState(() => tomar(archivos, 0, maximo));
  const [aviso, setAviso] = useState(inicial.aviso);
  const [items, setItems] = useState<Item[]>(inicial.items);
  // Copia para lo que corre después de un `await`: el estado de ese render ya es viejo.
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [guardando, setGuardando] = useState(false);
  const cerrado = useRef(false);
  /** `id:versión` de lo que se está procesando: el doble montaje de desarrollo no lo larga dos veces. */
  const procesando = useRef(new Set<string>());
  const input = useRef<HTMLInputElement>(null);
  const [encima, setEncima] = useState(false);

  const cambiar = (id: string, cambio: (i: Item) => Item) =>
    setItems((prev) => prev.map((i) => (i.id === id ? cambio(i) : i)));

  const liberar = (i: Item | undefined) => {
    if (i?.prep.estado === "lista" && i.prep.url) liberarUrl(i.prep.url);
  };

  // Las vistas previas se liberan al cerrar.
  useEffect(() => {
    cerrado.current = false;
    return () => {
      cerrado.current = true;
      itemsRef.current.forEach(liberar);
    };
  }, []);

  // De a una por vez: procesar 10 fotos juntas congela el celular.
  useEffect(() => {
    if (items.some((i) => i.prep.estado === "preparando")) return;
    const siguiente = items.find((i) => i.prep.estado === "espera");
    if (!siguiente) return;
    const { id, version, archivo, sacarFondo } = siguiente;
    const clave = `${id}:${version}`;
    if (procesando.current.has(clave)) return;
    procesando.current.add(clave);
    cambiar(id, (i) => (i.version === version ? { ...i, prep: { estado: "preparando" } } : i));
    void (async () => {
      let prep: Preparada;
      try {
        const r = await prepararIcono(archivo, sacarFondo);
        const url = crearUrl(r.blob);
        prep = { estado: "lista", blob: r.blob, url, fondoQuitado: r.fondoQuitado, yaSinFondo: r.yaSinFondo };
      } catch (e) {
        prep = { estado: "error", mensaje: mensaje(e, "No se pudo leer la imagen.") };
      }
      procesando.current.delete(clave);
      const vigente = itemsRef.current.find((i) => i.id === id);
      if (cerrado.current || !vigente || vigente.version !== version) {
        if (prep.estado === "lista" && prep.url) liberarUrl(prep.url);
        return;
      }
      cambiar(id, (i) => ({ ...i, prep }));
    })();
  }, [items]);

  // Cuando quedaron todas guardadas, vuelve al selector.
  useEffect(() => {
    const subibles = items.filter((i) => i.prep.estado !== "error");
    if (!guardando && subibles.length > 0 && subibles.every((i) => i.subida.estado === "ok")) onCerrar();
  }, [items, guardando, onCerrar]);

  const alternarFondo = (id: string) => {
    liberar(items.find((i) => i.id === id));
    cambiar(id, (i) => ({ ...i, sacarFondo: !i.sacarFondo, version: i.version + 1, prep: { estado: "espera" } }));
  };

  const quitar = (id: string) => {
    liberar(items.find((i) => i.id === id));
    setItems((prev) => prev.filter((i) => i.id !== id));
    setAviso("");
  };

  const agregar = (lista: FileList | File[] | null | undefined) => {
    const nuevos = Array.from(lista ?? []).filter((f) => f.type.startsWith("image/"));
    if (!nuevos.length) return;
    const r = tomar(nuevos, itemsRef.current.length, maximo);
    setAviso(r.aviso);
    setItems((prev) => [...prev, ...r.items]);
  };

  /** Sube uno; devuelve si quedó guardado. */
  const subirUno = async (id: string): Promise<boolean> => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item || item.prep.estado !== "lista" || item.subida.estado === "ok") return false;
    const { blob } = item.prep;
    cambiar(id, (i) => ({ ...i, subida: { estado: "subiendo" } }));
    try {
      const icono = await apiIconos.subir(blob, item.nombre.trim());
      cambiar(id, (i) => ({ ...i, subida: { estado: "ok" } }));
      onSubido(icono);
      return true;
    } catch (e) {
      cambiar(id, (i) => ({ ...i, subida: { estado: "error", mensaje: mensaje(e, "No se pudo guardar.") } }));
      return false;
    }
  };

  const guardar = async (ids: string[]) => {
    setGuardando(true);
    for (const id of ids) {
      if (cerrado.current) break;
      await subirUno(id);
    }
    if (!cerrado.current) setGuardando(false);
  };

  const pendientes = items.filter((i) => i.prep.estado === "lista" && i.subida.estado !== "ok");
  const preparando = items.some((i) => i.prep.estado === "espera" || i.prep.estado === "preparando");
  const enCurso = items.findIndex((i) => i.subida.estado === "subiendo");
  const lugar = maximo - items.length;

  let etiquetaGuardar = `Guardar ${pendientes.length} ${plural(pendientes.length, "ícono", "íconos")}`;
  if (guardando) {
    const total = items.filter((i) => i.prep.estado === "lista").length;
    const hechos = items.filter((i) => i.subida.estado === "ok").length;
    etiquetaGuardar = `Guardando ${Math.min(hechos + 1, total)} de ${total}…`;
  } else if (preparando) {
    etiquetaGuardar = "Preparando…";
  }

  return (
    <Modal
      abierto
      titulo="Subir íconos"
      subtitulo={`Hasta ${MAX_POR_TANDA} por vez`}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      ancho="max-w-lg"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            {items.some((i) => i.subida.estado === "ok") ? "Cerrar" : "Cancelar"}
          </Boton>
          <Boton
            onClick={() => void guardar(pendientes.map((i) => i.id))}
            disabled={guardando || preparando || pendientes.length === 0}
          >
            {etiquetaGuardar}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setEncima(true);
          }}
          onDragLeave={() => setEncima(false)}
          onDrop={(e) => {
            e.preventDefault();
            setEncima(false);
            if (!guardando) agregar(e.dataTransfer.files);
          }}
          className={`flex flex-col gap-2 rounded-2xl border-2 border-dashed p-3 sm:flex-row sm:items-center ${encima ? "border-primary bg-primary-50" : "border-borde"}`}
        >
          <p className="min-w-0 flex-1 text-[13px] text-texto-3">
            Sale mejor con el producto entero sobre un fondo liso de un solo color (una hoja o una pared blanca).
          </p>
          {lugar > 0 && (
            <Boton
              variante="ghost"
              icono="camara"
              className="shrink-0 self-start !px-3 !py-2 text-[13px] sm:self-auto"
              disabled={guardando}
              onClick={() => input.current?.click()}
            >
              {items.length ? "Agregar otras" : "Elegir imágenes"}
            </Boton>
          )}
          <input
            ref={input}
            type="file"
            accept={TIPOS_ICONO}
            multiple
            className="hidden"
            aria-label="Elegir imágenes para los íconos"
            onChange={(e) => {
              agregar(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {aviso && (
          <p role="status" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
            {aviso}
          </p>
        )}

        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-texto-3">
            Elegí hasta {maximo} {plural(maximo, "imagen", "imágenes")} (PNG, JPG o WebP).
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Íconos para subir">
            {items.map((item, n) => (
              <Fila
                key={item.id}
                item={item}
                bloqueado={guardando || item.subida.estado === "ok" || item.subida.estado === "subiendo"}
                enFila={guardando && enCurso >= 0 && n > enCurso && item.subida.estado === "pendiente"}
                onNombre={(nombre) => cambiar(item.id, (i) => ({ ...i, nombre }))}
                onFondo={() => alternarFondo(item.id)}
                onQuitar={() => quitar(item.id)}
                onReintentar={() => void guardar([item.id])}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Fila({
  item,
  bloqueado,
  enFila,
  onNombre,
  onFondo,
  onQuitar,
  onReintentar,
}: {
  item: Item;
  bloqueado: boolean;
  enFila: boolean;
  onNombre: (nombre: string) => void;
  onFondo: () => void;
  onQuitar: () => void;
  onReintentar: () => void;
}) {
  const { prep, subida } = item;
  const lista = prep.estado === "lista" ? prep : null;
  const sinPoder = item.sacarFondo && lista && !lista.fondoQuitado;
  const encendido = lista?.yaSinFondo ? true : sinPoder ? false : item.sacarFondo;
  const nombreVisible = item.nombre.trim() || "Ícono";
  const idFondo = `${item.id}-fondo`;

  return (
    <li className="relative rounded-xl border border-borde p-3">
      {!bloqueado && (
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar «${nombreVisible}»`}
          title="Quitar"
          className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-borde bg-white text-texto-3 shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Icon name="close" size={14} />
        </button>
      )}
      <div className="flex gap-3">
        <div className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
          {/* Sobre claro, como en la grilla del POS; y abajo al tamaño real. */}
          <div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-xl bg-slate-100">
            {lista ? (
              lista.url && (
                <img src={lista.url} alt={`Vista previa de «${nombreVisible}»`} width={LADO_ICONO} height={LADO_ICONO} className="h-full w-full object-contain" />
              )
            ) : prep.estado === "error" ? (
              <Icon name="alert" size={24} className="text-danger-text" />
            ) : (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-primary-200 border-t-primary" aria-label="Preparando" />
            )}
          </div>
          {lista?.url && (
            <>
              <img src={lista.url} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-contain" />
              <span className="text-[10px] leading-none text-texto-4">Tamaño real</span>
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <Campo label="Nombre">
            <Input
              value={item.nombre}
              maxLength={LARGO_NOMBRE_ICONO}
              placeholder="Ícono"
              disabled={bloqueado}
              onChange={(e) => onNombre(e.target.value)}
            />
          </Campo>

          {prep.estado === "error" ? (
            <p className="text-[12px] text-danger-text">{prep.mensaje}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span id={idFondo} className="text-[13px] font-semibold text-texto-2">
                  Sacarle el fondo
                </span>
                <Interruptor
                  activo={encendido}
                  etiquetadoPor={idFondo}
                  disabled={bloqueado || !lista || !!sinPoder || !!lista?.yaSinFondo}
                  onCambiar={onFondo}
                />
              </div>
              {sinPoder && <p className="text-[12px] leading-snug text-texto-3">No pudimos sacarle el fondo: quedó como foto.</p>}
              {lista?.yaSinFondo && <p className="text-[12px] leading-snug text-texto-3">Ya venía sin fondo.</p>}
            </>
          )}

          <EstadoSubida subida={subida} enFila={enFila} onReintentar={onReintentar} />
        </div>
      </div>
    </li>
  );
}

function EstadoSubida({ subida, enFila, onReintentar }: { subida: Subida; enFila: boolean; onReintentar: () => void }) {
  if (subida.estado === "subiendo") {
    return (
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-3">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-200 border-t-primary" aria-hidden="true" />
        Guardando…
      </p>
    );
  }
  if (subida.estado === "ok") {
    return (
      <p className="flex items-center gap-1 text-[12px] font-semibold text-primary-700">
        <Icon name="check" size={14} />
        Guardado
      </p>
    );
  }
  if (subida.estado === "error") {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="min-w-0 flex-1 text-[12px] text-danger-text">{subida.mensaje}</p>
        <button
          type="button"
          onClick={onReintentar}
          className="shrink-0 rounded-lg border border-danger-text/30 px-2.5 py-1 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-text/10"
        >
          Reintentar
        </button>
      </div>
    );
  }
  return enFila ? <p className="text-[12px] text-texto-4">En fila…</p> : null;
}

function Interruptor({
  activo,
  etiquetadoPor,
  disabled,
  onCambiar,
}: {
  activo: boolean;
  etiquetadoPor: string;
  disabled: boolean;
  onCambiar: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-labelledby={etiquetadoPor}
      disabled={disabled}
      onClick={onCambiar}
      className="relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
      style={{ background: activo ? "var(--color-primary-boton)" : "#CBD5E1" }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] duration-150"
        style={{ left: activo ? 18 : 2 }}
      />
    </button>
  );
}
