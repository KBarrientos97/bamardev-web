import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { Boton, Cargando, Confirmar, ErrorMsg, Modal } from "../../../components/ui";
import { ApiError } from "../../../lib/api";
import { ctrlEnter, pasarAlSiguiente, useTeclas } from "../../../lib/nutricion/atajos";
import { enfocaSolo, enfocarOMostrar } from "../../../lib/nutricion/foco";
import { apiSeguimiento, esProductoRepetido } from "../../../lib/nutricion/seguimiento/api";
import { textoVial } from "../../../lib/nutricion/seguimiento/formato";
import {
  cambiosDeProducto,
  erroresDeProducto,
  hayErroresDeProducto,
  MAX_PRESENTACIONES,
  nombreDeProducto,
  presentacionesDe,
  productoDesde,
  productoVacio,
  type FormProducto,
} from "../../../lib/nutricion/seguimiento/formulario";
import type { ListaProductos, ProductoSeguimiento } from "../../../lib/nutricion/seguimiento/tipos";
import { olvidarCatalogoSeguimiento } from "../../../lib/nutricion/seguimiento/useCatalogoSeguimiento";
import { useApi } from "../../../lib/useApi";
import { useAtrasConCambios } from "../../../lib/useAtrasConCambios";
import { CampoNumero, CampoTexto, Rotulo } from "../piezas";
import { BotonToque } from "./piezas";

/** Con un backend anterior (sin las rutas de la lista, 404). */
const NO_DISPONIBLE = "Todavía no está disponible.";
/** 409 PRODUCTO_REPETIDO (§9.1). */
const REPETIDO = "Ya está en la lista.";
/** Cuánto se lee «Todavía no está disponible.» antes de que la ventana se cierre sola. */
const ESPERA_NO_DISPONIBLE = 2500;
/** El prefijo de los `id` de los campos del formulario. */
const ID = "tratamientos";

type Vista = { que: "lista" } | { que: "formulario"; producto: ProductoSeguimiento | null };

/**
 * «Tratamientos» (CONTRATO-nutricion-seguimiento-23nov §9.2): la lista de
 * botones que salen al iniciar un tratamiento. Los de fábrica (Tirzepatida,
 * Retatrutida, Glow) se editan (sus viales) o se ocultan, y vuelven a como
 * venían; los propios del negocio se agregan, se editan, se ocultan y se
 * quitan (con pregunta). Es una lista de SUGERENCIAS: ningún tratamiento ya
 * iniciado cambia. Sólo para quien tiene `ajustes.puedeCambiarlos`.
 *
 * Cada escritura queda guardada al toque (la ventana no tiene «Guardar» propio)
 * y olvida el catálogo guardado; al cerrarla, `onCerrar` recibe la lista nueva
 * (o null si no cambió nada) para que los botones de atrás se vuelvan a leer.
 *
 * `abrirEn="agregar"` (el «+ Agregar» de las hojas) abre directo en «Agregar
 * tratamiento»: guardar o cancelar cierra la ventana. `Esc` y el atrás cierran
 * sólo lo de más arriba (la pregunta, el formulario, la ventana). Todo campo
 * abre vacío y nada se elige solo. Con un backend anterior, lo dice y se cierra.
 */
export default function DialogoTratamientos({
  abrirEn = "lista",
  continua,
  onCerrar,
}: {
  abrirEn?: "lista" | "agregar";
  /** Viene de otra ventana que se cierra en el mismo render («Ajustes del seguimiento»): sin volver a subir. */
  continua?: "adelante" | "atras";
  onCerrar: (productos: ProductoSeguimiento[] | null) => void;
}) {
  const lista = useApi(() => apiSeguimiento.productos(), []);
  const noDisponible = lista.falla instanceof ApiError && lista.falla.status === 404;
  const productos = lista.datos?.productos ?? null;
  const [vista, setVista] = useState<Vista>(abrirEn === "agregar" ? { que: "formulario", producto: null } : { que: "lista" });
  const [form, setForm] = useState<FormProducto>(productoVacio);
  const [intento, setIntento] = useState(false);
  const [errorForm, setErrorForm] = useState("");
  const [errorLista, setErrorLista] = useState("");
  const [quitando, setQuitando] = useState<ProductoSeguimiento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Al toque, sin esperar el dibujo: dos toques seguidos no mandan dos veces.
  const enCurso = useRef(false);
  const campos = useRef<HTMLDivElement>(null);
  /** La lista que dejó la última escritura (null = no cambió nada). */
  const cambiada = useRef<ProductoSeguimiento[] | null>(null);
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;
  const cerrada = useRef(false);
  const cerrar = useCallback(() => {
    if (cerrada.current) return;
    cerrada.current = true;
    alCerrar.current(cambiada.current);
  }, []);

  // Con un backend anterior: lo dice y se cierra sola.
  useEffect(() => {
    if (!noDisponible) return;
    const t = setTimeout(cerrar, ESPERA_NO_DISPONIBLE);
    return () => clearTimeout(t);
  }, [noDisponible, cerrar]);

  const enFormulario = vista.que === "formulario" && !noDisponible;
  const producto = vista.que === "formulario" ? vista.producto : null;
  const deFabrica = !!producto?.deFabrica;

  /** Lo que devolvió una escritura: la lista entera, ya cambiada. Los botones de atrás cambiaron. */
  const guardada = (r: ListaProductos) => {
    cambiada.current = r.productos;
    lista.setDatos(r);
    olvidarCatalogoSeguimiento();
  };

  const abrirFormulario = (p: ProductoSeguimiento | null) => {
    setForm(p ? productoDesde(p) : productoVacio());
    setIntento(false);
    setErrorForm("");
    setErrorLista("");
    setVista({ que: "formulario", producto: p });
  };
  /** «Cancelar» del formulario: a la lista, o cierra la ventana si se abrió directo en «Agregar». */
  const salirDelFormulario = () => (abrirEn === "agregar" ? cerrar() : setVista({ que: "lista" }));

  /** `Esc`, la ✕ y el atrás: sólo lo de más arriba. Mientras guarda, esperan. */
  const cerrarArriba = () => {
    if (enCurso.current) return;
    if (quitando) setQuitando(null);
    else if (enFormulario) salirDelFormulario();
    else cerrar();
  };
  useAtrasConCambios(true, cerrarArriba);

  async function escribir(pedido: () => Promise<ListaProductos>, alFallar: (e: unknown) => void): Promise<boolean> {
    if (enCurso.current) return false;
    enCurso.current = true;
    setOcupado(true);
    try {
      guardada(await pedido());
      return true;
    } catch (e) {
      alFallar(e);
      return false;
    } finally {
      enCurso.current = false;
      setOcupado(false);
    }
  }

  /** Ocultar, mostrar, quitar uno propio o volver uno de fábrica a como venía. */
  async function enLaLista(p: ProductoSeguimiento, que: "ocultar" | "mostrar" | "quitar") {
    setErrorLista("");
    const oculto = que === "ocultar";
    await escribir(
      () =>
        que === "quitar"
          ? apiSeguimiento.quitarProducto(p.id!)
          : p.id != null
            ? apiSeguimiento.cambiarProducto(p.id, { oculto })
            : apiSeguimiento.cambiarDeFabrica(p.nombre, { oculto }),
      (e) => {
        setErrorLista(e instanceof Error ? e.message : "No se pudo cambiar la lista.");
        // Otra persona la quitó o la cambió mientras tanto: la lista se vuelve a leer.
        if (e instanceof ApiError && e.status === 404) lista.recargar();
      },
    );
    setQuitando(null);
  }

  const errores = erroresDeProducto(form);
  async function guardarFormulario() {
    if (enCurso.current) return;
    setIntento(true);
    if (hayErroresDeProducto(deFabrica ? { ...errores, nombre: null } : errores)) {
      setErrorForm("");
      // Al primer campo para revisar de ESTA ventana (la hoja de atrás también es un diálogo).
      // Con el dedo queda a la vista, sin subir el teclado.
      setTimeout(() => enfocarOMostrar(campos.current?.querySelector<HTMLElement>('[aria-invalid="true"]')), 0);
      return;
    }
    let pedido: () => Promise<ListaProductos>;
    if (!producto) {
      const viales = presentacionesDe(form);
      pedido = () => apiSeguimiento.agregarProducto({ nombre: nombreDeProducto(form.nombre), ...(viales.length ? { presentaciones: viales } : {}) });
    } else {
      const cambios = cambiosDeProducto(producto, form);
      if (!Object.keys(cambios).length) {
        salirDelFormulario();
        return;
      }
      const id = producto.id;
      pedido = id != null ? () => apiSeguimiento.cambiarProducto(id, cambios) : () => apiSeguimiento.cambiarDeFabrica(producto.nombre, cambios);
    }
    setErrorForm("");
    const ok = await escribir(pedido, (e) => {
      setErrorForm(
        esProductoRepetido(e)
          ? REPETIDO
          : !producto && e instanceof ApiError && e.status === 404
            ? NO_DISPONIBLE
            : e instanceof Error
              ? e.message
              : "No se pudo guardar.",
      );
      if (producto && e instanceof ApiError && e.status === 404) lista.recargar();
    });
    if (ok) salirDelFormulario();
  }

  useTeclas((e) => {
    if (!enFormulario || !ctrlEnter(e)) return;
    e.preventDefault();
    void guardarFormulario();
  });

  const cambiarVial = (i: number, campo: "mg" | "ml", valor: string) =>
    setForm((f) => ({ ...f, viales: f.viales.map((v, j) => (j === i ? { ...v, [campo]: valor } : v)) }));
  const quitarVial = (i: number) =>
    setForm((f) => ({ ...f, viales: f.viales.length > 1 ? f.viales.filter((_, j) => j !== i) : [{ mg: "", ml: "" }] }));
  const agregarVial = () => {
    const i = form.viales.length;
    setForm((f) => (f.viales.length >= MAX_PRESENTACIONES ? f : { ...f, viales: [...f.viales, { mg: "", ml: "" }] }));
    // El botón es para escribir el renglón nuevo: el foco va, también con el dedo (`foco.ts`).
    setTimeout(() => document.getElementById(`${ID}-vial-${i}-mg`)?.focus(), 0);
  };

  // ── Lo que se ve ──────────────────────────────────────────────────────────

  let titulo = "Tratamientos";
  let subtitulo: string | undefined = "Son los botones que salen al iniciar un tratamiento. El nombre igual se puede escribir a mano.";
  let acciones: ReactNode;
  let contenido: ReactNode;

  if (noDisponible) {
    subtitulo = undefined;
    contenido = (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-info-bg px-3.5 py-2.5 text-sm text-info-text">
        <Icon name="info" size={16} className="mt-px shrink-0" />
        {NO_DISPONIBLE}
      </p>
    );
    // No «Cerrar»: así se llama la ✕ de la cabecera.
    acciones = (
      <Boton variante="ghost" className="min-h-11" onClick={cerrar}>
        Entendido
      </Boton>
    );
  } else if (enFormulario) {
    // El nombre va adentro (el campo, o el texto en uno de fábrica): no se repite en la cabecera.
    titulo = producto ? "Editar tratamiento" : "Agregar tratamiento";
    subtitulo = undefined;
    const errNombre = !deFabrica && intento ? errores.nombre : null;
    contenido = (
      <div
        ref={campos}
        className="space-y-5"
        onKeyDown={(e) => {
          // `Enter` en un campo pasa al siguiente; en el último, guarda.
          const el = e.target as HTMLElement;
          if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || el.tagName !== "INPUT") return;
          e.preventDefault();
          if (!pasarAlSiguiente(e.currentTarget, el)) void guardarFormulario();
        }}
      >
        {deFabrica && producto ? (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-texto-2">Nombre</p>
            <p className="break-words text-base font-semibold text-texto">{producto.nombre}</p>
            <p className="mt-1 text-xs text-texto-3">Viene con el sistema: el nombre no se cambia.</p>
          </div>
        ) : (
          <Rotulo htmlFor={`${ID}-nombre`} label="Nombre" error={errNombre}>
            <CampoTexto
              id={`${ID}-nombre`}
              value={form.nombre}
              maxLength={80}
              // «Agregar tratamiento» y «+ Agregar» son para escribir el nombre: el foco va,
              // también con el dedo. «Editar» abre un formulario: con el dedo, sin teclado.
              autoFocus={!producto || enfocaSolo()}
              autoComplete="off"
              enterKeyHint="next"
              invalido={!!errNombre}
              aria-describedby={errNombre ? `${ID}-nombre-error` : undefined}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
              className="min-h-12 text-base"
            />
          </Rotulo>
        )}

        <div className="space-y-2.5">
          <p className="text-[13px] font-semibold text-texto-2">
            Presentación del vial <span className="font-normal text-texto-4">(opcional)</span>
          </p>
          {form.viales.map((v, i) => {
            const e = errores.viales[i];
            const errMg = intento || v.mg ? e.mg : null;
            const errMl = intento || v.ml ? e.ml : null;
            // A medio llenar (mg sin ml): se marca el que falta, al guardar.
            const medio = intento && !errMg && !errMl ? e.vial : null;
            const falta = medio ? (v.mg.trim() ? "ml" : "mg") : null;
            const n = i + 1;
            return (
              <div key={i} className="space-y-1">
                {/* Los dos números se angostan un poco en un teléfono chico (360 px) antes de que el renglón se desborde. */}
                <div role="group" aria-label={`Presentación ${n}`} className="flex items-center gap-2 text-sm text-texto-2">
                  <span className="whitespace-nowrap">Vial de</span>
                  <div className="min-w-0 max-w-28 shrink grow basis-24">
                    <CampoNumero
                      id={`${ID}-vial-${i}-mg`}
                      aria-label={`Miligramos de la presentación ${n}`}
                      value={v.mg}
                      unidad="mg"
                      enterKeyHint="next"
                      // Editar uno de fábrica empieza por su vial (el nombre no se cambia); con el dedo, sin teclado.
                      autoFocus={deFabrica && i === 0 && enfocaSolo()}
                      invalido={!!errMg || falta === "mg"}
                      onChange={(x) => cambiarVial(i, "mg", x)}
                      className="min-h-12 pr-10! text-base"
                    />
                  </div>
                  <span>en</span>
                  <div className="min-w-0 max-w-28 shrink grow basis-24">
                    <CampoNumero
                      id={`${ID}-vial-${i}-ml`}
                      aria-label={`Mililitros de la presentación ${n}`}
                      value={v.ml}
                      unidad="ml"
                      enterKeyHint="next"
                      invalido={!!errMl || falta === "ml"}
                      onChange={(x) => cambiarVial(i, "ml", x)}
                      className="min-h-12 pr-10! text-base"
                    />
                  </div>
                  {(form.viales.length > 1 || !!v.mg.trim() || !!v.ml.trim()) && (
                    <button
                      type="button"
                      aria-label={`Quitar la presentación ${n}`}
                      title="Quitar esta presentación"
                      onClick={() => quitarVial(i)}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-texto-3 transition-colors hover:bg-muted hover:text-danger-text"
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
                {errMg && (
                  <p id={`${ID}-vial-${i}-mg-error`} className="text-xs text-danger-text">
                    {errMg}
                  </p>
                )}
                {errMl && (
                  <p id={`${ID}-vial-${i}-ml-error`} className="text-xs text-danger-text">
                    {errMl}
                  </p>
                )}
                {medio && (
                  <p id={`${ID}-vial-${i}-${falta}-error`} className="text-xs text-danger-text">
                    {medio}
                  </p>
                )}
              </div>
            );
          })}
          {form.viales.length < MAX_PRESENTACIONES ? (
            <BotonToque onClick={agregarVial}>
              <Icon name="plus" size={15} strokeWidth={2.4} className="shrink-0" />
              Agregar otra presentación
            </BotonToque>
          ) : (
            <p className="text-xs text-texto-3">Hasta {MAX_PRESENTACIONES} presentaciones.</p>
          )}
          <p className="text-[12px] text-texto-3">Sirve para pasar la dosis de mg a UI y a ml. Si no la sabés, dejala vacía.</p>
        </div>

        {errorForm && (
          <p role="alert" className="rounded-xl bg-danger-bg px-3.5 py-2.5 text-sm text-danger-text">
            {errorForm}
          </p>
        )}
      </div>
    );
    acciones = (
      <>
        <Boton variante="ghost" className="min-h-11" onClick={salirDelFormulario} disabled={ocupado}>
          Cancelar
        </Boton>
        <Boton className="min-h-11" onClick={() => void guardarFormulario()} disabled={ocupado} title={`${producto ? "Guardar" : "Agregar"} (Ctrl+Enter)`}>
          {ocupado ? "Guardando…" : producto ? "Guardar" : "Agregar"}
        </Boton>
      </>
    );
  } else {
    contenido =
      lista.error && !productos ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : !productos ? (
        <Cargando texto="Cargando la lista…" />
      ) : (
        <div className="space-y-3">
          {errorLista && <ErrorMsg>{errorLista}</ErrorMsg>}
          {productos.length === 0 ? (
            <p className="py-6 text-center text-sm text-texto-3">Todavía no hay ninguno: el nombre se escribe a mano.</p>
          ) : (
            <ul className="divide-y divide-borde-soft">
              {productos.map((p) => (
                <Renglon
                  key={p.id ?? `f-${p.nombre}`}
                  p={p}
                  ocupado={ocupado}
                  onEditar={() => abrirFormulario(p)}
                  onOcultar={() => void enLaLista(p, p.oculto ? "mostrar" : "ocultar")}
                  onQuitar={() => setQuitando(p)}
                  onVolver={() => void enLaLista(p, "quitar")}
                />
              ))}
            </ul>
          )}
        </div>
      );
    acciones = (
      <>
        {/* Todo queda guardado al toque: «Listo» sólo cierra (no «Cerrar»: así se llama la ✕). */}
        <Boton variante="ghost" className="min-h-11" onClick={cerrar} disabled={ocupado}>
          Listo
        </Boton>
        <Boton icono="plus" className="min-h-11" onClick={() => abrirFormulario(null)} disabled={ocupado || !productos}>
          Agregar tratamiento
        </Boton>
      </>
    );
  }

  return (
    <>
      <Modal
        abierto
        titulo={titulo}
        subtitulo={subtitulo}
        // Con la pregunta de «Quitar» encima, `Esc` es de ella.
        onClose={quitando ? sinCerrar : cerrarArriba}
        ancho="max-w-xl"
        cerrarAlClicAfuera={false}
        continua={continua}
        acciones={acciones}
      >
        {contenido}
      </Modal>
      <Confirmar
        abierto={!!quitando}
        titulo={quitando ? `¿Quitar “${quitando.nombre}” de la lista?` : "¿Quitar de la lista?"}
        texto="Los tratamientos ya iniciados no cambian."
        etiquetaOk="Quitar"
        peligroso
        procesando={ocupado}
        onCancel={() => {
          if (!enCurso.current) setQuitando(null);
        }}
        onOk={() => quitando && void enLaLista(quitando, "quitar")}
      />
    </>
  );
}

const sinCerrar = () => {};

/**
 * Un tratamiento de la lista: el nombre en negrita, debajo sus viales (uno por
 * renglón) o «Sin vial cargado», la marca «Oculto», y sus acciones. Si no
 * entran al lado, bajan enteras.
 */
function Renglon({
  p,
  ocupado,
  onEditar,
  onOcultar,
  onQuitar,
  onVolver,
}: {
  p: ProductoSeguimiento;
  ocupado: boolean;
  onEditar: () => void;
  onOcultar: () => void;
  onQuitar: () => void;
  onVolver: () => void;
}) {
  const propio = !p.deFabrica && p.id != null;
  const volver = p.deFabrica && p.cambiado && p.id != null;
  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div role="group" aria-label={p.nombre} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2.5">
        <div className="min-w-48 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`min-w-0 break-words font-semibold ${p.oculto ? "text-texto-3" : "text-texto"}`}>{p.nombre}</span>
            {p.oculto && <span className="whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-texto-3">Oculto</span>}
          </p>
          {p.presentaciones.length > 0 ? (
            p.presentaciones.map((v) => (
              <span key={`${v.mg}-${v.ml}`} className="mt-0.5 block whitespace-nowrap text-[13px] tabular-nums text-texto-3">
                {textoVial(v.mg, v.ml)}
              </span>
            ))
          ) : (
            <span className="mt-0.5 block text-[13px] text-texto-4">Sin vial cargado</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonToque onClick={onEditar} disabled={ocupado}>
            <Icon name="edit" size={15} className="shrink-0" />
            Editar
          </BotonToque>
          <BotonToque onClick={onOcultar} disabled={ocupado}>
            <Icon name={p.oculto ? "ojo" : "ojoTachado"} size={15} className="shrink-0" />
            {p.oculto ? "Mostrar" : "Ocultar"}
          </BotonToque>
          {propio && (
            <BotonToque onClick={onQuitar} disabled={ocupado}>
              <Icon name="trash" size={15} className="shrink-0" />
              Quitar
            </BotonToque>
          )}
          {volver && (
            <BotonToque onClick={onVolver} disabled={ocupado}>
              <Icon name="girar" size={15} className="shrink-0" />
              Volver a como venía
            </BotonToque>
          )}
        </div>
      </div>
    </li>
  );
}
