import { useEffect, useState } from "react";
import { Boton, Campo, ErrorMsg, Input, Modal } from "../../components/ui";
import { apiAgenda } from "../../lib/agenda/apiAgenda";
import type { Propuesta, Recurso, Servicio } from "../../lib/agenda/tiposAgenda";
import { apiPagina } from "../../lib/pagina/apiPagina";
import { formatoPrecio } from "../../lib/pagina/catalogo";
import {
  apiDestacado,
  horaAIso,
  horaDe,
  horaPropuesta,
  resumenDestacado,
  TOPES_DESTACADO,
  type EstadoDestacado,
  type TurnoAPublicar,
} from "../../lib/pagina/apiDestacado";
import type { DestacadoDia, ProductoParaPagina } from "../../lib/pagina/tipos";
import { hoyBolivia } from "../../lib/pagina/vista";

/**
 * «Publicar en tu sitio» desde la caja (PLAN-PAGINA-PRO M4; diseños HoyHay
 * del lienzo «Sitio Pro por rubro»): lo diario se publica donde el dueño ya
 * está (§5.5). Un producto del catálogo con cuántos hay, o en belleza los
 * huecos de hoy de la agenda; se quita solo a la hora elegida, al venderse
 * todo o al reservarse los turnos. Se ve al instante, sin borrador.
 */

const mensaje = (e: unknown, defecto = "No se pudo publicar") => (e instanceof Error ? e.message : defecto);

function Vigente({ d, onQuitar, quitando }: { d: DestacadoDia; onQuitar: () => void; quitando: boolean }) {
  const titulos = d.items.map((i) => i.titulo);
  const turnos = d.turnos?.length ?? 0;
  return (
    <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-[13px] font-semibold text-emerald-900">Ahora en tu sitio, hasta las {horaDe(d.hasta)}</p>
      <p className="text-sm text-texto">
        «{resumenDestacado({ etiqueta: d.etiqueta, titulos, cantidad: d.restante, texto: d.texto, descuentoPct: d.descuentoPct, turnos })}»
      </p>
      <Boton variante="ghost" disabled={quitando} onClick={onQuitar}>
        {quitando ? "Quitando…" : "Quitar"}
      </Boton>
    </div>
  );
}

/** Los turnos libres de hoy (belleza): un servicio y los huecos de la agenda. */
function ElegirTurnos({
  sucursalId,
  elegidos,
  onElegidos,
  onError,
}: {
  sucursalId: number | null;
  elegidos: TurnoAPublicar[];
  onElegidos: (t: TurnoAPublicar[]) => void;
  onError: (m: string) => void;
}) {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [huecos, setHuecos] = useState<Propuesta[] | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([apiAgenda.servicios(), apiAgenda.recursos()])
      .then(([s, r]) => {
        if (!vivo) return;
        setServicios(s.filter((x) => x.activo));
        setRecursos(r);
      })
      .catch((e: unknown) => vivo && onError(mensaje(e, "No se pudieron leer los servicios")));
    return () => {
      vivo = false;
    };
  }, [onError]);

  useEffect(() => {
    if (servicioId === null || sucursalId === null) return;
    let vivo = true;
    setHuecos(null);
    apiAgenda
      .huecos({ fecha: hoyBolivia(), sucursalId, lineas: [{ servicioId, recursoId: null }] })
      .then((r) => vivo && setHuecos(r.huecos.filter((h) => new Date(h.inicio).getTime() > Date.now())))
      .catch((e: unknown) => vivo && onError(mensaje(e, "No se pudieron leer los huecos de la agenda")));
    return () => {
      vivo = false;
    };
  }, [servicioId, sucursalId, onError]);

  const nombreDe = (id: number) => {
    const r = recursos.find((x) => x.id === id);
    return r ? (r.nombrePublico || r.nombre) : null;
  };
  const clave = (inicio: string, recursoId: number) => `${inicio}|${recursoId}`;
  const marcados = new Set(elegidos.map((t) => clave(t.inicio, t.recursoId)));

  if (servicios === null) return <p className="text-sm text-texto-3">Cargando los servicios…</p>;
  return (
    <div className="space-y-3">
      <Campo label="Servicio">
        <select
          aria-label="Servicio"
          value={servicioId ?? ""}
          onChange={(ev) => {
            setServicioId(ev.target.value ? Number(ev.target.value) : null);
            onElegidos([]);
          }}
          className="w-full rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto"
        >
          <option value="">Elegí un servicio</option>
          {servicios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </Campo>
      {servicioId !== null &&
        (huecos === null ? (
          <p className="text-sm text-texto-3">Buscando los huecos de hoy…</p>
        ) : huecos.length === 0 ? (
          <p className="text-sm text-texto-3">Hoy no quedan huecos para este servicio.</p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-[13px] font-semibold text-texto-2">
              Huecos de hoy en la agenda ({elegidos.length} de {TOPES_DESTACADO.turnos})
            </legend>
            {huecos.map((h) => {
              const recursoId = h.lineas[0]?.recursoId;
              if (!recursoId) return null;
              const k = clave(h.inicio, recursoId);
              const quien = nombreDe(recursoId);
              const marcado = marcados.has(k);
              return (
                <label key={k} className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 ${marcado ? "border-primary bg-primary-50" : "border-borde"}`}>
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px]"
                    checked={marcado}
                    disabled={!marcado && elegidos.length >= TOPES_DESTACADO.turnos}
                    onChange={() =>
                      onElegidos(
                        marcado
                          ? elegidos.filter((t) => clave(t.inicio, t.recursoId) !== k)
                          : [...elegidos, { inicio: h.inicio, recursoId, profesional: quien }],
                      )
                    }
                  />
                  <strong className="text-sm text-texto">{horaDe(h.inicio)}</strong>
                  {quien && <span className="text-sm text-texto-2">con {quien}</span>}
                </label>
              );
            })}
          </fieldset>
        ))}
    </div>
  );
}

/** El producto del catálogo: se busca por nombre (hasta 4). */
function ElegirProductos({
  elegidos,
  onElegidos,
  onError,
}: {
  elegidos: ProductoParaPagina[];
  onElegidos: (p: ProductoParaPagina[]) => void;
  onError: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [lista, setLista] = useState<ProductoParaPagina[]>([]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(() => {
      apiPagina
        .buscarProductosCatalogo(q)
        .then((r) => vivo && setLista(r.items))
        .catch((e: unknown) => vivo && onError(mensaje(e, "No se pudo buscar en el catálogo")));
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [q, onError]);
  const ids = new Set(elegidos.map((p) => p.id));
  const lleno = elegidos.length >= TOPES_DESTACADO.productos;
  return (
    <div className="space-y-2">
      <span className="block text-[13px] font-semibold text-texto-2">Del catálogo ({elegidos.length} de {TOPES_DESTACADO.productos})</span>
      {elegidos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Elegidos">
          {elegidos.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                aria-label={`Quitar ${p.nombre}`}
                onClick={() => onElegidos(elegidos.filter((x) => x.id !== p.id))}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-primary bg-primary-50 px-3 text-[13px] font-semibold text-primary-700"
              >
                {p.nombre} <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input aria-label="Buscar en el catálogo" placeholder="Buscá el producto o el plato" value={q} onChange={(ev) => setQ(ev.target.value)} />
      <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Productos del catálogo">
        {lista
          .filter((p) => !ids.has(p.id))
          .slice(0, 12)
          .map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={lleno}
                onClick={() => onElegidos([...elegidos, p])}
                className="flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border border-borde px-3 text-left text-sm hover:bg-muted disabled:opacity-40"
              >
                <span className="min-w-0 truncate">{p.nombre}</span>
                {p.precio != null && <span className="shrink-0 text-texto-3">{formatoPrecio(p.precio)}</span>}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

export default function PublicarEnSitio({
  abierto,
  onCerrar,
  sucursalId,
}: {
  abierto: boolean;
  onCerrar: () => void;
  /** La sucursal de la caja: de ella son los huecos de la agenda. */
  sucursalId: number | null;
}) {
  const [estado, setEstado] = useState<EstadoDestacado | null>(null);
  const [tipo, setTipo] = useState<string>("");
  const [productos, setProductos] = useState<ProductoParaPagina[]>([]);
  const [cantidad, setCantidad] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [descuento, setDescuento] = useState<number | null>(null);
  const [turnos, setTurnos] = useState<TurnoAPublicar[]>([]);
  const [hasta, setHasta] = useState("21:00");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setError("");
    setAviso("");
    apiDestacado
      .estado()
      .then((e) => {
        if (!vivo) return;
        setEstado(e);
        const primero = e.tipos[0]?.tipo ?? "";
        setTipo(primero);
        setHasta(horaPropuesta(primero));
      })
      .catch((e: unknown) => vivo && setError(mensaje(e, "No se pudo abrir")));
    return () => {
      vivo = false;
    };
  }, [abierto]);

  const elegirTipo = (t: string) => {
    setTipo(t);
    setHasta(horaPropuesta(t));
    setError("");
  };
  const conTurnos = tipo === "TURNOS_LIBRES";
  const etiqueta = estado?.tipos.find((t) => t.tipo === tipo)?.etiqueta ?? "";
  const etiquetaTexto =
    tipo === "DE_TURNO" ? "Hasta cuándo estás de turno" : tipo === "ULTIMOS_LUGARES" ? "Qué curso y cuántos lugares quedan" : "Una nota (opcional)";
  const ejemploTexto =
    tipo === "DE_TURNO" ? "Hasta las 08:00" : tipo === "ULTIMOS_LUGARES" ? "Inglés básico: quedan 3 lugares" : "Ej.: Con refresco de mocochinchi";

  const publicar = async () => {
    const iso = horaAIso(hasta);
    if (!iso) {
      setError("Elegí a qué hora se quita.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const nota = texto.trim();
      const r = await apiDestacado.publicar({
        tipo,
        ...(conTurnos
          ? { turnos, ...(descuento ? { descuentoPct: descuento } : {}) }
          : {
              ...(productos.length ? { productoIds: productos.map((p) => p.id) } : {}),
              ...(productos.length && cantidad ? { cantidad } : {}),
            }),
        ...(nota ? { texto: nota } : {}),
        hasta: iso,
      });
      setEstado(r);
      setAviso("¡Publicado! Ya se ve en tu sitio.");
      setProductos([]);
      setCantidad(null);
      setTexto("");
      setTurnos([]);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setEnviando(false);
    }
  };

  const quitar = async () => {
    setEnviando(true);
    setError("");
    try {
      setEstado(await apiDestacado.quitar());
      setAviso("Lo quitaste de tu sitio.");
    } catch (e) {
      setError(mensaje(e, "No se pudo quitar"));
    } finally {
      setEnviando(false);
    }
  };

  const resumen = resumenDestacado({
    etiqueta,
    titulos: productos.map((p) => p.nombre),
    cantidad: productos.length ? cantidad : null,
    texto: texto.trim() || null,
    descuentoPct: conTurnos ? descuento : null,
    turnos: conTurnos ? turnos.length : 0,
  });
  const listo = conTurnos ? turnos.length > 0 : tipo === "DE_TURNO" ? !!texto.trim() : productos.length > 0 || !!texto.trim();

  return (
    <Modal
      abierto={abierto}
      titulo="Publicar en tu sitio"
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar}>
            Cerrar
          </Boton>
          <Boton disabled={!estado || !listo || enviando} onClick={() => void publicar()}>
            {enviando ? "Publicando…" : "Publicar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-4">
        <ErrorMsg>{error}</ErrorMsg>
        {aviso && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-900">
            {aviso}
          </p>
        )}
        {!estado ? (
          !error && <p className="text-sm text-texto-3">Cargando…</p>
        ) : (
          <>
            {estado.vigente && <Vigente d={estado.vigente} onQuitar={() => void quitar()} quitando={enviando} />}
            {estado.tipos.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Qué publicar">
                {estado.tipos.map((t) => (
                  <button
                    key={t.tipo}
                    type="button"
                    aria-pressed={tipo === t.tipo}
                    onClick={() => elegirTipo(t.tipo)}
                    className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                      tipo === t.tipo ? "border-slate-800 bg-slate-800 text-white" : "border-borde bg-white text-texto-2 hover:bg-muted"
                    }`}
                  >
                    {t.etiqueta}
                  </button>
                ))}
              </div>
            )}

            {conTurnos ? (
              <>
                <ElegirTurnos sucursalId={sucursalId} elegidos={turnos} onElegidos={setTurnos} onError={setError} />
                <div className="space-y-1.5">
                  <span className="block text-[13px] font-semibold text-texto-2">Descuento (opcional)</span>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Descuento">
                    {[null, 10, 20].map((d) => (
                      <button
                        key={String(d)}
                        type="button"
                        aria-pressed={descuento === d}
                        onClick={() => setDescuento(d)}
                        className={`min-h-10 rounded-full border px-4 text-sm font-semibold ${
                          descuento === d ? "border-slate-800 bg-slate-800 text-white" : "border-borde bg-white text-texto-2"
                        }`}
                      >
                        {d ? `${d} %` : "Sin descuento"}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              tipo !== "DE_TURNO" &&
              tipo !== "ULTIMOS_LUGARES" && <ElegirProductos elegidos={productos} onElegidos={setProductos} onError={setError} />
            )}

            {!conTurnos && productos.length > 0 && (
              <div className="flex items-center justify-between gap-3">
                <span className="flex flex-col">
                  <strong className="text-sm text-texto">Cuántos hay</strong>
                  <span className="text-xs text-texto-3">Baja solo con cada venta. Vacío = sin contar.</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Uno menos"
                    onClick={() => setCantidad((c) => (c && c > 1 ? c - 1 : null))}
                    className="h-11 w-11 rounded-xl border border-borde text-lg font-bold"
                  >
                    −
                  </button>
                  <Input
                    aria-label="Cuántos hay"
                    inputMode="numeric"
                    className="!w-20 text-center"
                    value={cantidad ?? ""}
                    onChange={(ev) => {
                      const n = Number(ev.target.value.replace(/\D/g, ""));
                      setCantidad(n > 0 ? Math.min(n, TOPES_DESTACADO.cantidad) : null);
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Uno más"
                    onClick={() => setCantidad((c) => Math.min((c ?? 0) + 1, TOPES_DESTACADO.cantidad))}
                    className="h-11 w-11 rounded-xl border border-borde text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {!conTurnos && (
              <Campo label={etiquetaTexto} hint={`${texto.length} de ${TOPES_DESTACADO.texto}`}>
                <Input aria-label={etiquetaTexto} maxLength={TOPES_DESTACADO.texto} value={texto} placeholder={ejemploTexto} onChange={(ev) => setTexto(ev.target.value)} />
              </Campo>
            )}

            <Campo label="Se quita a las" hint="O antes, cuando se acabe o se reserven todos.">
              <Input aria-label="Se quita a las" type="time" value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
            </Campo>

            {listo && (
              <p className="rounded-xl bg-muted px-3.5 py-2.5 text-sm text-texto-2">
                En tu sitio: <strong>«{resumen}»</strong>.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
