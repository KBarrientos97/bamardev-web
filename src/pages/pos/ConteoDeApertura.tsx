import { useEffect, useMemo, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { fmtNum } from "../../lib/format";
import { fraseContar, lineasCambiadas, type FilaApertura } from "../../lib/conteo";
import { useApi } from "../../lib/useApi";
import type { CategoriaContada } from "../../types";

/** Lo tecleado, leído: vacío o roto = no escribió nada (null). */
function leerNumero(texto: string | undefined): number | null {
  if (texto == null || texto.trim() === "") return null;
  const n = Number(texto);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/**
 * El conteo por categoría al abrir la caja (17-nov): cuántos vasos (o cajas, o
 * envases) de cada tamaño hay AHORA en el local.
 *
 * Es el ÚNICO momento en que el cajero cambia el conteo: lo que quedó del
 * turno anterior ya viene escrito y, si repuso («le quedaban 20, borra y pone
 * 100»), escribe cuántos hay. Misma estética que el corte por denominación
 * (`CorteDeCaja`) porque se hace en el mismo gesto, con el cajón a la vista.
 *
 * Qué viaja lo decide `lineasCambiadas`: sólo lo que el cajero tocó. Una fila
 * que se deja en blanco sigue su cuenta en el servidor; mandarla con el número
 * que bajó la pantalla pisaría lo que otro cajero vendió mientras tanto.
 *
 * Si no se puede traer lo que quedaba (se cortó el internet) igual se puede
 * abrir: las filas salen vacías y lo que se escriba cuenta como conteo nuevo.
 * Una apertura que no deja abrir por un contador de vasos es peor que un
 * contador sin el dato de ayer.
 */
export default function ConteoDeApertura({
  nombre,
  categorias,
  sucursalId,
  onCambio,
}: {
  /** Lo que se cuenta, en plural («Vasos»). */
  nombre: string;
  /** Las categorías contadas, para dibujar las filas si el pedido falla. */
  categorias: CategoriaContada[];
  /** La sucursal en la que se abre; null = la del cajero (la decide el servidor). */
  sucursalId: number | null;
  /** Qué viaja con la apertura, cada vez que cambia. */
  onCambio: (lineas: { categoriaId: number; cantidad: number }[]) => void;
}) {
  const [abierto, setAbierto] = useState(true);
  // Con `clave` los datos de otra sucursal no se ven como si fueran de ésta.
  const estado = useApi(() => api.estadoConteo(sucursalId), [sucursalId], { clave: sucursalId });
  const [escrito, setEscrito] = useState<Record<number, string>>({});

  // Otra sucursal = otro conteo: lo escrito para la anterior no vale acá.
  useEffect(() => {
    setEscrito({});
  }, [sucursalId]);

  const filas = useMemo(() => {
    const items = estado.datos?.items;
    if (items && items.length > 0) {
      return items.map((i) => ({ categoriaId: i.categoriaId, nombre: i.nombre, quedaban: i.quedan }));
    }
    return categorias.map((c) => ({ categoriaId: c.id, nombre: c.nombre, quedaban: null as number | null }));
  }, [estado.datos, categorias]);

  const paraEnviar = useMemo(() => {
    const aplicar: FilaApertura[] = filas.map((f) => ({
      categoriaId: f.categoriaId,
      quedaban: f.quedaban,
      cantidad: leerNumero(escrito[f.categoriaId]),
    }));
    return lineasCambiadas(aplicar);
  }, [filas, escrito]);

  // Sale hacia la pantalla sólo cuando cambia de verdad: el padre guarda el arreglo.
  const clave = JSON.stringify(paraEnviar);
  useEffect(() => {
    onCambio(paraEnviar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `clave` ya resume `paraEnviar`; `onCambio` del padre cambia en cada render.
  }, [clave]);

  const fijar = (id: number, valor: number) => {
    setEscrito((e) => ({ ...e, [id]: String(Math.max(0, Math.floor(valor) || 0)) }));
  };

  const titulo = fraseContar(nombre);
  const sinDato = !estado.cargando && !!estado.error;

  return (
    <div className="rounded-xl border border-borde">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
      >
        <Icon name="box" size={17} />
        <span className="flex-1 text-[13px] font-bold text-texto">{titulo}</span>
        <Icon name={abierto ? "chevronDown" : "chevronRight"} size={16} />
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-borde-soft p-3.5">
          <p className="text-[12px] text-texto-3">
            Lo que quedó del turno anterior. Si repusiste, escribí cuántos hay ahora.
          </p>
          {sinDato && (
            <p role="note" className="text-[12px] font-semibold text-warning-text">
              No se pudo traer lo que quedaba. Escribí cuántos hay ahora: podés abrir igual.
            </p>
          )}
          {estado.cargando && !estado.datos ? (
            <p className="text-[13px] text-texto-3">Buscando lo que quedó…</p>
          ) : (
            <ul className="space-y-2">
              {filas.map((f) => {
                const texto = escrito[f.categoriaId] ?? "";
                const actual = leerNumero(texto);
                // Sin escribir, + y − parten de lo que quedaba.
                const base = actual ?? f.quedaban ?? 0;
                return (
                  <li key={f.categoriaId} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-texto-2">{f.nombre}</span>
                      <span className="block text-[12px] text-texto-3">
                        {f.quedaban == null ? "sin contar todavía" : `quedaban ${fmtNum(f.quedaban)}`}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => fijar(f.categoriaId, base - 1)}
                      disabled={base <= 0}
                      aria-label={`Quitar uno de ${f.nombre}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borde text-texto-2 disabled:opacity-40"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={texto}
                      onChange={(e) => setEscrito((v) => ({ ...v, [f.categoriaId]: e.target.value }))}
                      placeholder={f.quedaban != null && f.quedaban >= 0 ? String(f.quedaban) : "0"}
                      aria-label={`Cuántos hay de ${f.nombre}`}
                      className="w-16 rounded-lg border border-borde px-2 py-1 text-center text-[13px] outline-none placeholder:text-texto-4 focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={() => fijar(f.categoriaId, base + 1)}
                      aria-label={`Agregar uno de ${f.nombre}`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-borde text-texto-2"
                    >
                      +
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
