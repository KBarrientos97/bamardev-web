import { useId, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { Badge, Boton, Campo, ErrorMsg, Input, Modal, Select } from "../../components/ui";
import { api } from "../../lib/api";
import { parsearMonto } from "../../lib/dinero";
import { fmtCantidad, fmtFecha, fmtMoney } from "../../lib/format";
import { enfocaSolo } from "../../lib/nutricion/foco";
import { sugeridosQueFaltan, type InsumoSugerido } from "../../lib/recetas/sugeridos";
import {
  FORMAS_COMPRA,
  NOMBRES_PORCION,
  PALABRAS_BASE,
  baseDeUnidad,
  elBulto,
  formaCompra,
  redondear3,
  resumenInsumo,
  textoPorciones,
  unBulto,
  unaBase,
  unidadDeBase,
  type BaseInsumo,
  type FormaCompra,
} from "../../lib/recetas/unidades";
import { DESCARTABLES_CON_RECETAS } from "../../lib/rubro";
import type { Categoria, Insumo, InsumoInput, UnidadMedida } from "../../types";
import { RUTA_REGISTRAR_COMPRA } from "./Movimientos";

/**
 * Insumos con las recetas del plato prendidas (27-nov): la tarjeta, el
 * formulario y la «Lista sugerida». Insumos.tsx los usa SÓLO con
 * `recetasActivas(negocio)`; apagadas, la pantalla es la de siempre y nada de
 * esto se monta.
 *
 * Con recetas la venta descuenta los insumos, así que el stock vuelve a ser un
 * dato. Y el costo ya no se escribe en la ficha: sale de las compras
 * (Movimientos), que es lo que pagaste de verdad. La ficha dice en cambio
 * cómo lo comprás (un quintal de 46 kg) y para cuánto te alcanza (1 kg, 12
 * porciones), que es lo que el sistema necesita para el costo de cada plato.
 */

/** Un número guardado, como texto para el campo ("" si no hay). */
function textoNum(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}

/** «Con cuánto» vacío vale 1 (el campo lo muestra de ayuda): un 1 guardado se ve vacío. */
function textoRindeCantidad(n: number | null | undefined): string {
  return n == null || n === 1 ? "" : String(n);
}

// ── La tarjeta de la lista ──────────────────────────────────────────────────

export function TarjetaInsumoReceta({
  insumo: i,
  estado,
  onClick,
}: {
  insumo: Insumo;
  /** El del stock, como en los demás rubros: en cero, bajo el punto de reorden o bien. */
  estado: "sin" | "bajo" | "ok";
  onClick: () => void;
}) {
  const r = resumenInsumo(i);
  const unidad = i.unidad?.abreviatura ?? i.unidad?.nombre ?? "";
  const comoLoCompra = [r.compra, r.rinde].filter(Boolean).join(" · ");

  return (
    <li>
      <button onClick={onClick} className="card w-full p-4 text-left transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-marca text-white">
            <Icon name="sack" size={21} />
          </span>
          <Icon name="chevronRight" size={17} color="#94A3B8" />
        </div>

        <h3 className="mt-3 truncate text-[15px] font-bold text-texto">{i.nombre}</h3>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-texto-3">
          {i.codigo ? `${i.codigo} · ` : ""}
          {i.categoria?.nombre ?? "Sin categoría"}
        </p>

        {/* En su renglón y con salto: tres pastillas al lado del ícono no entraban en un teléfono. */}
        {(!r.configurado || r.sinCosto || estado !== "ok" || !i.habilitado) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!r.configurado && <Badge tono="amarillo">Falta completar</Badge>}
            {r.sinCosto && <Badge tono="gris">Todavía sin costo</Badge>}
            {estado === "sin" && <Badge tono="rojo">Sin stock</Badge>}
            {estado === "bajo" && <Badge tono="amarillo">Reponer</Badge>}
            {!i.habilitado && <Badge tono="gris">Inactivo</Badge>}
          </div>
        )}

        {comoLoCompra && <p className="mt-2 text-[13px] text-texto-2">{comoLoCompra}</p>}

        <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted p-2.5">
          <div className="min-w-0">
            {/* Lo que se cuenta queda de verdad; lo que se estima, debería quedar. */}
            <p className="text-[11px] font-semibold uppercase text-texto-4">{i.seCuenta ? "Queda" : "Debería quedar"}</p>
            <p className="text-sm font-bold text-texto">
              {fmtCantidad(i.stock)} {unidad}
            </p>
            {r.porciones != null && <p className="text-xs text-texto-3">{textoPorciones(r.porciones, r.porcion)}</p>}
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase text-texto-4">Cada {r.porcion}</p>
            <p className={`text-sm font-bold ${r.costoPorcion != null ? "text-texto" : "text-texto-4"}`}>
              {r.costoPorcion != null ? fmtMoney(r.costoPorcion) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-xs text-texto-4">{i.proveedor || "Sin proveedor"}</span>
          {i.vencimiento && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-texto-4">
              <Icon name="calendar" size={12} /> {fmtFecha(i.vencimiento)}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

// ── «Lista sugerida» ────────────────────────────────────────────────────────

/**
 * Los insumos típicos de una cocina que el negocio todavía no tiene. Tocar uno
 * cierra la lista y abre el formulario con lo de fábrica cargado (nunca dos
 * hojas apiladas).
 */
export function ListaSugerida({
  abierta,
  existentes,
  onElegir,
  onClose,
}: {
  abierta: boolean;
  /** Los nombres de los insumos que ya hay. */
  existentes: readonly string[];
  onElegir: (s: InsumoSugerido) => void;
  onClose: () => void;
}) {
  if (!abierta) return null;
  const faltan = sugeridosQueFaltan(existentes);
  return (
    <Modal abierto titulo="Lista sugerida" subtitulo="Los insumos típicos de una cocina" onClose={onClose}>
      {faltan.length === 0 ? (
        <p className="text-sm text-texto-2">Ya cargaste todos los de la lista. Los demás se cargan con «Nuevo».</p>
      ) : (
        <>
          <p className="text-[13px] text-texto-2">
            Tocá uno y se abre con lo típico ya puesto: cómo se compra y para cuánto alcanza. Si lo comprás distinto,
            cambialo antes de guardar.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {faltan.map((s) => (
              <button
                key={s.nombre}
                type="button"
                onClick={() => onElegir(s)}
                className="min-h-11 whitespace-nowrap rounded-full border border-borde bg-white px-4 text-[13px] font-semibold text-texto-2 transition-colors hover:border-primary hover:bg-primary-50"
              >
                {s.nombre}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// ── El formulario ───────────────────────────────────────────────────────────

/**
 * Alta y edición de un insumo con las recetas prendidas: cuatro bloques (qué
 * es, cómo lo comprás, para cuánto te alcanza, cómo lo controlás) y SIN campo
 * de precio: el costo se ve, de sólo lectura, y sale de las compras.
 *
 * Todo campo arranca vacío, salvo que el usuario haya elegido una plantilla de
 * la «Lista sugerida» (ahí llega con lo típico, y se puede cambiar).
 */
export function FormInsumoReceta({
  insumo,
  plantilla,
  categorias,
  unidades,
  registraCompras,
  onClose,
  onGuardado,
}: {
  insumo: Insumo | null;
  /** El de la «Lista sugerida» que se tocó (sólo en un alta). */
  plantilla: InsumoSugerido | null;
  categorias: Categoria[];
  unidades: UnidadMedida[];
  /** Puede abrir Movimientos: sin eso no se ofrece «Registrar una compra». */
  registraCompras: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const navigate = useNavigate();
  const ids = useId();
  const esEdicion = !!insumo;
  const desdePlantilla = !insumo && !!plantilla;
  const baseOriginal = baseDeUnidad(insumo?.unidad);
  const formaOriginal = formaCompra(insumo ? insumo.compraUnidad : plantilla?.compra);

  /**
   * Cuánto trae un chip al elegirlo: el de siempre (quintal 46, arroba 11,5) o
   * vacío (bolsa, bidón, paquete). El chip con que se abrió el formulario
   * vuelve con lo que traía (lo guardado, o lo de la plantilla).
   */
  const contenidoDe = (f: FormaCompra | null): string => {
    if (!f || f.esLaBase) return "";
    if (f.nombre === formaOriginal?.nombre) {
      if (insumo) return textoNum(insumo.compraContenido);
      if (plantilla) return textoNum(plantilla.contenido ?? f.contenido);
    }
    return textoNum(f.contenido);
  };
  /**
   * En qué viene una bolsa, un bidón o un paquete al elegirlo. En una edición,
   * la unidad que el insumo ya tiene (no se la cambia sin que se pida); en la
   * plantilla, la suya; si no, la que sugiere el chip.
   */
  const baseDe = (f: FormaCompra | null): BaseInsumo | null => {
    if (!f || f.base) return null;
    if (insumo) return baseOriginal;
    return f.nombre === formaOriginal?.nombre ? (plantilla?.base ?? null) : null;
  };

  const [nombre, setNombre] = useState(insumo?.nombre ?? plantilla?.nombre ?? "");
  const [categoriaId, setCategoriaId] = useState(String(insumo?.categoriaId ?? ""));
  const [compra, setCompra] = useState(formaOriginal?.nombre ?? "");
  const [contenido, setContenido] = useState(() => contenidoDe(formaOriginal));
  /** En qué viene una bolsa, un bidón o un paquete (los demás chips lo fijan). */
  const [baseElegida, setBaseElegida] = useState<BaseInsumo | null>(() => baseDe(formaOriginal));
  /** La unidad a mano: sin chip (un insumo de antes), o si el negocio no tiene la del chip. */
  const [unidadId, setUnidadId] = useState(String(insumo?.unidadMedidaId ?? ""));
  const [rindeCantidad, setRindeCantidad] = useState(() =>
    textoRindeCantidad(insumo ? insumo.rindeCantidad : plantilla?.rindeCantidad),
  );
  const [rindePorciones, setRindePorciones] = useState(() =>
    textoNum(insumo ? insumo.rindePorciones : plantilla?.rindePorciones),
  );
  const [porcionNombre, setPorcionNombre] = useState(insumo?.porcionNombre ?? plantilla?.porcion ?? "");
  /** Null = todavía no eligió (el backend lo deja en «lo estimo»). */
  const [seCuenta, setSeCuenta] = useState<boolean | null>(() =>
    insumo ? (insumo.seCuenta ?? null) : plantilla ? plantilla.seCuenta : null,
  );
  const [polloEntero, setPolloEntero] = useState(insumo ? insumo.partes === "POLLO_8" : plantilla?.partes === "POLLO_8");
  const [proveedor, setProveedor] = useState(insumo?.proveedor ?? "");
  // El input date sólo entiende yyyy-MM-dd.
  const [vencimiento, setVencimiento] = useState((insumo?.vencimiento ?? "").slice(0, 10));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // ── Lo que se deriva de lo elegido ──
  const forma = formaCompra(compra);
  const unidadAMano = unidades.find((u) => String(u.id) === unidadId) ?? null;
  const base: BaseInsumo | null = forma
    ? (forma.base ?? baseElegida ?? baseOriginal ?? forma.baseSugerida)
    : baseDeUnidad(unidadAMano ?? insumo?.unidad);
  const unidadDelChip = forma && base ? unidadDeBase(unidades, base) : null;
  // A mano: con un chip cuya unidad el negocio no tiene (y las unidades ya
  // llegaron), o en un insumo de antes que todavía no dice cómo se compra (ahí
  // se ve la unidad que ya tiene). Un alta sin chip no la pide: falta el chip.
  const pideUnidad = forma ? unidades.length > 0 && !unidadDelChip : esEdicion;
  const unidadFinal = unidadDelChip ?? (pideUnidad ? unidadAMano : null);
  const palabras = base ? PALABRAS_BASE[base] : null;
  const enUnidad = palabras?.plural ?? unidadFinal?.nombre.toLowerCase() ?? "su unidad";
  const cambiaUnidad =
    esEdicion && insumo.unidadMedidaId != null && unidadFinal != null && unidadFinal.id !== insumo.unidadMedidaId;

  const contenidoNum = forma ? (forma.esLaBase ? 1 : parsearMonto(contenido)) : 1;
  const rc = rindeCantidad.trim() === "" ? 1 : parsearMonto(rindeCantidad);
  const rp = rindePorciones.trim() === "" ? null : parsearMonto(rindePorciones);
  const rindeOk = rc != null && rc > 0 && rp != null && rp > 0;
  const nombrePorcion = porcionNombre.trim();
  const porBulto = rindeOk && contenidoNum != null && contenidoNum > 0 ? (contenidoNum * rp) / rc : null;
  const sujeto = forma ? unBulto(forma) : base ? unaBase(base) : null;
  const alcanza = porBulto != null && nombrePorcion && sujeto ? `${sujeto} te alcanza para ${textoPorciones(porBulto, nombrePorcion)}.` : null;
  // Una unidad que sirve 8 presas: puede ser el pollo entero de la plantilla de partes.
  const puedeSerPollo = nombrePorcion === "presa" && rc === 1 && rp === 8;

  // El costo, de sólo lectura: el de la ficha, que sale de las compras.
  const costo = insumo && typeof insumo.costoCompra === "number" && insumo.costoCompra > 0 ? insumo.costoCompra : null;
  const costoBulto = costo != null && forma && !forma.esLaBase && contenidoNum != null && contenidoNum > 0 ? costo * contenidoNum : null;
  const costoPorcion = costo != null && rindeOk ? (costo * rc) / rp : null;

  function elegirCompra(f: FormaCompra) {
    if (f.nombre === compra) return;
    setCompra(f.nombre);
    // Lo que trae y en qué viene son de cada chip: cambiar de chip los vuelve a empezar.
    setContenido(contenidoDe(f));
    setBaseElegida(baseDe(f));
  }

  async function guardar() {
    if (guardando) return;
    setError("");

    if (!nombre.trim()) return setError("Poné un nombre.");
    // Obligatoria, como siempre: sin categoría desaparece de los reportes de compras agrupados.
    if (!categoriaId) return setError("Elegí una categoría para el insumo.");
    if (!forma && !unidadAMano) return setError("Elegí cómo lo comprás.");
    if (!unidadFinal) return setError("Elegí una unidad de medida.");

    let compraContenido: number | undefined;
    if (forma) {
      if (forma.esLaBase) compraContenido = 1;
      else {
        if (contenidoNum == null || !(contenidoNum > 0))
          return setError(`Escribí cuánto trae cada ${forma.nombre.toLowerCase()}.`);
        compraContenido = redondear3(contenidoNum);
      }
    }
    if (rc == null || !(rc > 0)) return setError("«Con cuánto» tiene que ser un número mayor a 0.");
    if (rindePorciones.trim() !== "" && (rp == null || !(rp > 0)))
      return setError("«Sirvo» tiene que ser un número mayor a 0.");

    const input: InsumoInput = {
      nombre: nombre.trim(),
      unidadMedidaId: unidadFinal.id,
      categoriaId: Number(categoriaId),
      // Escondido, como en el restaurante de siempre: viaja con el que ya tenía, y un alta nace en 0.
      puntoReorden: insumo?.puntoReorden ?? 0,
      proveedor: proveedor.trim(),
      ...(vencimiento ? { vencimiento } : {}),
      // Sin `costoCompra`: con recetas el costo entra sólo por las compras.
      ...(forma ? { compraUnidad: forma.nombre, compraContenido } : {}),
      rindeCantidad: redondear3(rc),
      ...(rp != null ? { rindePorciones: redondear3(rp) } : {}),
      ...(nombrePorcion ? { porcionNombre: nombrePorcion } : {}),
      ...(seCuenta != null ? { seCuenta } : {}),
      partes: puedeSerPollo && polloEntero ? "POLLO_8" : null,
    };

    setGuardando(true);
    try {
      if (insumo) await api.actualizarInsumo(insumo.id, input);
      else await api.crearInsumo(input);
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={esEdicion ? "Editar insumo" : "Nuevo insumo"}
      subtitulo={
        esEdicion
          ? insumo.nombre
          : desdePlantilla
            ? "Con lo típico ya puesto: cambialo si lo comprás distinto"
            : "Materia prima que se compra, no se vende"
      }
      onClose={onClose}
      // Un formulario largo: un toque al costado no lo borra.
      cerrarAlClicAfuera={false}
      ancho="max-w-xl"
      acciones={
        <>
          <Boton variante="ghost" onClick={onClose}>
            Cancelar
          </Boton>
          <Boton icono="save" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-start gap-2 rounded-xl bg-primary-50 px-3.5 py-2.5 text-[13px] text-primary-700">
          <Icon name="info" size={17} className="shrink-0" />
          <span>{DESCARTABLES_CON_RECETAS}</span>
        </div>

        <Bloque numero={1} titulo="Qué es">
          <Campo label="Nombre">
            {/* En la PC el foco va al nombre; con el dedo no, o el teclado tapa el formulario. */}
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={enfocaSolo()} />
          </Campo>
          <Campo label="Categoría">
            <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Elegí una categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        </Bloque>

        <Bloque numero={2} titulo="Cómo lo comprás">
          <div className="flex flex-wrap gap-2">
            {FORMAS_COMPRA.map((f) => (
              <Chip key={f.nombre} activo={f.nombre === forma?.nombre} onClick={() => elegirCompra(f)}>
                {f.nombre}
              </Chip>
            ))}
          </div>

          {forma && !forma.esLaBase && (
            <div>
              <label htmlFor={`${ids}-contenido`} className="mb-1.5 block text-[13px] font-semibold text-texto-2">
                Cada {forma.nombre.toLowerCase()} trae
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id={`${ids}-contenido`}
                  type="number"
                  inputMode="decimal"
                  value={contenido}
                  onChange={(e) => setContenido(e.target.value)}
                  className="w-28 text-right"
                />
                {forma.base ? (
                  <span className="text-sm text-texto-2">{PALABRAS_BASE[forma.base].plural}</span>
                ) : (
                  <div className="w-36">
                    <Select
                      aria-label={`En qué viene ${elBulto(forma).toLowerCase()}`}
                      value={base ?? forma.baseSugerida}
                      onChange={(e) => setBaseElegida(e.target.value as BaseInsumo)}
                    >
                      {(Object.keys(PALABRAS_BASE) as BaseInsumo[]).map((b) => (
                        <option key={b} value={b}>
                          {PALABRAS_BASE[b].plural}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
            </div>
          )}

          {pideUnidad && (
            <Campo
              label="Unidad de medida"
              hint={
                forma && palabras ? `Tu negocio no tiene una unidad de ${palabras.plural}: elegí con cuál lo llevás.` : undefined
              }
            >
              <Select value={unidadId} onChange={(e) => setUnidadId(e.target.value)}>
                <option value="">Elegí una</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          )}

          {cambiaUnidad && (
            <p role="note" className="rounded-lg bg-warning-bg px-3 py-2 text-[12px] text-warning-text">
              Ojo: la unidad pasa de {insumo.unidad?.nombre ?? "la que tenía"} a {unidadFinal.nombre}. El stock y el costo
              que ya tiene se van a leer en {enUnidad}.
            </p>
          )}
        </Bloque>

        <Bloque numero={3} titulo="Para cuánto te alcanza">
          <div className="grid grid-cols-2 items-end gap-3">
            <Campo label={`Con cuánto (en ${enUnidad})`}>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="1"
                value={rindeCantidad}
                onChange={(e) => setRindeCantidad(e.target.value)}
              />
            </Campo>
            <Campo label="Sirvo (cuántas)">
              <Input type="number" inputMode="decimal" value={rindePorciones} onChange={(e) => setRindePorciones(e.target.value)} />
            </Campo>
          </div>

          <div>
            <p id={`${ids}-porcion`} className="mb-1.5 text-[13px] font-semibold text-texto-2">
              Lo que sirvo se llama
            </p>
            <div role="group" aria-labelledby={`${ids}-porcion`} className="flex flex-wrap gap-2">
              {NOMBRES_PORCION.map((p) => (
                <Chip key={p.nombre} activo={nombrePorcion === p.nombre} onClick={() => setPorcionNombre(p.nombre)}>
                  {p.plural}
                </Chip>
              ))}
            </div>
          </div>

          {alcanza ? (
            <p className="text-[13px] font-semibold text-primary-700">{alcanza}</p>
          ) : (
            rp != null &&
            rp > 0 &&
            !nombrePorcion && <p className="text-[12px] text-texto-3">Elegí cómo se llama lo que servís.</p>
          )}

          {puedeSerPollo && (
            <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-borde bg-white px-3.5 py-2">
              <input
                type="checkbox"
                checked={polloEntero}
                onChange={(e) => setPolloEntero(e.target.checked)}
                className="h-5 w-5 shrink-0 rounded border-borde accent-primary"
              />
              <span className="text-sm text-texto">Es un pollo entero: 2 alas, 2 pechos, 2 piernas y 2 contras</span>
            </label>
          )}

          <p className="text-[12px] text-texto-3">
            Para lo que no va plato por plato, como el aceite o el gas: poné cuánto gastás y para cuánto te alcanza. Ej.:
            con 20 litros sirvo 500 porciones.
          </p>
        </Bloque>

        <Bloque numero={4} titulo="Cómo lo controlás">
          <div className="grid gap-2 sm:grid-cols-2">
            <OpcionControl
              activa={seCuenta === true}
              titulo="Lo cuento"
              texto="Pollos, bandejas, gaseosas: el sistema dice para cuántos platos alcanza."
              onClick={() => setSeCuenta(true)}
            />
            <OpcionControl
              activa={seCuenta === false}
              titulo="Lo estimo"
              texto="Arroz, aceite, sal: calcula cuánto debería quedar."
              onClick={() => setSeCuenta(false)}
            />
          </div>
        </Bloque>

        <section aria-label="Costo" className="rounded-xl border border-borde-soft bg-muted p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] font-bold text-texto">Costo · sale de tus compras</p>
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-texto-3">No se carga acá</span>
          </div>
          {costo != null ? (
            <>
              <dl className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {costoBulto != null && forma && <Cifra etiqueta={elBulto(forma)} valor={fmtMoney(costoBulto)} />}
                <Cifra etiqueta={`Cada ${palabras?.singular ?? insumo?.unidad?.nombre.toLowerCase() ?? "unidad"}`} valor={fmtMoney(costo)} />
                {costoPorcion != null && <Cifra etiqueta={`Cada ${nombrePorcion || "porción"}`} valor={fmtMoney(costoPorcion)} />}
              </dl>
              <p className="mt-2 text-[12px] text-texto-3">
                Es lo que pagaste en tu última compra. Se actualiza solo cada vez que registrás una entrada en Movimientos.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-sm font-semibold text-texto-2">Todavía sin costo</p>
              <p className="mt-0.5 text-[12px] text-texto-3">
                Se carga solo con tu primera compra: registrala en Movimientos como una entrada
                {forma && !forma.esLaBase ? `, por ${forma.nombre.toLowerCase()} y con lo que pagaste` : ", con lo que pagaste"}.
              </p>
            </>
          )}
          {esEdicion && registraCompras && (
            <Boton variante="ghost" icono="cart" className="mt-3" onClick={() => navigate(RUTA_REGISTRAR_COMPRA)}>
              Registrar una compra
            </Boton>
          )}
        </section>

        <Campo label="Proveedor">
          <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
        </Campo>

        <Campo label="Vencimiento" hint="Opcional">
          <Input type="date" value={vencimiento} onChange={(e) => setVencimiento(e.target.value)} />
        </Campo>

        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}

/** Un bloque numerado del formulario. El número no entra en el nombre del grupo. */
function Bloque({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <fieldset>
      <legend className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.12em] text-texto-3">
        <span
          aria-hidden="true"
          className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-50 text-[11px] tracking-normal text-primary-700"
        >
          {numero}
        </span>
        {titulo}
      </legend>
      {/* El aire va en el contenido: el margen de un <legend> no se respeta igual en todos los navegadores. */}
      <div className="space-y-3 pt-2.5">{children}</div>
    </fieldset>
  );
}

/** Un chip que se elige (uno por grupo). 44 px de alto: es para el dedo. */
function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`min-h-11 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-colors ${
        activo ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-2 hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** «Lo cuento» / «Lo estimo»: una tarjeta-botón con su explicación. */
function OpcionControl({
  activa,
  titulo,
  texto,
  onClick,
}: {
  activa: boolean;
  titulo: string;
  texto: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activa}
      onClick={onClick}
      className={`min-h-11 rounded-xl border p-3 text-left transition-colors ${
        activa ? "border-primary bg-primary-50" : "border-borde bg-white hover:bg-muted"
      }`}
    >
      <span className={`block text-sm font-bold ${activa ? "text-primary-700" : "text-texto"}`}>{titulo}</span>
      <span className="mt-0.5 block text-[12px] text-texto-3">{texto}</span>
    </button>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-white px-2.5 py-2">
      <dt className="text-[12px] text-texto-3">{etiqueta}</dt>
      <dd className="text-sm font-bold tabular-nums text-texto">{valor}</dd>
    </div>
  );
}

