import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Buscador } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Boton, Cargando, Confirmar, ErrorMsg, Input, Modal } from "../../../components/ui";
import { api } from "../../../lib/api";
import { parsearMonto } from "../../../lib/dinero";
import { fmtMoney, fmtPlata } from "../../../lib/format";
import { apiRecetas } from "../../../lib/recetas/api";
import {
  anchoDelCosto,
  costoPlato,
  costoRenglon,
  loQueDeja,
  rangoCosto,
  sinCosto as sinCostoDe,
} from "../../../lib/recetas/calculo";
import { recetasDe } from "../../../lib/recetas/donde";
import type {
  GrupoReceta,
  InsumoReceta,
  LineaRecetaInput,
  LineaRecetaPlato,
  RecetaPlato,
} from "../../../lib/recetas/tipos";
import { contiene } from "../../../lib/texto";
import { useApi } from "../../../lib/useApi";
import { useAuth } from "../../../store/AuthContext";
import type { PartesInsumo } from "../../../types";
import { RUTA_REGISTRAR_COMPRA } from "../Movimientos";
import { cantidadDe, esDePresas, textoAlcanza, textoPresas, unir } from "./textos";

/**
 * El editor de la receta de un plato (CONTRATO-recetas-plato §3.4): lo que
 * lleva siempre, la guarnición (sale completa; el cliente puede quitar o pedir
 * «puro») y las presas. Lo abren Artículos y «Costos de platos».
 *
 * El costo se ve EN VIVO mientras se arma, con las mismas cuentas del backend
 * (`lib/recetas/calculo.ts`); al guardar, el backend escribe el suyo en la
 * ficha del plato. Sin `costos.ver` la receta llega sin plata: no se dibuja
 * «Cuánto te deja» y los renglones no muestran costos.
 *
 * Nada se guarda hasta «Guardar» (`PUT /recetas-plato/:id`, la receta entera).
 * «Volver a Elaborado» guarda los renglones pero el plato deja de calcular su
 * costo y de descontar insumos.
 */

/** Un plato del que se puede copiar la receta. */
export interface PlatoParaCopiar {
  id: number;
  nombre: string;
}

interface Renglon {
  insumoId: number;
  grupo: GrupoReceta;
  /** Como está escrito: se puede estar tecleando «0,5». Vacío en las presas hasta elegir cuántas. */
  porciones: string;
  puro: boolean;
}

/** Un renglón con lo que se sabe de su insumo. */
interface Vista {
  r: Renglon;
  nombre: string;
  porcionNombre: string;
  costoPorcion: number | null;
  partes: PartesInsumo | null;
  /** Está entre los insumos que se pueden usar: vigente y con su rinde completo. */
  vigente: boolean;
}

const MAX_RENGLONES = 40;
const MAX_PORCIONES = 1000;
const CANTIDADES_PRESA = [1, 2, 4, 8];
const ORDEN: GrupoReceta[] = ["FIJO", "GUARNICION", "PRESA"];

/** Las porciones tecleadas, o null si no valen: más de 0, hasta 1000 y con 3 decimales como mucho. */
function porcionesValidas(texto: string): number | null {
  const n = parsearMonto(texto);
  if (n == null || !(n > 0) || n > MAX_PORCIONES) return null;
  if (Math.abs(Math.round(n * 1000) - n * 1000) > 1e-6) return null;
  return n;
}

const aTres = (n: number) => Math.round(n * 1000) / 1000;

function desdeGuardada(lineas: LineaRecetaPlato[]): Renglon[] {
  return lineas.map((l) => ({
    insumoId: l.insumoId,
    grupo: l.grupo,
    porciones: String(l.porciones),
    puro: l.grupo === "GUARNICION" && l.puro,
  }));
}

/** En el orden de la pantalla: lo fijo, la guarnición y las presas. */
function ordenados<T extends { r: Renglon } | Renglon>(lista: T[]): T[] {
  const grupo = (x: T) => ("r" in x ? x.r.grupo : x.grupo);
  return ORDEN.flatMap((g) => lista.filter((x) => grupo(x) === g));
}

/** La receta como se mandaría: para saber si hay algo sin guardar. */
function firma(renglones: Renglon[]): string {
  return JSON.stringify(
    ordenados(renglones).map((r) => [
      r.insumoId,
      r.grupo,
      porcionesValidas(r.porciones) ?? r.porciones.trim(),
      r.grupo === "GUARNICION" && r.puro,
    ]),
  );
}

export default function EditorReceta({
  platoId,
  onClose,
  onGuardada,
  platos,
  sucursalId,
  continua,
}: {
  platoId: number;
  onClose: () => void;
  /** Se guardó (con «Guardar» o «Volver a Elaborado»): lo que devolvió el backend. */
  onGuardada: (receta: RecetaPlato) => void;
  /** Los platos con receta de los que se puede copiar. Sin la lista, se piden al tocar «Copiar». */
  platos?: PlatoParaCopiar[];
  /** De qué local sale «Alcanza para…»; sin él, el criterio de siempre del backend. */
  sucursalId?: number | null;
  /** Viene en lugar de otra hoja (el formulario del artículo): nunca se apilan dos. */
  continua?: "adelante" | "atras";
}) {
  const { negocio } = useAuth();
  const ajustes = recetasDe(negocio);
  const elegirPresa = ajustes?.elegirPresa === true;
  // De fábrica, «puro» descuenta doble porción (CONTRATO §1.1).
  const puroDoble = ajustes?.puroDoble !== false;
  const navigate = useNavigate();

  // Con la clave del plato: si el editor pasa a otro, no se ve el anterior mientras llega.
  const receta = useApi(() => apiRecetas.receta(platoId, sucursalId), [platoId, sucursalId], { clave: platoId });
  const insumos = useApi(() => apiRecetas.insumos(), []);
  const guardada = receta.datos;

  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [cargadaDe, setCargadaDe] = useState<number | null>(null);
  // Al llegar la receta, los renglones arrancan con lo guardado (estado que
  // depende de una respuesta, sin efecto). Un cambio de sucursal la vuelve a
  // pedir pero no pisa lo que se está armando.
  if (guardada && cargadaDe !== guardada.platoId) {
    setCargadaDe(guardada.platoId);
    setRenglones(desdeGuardada(guardada.lineas));
  }

  const [agregandoEn, setAgregandoEn] = useState<"FIJO" | "GUARNICION" | null>(null);
  const [otraPresa, setOtraPresa] = useState(false);
  const [verPlatos, setVerPlatos] = useState(false);
  const [copiandoDe, setCopiandoDe] = useState<number | null>(null);
  const [copiada, setCopiada] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [volviendo, setVolviendo] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  // Los platos para copiar: los que manda quien abre el editor, o los del
  // catálogo (sólo si hace falta, al tocar «Ver los platos»).
  const delCatalogo = useApi(
    () =>
      platos || !verPlatos
        ? Promise.resolve(null)
        : api
            .getProductos(false)
            .then((ps) => ps.filter((p) => p.conReceta).map((p) => ({ id: p.id, nombre: p.nombre }))),
    [verPlatos, !!platos],
  );
  const paraCopiar = (platos ?? delCatalogo.datos ?? []).filter((p) => p.id !== platoId);

  const porId = useMemo(() => new Map((insumos.datos ?? []).map((i) => [i.id, i])), [insumos.datos]);
  const guardadaPorId = useMemo(
    () => new Map((guardada?.lineas ?? []).map((l) => [l.insumoId, l])),
    [guardada],
  );
  // Sin la lista todavía no se sabe qué insumo sigue vigente: no se marca nada.
  const listaInsumos = insumos.datos != null;
  // Sin `costos.ver` la receta llega sin plata (QA S2SEG-04, como belleza).
  const veCostos = guardada?.costo != null;

  const vistas: Vista[] = (renglones ?? []).map((r) => {
    const i = porId.get(r.insumoId);
    const g = guardadaPorId.get(r.insumoId);
    return {
      r,
      nombre: i?.nombre ?? g?.nombre ?? `Insumo ${r.insumoId}`,
      porcionNombre: (i?.porcionNombre ?? g?.porcionNombre ?? "").trim() || "porción",
      costoPorcion: i ? i.costoPorcion : (g?.costoPorcion ?? null),
      partes: i?.partes ?? g?.partes ?? null,
      vigente: !listaInsumos || (!!i && i.configurado),
    };
  });

  const cambiado = !!guardada && !!renglones && firma(renglones) !== firma(desdeGuardada(guardada.lineas));
  const paraCuentas = vistas.map((v) => ({
    nombre: v.nombre,
    grupo: v.r.grupo,
    porciones: porcionesValidas(v.r.porciones) ?? 0,
    puro: v.r.puro,
    costoPorcion: v.costoPorcion,
  }));
  // Sin cambios se muestra lo que dijo el backend (es lo que está en la ficha);
  // con cambios, la cuenta en vivo, que es la misma.
  const costo = !cambiado && guardada?.costo != null ? guardada.costo : costoPlato(paraCuentas);
  const rango =
    !cambiado && guardada?.costoMinimo != null && guardada.costoMaximo != null
      ? { minimo: guardada.costoMinimo, maximo: guardada.costoMaximo }
      : rangoCosto(paraCuentas, puroDoble);
  const faltanCosto = !cambiado && guardada ? guardada.sinCosto : sinCostoDe(paraCuentas);

  // Un insumo va una sola vez en la receta: el backend rechaza los repetidos.
  const enReceta = new Set((renglones ?? []).map((r) => r.insumoId));
  const presa = vistas.find((v) => v.r.grupo === "PRESA");
  const libres = (insumos.datos ?? []).filter((i) => !enReceta.has(i.id) && !esDePresas(i));
  const pollos = (insumos.datos ?? []).filter(
    (i) => esDePresas(i) && (!enReceta.has(i.id) || i.id === presa?.r.insumoId),
  );

  function cambiar(insumoId: number, cambio: Partial<Renglon>) {
    setRenglones((rs) => (rs ?? []).map((r) => (r.insumoId === insumoId ? { ...r, ...cambio } : r)));
  }
  function quitar(insumoId: number) {
    setRenglones((rs) => (rs ?? []).filter((r) => r.insumoId !== insumoId));
  }
  function agregar(i: InsumoReceta, grupo: GrupoReceta) {
    // Arranca en una porción, como el stepper de la maqueta; puro, apagado (como en la base).
    setRenglones((rs) => [...(rs ?? []), { insumoId: i.id, grupo, porciones: grupo === "PRESA" ? "" : "1", puro: false }]);
    setError("");
  }
  /** El pollo de las presas: si ya había uno, se cambia y se quedan las presas elegidas. */
  function elegirPollo(i: InsumoReceta) {
    if (presa) {
      setRenglones((rs) => (rs ?? []).map((r) => (r.grupo === "PRESA" ? { ...r, insumoId: i.id } : r)));
    } else {
      agregar(i, "PRESA");
    }
  }

  async function copiarDe(p: PlatoParaCopiar) {
    if (copiandoDe != null) return;
    setCopiandoDe(p.id);
    setError("");
    try {
      const otra = await apiRecetas.receta(p.id, sucursalId);
      setRenglones(desdeGuardada(otra.lineas));
      setOtraPresa(false);
      setCopiada(`Copiaste la receta de ${p.nombre}: revisala y guardá.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo copiar la receta.");
    } finally {
      setCopiandoDe(null);
    }
  }

  /** Lo que impide guardar la receta tal como está, o null. */
  function problema(): string | null {
    if (!vistas.length) return "Agregá al menos un insumo a la receta.";
    if (vistas.length > MAX_RENGLONES) return `Una receta lleva hasta ${MAX_RENGLONES} insumos.`;
    const fuera = vistas.find((v) => !v.vigente);
    if (fuera)
      return `«${fuera.nombre}» ya no está entre tus insumos listos para recetas: sacalo de la receta para guardar.`;
    if (presa && !presa.r.porciones.trim()) return "Elegí cuántas presas lleva el plato.";
    const mal = vistas.find((v) => porcionesValidas(v.r.porciones) == null);
    if (mal) return `Revisá las porciones de «${mal.nombre}»: tienen que ser más de 0 y hasta 1000.`;
    return null;
  }

  async function guardar(conReceta: boolean) {
    if (!renglones || guardando) return;
    setError("");
    // «Volver a Elaborado» guarda lo que sirva y no pide nada: es apagar la receta.
    const usables = conReceta ? vistas : vistas.filter((v) => v.vigente && porcionesValidas(v.r.porciones) != null);
    if (conReceta) {
      const p = problema();
      if (p) {
        setError(p);
        return;
      }
    }
    const lineas: LineaRecetaInput[] = ordenados(usables).map((v) => ({
      insumoId: v.r.insumoId,
      porciones: porcionesValidas(v.r.porciones)!,
      grupo: v.r.grupo,
      puro: v.r.grupo === "GUARNICION" && v.r.puro,
    }));
    setGuardando(true);
    try {
      onGuardada(await apiRecetas.guardar(platoId, { conReceta, lineas }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la receta.");
    } finally {
      setGuardando(false);
      setVolviendo(false);
    }
  }

  const cerrar = () => {
    if (!guardando) onClose();
  };
  const irACompra = () => (cambiado ? setSaliendo(true) : navigate(RUTA_REGISTRAR_COMPRA));

  const filas = (grupo: GrupoReceta) => vistas.filter((v) => v.r.grupo === grupo);
  const fijos = filas("FIJO");
  const guarnicion = filas("GUARNICION");

  return (
    <>
      <Modal
        abierto
        titulo={guardada ? `Receta · ${guardada.nombre}` : "Receta del plato"}
        subtitulo="Lo que lleva cada plato. El costo sale de lo que pagás por cada insumo."
        ancho="max-w-5xl"
        cerrarAlClicAfuera={false}
        continua={continua}
        onClose={cerrar}
        acciones={
          <>
            {guardada?.conReceta && (
              <Boton
                variante="ghost"
                className="min-h-11 sm:mr-auto"
                onClick={() => setVolviendo(true)}
                disabled={guardando}
              >
                Volver a Elaborado
              </Boton>
            )}
            <Boton variante="ghost" className="min-h-11" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton icono="save" className="min-h-11" onClick={() => void guardar(true)} disabled={guardando || !renglones}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </>
        }
      >
        {receta.error && !guardada ? (
          <ErrorMsg onReintentar={receta.recargar}>{receta.error}</ErrorMsg>
        ) : !guardada || !renglones ? (
          <Cargando texto="Cargando la receta…" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
            {/* Arriba en el teléfono y al costado en la compu: lo que cuesta y lo
                que deja, a la vista mientras se arma (como en la maqueta). */}
            <aside className="min-w-0 space-y-3 lg:sticky lg:top-0 lg:col-start-2 lg:row-start-1">
              {veCostos && (
                <CuantoTeDeja
                  precio={guardada.precio}
                  costo={costo}
                  rango={rango}
                  faltanCosto={faltanCosto}
                  onRegistrarCompra={irACompra}
                />
              )}
              {vistas.length > 0 && <Alcanza receta={guardada} cambiado={cambiado} />}
            </aside>

            <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
              <ErrorMsg>{error}</ErrorMsg>
              {insumos.error && (
                <ErrorMsg onReintentar={insumos.recargar}>No se pudieron traer tus insumos: {insumos.error}</ErrorMsg>
              )}
              {!guardada.conReceta && (
                <p className="rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
                  Al guardar, este plato pasa a «Con receta»: el sistema le calcula el costo y la venta descuenta sus
                  insumos.
                </p>
              )}

              <Seccion
                titulo="Lo que lleva siempre"
                derecha={fijos.length ? cantidadDe(fijos.length, "insumo") : undefined}
              >
                {fijos.length === 0 ? (
                  <p className="text-[13px] text-texto-3">Aceite, gas, salsas, la bandeja: lo que va en cada plato.</p>
                ) : (
                  <ul className="space-y-2">
                    {fijos.map((v) => (
                      <Fila key={v.r.insumoId} vista={v} veCostos={veCostos} onCambiar={cambiar} onQuitar={quitar} />
                    ))}
                  </ul>
                )}
                <Agregar
                  abierto={agregandoEn === "FIJO"}
                  etiqueta="Agregar un insumo"
                  opciones={libres}
                  cargando={insumos.cargando && !listaInsumos}
                  onAbrir={() => setAgregandoEn("FIJO")}
                  onCerrar={() => setAgregandoEn(null)}
                  onElegir={(i) => agregar(i, "FIJO")}
                />
              </Seccion>

              <Seccion titulo="Guarnición" derecha="Va completa · el cliente puede quitar">
                {guarnicion.length === 0 ? (
                  <p className="text-[13px] text-texto-3">Este plato todavía no tiene guarnición.</p>
                ) : (
                  <ul className="space-y-2">
                    {guarnicion.map((v) => (
                      <Fila key={v.r.insumoId} vista={v} veCostos={veCostos} onCambiar={cambiar} onQuitar={quitar}>
                        <button
                          type="button"
                          aria-pressed={v.r.puro}
                          onClick={() => cambiar(v.r.insumoId, { puro: !v.r.puro })}
                          className={`min-h-11 basis-full rounded-xl border px-3 text-left text-[13px] font-semibold transition-colors ${
                            v.r.puro
                              ? "border-primary-200 bg-primary-50 text-primary-700"
                              : "border-borde bg-white text-texto-3 hover:bg-muted"
                          }`}
                        >
                          Se puede pedir «puro»: {v.r.puro ? "sí" : "no"}
                        </button>
                      </Fila>
                    ))}
                  </ul>
                )}
                <Agregar
                  abierto={agregandoEn === "GUARNICION"}
                  etiqueta="Sumar a la guarnición"
                  opciones={libres}
                  cargando={insumos.cargando && !listaInsumos}
                  onAbrir={() => setAgregandoEn("GUARNICION")}
                  onCerrar={() => setAgregandoEn(null)}
                  onElegir={(i) => agregar(i, "GUARNICION")}
                />
                <p className="text-xs text-texto-3">
                  Sale completa en cada venta, sin marcar nada. El cajero sólo toca cuando el cliente quita algo («sin
                  fideo») o la pide «puro» («pura papa»).
                </p>
              </Seccion>

              <Seccion titulo="Presas">
                <Presas
                  presa={presa}
                  pollos={pollos}
                  veCostos={veCostos}
                  elegirPresa={elegirPresa}
                  otra={otraPresa}
                  onOtra={setOtraPresa}
                  onPollo={elegirPollo}
                  onCambiar={cambiar}
                  onQuitar={quitar}
                />
              </Seccion>

              <Seccion titulo="Copiar la receta de otro plato">
                {platos || verPlatos ? (
                  delCatalogo.cargando && !platos ? (
                    <p className="text-[13px] text-texto-3">Buscando los platos con receta…</p>
                  ) : paraCopiar.length === 0 ? (
                    <p className="text-[13px] text-texto-3">Todavía no hay otro plato con receta.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {paraCopiar.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => void copiarDe(p)}
                          disabled={copiandoDe != null}
                          className="min-h-11 rounded-full border border-borde bg-white px-4 text-[13px] font-semibold text-texto-2 hover:bg-muted disabled:opacity-60"
                        >
                          {copiandoDe === p.id ? "Copiando…" : p.nombre}
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <Boton variante="soft" icono="copiar" className="min-h-11" onClick={() => setVerPlatos(true)}>
                    Ver los platos con receta
                  </Boton>
                )}
                <p className="text-xs text-texto-3">Sirve para los tamaños: copiás la de uno y sólo cambiás las cantidades.</p>
                <AvisoOk>{copiada}</AvisoOk>
              </Seccion>
            </div>
          </div>
        )}
      </Modal>

      <Confirmar
        abierto={volviendo}
        titulo="Volver a Elaborado"
        texto="El plato deja de calcular su costo con la receta y la venta ya no descuenta sus insumos. La receta queda guardada por si la volvés a usar, y el costo queda como está."
        etiquetaOk="Volver a Elaborado"
        procesando={guardando}
        onCancel={() => setVolviendo(false)}
        onOk={() => void guardar(false)}
      />
      <Confirmar
        abierto={saliendo}
        titulo="Salir sin guardar"
        texto="Tenés cambios en la receta que todavía no guardaste. Si vas a registrar la compra ahora, se pierden."
        etiquetaOk="Salir sin guardar"
        onCancel={() => setSaliendo(false)}
        onOk={() => navigate(RUTA_REGISTRAR_COMPRA)}
      />
    </>
  );
}

function Seccion({ titulo, derecha, children }: { titulo: string; derecha?: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-borde-soft pb-1.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-texto-3">{titulo}</h3>
        {derecha && <span className="text-xs text-texto-3">{derecha}</span>}
      </div>
      {children}
    </section>
  );
}

/** Menos / cuántas / más: botones de 44 px y el número se puede escribir («0,5»). */
function Porciones({
  nombre,
  valor,
  onChange,
}: {
  nombre: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  const n = parsearMonto(valor);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        aria-label={`Menos ${nombre}`}
        disabled={n == null || n <= 1}
        onClick={() => n != null && onChange(String(aTres(n - 1)))}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-borde bg-white text-texto hover:bg-muted disabled:opacity-40"
      >
        <Icon name="minus" size={18} />
      </button>
      <div className="w-16">
        <Input
          type="number"
          aria-label={`Porciones de ${nombre}`}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-11 text-center font-bold"
        />
      </div>
      <button
        type="button"
        aria-label={`Más ${nombre}`}
        disabled={n != null && n + 1 > MAX_PORCIONES}
        onClick={() => onChange(String(aTres((n ?? 0) + 1)))}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-boton text-white hover:bg-primary-boton-hover disabled:opacity-40"
      >
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

/** El renglón de un insumo: nombre, porciones con su costo, − / +, lo que suma y el tacho. */
function Fila({
  vista: v,
  veCostos,
  onCambiar,
  onQuitar,
  children,
}: {
  vista: Vista;
  veCostos: boolean;
  onCambiar: (insumoId: number, cambio: Partial<Renglon>) => void;
  onQuitar: (insumoId: number) => void;
  /** Lo que va debajo, a lo ancho (el «puro» de la guarnición). */
  children?: ReactNode;
}) {
  const n = porcionesValidas(v.r.porciones);
  const detalle = !v.vigente
    ? "Ya no está entre tus insumos listos para recetas: sacalo para guardar."
    : [
        n != null ? cantidadDe(n, v.porcionNombre) : "Poné cuántas porciones",
        veCostos
          ? v.costoPorcion != null
            ? `${fmtMoney(v.costoPorcion)} cada ${v.porcionNombre}`
            : "falta su primera compra"
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
  return (
    <li className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl border border-borde p-2.5">
      <div className="min-w-0 flex-[1_1_150px]">
        <p className="break-words text-[15px] font-semibold text-texto">{v.nombre}</p>
        <p className={`text-xs ${v.vigente ? "text-texto-3" : "text-danger-text"}`}>{detalle}</p>
      </div>
      <Porciones nombre={v.nombre} valor={v.r.porciones} onChange={(p) => onCambiar(v.r.insumoId, { porciones: p })} />
      {veCostos && (
        <span
          className={`flex-[1_0_64px] text-right font-bold ${
            v.costoPorcion != null ? "text-[15px] text-texto" : "text-[13px] text-warning-text"
          }`}
        >
          {v.costoPorcion != null ? fmtMoney(costoRenglon(v.costoPorcion, n ?? 0)) : "Sin costo"}
        </span>
      )}
      <button
        type="button"
        aria-label={`Sacar ${v.nombre} de la receta`}
        onClick={() => onQuitar(v.r.insumoId)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-danger-text hover:bg-danger-bg"
      >
        <Icon name="trash" size={17} />
      </button>
      {children}
    </li>
  );
}

/**
 * Sumar un insumo: los que tienen su rinde completo y todavía no están en la
 * receta. Uno sin completar aparece apagado, para que se sepa por qué no está.
 */
function Agregar({
  abierto,
  etiqueta,
  opciones,
  cargando,
  onAbrir,
  onCerrar,
  onElegir,
}: {
  abierto: boolean;
  etiqueta: string;
  opciones: InsumoReceta[];
  cargando: boolean;
  onAbrir: () => void;
  onCerrar: () => void;
  onElegir: (i: InsumoReceta) => void;
}) {
  const [q, setQ] = useState("");
  if (!abierto) {
    return (
      <Boton variante="soft" icono="plus" className="min-h-11" onClick={onAbrir}>
        {etiqueta}
      </Boton>
    );
  }
  const visibles = q.trim() ? opciones.filter((i) => contiene(i.nombre, q)) : opciones;
  return (
    <div className="space-y-2.5 rounded-xl bg-muted p-3">
      <p className="text-[13px] font-semibold text-texto-2">{etiqueta}</p>
      {opciones.length > 8 && <Buscador valor={q} onChange={setQ} placeholder="Buscar un insumo" etiqueta="Buscar un insumo" />}
      {cargando ? (
        <p className="text-[13px] text-texto-3">Trayendo tus insumos…</p>
      ) : visibles.length === 0 ? (
        <p className="text-[13px] text-texto-3">
          {opciones.length === 0
            ? "No queda ningún insumo para sumar. Los nuevos se cargan en Insumos."
            : "Ningún insumo se llama así."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {visibles.map((i) =>
            i.configurado ? (
              <button
                key={i.id}
                type="button"
                onClick={() => onElegir(i)}
                className="min-h-11 rounded-full bg-primary-50 px-4 text-[13px] font-semibold text-primary-700 hover:bg-primary-100"
              >
                + {i.nombre}
              </button>
            ) : (
              <button
                key={i.id}
                type="button"
                disabled
                className="flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-borde bg-white px-4 text-[13px] text-texto-3"
              >
                {i.nombre}
                <span className="text-[11px] font-semibold text-warning-text">Falta completar</span>
              </button>
            ),
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Boton variante="ghost" className="min-h-11" onClick={onCerrar}>
          Listo
        </Boton>
      </div>
    </div>
  );
}

/** Las presas del pollo: de qué insumo y cuántas (1, 2, 4, 8 u otra cantidad). */
function Presas({
  presa,
  pollos,
  veCostos,
  elegirPresa,
  otra,
  onOtra,
  onPollo,
  onCambiar,
  onQuitar,
}: {
  presa: Vista | undefined;
  pollos: InsumoReceta[];
  veCostos: boolean;
  elegirPresa: boolean;
  otra: boolean;
  onOtra: (v: boolean) => void;
  onPollo: (i: InsumoReceta) => void;
  onCambiar: (insumoId: number, cambio: Partial<Renglon>) => void;
  onQuitar: (insumoId: number) => void;
}) {
  const otrosPollos = pollos.filter((p) => p.id !== presa?.r.insumoId);
  const chipsDePollos = (lista: InsumoReceta[]) => (
    <div className="flex flex-wrap gap-2">
      {lista.map((p) =>
        p.configurado ? (
          <button
            key={p.id}
            type="button"
            onClick={() => onPollo(p)}
            className="min-h-11 rounded-full bg-primary-50 px-4 text-[13px] font-semibold text-primary-700 hover:bg-primary-100"
          >
            {presa ? p.nombre : `+ ${p.nombre}`}
          </button>
        ) : (
          <button
            key={p.id}
            type="button"
            disabled
            className="flex min-h-11 items-center gap-1.5 rounded-full border border-dashed border-borde bg-white px-4 text-[13px] text-texto-3"
          >
            {p.nombre}
            <span className="text-[11px] font-semibold text-warning-text">Falta completar</span>
          </button>
        ),
      )}
    </div>
  );

  if (!presa) {
    if (!pollos.length) {
      return (
        <p className="text-[13px] text-texto-3">
          Si el plato lleva presas, primero cargá el pollo en Insumos, con lo que sirve en presas.
        </p>
      );
    }
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-texto-2">¿Lleva presas? Elegí de qué pollo:</p>
        {chipsDePollos(pollos)}
      </div>
    );
  }

  const n = porcionesValidas(presa.r.porciones);
  const conOtra = otra || (n != null && !CANTIDADES_PRESA.includes(n));
  const chip = (activo: boolean) =>
    `min-h-11 min-w-11 rounded-full px-4 text-[13px] font-bold transition-colors ${
      activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
    }`;
  return (
    <div className="space-y-2.5 rounded-xl border border-borde p-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <div className="min-w-0 flex-[1_1_180px]">
          <p className="break-words text-[15px] font-semibold text-texto">
            {n != null ? `${cantidadDe(n, "presa")} de ${presa.nombre}` : presa.nombre}
          </p>
          <p className={`text-xs ${presa.vigente ? "text-texto-3" : "text-danger-text"}`}>
            {!presa.vigente
              ? "Ya no está entre tus insumos listos para recetas: sacalo para guardar."
              : n == null
                ? "Elegí cuántas presas lleva."
                : textoPresas(n, presa.partes, elegirPresa)}
          </p>
        </div>
        {veCostos && n != null && (
          <span
            className={`font-bold ${presa.costoPorcion != null ? "text-[15px] text-texto" : "text-[13px] text-warning-text"}`}
          >
            {presa.costoPorcion != null ? fmtMoney(costoRenglon(presa.costoPorcion, n)) : "Sin costo"}
          </span>
        )}
        <button
          type="button"
          aria-label="Sacar las presas de la receta"
          onClick={() => {
            onOtra(false);
            onQuitar(presa.r.insumoId);
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-danger-text hover:bg-danger-bg"
        >
          <Icon name="trash" size={17} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cuántas presas">
        {CANTIDADES_PRESA.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={!conOtra && n === c}
            onClick={() => {
              onOtra(false);
              onCambiar(presa.r.insumoId, { porciones: String(c) });
            }}
            className={chip(!conOtra && n === c)}
          >
            {c}
          </button>
        ))}
        <button type="button" aria-pressed={conOtra} onClick={() => onOtra(true)} className={chip(conOtra)}>
          Otra
        </button>
        {conOtra && (
          <div className="w-24">
            <Input
              type="number"
              inputMode="numeric"
              aria-label="Cuántas presas"
              value={presa.r.porciones}
              onChange={(e) => onCambiar(presa.r.insumoId, { porciones: e.target.value })}
              className="min-h-11 text-center font-bold"
            />
          </div>
        )}
      </div>
      {otrosPollos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-texto-3">¿Es de otro pollo? Cambialo:</p>
          {chipsDePollos(otrosPollos)}
        </div>
      )}
    </div>
  );
}

/** «Cuánto te deja»: precio (no se edita acá), costo, ganancia, la barra y el rango. Sólo con `costos.ver`. */
function CuantoTeDeja({
  precio,
  costo,
  rango,
  faltanCosto,
  onRegistrarCompra,
}: {
  precio: number | null;
  costo: number;
  rango: { minimo: number; maximo: number };
  faltanCosto: string[];
  onRegistrarCompra: () => void;
}) {
  const deja = loQueDeja(precio, costo);
  const ancho = anchoDelCosto(precio, costo);
  const frase =
    precio == null
      ? "Sin ver el precio del plato no se puede calcular cuánto te deja."
      : !(precio > 0)
        ? "Ponele precio al artículo para ver cuánto te deja."
        : (deja.ganancia ?? 0) < 0
          ? "Ojo: hacerlo te cuesta más de lo que lo cobrás."
          : `De cada ${fmtPlata(100)} que cobrás, ${fmtPlata(deja.costoDe100)} son costo y ${fmtPlata(deja.quedaDe100)} te quedan.`;
  return (
    <section aria-label="Cuánto te deja" className="card space-y-3 p-4">
      <h3 className="text-[12px] font-bold uppercase tracking-wide text-texto-3">Cuánto te deja</h3>
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-[13px] font-semibold text-texto-2">Precio de venta</span>
          <span className="text-base font-bold text-texto">{precio != null ? fmtMoney(precio) : "—"}</span>
        </div>
        <p className="mt-0.5 text-xs text-texto-3">El precio lo ponés vos en el artículo: el sistema nunca lo cambia.</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Cifra titulo="Costo del plato" valor={fmtMoney(costo)} />
        {deja.ganancia != null && (
          <Cifra
            titulo={deja.ganancia < 0 ? "Perdés por plato" : "Ganás por plato"}
            valor={fmtMoney(Math.abs(deja.ganancia))}
            tono={deja.ganancia < 0 ? "rojo" : "verde"}
          />
        )}
      </div>
      {ancho != null && (
        <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-primary">
          <div className="bg-slate-400" style={{ width: `${ancho}%` }} />
        </div>
      )}
      <p className="text-sm text-texto">{frase}</p>
      {rango.maximo - rango.minimo >= 0.005 && (
        <p className="text-[13px] text-texto-2">
          Si el cliente quita algo o la pide «puro», te cuesta entre {fmtMoney(rango.minimo)} y{" "}
          {fmtMoney(rango.maximo)}. El costo de arriba es con la guarnición completa.
        </p>
      )}
      {faltanCosto.length > 0 && (
        <div className="space-y-2 rounded-xl border border-warning-borde bg-warning-suave px-3 py-2.5 text-[13px] text-warning-text">
          <p>
            Costo incompleto: {unir(faltanCosto)} {faltanCosto.length === 1 ? "todavía no tiene" : "todavía no tienen"}{" "}
            ninguna compra, así que no entra en la cuenta. Registrá su entrada en Movimientos y el costo se completa
            solo.
          </p>
          <Boton variante="ghost" className="min-h-11" onClick={onRegistrarCompra}>
            Registrar la compra
          </Boton>
        </div>
      )}
    </section>
  );
}

function Cifra({ titulo, valor, tono }: { titulo: string; valor: string; tono?: "verde" | "rojo" }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted p-3">
      <p className="text-xs font-semibold text-texto-3">{titulo}</p>
      <p
        className={`mt-0.5 break-words text-lg font-bold ${
          tono === "rojo" ? "text-danger-text" : tono === "verde" ? "text-primary-700" : "text-texto"
        }`}
      >
        {valor}
      </p>
    </div>
  );
}

/** Para cuántos platos alcanza lo que se cuenta. Sale del stock: lo calcula el backend al guardar. */
function Alcanza({ receta, cambiado }: { receta: RecetaPlato; cambiado: boolean }) {
  if (cambiado) {
    return <p className="rounded-xl bg-muted px-3.5 py-2.5 text-[13px] text-texto-3">Para cuántos platos alcanza se ve al guardar.</p>;
  }
  const texto = textoAlcanza(receta.alcanza);
  return (
    <div className="rounded-xl bg-muted px-3.5 py-2.5">
      {texto ? (
        <>
          <p className="text-base font-bold text-texto">{texto}</p>
          {receta.limite && (
            <p className="text-[13px] text-texto-2">
              {(receta.alcanza ?? 0) <= 0 ? `Se acabó: ${receta.limite}.` : `Lo primero que se acaba: ${receta.limite}.`}
            </p>
          )}
        </>
      ) : (
        <p className="text-[13px] text-texto-3">
          Este plato sólo lleva insumos que se estiman: no hay un conteo que diga para cuántos platos alcanza.
        </p>
      )}
    </div>
  );
}
