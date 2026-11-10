import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import IconoProducto from "../../components/IconoProducto";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Input, useAviso } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtNum } from "../../lib/format";
import { contiene } from "../../lib/texto";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import type { EstadoControlStock, Producto } from "../../types";
import { veFicha } from "../reportes/catalogo";
import { SiNo, Tarjeta } from "../tickets/piezas";

/**
 * Configuración › Inventario y stock (pedido del 09-nov): si el stock frena la
 * venta.
 *
 * Nació de una pollería que abre de lunes a lunes y no tiene un día para
 * contar sus bebidas. Con el stock en cero, el punto de venta no le dejaba
 * cobrar ni una gaseosa; lo que vende lo saca de "Productos vendidos" del
 * cierre de cada turno, que no depende del stock. Así que:
 *
 *  - **Apagarlo** es un clic (con confirmación): el POS, la carta del salón y
 *    el menú digital dejan de agotar por stock. La venta sigue descontando.
 *  - **Prenderlo** pide lo contado: mientras estuvo apagado el stock quedó en
 *    negativo, y prenderlo así nomás dejaría todo "Agotado". El conteo fija
 *    cada artículo en lo que de verdad hay (un ajuste en Movimientos).
 *
 * El negocio que ya controla su stock no se entera de esta pantalla: nace
 * prendido y nada cambia mientras nadie lo apague.
 */
export default function ConfigInventario() {
  const estado = useApi(() => api.controlStock(), []);
  const [contando, setContando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(10000);

  const apagar = async () => {
    setProcesando(true);
    setError("");
    try {
      estado.setDatos(await api.venderSinStock());
      setApagando(false);
      setAviso("Listo: desde ahora se vende sin mirar el stock.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo apagar el control de stock");
      setApagando(false);
    } finally {
      setProcesando(false);
    }
  };

  if (contando) {
    return (
      <Conteo
        onCancelar={() => setContando(false)}
        onListo={(nuevo, contados, enCero) => {
          estado.setDatos(nuevo);
          setContando(false);
          setAviso(
            `Listo: el control de stock está prendido con ${fmtNum(contados)} ${
              contados === 1 ? "artículo contado" : "artículos contados"
            }.` +
              (enCero > 0
                ? ` ${fmtNum(enCero)} que quedaron en negativo sin contar arrancan en 0.`
                : ""),
          );
        }}
      />
    );
  }

  const datos = estado.datos;
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Inventario y stock"
        subtitulo="Elegí si el stock frena las ventas. Sirve para el local que todavía no contó su mercadería."
      />
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>
      {estado.error ? (
        <ErrorMsg onReintentar={estado.recargar}>{estado.error}</ErrorMsg>
      ) : !datos ? (
        <Cargando />
      ) : (
        <>
          <Tarjeta titulo="Control de stock">
            {datos.sePuedeApagar ? (
              <SiNo
                activo={datos.controlaStock}
                onCambiar={(prender) => (prender ? setContando(true) : setApagando(true))}
                etiqueta="Controlar el stock al vender"
                detalle={
                  datos.controlaStock
                    ? "Prendido: lo que no hay no se vende, y el punto de venta muestra cuánto queda de cada cosa."
                    : "Apagado: se vende sin mirar el stock. Nada se agota por stock en el punto de venta, las mesas ni el menú digital."
                }
              />
            ) : (
              // Hoy la pantalla no existe fuera del restaurante (y el backend
              // no deja apagarlo en otro rubro); si un día se abre, dice por qué.
              <p className="text-sm text-texto-2">
                Vender sin control de stock es sólo para restaurantes: en este negocio el stock siempre se controla.
              </p>
            )}
            {datos.sePuedeApagar && !datos.controlaStock && (
              <div className="mt-3 rounded-xl bg-muted p-3.5">
                <p className="text-sm font-semibold text-texto">¿Ya contaste tu mercadería?</p>
                <p className="mt-0.5 text-[13px] text-texto-3">
                  Cargá cuánto tenés de cada producto y el control se prende con eso. Lleva un rato: se puede hacer
                  con el local abierto.
                </p>
                <Boton className="mt-3" icono="archive" onClick={() => setContando(true)}>
                  Contar y empezar a controlar
                </Boton>
                <EnlaceReporte antes="Mientras tanto, lo que se vende sin estar cargado lo ves en " />
              </div>
            )}
          </Tarjeta>

          <Tarjeta titulo="Cómo funciona">
            <ul className="space-y-2.5 text-[13px] text-texto-2">
              <li>
                <span className="font-semibold text-texto">Sin control de stock</span> se vende todo lo que esté
                habilitado, aunque el stock diga 0. Lo marcado «Agotado hoy» en el Menú digital sigue sin venderse.
              </li>
              <li>
                <span className="font-semibold text-texto">Lo vendido en cada turno</span> lo ves igual que siempre
                en el cierre de caja, en «Productos vendidos», y en los reportes. Lo que salió sin estar cargado,
                además, en el reporte «Vendido sin stock», por artículo y venta por venta.
              </li>
              <li>
                <span className="font-semibold text-texto">Los elaborados</span> (los platos que se preparan al
                vender) no cambian: nunca llevaron stock.
              </li>
              <li>
                <span className="font-semibold text-texto">Para volver a controlarlo</span> contás lo que tenés y lo
                cargás acá. Lo que dejes sin contar queda en 0 hasta que cargues una entrada en Movimientos.
              </li>
            </ul>
          </Tarjeta>
        </>
      )}

      <Confirmar
        abierto={apagando}
        titulo="¿Vender sin control de stock?"
        texto="Desde ahora el punto de venta deja vender aunque el stock diga 0 y no muestra cuánto queda. Las ventas se siguen registrando igual. Cuando cuentes tu mercadería, lo volvés a prender desde acá."
        etiquetaOk="Vender sin stock"
        procesando={procesando}
        onCancel={() => setApagando(false)}
        onOk={() => void apagar()}
      />
    </div>
  );
}

// ── El conteo ─────────────────────────────────────────────────────────────

/**
 * Lo tecleado se guarda en la pestaña mientras se cuenta: contar un local
 * lleva un rato, y una recarga (o la tablet que recarga sola por memoria) no
 * puede costar el conteo entero. Se borra al guardarlo.
 */
const claveBorrador = (negocioId: number | undefined, almacenId: number) =>
  `bamar.conteo.${negocioId ?? 0}.${almacenId}`;

function leerBorrador(clave: string): Record<number, string> {
  try {
    const crudo = sessionStorage.getItem(clave);
    const datos: unknown = crudo ? JSON.parse(crudo) : null;
    return datos && typeof datos === "object" ? (datos as Record<number, string>) : {};
  } catch {
    return {};
  }
}

function guardarBorrador(clave: string, cantidades: Record<number, string>) {
  try {
    sessionStorage.setItem(clave, JSON.stringify(cantidades));
  } catch {
    // Sin almacenamiento (modo privado) se cuenta igual; sólo no sobrevive a un F5.
  }
}

function olvidarBorrador(clave: string) {
  try {
    sessionStorage.removeItem(clave);
  } catch {
    // Nada que hacer.
  }
}

/** Lo que se puede contar: lo que lleva stock y se vende hoy. */
function paraContar(lista: Producto[]): Producto[] {
  return lista
    .filter((p) => p.tipoProducto !== "SERVICIO" && p.habilitado)
    .sort(
      (a, b) =>
        (a.categoria?.nombre ?? "~").localeCompare(b.categoria?.nombre ?? "~", "es") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
}

/**
 * El texto de un casillero, leído. `vacio` = sin contar (queda en 0);
 * `valor` null con algo escrito = no es un número de 0 para arriba.
 */
function leerCantidad(texto: string | undefined): { vacio: boolean; valor: number | null } {
  if (!texto?.trim()) return { vacio: true, valor: null };
  const n = parsearMonto(texto);
  return { vacio: false, valor: n != null && n >= 0 ? n : null };
}

function Conteo({
  onCancelar,
  onListo,
}: {
  onCancelar: () => void;
  onListo: (estado: EstadoControlStock, contados: number, enCero: number) => void;
}) {
  const { negocio, usuario } = useAuth();
  const locales = useApi(() => api.getSucursales(), []);
  // Se cuenta un local que vende: el depósito no se vacía vendiendo.
  const opciones = (locales.datos ?? []).filter((a) => a.activo && a.tipo !== "DEPOSITO");
  const [elegidoId, setElegidoId] = useState<number | null>(null);
  const almacenId =
    elegidoId ??
    usuario?.sucursalId ??
    (opciones.find((a) => a.esPrincipal) ?? opciones[0])?.id ??
    null;

  const productos = useApi(
    () => (almacenId == null ? Promise.resolve([] as Producto[]) : api.getProductos(false, almacenId)),
    [almacenId],
  );
  const lista = useMemo(() => paraContar(productos.datos ?? []), [productos.datos]);

  const clave = almacenId == null ? null : claveBorrador(negocio?.id, almacenId);
  const [cantidades, setCantidades] = useState<Record<number, string>>({});
  // Al cambiar de local se trae lo que se venía contando en ESE local.
  useEffect(() => {
    setCantidades(clave ? leerBorrador(clave) : {});
  }, [clave]);

  const [q, setQ] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (id: number, texto: string) => {
    const nuevas = { ...cantidades, [id]: texto };
    setCantidades(nuevas);
    if (clave) guardarBorrador(clave, nuevas);
  };

  const lecturas = lista.map((p) => ({ p, l: leerCantidad(cantidades[p.id]) }));
  const malos = lecturas.filter(({ l }) => !l.vacio && l.valor == null).map(({ p }) => p.nombre);
  const contados = lecturas.filter(({ l }) => !l.vacio).length;
  const vacios = lista.length - contados;
  const visibles = q ? lista.filter((p) => contiene(p.nombre, q) || contiene(p.categoria?.nombre, q)) : lista;

  const guardar = async () => {
    if (almacenId == null) return;
    setProcesando(true);
    setError("");
    try {
      const r = await api.controlarStock(
        almacenId,
        lecturas.map(({ p, l }) => ({ productoId: p.id, cantidad: l.vacio ? 0 : (l.valor ?? 0) })),
      );
      if (clave) olvidarBorrador(clave);
      onListo({ controlaStock: r.controlaStock, sePuedeApagar: r.sePuedeApagar }, r.contados, r.puestosEnCero);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el conteo");
      setConfirmando(false);
    } finally {
      setProcesando(false);
    }
  };

  const nombreLocal = opciones.find((a) => a.id === almacenId)?.nombre;
  let categoriaAnterior: string | null | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-5">
      <EncabezadoPagina
        titulo="Contar la mercadería"
        subtitulo="Escribí cuánto tenés hoy de cada producto. Con esto se prende el control de stock."
        accion={
          <Boton variante="ghost" icono="chevronLeft" onClick={onCancelar} disabled={procesando}>
            Volver
          </Boton>
        }
      />

      {opciones.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Local que se cuenta">
          <span className="text-[13px] font-semibold text-texto-2">Local:</span>
          {opciones.map((a) => (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={a.id === almacenId}
              onClick={() => setElegidoId(a.id)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${
                a.id === almacenId
                  ? "border-primary bg-primary-50 text-primary-700"
                  : "border-borde bg-white text-texto-2 hover:border-primary"
              }`}
            >
              {a.nombre}
            </button>
          ))}
        </div>
      )}

      <ErrorMsg onReintentar={locales.error ? locales.recargar : productos.error ? productos.recargar : undefined}>
        {error || locales.error || productos.error}
      </ErrorMsg>

      {locales.cargando || productos.cargando ? (
        <Cargando />
      ) : almacenId == null ? (
        <p className="card p-4 text-sm text-texto-3">No hay un local activo para contar.</p>
      ) : lista.length === 0 ? (
        <p className="card p-4 text-sm text-texto-3">
          No hay productos con stock para contar: los elaborados no llevan. Podés prender el control igual.
        </p>
      ) : (
        <>
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar un producto o una categoría"
            aria-label="Buscar un producto o una categoría"
          />
          <ul className="card divide-y divide-borde-soft p-0">
            {visibles.map((p) => {
              const cat = p.categoria?.nombre ?? null;
              const titulo = cat !== categoriaAnterior ? (cat ?? "Sin categoría") : null;
              categoriaAnterior = cat;
              const l = leerCantidad(cantidades[p.id]);
              const malo = !l.vacio && l.valor == null;
              return (
                <li key={p.id}>
                  {titulo && (
                    <p className="bg-muted px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-texto-3">
                      {titulo}
                    </p>
                  )}
                  <label className="flex items-center gap-3 px-4 py-2.5">
                    <IconoProducto nombre={p.nombre} icono={p.icono} categoria={cat ?? undefined} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-texto">{p.nombre}</span>
                      {malo && <span className="block text-xs text-danger-text">Escribí un número (0 o más)</span>}
                    </span>
                    <Input
                      type="number"
                      value={cantidades[p.id] ?? ""}
                      onChange={(e) => cambiar(p.id, e.target.value)}
                      placeholder="0"
                      aria-label={`Cuántos hay de ${p.nombre}`}
                      className={`w-24 text-right ${malo ? "border-danger-text" : ""}`}
                    />
                    <span className="w-8 shrink-0 text-xs text-texto-4">{p.unidadMedida?.nombre ?? ""}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {almacenId != null && !productos.cargando && !locales.cargando && (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-[13px] text-texto-2">
            {lista.length > 0 ? (
              <>
                Contaste <span className="font-bold text-texto">{fmtNum(contados)}</span> de {fmtNum(lista.length)}.
                {vacios > 0 && " Lo que quede vacío arranca en 0."}
              </>
            ) : (
              "Sin productos para contar."
            )}
          </p>
          <Boton onClick={() => setConfirmando(true)} disabled={procesando || malos.length > 0}>
            Prender el control de stock
          </Boton>
        </div>
      )}

      <Confirmar
        abierto={confirmando}
        titulo="¿Prender el control de stock?"
        texto={
          `${nombreLocal ? `${nombreLocal}: s` : "S"}e carga${contados === 1 ? "" : "n"} ${fmtNum(contados)} ` +
          `${contados === 1 ? "producto" : "productos"} con lo que contaste` +
          (vacios > 0 ? ` y ${fmtNum(vacios)} sin contar quedan en 0 (agotados)` : "") +
          ". Desde ahí el punto de venta no deja vender lo que no hay."
        }
        etiquetaOk="Prender"
        procesando={procesando}
        onCancel={() => setConfirmando(false)}
        onOk={() => void guardar()}
      />
    </div>
  );
}

/**
 * "…lo ves en Vendido sin stock": el reporte que reemplaza al stock mientras
 * no se cuenta. Sólo si el usuario lo ve (pide `reportes.ver` y la entrada a
 * Reportes): un enlace a un reporte ajeno lo dejaba en la lista sin decirle
 * por qué. Es un componente aparte para que su `useAuth` no quede debajo del
 * `if (contando)` de la pantalla.
 */
function EnlaceReporte({ antes }: { antes: string }) {
  const { rubro, negocio, usuario, puede, incluye } = useAuth();
  const ve = veFicha("vendido-sin-stock", { rubro, features: negocio?.features, permisos: usuario?.permisos, puede, incluye });
  if (!ve) return null;
  return (
    <p className="mt-3 text-[13px] text-texto-3">
      {antes}
      <Link to="/reportes/vendido-sin-stock" className="font-semibold text-primary-700 underline underline-offset-2">
        Reportes › Vendido sin stock
      </Link>
      .
    </p>
  );
}
