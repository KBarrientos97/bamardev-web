import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { useConsultaMedia } from "../../../lib/agenda/useEsCelular";
import PanelLateral from "../../../components/PanelLateral";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, Modal, Select, Vacio, useAviso } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import {
  descuentoEquivalente,
  precioCurso,
  problemasDelPlan,
  textoCubre,
  textoPagoDocente,
  textoPct,
  totalCalendario,
} from "../../../lib/academia/formato";
import type {
  Carrera,
  CarreraSimpleInput,
  CategoriaCctp,
  CuotaPlan,
  Materia,
  PagoDocenteModo,
  PlanPago,
  TipoVence,
} from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { ApiError } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { conMayuscula } from "../../../lib/rubro";
import { tieneFeature, tienePermiso } from "../../../lib/permisos";
import { useApi } from "../../../lib/useApi";
import { avisarPrimerosPasos } from "../../../lib/academia/primerosPasos";
import { useAuth } from "../../../store/AuthContext";
import { BotonCompartirInscripcion } from "../CompartirInscripcion";
import {
  BotonFila,
  BotonIcono,
  Chip,
  EncabezadoPagina,
  FiltrosConteo,
  Interruptor,
  LISTA,
  PaginaAcademia,
  ResumenPanel,
  SeccionPanel,
  TABLA,
  Tarjeta,
} from "../piezas";

/**
 * N2 · Cursos (ronda 2, modo simple D4): la lista de lo que ofrece el
 * instituto y, al tocar uno, el panel con lo único que hace falta para
 * ofrecerlo —nombre, módulos en orden, precio por módulo, descuento por pago
 * completo, cupo y % del docente—. Con eso el servidor arma solo los dos
 * planes ("Mes a mes" y "Pago completo"); el panel muestra cómo queda antes de
 * guardar.
 *
 * Lo de antes (horas, categoría CCTP, planes a medida con cuotas que cubren
 * varios módulos) sigue entero en "Opciones avanzadas": se usa poco y se
 * aparta (requerimiento 7), no se borra.
 *
 * No se ofrece un cargo de "matrícula": el reglamento de CCTP lo prohíbe en
 * el contrato (art. 39.II), así que el calendario sólo tiene cuotas que
 * cubren materias.
 */

/**
 * Dos chips y nada más (U4, 26-oct): «En la página» y «Sin publicar» eran
 * filtros que casi nadie usa; ahora el estado de publicación es una marca
 * en la fila de cada curso.
 */
type FiltroCursos = "todos" | "retirados";

export default function Carreras() {
  const p = usePalabras();
  const lista = useApi(() => apiAcademia.carreras(true), []);
  const ajustes = useApi(() => apiAcademia.ajustes(), []);
  const [filtro, setFiltro] = useState<FiltroCursos>("todos");
  const [elegida, setElegida] = useState<number | "nueva" | null>(null);
  const [avanzadas, setAvanzadas] = useState<number | null>(null);
  const [aviso, setAviso] = useAviso(5000);
  const navigate = useNavigate();
  const { usuario } = useAuth();
  // En el celular el panel es una hoja que tapa la pantalla (y los avisos).
  const celular = useConsultaMedia("(max-width: 767px)");
  // C2: al crear un curso, el aviso ofrece abrir su primer grupo (sólo a quien
  // puede abrir grupos). Dura más que un aviso común: hay que alcanzar a tocarlo.
  const abreGrupos = tienePermiso(usuario, "academia.grupos");
  const [recienCreado, setRecienCreado] = useState<Carrera | null>(null);
  useEffect(() => {
    if (!recienCreado) return;
    const t = setTimeout(() => setRecienCreado(null), 20000);
    return () => clearTimeout(t);
  }, [recienCreado]);

  const carreras = lista.datos ?? [];
  const pctInstituto = ajustes.datos?.pctDocenteDefecto ?? 20;
  const activas = carreras.filter((c) => c.activa);
  const conteo: Record<FiltroCursos, number> = {
    todos: activas.length,
    retirados: carreras.length - activas.length,
  };
  const visibles = carreras.filter((c) => (filtro === "retirados" ? !c.activa : c.activa));
  const actual = typeof elegida === "number" ? (carreras.find((c) => c.id === elegida) ?? null) : null;
  const panelAbierto = elegida === "nueva" || actual !== null;
  const enAvanzadas = avanzadas != null ? (carreras.find((c) => c.id === avanzadas) ?? null) : null;

  /** Reemplaza (o suma) una carrera en la lista con lo que devolvió el backend. */
  const actualizar = (c: Carrera) =>
    lista.setDatos(carreras.some((x) => x.id === c.id) ? carreras.map((x) => (x.id === c.id ? c : x)) : [...carreras, c]);
  const recargarUna = async (id: number) => {
    try {
      actualizar(await apiAcademia.carrera(id));
    } catch {
      lista.recargar();
    }
  };

  return (
    // Con el panel abierto se corre la página para que el panel no tape la
    // lista (el `!` le gana al `lg:p-8` del marco, que si no lo pisaba).
    <PaginaAcademia className={panelAbierto ? "md:!pr-[404px]" : ""}>
      <EncabezadoPagina
        titulo={p.Carreras}
        volver={{ a: "/configuracion/academia", texto: "Ajustes" }}
        bajada={
          ajustes.datos
            ? `Lo que ofrece el instituto. Los ${p.materias} empiezan el ${ajustes.datos.diaInicioModulo} de cada mes.`
            : "Lo que ofrece el instituto."
        }
        acciones={
          <Boton icono="plus" onClick={() => setElegida("nueva")}>
            Nuevo {p.carrera}
          </Boton>
        }
      />
      <AvisoOk>{aviso}</AvisoOk>
      {recienCreado && (
        <AvisoOk>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>
              {p.Carrera} creado: <b>{recienCreado.nombre}</b>.
            </span>
            <BotonFila
              variante="soft"
              icono="calendar"
              onClick={() => navigate(`/academia/calendario?nuevoGrupo=${recienCreado.id}`)}
            >
              Abrir el primer grupo
            </BotonFila>
          </span>
        </AvisoOk>
      )}

      <Tarjeta
        etiqueta={p.Carreras}
        sinRelleno
        barra={
          // Sin retirados, «Todos» solo no filtra nada: la barra no se dibuja.
          conteo.retirados || filtro === "retirados" ? (
            <FiltrosConteo<FiltroCursos>
              etiqueta={`Filtrar ${p.carreras}`}
              valor={filtro}
              onChange={setFiltro}
              enTarjeta
              opciones={[
                { clave: "todos", label: "Todos", n: conteo.todos },
                { clave: "retirados", label: "Retirados", n: conteo.retirados },
              ]}
            />
          ) : undefined
        }
        pie={
          visibles.length > 0 && (
            <p className="text-[13px] text-texto-3">Cambiar un precio vale para las inscripciones nuevas; las ya hechas conservan el suyo.</p>
          )
        }
      >
        {lista.error && !lista.datos ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
        ) : lista.cargando && !lista.datos ? (
          <Cargando />
        ) : visibles.length === 0 ? (
          <Vacio
            icono="birrete"
            titulo={filtro === "todos" ? `Todavía no hay ${p.carreras}` : `Ningún ${p.carrera} acá`}
            texto={filtro === "todos" ? `Cargá el primero con sus ${p.materias} y su precio.` : undefined}
            accion={filtro === "todos" ? <Boton onClick={() => setElegida("nueva")}>Nuevo {p.carrera}</Boton> : undefined}
          />
        ) : (
          <>
            <div className={`hidden ${COLUMNAS} gap-3 py-2.5 pl-5 pr-5 md:grid ${TABLA.encabezado}`}>
              <span>{p.Carrera}</span>
              <span className="text-right">{p.Materias}</span>
              <span className="text-right">Por {p.materia}</span>
              <span className="text-right">Pago completo</span>
              <span className="text-right">{p.Docente}</span>
              <span className="text-right">Grupos</span>
              <span />
            </div>
            <ul className={`${LISTA.lista} border-t border-borde-soft md:border-t-0`}>
              {visibles.map((c) => (
                <FilaCurso key={c.id} curso={c} pctInstituto={pctInstituto} elegido={actual?.id === c.id} onAbrir={() => setElegida(c.id)} />
              ))}
            </ul>
          </>
        )}
      </Tarjeta>

      {panelAbierto && (
        <PanelCurso
          key={actual?.id ?? "nueva"}
          curso={actual}
          pctInstituto={pctInstituto}
          pagina={ajustes.datos ? { publicada: ajustes.datos.paginaPublicada, recibe: ajustes.datos.preinscripcionActiva } : null}
          onCerrar={() => setElegida(null)}
          onGuardado={(c, nuevo) => {
            actualizar(c);
            // «Primeros pasos» (el curso con módulos y precio) se marca sola sin salir de acá (ronda 2, R3).
            avisarPrimerosPasos();
            // En el celular la hoja se cierra al guardar: el aviso («Curso creado»
            // con «Abrir el primer grupo») quedaba detrás de ella. En escritorio el
            // panel no tapa nada y el curso sigue a la vista.
            setElegida(celular ? null : c.id);
            // Con permiso para abrir grupos, el aviso del curso nuevo lleva su botón.
            if (nuevo && abreGrupos) {
              setAviso("");
              setRecienCreado(c);
            } else {
              setRecienCreado(null);
              setAviso(nuevo ? `${p.Carrera} creado.` : "Cambios guardados.");
            }
          }}
          // El editor de planes a medida es grande (cuotas, vencimientos): no
          // entra en el panel. Se pasa de uno al otro, nunca los dos a la vez
          // (en el celular eran dos hojas, una encima de la otra).
          onAvanzadas={
            actual
              ? () => {
                  setElegida(null);
                  setAvanzadas(actual.id);
                }
              : undefined
          }
        />
      )}

      {enAvanzadas && (
        <Modal
          abierto
          titulo={`Opciones avanzadas · ${enAvanzadas.nombre}`}
          subtitulo="Horas, categoría y planes a medida"
          // Al cerrar se vuelve al panel del curso, de donde se vino.
          onClose={() => {
            setAvanzadas(null);
            setElegida(enAvanzadas.id);
          }}
          ancho="max-w-4xl"
          cerrarAlClicAfuera={false}
        >
          <DetalleCarrera
            carrera={enAvanzadas}
            onCambio={actualizar}
            onRecargar={() => void recargarUna(enAvanzadas.id)}
            onAviso={setAviso}
          />
        </Modal>
      )}
    </PaginaAcademia>
  );
}

/**
 * Cómo se le paga al docente en el curso. Con el modo, ése; si un backend no
 * lo manda pero sí el monto, es monto fijo (QA 23-oct: la lista decía "20 %"
 * en un curso de Bs 90 fijos).
 */
function modoDocenteDe(c: Carrera): PagoDocenteModo {
  return c.pagoDocenteModo ?? (c.montoDocente != null ? "MONTO" : "PORCENTAJE");
}

/** Cuántos módulos activos tiene el curso: el precio mes a mes es eso por el precio de cada uno. */
function modulosActivos(c: Carrera): number {
  return c.materias.filter((m) => m.activa).length;
}

/**
 * Dos opciones excluyentes como un control segmentado: el pago completo por %
 * o por precio final (A4) y el pago al docente (A5). Alto de pulgar en el
 * celular, y el texto parte en dos renglones si no entra.
 */
function Segmentos<T extends string>({
  etiqueta,
  valor,
  opciones,
  onChange,
}: {
  etiqueta: string;
  valor: T;
  opciones: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
      {opciones.map(([k, label]) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={valor === k}
          onClick={() => onChange(k)}
          className={`min-h-11 rounded-lg px-2.5 py-1.5 text-center text-[13px] font-semibold leading-tight transition-colors sm:min-h-9 ${
            valor === k ? "bg-white text-texto shadow-sm ring-1 ring-borde" : "text-texto-3 hover:text-texto"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Las columnas de la lista en escritorio: el encabezado y cada fila las comparten. */
const COLUMNAS = "md:grid-cols-[minmax(0,2fr)_72px_100px_minmax(0,1fr)_minmax(0,1fr)_56px_36px]";

function FilaCurso({
  curso: c,
  pctInstituto,
  elegido,
  onAbrir,
}: {
  curso: Carrera;
  pctInstituto: number;
  elegido: boolean;
  onAbrir: () => void;
}) {
  const p = usePalabras();
  const modulos = [...c.materias].filter((m) => m.activa).sort((a, b) => a.orden - b.orden);
  const completo =
    c.precioCompletoEfectivo ?? c.planes.find((pl) => pl.activo && pl.generado === "COMPLETO")?.total ?? c.precioCompleto ?? null;
  // A4: con precio final, el % es el que equivale (lo calcula el backend; si no vino, acá).
  const pctCompleto =
    c.precioCompletoFijo != null
      ? (c.descuentoCompletoEquivalentePct ?? descuentoEquivalente((c.precioModulo ?? 0) * modulosActivos(c), c.precioCompletoFijo))
      : c.descuentoCompletoPct;
  const montoFijo = modoDocenteDe(c) === "MONTO";
  const aMedida = c.planes.some((pl) => pl.activo && !pl.generado);
  const pct = c.pctDocente ?? pctInstituto;
  const sub = [modulos.map((m) => m.nombre).join(" · "), aMedida ? "con planes a medida" : ""].filter(Boolean).join(" · ");
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Editar ${c.nombre}`}
        aria-current={elegido ? "true" : undefined}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 px-4 py-3.5 text-left transition-colors sm:px-5 ${COLUMNAS} md:items-center ${
          elegido ? "bg-primary-50" : "hover:bg-muted"
        }`}
      >
        <span className="min-w-0">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-texto">{c.nombre}</span>
            {!c.activa ? (
              <Chip tono="gris">Retirado</Chip>
            ) : c.publicarEnPagina ? (
              <Chip tono="verde">En la página</Chip>
            ) : (
              <Chip tono="ambar">Sin publicar en la página</Chip>
            )}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-texto-3">{sub || `Sin ${p.materias}`}</span>
        </span>
        <span className={`text-right text-sm text-texto-2 ${TABLA.numero}`}>
          {modulos.length}
          <span className="md:hidden"> {p.materias}</span>
        </span>
        <span className="text-sm tabular-nums text-texto-2 md:text-right">
          {c.precioModulo != null ? fmtMoney(c.precioModulo) : "—"}
          <span className="md:hidden"> por {p.materia}</span>
        </span>
        <span className="min-w-0 text-right">
          <span className="block text-sm font-semibold tabular-nums text-texto">{completo != null ? fmtMoney(completo) : "—"}</span>
          {pctCompleto != null && (
            <span className="block text-[12px] text-texto-3">
              {textoPct(pctCompleto)} % menos{c.precioCompletoFijo != null ? " · precio final" : ""}
            </span>
          )}
        </span>
        <span className="min-w-0 md:text-right">
          {montoFijo ? (
            <>
              <span className="block text-sm tabular-nums text-texto-2">{fmtMoney(c.montoDocente ?? 0)} fijo</span>
              <span className="block text-[12px] text-texto-3">por {p.alumno} y {p.materia}</span>
            </>
          ) : (
            <>
              <span className="block text-sm tabular-nums text-texto-2">{pct} %</span>
              <span className="block text-[12px] text-texto-3">{c.pctDocente == null ? "del instituto" : `propio del ${p.carrera}`}</span>
            </>
          )}
        </span>
        <span className={`text-right text-sm text-texto-2 ${TABLA.numero}`}>
          {c.gruposActivos}
          <span className="md:hidden"> {c.gruposActivos === 1 ? "grupo" : "grupos"}</span>
        </span>
        {/* El renglón entero abre el panel; el chevron lo dice a la vista. */}
        <span
          aria-hidden="true"
          className="hidden h-8 w-8 items-center justify-center justify-self-end rounded-lg border border-borde bg-white text-texto-3 md:flex"
        >
          <Icon name="chevronRight" size={16} />
        </span>
      </button>
    </li>
  );
}

/**
 * El panel del curso en modo simple. Guarda todo junto (el PUT de modo
 * simple): el servidor sincroniza los módulos (crea, renombra, reordena,
 * desactiva) y los dos planes generados, sin tocar los planes a medida ni las
 * inscripciones.
 */
function PanelCurso({
  curso,
  pctInstituto,
  pagina,
  onCerrar,
  onGuardado,
  onAvanzadas,
}: {
  curso: Carrera | null;
  pctInstituto: number;
  /** C7: si la página está publicada y si recibe inscripciones; `null` = Ajustes no cargó. */
  pagina: { publicada?: boolean; recibe: boolean } | null;
  onCerrar: () => void;
  onGuardado: (c: Carrera, nuevo: boolean) => void;
  onAvanzadas?: () => void;
}) {
  const p = usePalabras();
  const { negocio } = useAuth();
  const nuevo = !curso;
  const [nombre, setNombre] = useState(curso?.nombre ?? "");
  const [modulos, setModulos] = useState<{ id?: number; nombre: string }[]>(() =>
    curso
      ? [...curso.materias].filter((m) => m.activa).sort((a, b) => a.orden - b.orden).map((m) => ({ id: m.id, nombre: m.nombre }))
      : [{ nombre: `${conMayuscula(p.materia)} 1` }],
  );
  const [precio, setPrecio] = useState(curso?.precioModulo != null ? String(curso.precioModulo) : "");
  // L3 (28-oct): el curso nuevo arranca sin descuento. Nacía con 10 % y así
  // quedaba el de Tatuaje en QA (Bs 1.350) cuando el instituto cobra Bs 1.300.
  const [desc, setDesc] = useState(curso?.descuentoCompletoPct != null ? String(curso.descuentoCompletoPct) : "");
  const [cupo, setCupo] = useState(curso?.cupoDefecto != null ? String(curso.cupoDefecto) : nuevo ? "20" : "");
  const [pct, setPct] = useState(curso?.pctDocente != null ? String(curso.pctDocente) : "");
  // A4: el pago completo por % (como siempre) o por precio final.
  const [modoCompleto, setModoCompleto] = useState<"PCT" | "PRECIO">(curso?.precioCompletoFijo != null ? "PRECIO" : "PCT");
  const [precioFinal, setPrecioFinal] = useState(curso?.precioCompletoFijo != null ? String(curso.precioCompletoFijo) : "");
  // A5: al docente, un % de lo que paga cada estudiante o un monto fijo por módulo pagado.
  const [modoDocente, setModoDocente] = useState<PagoDocenteModo>(curso ? modoDocenteDe(curso) : "PORCENTAJE");
  const [montoDoc, setMontoDoc] = useState(curso?.montoDocente != null ? String(curso.montoDocente) : "");
  const [publicar, setPublicar] = useState(curso?.publicarEnPagina ?? false);
  const [verAvanzadas, setVerAvanzadas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  /**
   * Hay algo tecleado sin guardar. Las opciones avanzadas reemplazan a este
   * panel (no se abren encima): ir con cambios pendientes los perdería.
   */
  const firma = JSON.stringify([nombre, modulos, precio, desc, cupo, pct, modoCompleto, precioFinal, modoDocente, montoDoc, publicar]);
  const [firmaInicial, setFirmaInicial] = useState(firma);
  const sucio = firma !== firmaInicial;

  const n = modulos.length;
  const nPrecio = Number(precio) || 0;
  const nDesc = Number(desc) || 0;
  const pctEf = pct.trim() === "" ? pctInstituto : Number(pct) || 0;
  const conPrecioFinal = modoCompleto === "PRECIO";
  const nFinal = Number(precioFinal) || 0;
  const nMontoDoc = Number(montoDoc) || 0;
  const lista = nPrecio * n;
  const precioFinalOk = nFinal > 0 && nFinal <= lista + 0.005;
  const equivalente = descuentoEquivalente(lista, nFinal);
  const cuenta = precioCurso(nPrecio, n, nDesc, conPrecioFinal && precioFinalOk ? nFinal : null);
  /**
   * Con "Precio final" y el campo vacío (o mal) el pago completo todavía no
   * tiene precio: "—", no el del % anterior (QA 23-oct).
   */
  const completoPendiente = conPrecioFinal && !precioFinalOk;
  // El error de guardar era de lo que se mandó: al corregir cualquier campo se
  // va, no queda pegado en rojo (QA 23-oct).
  useEffect(() => {
    setError("");
  }, [nombre, modulos, precio, desc, cupo, pct, modoCompleto, precioFinal, modoDocente, montoDoc, publicar]);

  async function guardar() {
    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!n || modulos.some((m) => !m.nombre.trim())) return setError(`Cada ${p.materia} necesita un nombre.`);
    if (!(nPrecio > 0)) return setError(`Poné el precio por ${p.materia}.`);
    if (!conPrecioFinal && (nDesc < 0 || nDesc > 50)) return setError("El descuento por pago completo va de 0 a 50 %.");
    if (conPrecioFinal && !precioFinalOk)
      return setError(`El precio final va de más de Bs 0 hasta ${fmtMoney(lista)}, que es lo que cuesta mes a mes.`);
    if (pct.trim() !== "" && (pctEf < 0 || pctEf > 100)) return setError(`El % del ${p.docente} va de 0 a 100.`);
    if (modoDocente === "MONTO" && !(nMontoDoc > 0)) return setError(`Poné cuánto cobra el ${p.docente} por ${p.alumno} y ${p.materia}.`);
    setGuardando(true);
    setError("");
    const input: CarreraSimpleInput = {
      nombre: nombre.trim(),
      modulos: modulos.map((m) => (m.id ? { id: m.id, nombre: m.nombre.trim() } : { nombre: m.nombre.trim() })),
      precioModulo: nPrecio,
      // Con precio final va también el % que equivale (dentro del rango de
      // siempre): el backend lo pone en null, y uno anterior sin el campo
      // nuevo cobra al menos algo parecido.
      descuentoCompletoPct: conPrecioFinal ? Math.min(50, Math.max(0, equivalente)) : nDesc,
      cupoDefecto: cupo.trim() === "" ? null : Number(cupo),
      pctDocente: pct.trim() === "" ? null : pctEf,
      publicarEnPagina: publicar,
      // Los campos nuevos viajan sólo cuando dicen algo (o hay que limpiarlos):
      // un curso que sigue con el % no le manda nada nuevo al backend.
      ...(conPrecioFinal
        ? { precioCompletoFijo: nFinal }
        : curso?.precioCompletoFijo != null
          ? { precioCompletoFijo: null }
          : {}),
      ...(modoDocente === "MONTO"
        ? { pagoDocenteModo: "MONTO" as const, montoDocente: nMontoDoc }
        : curso && modoDocenteDe(curso) === "MONTO"
          ? { pagoDocenteModo: "PORCENTAJE" as const, montoDocente: null }
          : {}),
    };
    try {
      const c = curso ? await apiAcademia.editarCarreraSimple(curso.id, input) : await apiAcademia.crearCarreraSimple(input);
      // Lo guardado ya no está pendiente (el panel sigue abierto con lo mismo).
      setFirmaInicial(firma);
      onGuardado(c, nuevo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelLateral
      abierto
      titulo={nuevo ? `Nuevo ${p.carrera}` : nombre || p.Carrera}
      subtitulo={
        curso
          ? `${curso.gruposActivos} ${curso.gruposActivos === 1 ? "grupo activo" : "grupos activos"}`
          : "Se configura una vez; los grupos se abren desde el calendario."
      }
      onClose={onCerrar}
      // El formulario más largo del instituto (módulos, precios): un toque fuera no lo borra.
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : nuevo ? `Crear ${p.carrera}` : "Guardar cambios"}
          </Boton>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
        </>
      }
    >
      <div>
        <SeccionPanel titulo={p.Carrera}>
          <Campo label="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Barbería" />
          </Campo>
        </SeccionPanel>

        <SeccionPanel titulo={`${p.Materias}, en orden`}>
          <ol className="space-y-2">
            {modulos.map((m, i) => (
              <li key={m.id ?? `nuevo-${i}`} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-bold tabular-nums text-primary-700"
                >
                  {i + 1}
                </span>
                <label className="min-w-0 flex-1">
                  <span className="sr-only">
                    Nombre del {p.materia} {i + 1}
                  </span>
                  <Input
                    value={m.nombre}
                    onChange={(e) => setModulos(modulos.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))}
                  />
                </label>
                <BotonIcono
                  icono="trash"
                  etiqueta={`Quitar el ${p.materia} ${i + 1}`}
                  onClick={() => setModulos(modulos.filter((_, j) => j !== i))}
                  disabled={modulos.length === 1}
                />
              </li>
            ))}
          </ol>
          <BotonFila
            icono="plus"
            className="mt-3"
            onClick={() => setModulos([...modulos, { nombre: `${conMayuscula(p.materia)} ${modulos.length + 1}` }])}
          >
            Agregar {p.materia}
          </BotonFila>
        </SeccionPanel>

        <SeccionPanel titulo="Precio y cupo">
          <div className="grid grid-cols-2 gap-3">
            <Campo label={`Precio por ${p.materia} (Bs)`}>
              <Input type="number" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="0" />
            </Campo>
            <Campo label="Cupo por grupo">
              <Input type="number" inputMode="numeric" value={cupo} onChange={(e) => setCupo(e.target.value)} />
            </Campo>
          </div>
        </SeccionPanel>

        {/* A4: Derick cobra "Bs 1.300 al contado": con el % hacía falta un 13,33. */}
        <SeccionPanel titulo="Descuento por pago completo">
          <Segmentos<"PCT" | "PRECIO">
            etiqueta="Descuento por pago completo"
            valor={modoCompleto}
            onChange={setModoCompleto}
            opciones={[
              ["PCT", "Porcentaje"],
              ["PRECIO", "Precio final"],
            ]}
          />
          <div className="mt-3">
            {conPrecioFinal ? (
              <Campo label="Precio final del pago completo (Bs)">
                <Input type="number" value={precioFinal} onChange={(e) => setPrecioFinal(e.target.value)} placeholder={lista > 0 ? String(lista) : "0"} />
              </Campo>
            ) : (
              <Campo label="Descuento (%)">
                <Input type="number" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="0" />
              </Campo>
            )}
          </div>
          {!conPrecioFinal && nDesc === 0 && (
            <p className="mt-2 text-xs text-texto-3">
              Sin descuento: el pago completo cuesta lo mismo que mes a mes. Poné el % o elegí «Precio final».
            </p>
          )}
          {conPrecioFinal && lista > 0 && (
            <p className={`mt-2 text-xs ${precioFinal.trim() === "" || precioFinalOk ? "text-texto-3" : "text-danger-text"}`}>
              {precioFinal.trim() === ""
                ? `Mes a mes cuesta ${fmtMoney(lista)}.`
                : precioFinalOk
                  ? `Equivale a ${textoPct(equivalente)} % de descuento (regular ${fmtMoney(lista)}).`
                  : `Tiene que ser más de Bs 0 y hasta ${fmtMoney(lista)}.`}
            </p>
          )}
        </SeccionPanel>

        {/* A5: el % del docente no se entendía; ahora también un monto fijo, con la frase de cómo se paga. */}
        <SeccionPanel titulo={`Pago al ${p.docente}`}>
          <Segmentos<PagoDocenteModo>
            etiqueta={`Pago al ${p.docente}`}
            valor={modoDocente}
            onChange={setModoDocente}
            opciones={[
              ["PORCENTAJE", `% de lo que paga cada ${p.alumno}`],
              ["MONTO", `Monto fijo por ${p.alumno} y ${p.materia}`],
            ]}
          />
          <div className="mt-3">
            {modoDocente === "MONTO" ? (
              <Campo label={`Bs por ${p.alumno} y ${p.materia} pagado`}>
                <Input type="number" value={montoDoc} onChange={(e) => setMontoDoc(e.target.value)} placeholder="0" />
              </Campo>
            ) : (
              <>
                <Campo label={`% para el ${p.docente}`}>
                  <Input type="number" value={pct} onChange={(e) => setPct(e.target.value)} placeholder={String(pctInstituto)} />
                </Campo>
                <p className="mt-2 text-xs text-texto-4">El instituto paga {pctInstituto} %; dejalo vacío para usar ese. Este porcentaje manda sobre el de Ajustes.</p>
              </>
            )}
          </div>
          <p className="mt-2 text-[13px] text-texto-2" data-testid="frase-docente">
            {textoPagoDocente(modoDocente, pctEf, nMontoDoc, p)}
          </p>
        </SeccionPanel>

        <SeccionPanel titulo="Página">
          <div className="-my-3">
            <Interruptor
              activo={publicar}
              onCambiar={setPublicar}
              etiqueta="Publicar en la página"
              detalle={publicar ? "Se puede inscribir desde la página del instituto" : "Sólo se inscribe en el mostrador"}
            />
          </div>
          {/* C7: publicar el curso no alcanza si la página no está publicada o no recibe inscripciones. */}
          {publicar && tieneFeature(negocio?.features, "preinscripcion_online") && pagina && (pagina.publicada === false || !pagina.recibe) && (
            <p role="note" className="mt-3 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
              {pagina.publicada === false
                ? "Tu página todavía no está publicada: nadie va a ver este curso. "
                : "La página no está recibiendo inscripciones: este curso no se va a poder pedir. "}
              <Link to={pagina.publicada === false ? "/mi-pagina" : "/configuracion/academia#s-insc"} className="font-semibold underline">
                {pagina.publicada === false ? "Publicar Mi página" : "Activarlo en Ajustes"}
              </Link>
            </p>
          )}
          {/* B9: el enlace de cada grupo de este curso, para WhatsApp y redes. */}
          {curso && tieneFeature(negocio?.features, "preinscripcion_online") && (
            <div className="mt-3">
              <BotonCompartirInscripcion carreraId={curso.id} enLinea />
            </div>
          )}
        </SeccionPanel>

        <section aria-label="Así se ofrece" className="border-t border-borde-soft py-4">
          <ResumenPanel>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-texto-4">Así se ofrece</p>
            {nPrecio > 0 && n > 0 ? (
              <>
                <dl className="mt-2.5 space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-texto-2">Mes a mes</dt>
                    <dd className="text-right tabular-nums text-texto">
                      <span className="font-semibold">{fmtMoney(nPrecio)}</span> por {p.materia} ({n} {n === 1 ? "cuota" : "cuotas"})
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="shrink-0 text-texto-2">Pago completo</dt>
                    <dd className="text-right tabular-nums text-texto">
                      {completoPendiente ? (
                        <span className="text-texto-4">—</span>
                      ) : (
                        <>
                      <span className="font-semibold">{fmtMoney(cuenta.completo)}</span> ·{" "}
                      {cuenta.ahorro > 0 ? (
                        <span className="text-primary-700">ahorra {fmtMoney(cuenta.ahorro)}</span>
                      ) : (
                        "sin descuento"
                      )}
                        </>
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-borde pt-2.5 text-[13px] text-texto-3">
                  {modoDocente === "MONTO" ? (
                    <>
                      Al {p.docente}: {fmtMoney(nMontoDoc)} por {p.alumno} y {p.materia} pagado, pague mes a mes o completo
                    </>
                  ) : (
                    <>
                      Al {p.docente}: {fmtMoney((nPrecio * pctEf) / 100)} por {p.alumno} y {p.materia} pagado ({pctEf} %); con pago
                      completo{" "}
                      {completoPendiente
                        ? "—"
                        : `${fmtMoney((cuenta.porModuloCompleto * pctEf) / 100)} (${pctEf} % de ${fmtMoney(cuenta.porModuloCompleto)})`}
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-texto-3">Poné el precio por {p.materia} para ver cómo se ofrece.</p>
            )}
          </ResumenPanel>
        </section>

        {onAvanzadas && (
          <div className="border-t border-borde-soft pt-3">
            <button
              type="button"
              onClick={() => setVerAvanzadas((v) => !v)}
              aria-expanded={verAvanzadas}
              className="flex min-h-11 w-full items-center justify-between rounded-lg text-sm font-semibold text-texto-2 hover:text-texto sm:min-h-9"
            >
              Opciones avanzadas
              <Icon name="chevronDown" size={16} className={verAvanzadas ? "rotate-180" : ""} />
            </button>
            {verAvanzadas && (
              <div className="mt-2 space-y-3 text-[13px] text-texto-3">
                <p>
                  Para planes que no sean mes a mes ni pago completo: cuotas que cubren varios {p.materias}, vencimientos
                  distintos o promociones. Los dos planes de arriba se arman solos con estos datos.
                </p>
                <BotonFila variante="ghost" icono="edit" onClick={onAvanzadas} disabled={sucio}>
                  Editar planes a medida
                </BotonFila>
                {sucio && <p className="text-warning-text">Guardá los cambios de arriba antes: los planes a medida se editan aparte.</p>}
              </div>
            )}
          </div>
        )}
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </PanelLateral>
  );
}

function DetalleCarrera({
  carrera,
  onCambio,
  onRecargar,
  onAviso,
}: {
  carrera: Carrera;
  onCambio: (c: Carrera) => void;
  onRecargar: () => void;
  onAviso: (t: string) => void;
}) {
  const p = usePalabras();
  const [datos, setDatos] = useState({
    nombre: carrera.nombre,
    horasTotales: String(carrera.horasTotales),
    categoriaCctp: (carrera.categoriaCctp ?? "") as "" | CategoriaCctp,
    descripcion: carrera.descripcion ?? "",
    publicarEnPagina: carrera.publicarEnPagina,
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [nuevoPlan, setNuevoPlan] = useState(false);

  const materias = [...carrera.materias].sort((a, b) => a.orden - b.orden);
  const sucio =
    datos.nombre !== carrera.nombre ||
    Number(datos.horasTotales) !== carrera.horasTotales ||
    (datos.categoriaCctp || null) !== carrera.categoriaCctp ||
    (datos.descripcion.trim() || null) !== (carrera.descripcion ?? null) ||
    datos.publicarEnPagina !== carrera.publicarEnPagina;

  async function guardar(extra: { activa?: boolean } = {}) {
    if (!datos.nombre.trim()) return setError("Falta el nombre.");
    if (!(Number(datos.horasTotales) > 0)) return setError("Las horas totales tienen que ser más que cero.");
    setGuardando(true);
    setError("");
    try {
      const c = await apiAcademia.editarCarrera(carrera.id, {
        nombre: datos.nombre.trim(),
        horasTotales: Number(datos.horasTotales),
        categoriaCctp: datos.categoriaCctp || null,
        descripcion: datos.descripcion.trim() || null,
        publicarEnPagina: datos.publicarEnPagina,
        ...extra,
      });
      onCambio(c);
      onAviso(extra.activa === false ? `${p.Carrera} retirada.` : extra.activa ? `${p.Carrera} reactivada.` : "Cambios guardados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-w-0 space-y-6 [&>section+section]:border-t [&>section+section]:border-borde-soft [&>section+section]:pt-6">
      <section className="space-y-3" aria-label={`Datos ${deLa(p.carrera)}`}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)]">
          <Campo label={`Nombre ${deLa(p.carrera)}`}>
            <Input value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          </Campo>
          <Campo label="Horas totales">
            <Input type="number" inputMode="numeric" value={datos.horasTotales} onChange={(e) => setDatos({ ...datos, horasTotales: e.target.value })} />
          </Campo>
          <Campo label="Categoría (CCTP)">
            <Select value={datos.categoriaCctp} onChange={(e) => setDatos({ ...datos, categoriaCctp: e.target.value as "" | CategoriaCctp })}>
              <option value="">Sin categoría</option>
              <option value="A">A · 20 a 80 h</option>
              <option value="B">B · 80 a 400 h</option>
            </Select>
          </Campo>
        </div>
        <Campo label="Descripción (para la página)">
          <textarea
            rows={2}
            value={datos.descripcion}
            onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })}
            className="w-full resize-y rounded-xl border border-borde bg-white px-3.5 py-2.5 text-sm text-texto outline-none focus:border-primary focus:ring-2 focus:ring-primary-100"
          />
        </Campo>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-primary-boton)]"
              checked={datos.publicarEnPagina}
              onChange={(e) => setDatos({ ...datos, publicarEnPagina: e.target.checked })}
            />
            Mostrar en la página
          </label>
          <div className="flex gap-2">
            <Boton variante="ghost" disabled={guardando} onClick={() => void guardar({ activa: !carrera.activa })}>
              {carrera.activa ? "Retirar" : "Reactivar"}
            </Boton>
            <Boton disabled={!sucio || guardando} onClick={() => void guardar()}>
              {guardando ? "Guardando…" : "Guardar"}
            </Boton>
          </div>
        </div>
        <ErrorMsg>{error}</ErrorMsg>
      </section>

      <Materias carrera={carrera} materias={materias} onCambio={onRecargar} />

      <section className="space-y-3" aria-label="Planes de pago">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-texto">Planes de pago</h2>
          <Boton variante="ghost" icono="plus" onClick={() => setNuevoPlan(true)} disabled={!materias.some((m) => m.activa)}>
            Agregar plan
          </Boton>
        </div>
        {!materias.some((m) => m.activa) && <p className="text-sm text-texto-3">Primero cargá las {p.materias}: cada cuota cubre alguna.</p>}
        {nuevoPlan && (
          <EditorPlan
            carreraId={carrera.id}
            materias={materias}
            referencia={masBarato(carrera.planes)}
            onCancelar={() => setNuevoPlan(false)}
            onGuardado={() => {
              setNuevoPlan(false);
              onRecargar();
              onAviso("Plan creado.");
            }}
          />
        )}
        {[...carrera.planes]
          .sort((a, b) => a.orden - b.orden)
          .map((pl) => (
            <EditorPlan
              key={pl.id}
              carreraId={carrera.id}
              plan={pl}
              materias={materias}
              referencia={masBarato(carrera.planes.filter((x) => x.id !== pl.id))}
              onGuardado={() => {
                onRecargar();
                onAviso("Plan guardado.");
              }}
            />
          ))}
        {carrera.planes.length === 0 && !nuevoPlan && <p className="text-sm text-texto-3">Sin planes todavía.</p>}
      </section>
    </div>
  );
}

function masBarato(planes: PlanPago[]): PlanPago | null {
  const activos = planes.filter((x) => x.activo);
  return activos.length ? activos.reduce((a, b) => (b.total < a.total ? b : a)) : null;
}

/** Las materias en orden, con ↑ ↓ para reordenarlas (todas o ninguna, como el backend). */
function Materias({ carrera, materias, onCambio }: { carrera: Carrera; materias: Materia[]; onCambio: () => void }) {
  const p = usePalabras();
  const [nueva, setNueva] = useState({ nombre: "", horas: "" });
  const [editando, setEditando] = useState<number | null>(null);
  const [borrador, setBorrador] = useState({ nombre: "", horas: "" });
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const activas = materias.filter((m) => m.activa);
  const suma = activas.reduce((s, m) => s + m.horas, 0);

  async function hacer(fn: () => Promise<unknown>) {
    setOcupado(true);
    setError("");
    try {
      await fn();
      onCambio();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setOcupado(false);
    }
  }

  const mover = (i: number, d: -1 | 1) => {
    const ids = materias.map((m) => m.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void hacer(() => apiAcademia.ordenarMaterias(carrera.id, ids));
  };

  return (
    <section className="space-y-3" aria-label={p.Materias}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-texto">{p.Materias}</h2>
        {activas.length > 0 && (
          <span className={`text-[13px] ${suma === carrera.horasTotales ? "text-texto-3" : "font-semibold text-warning-text"}`}>
            Suman {suma} h{suma === carrera.horasTotales ? " ✓" : ` de ${carrera.horasTotales}`}
          </span>
        )}
      </div>
      <ul className="divide-y divide-borde-soft border-y border-borde-soft">
        {materias.map((m, i) => (
          <li key={m.id} className={`flex flex-wrap items-center gap-2 py-2.5 ${m.activa ? "" : "opacity-50"}`}>
            <span className="w-9 text-sm font-semibold tabular-nums text-texto-3">M{m.orden}</span>
            {editando === m.id ? (
              <>
                <div className="min-w-0 flex-1 basis-40">
                  <Input aria-label="Nombre" value={borrador.nombre} onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })} />
                </div>
                <div className="w-24">
                  <Input aria-label="Horas" type="number" value={borrador.horas} onChange={(e) => setBorrador({ ...borrador, horas: e.target.value })} />
                </div>
                <Boton
                  disabled={ocupado}
                  onClick={() =>
                    void hacer(async () => {
                      await apiAcademia.editarMateria(m.id, { nombre: borrador.nombre.trim(), horas: Number(borrador.horas) });
                      setEditando(null);
                    })
                  }
                >
                  Guardar
                </Boton>
                <Boton variante="ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </Boton>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-texto">{m.nombre}</span>
                <span className="text-sm tabular-nums text-texto-3">{m.horas} h</span>
                <span className="flex items-center gap-1.5">
                  <BotonIcono etiqueta={`Subir M${m.orden}`} icono="arrowUp" disabled={ocupado || i === 0} onClick={() => mover(i, -1)} />
                  <BotonIcono etiqueta={`Bajar M${m.orden}`} icono="arrowDown" disabled={ocupado || i === materias.length - 1} onClick={() => mover(i, 1)} />
                  <BotonIcono
                    etiqueta={`Editar M${m.orden}`}
                    icono="edit"
                    onClick={() => {
                      setEditando(m.id);
                      setBorrador({ nombre: m.nombre, horas: String(m.horas) });
                    }}
                  />
                  <BotonFila
                    variante="ghost"
                    disabled={ocupado}
                    onClick={() => void hacer(() => apiAcademia.editarMateria(m.id, { activa: !m.activa }))}
                  >
                    {m.activa ? "Retirar" : "Reactivar"}
                  </BotonFila>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!nueva.nombre.trim() || !(Number(nueva.horas) > 0)) return setError(`La ${p.materia} necesita nombre y horas.`);
          void hacer(async () => {
            await apiAcademia.crearMateria(carrera.id, { nombre: nueva.nombre.trim(), horas: Number(nueva.horas) });
            setNueva({ nombre: "", horas: "" });
          });
        }}
      >
        <div className="min-w-0 flex-1 basis-48">
          <Campo label={`Nueva ${p.materia}`}>
            <Input value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" />
          </Campo>
        </div>
        <div className="w-24">
          <Campo label="Horas">
            <Input type="number" inputMode="numeric" value={nueva.horas} onChange={(e) => setNueva({ ...nueva, horas: e.target.value })} />
          </Campo>
        </div>
        <Boton type="submit" variante="soft" icono="plus" disabled={ocupado}>
          Agregar
        </Boton>
      </form>
      <ErrorMsg>{error}</ErrorMsg>
    </section>
  );
}

/** Las formas de arrancar un plan nuevo: un pago, por materia o en cuotas. */
function calendarioBase(forma: "unico" | "materia" | "cuotas", materias: Materia[]): CuotaPlan[] {
  const activas = materias.filter((m) => m.activa).map((m) => m.orden);
  if (forma === "unico" || activas.length < 2) {
    return [{ n: 1, monto: 0, vence: { tipo: "INSCRIPCION" }, cubre: activas }];
  }
  if (forma === "materia") {
    return activas.map((orden, i) => ({
      n: i + 1,
      monto: 0,
      vence: i === 0 ? { tipo: "INSCRIPCION" } : { tipo: "INICIO_MATERIA", materiaOrden: orden },
      cubre: [orden],
    }));
  }
  // Dos cuotas: la primera materia al inscribirse y el resto al empezar la segunda.
  return [
    { n: 1, monto: 0, vence: { tipo: "INSCRIPCION" }, cubre: [activas[0]] },
    { n: 2, monto: 0, vence: { tipo: "INICIO_MATERIA", materiaOrden: activas[1] }, cubre: activas.slice(1) },
  ];
}

/**
 * El editor de un plan: nombre, el calendario (una fila por cuota: monto,
 * cuándo vence y qué materias cubre) y la base del docente por materia. El
 * total se calcula; si cuesta más que el plan más barato, se dice cuánto.
 */
function EditorPlan({
  carreraId,
  plan,
  materias,
  referencia,
  onGuardado,
  onCancelar,
}: {
  carreraId: number;
  plan?: PlanPago;
  materias: Materia[];
  referencia: PlanPago | null;
  onGuardado: () => void;
  onCancelar?: () => void;
}) {
  const p = usePalabras();
  const nuevo = !plan;
  const [abierto, setAbierto] = useState(nuevo);
  const [nombre, setNombre] = useState(plan?.nombre ?? "");
  const [cuotas, setCuotas] = useState<CuotaPlan[]>(plan?.calendario ?? calendarioBase("unico", materias));
  const [base, setBase] = useState<Record<string, number>>(plan?.baseDocente ?? {});
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<string[]>([]);
  useEffect(() => {
    if (plan) {
      setCuotas(plan.calendario);
      setBase(plan.baseDocente);
      setNombre(plan.nombre);
    }
  }, [plan]);

  const activas = materias.filter((m) => m.activa);
  const total = totalCalendario(cuotas);
  const diferencia = referencia && total > referencia.total ? total - referencia.total : 0;

  const cambiarCuota = (i: number, c: Partial<CuotaPlan>) => setCuotas(cuotas.map((x, j) => (j === i ? { ...x, ...c } : x)));
  const alternarCubre = (i: number, orden: number) => {
    const c = cuotas[i];
    cambiarCuota(i, { cubre: c.cubre.includes(orden) ? c.cubre.filter((o) => o !== orden) : [...c.cubre, orden].sort((a, b) => a - b) });
  };

  async function guardar(extra: { activo?: boolean } = {}) {
    if (!nombre.trim()) return setErrores(["El plan necesita un nombre."]);
    const problemas = extra.activo === false ? [] : problemasDelPlan(cuotas, materias, p.materias);
    if (problemas.length) return setErrores(problemas);
    setGuardando(true);
    setErrores([]);
    const calendario = cuotas.map((c, i) => ({ ...c, n: i + 1, monto: Number(c.monto) }));
    try {
      if (plan) await apiAcademia.editarPlan(plan.id, { nombre: nombre.trim(), calendario, baseDocente: base, ...extra });
      else await apiAcademia.crearPlan(carreraId, { nombre: nombre.trim(), calendario, baseDocente: base });
      if (!nuevo) setAbierto(false);
      onGuardado();
    } catch (e) {
      if (e instanceof ApiError && e.codigo === CODIGOS_ACADEMIA.PLAN_INVALIDO && Array.isArray(e.detalle.detalles)) {
        setErrores(e.detalle.detalles as string[]);
      } else {
        setErrores([e instanceof Error ? e.message : "No se pudo guardar el plan"]);
      }
    } finally {
      setGuardando(false);
    }
  }

  if (!abierto && plan) {
    return (
      <article className={`rounded-xl border border-borde p-4 ${plan.activo ? "" : "opacity-60"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-texto">
              {plan.nombre}
              {!plan.activo && (
                <Chip tono="gris" className="ml-2 align-middle">
                  retirado
                </Chip>
              )}
            </p>
            <p className="text-[13px] text-texto-3">
              {plan.calendario.length === 1 ? "Un pago" : `${plan.calendario.length} cuotas`} · total {fmtMoney(plan.total)}
              {diferencia > 0 && ` · ${fmtMoney(diferencia)} más que ${referencia?.nombre}`}
            </p>
          </div>
          {/* L3: «Mes a mes» y «Pago completo» salen del precio del curso; sus cuotas
              no se editan acá (el backend lo rechaza con PLAN_GENERADO). Se retiran o
              se reactivan, nada más. */}
          {plan.generado ? (
            <Boton
              variante="ghost"
              disabled={guardando}
              onClick={() =>
                void (async () => {
                  setGuardando(true);
                  setErrores([]);
                  try {
                    await apiAcademia.editarPlan(plan.id, { activo: !plan.activo });
                    onGuardado();
                  } catch (e) {
                    setErrores([e instanceof Error ? e.message : "No se pudo guardar el plan"]);
                  } finally {
                    setGuardando(false);
                  }
                })()
              }
            >
              {plan.activo ? "Retirar plan" : "Reactivar"}
            </Boton>
          ) : (
            <Boton variante="ghost" icono="edit" onClick={() => setAbierto(true)}>
              Editar
            </Boton>
          )}
        </div>
        {plan.generado && (
          <p className="mt-1 text-[12px] text-texto-3">
            Lo arma el curso: el precio se cambia en el precio por {p.materia} o en el del pago completo, y se rehace solo al agregar o retirar un {p.materia}.
          </p>
        )}
        {errores.length > 0 && <ErrorMsg>{errores[0]}</ErrorMsg>}
        <ul className="mt-2 space-y-0.5 text-[13px] text-texto-2">
          {plan.calendario.map((c) => (
            <li key={c.n} className="flex justify-between gap-2">
              <span>
                Cuota {c.n} · {textoCubre(c.cubre)} ·{" "}
                {c.vence.tipo === "INSCRIPCION" ? "al inscribirse" : c.vence.tipo === "INICIO_MATERIA" ? `día 1 de M${c.vence.materiaOrden}` : `a los ${c.vence.dias} días`}
              </span>
              <span className="tabular-nums">{fmtMoney(c.monto)}</span>
            </li>
          ))}
        </ul>
      </article>
    );
  }

  return (
    <article className="space-y-4 rounded-xl border border-primary/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <Campo label="Nombre del plan">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Completo, Cuotas, Modular…" />
          </Campo>
        </div>
        {nuevo && (
          <div className="flex flex-wrap gap-1.5 pb-0.5" role="group" aria-label="Forma del plan">
            {(
              [
                ["unico", "Un pago"],
                ["cuotas", "En cuotas"],
                ["materia", `Por ${p.materia}`],
              ] as const
            ).map(([k, label]) => (
              <BotonFila key={k} variante="ghost" onClick={() => setCuotas(calendarioBase(k, materias))}>
                {label}
              </BotonFila>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-texto-2">Calendario</p>
        <ul className="space-y-2">
          {cuotas.map((c, i) => (
            <li key={i} className="grid gap-2 rounded-xl bg-muted p-3 md:grid-cols-[60px_120px_minmax(0,1.2fr)_minmax(0,1fr)_36px] md:items-center">
              <span className="text-sm font-semibold text-texto-2">Cuota {i + 1}</span>
              <Input
                aria-label={`Monto de la cuota ${i + 1}`}
                type="number"
                value={c.monto ? String(c.monto) : ""}
                placeholder="Bs"
                onChange={(e) => cambiarCuota(i, { monto: Number(e.target.value) || 0 })}
              />
              <div className="flex gap-2">
                <Select
                  aria-label={`Cuándo vence la cuota ${i + 1}`}
                  value={c.vence.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as TipoVence;
                    cambiarCuota(i, {
                      vence:
                        tipo === "INICIO_MATERIA"
                          ? { tipo, materiaOrden: c.cubre[0] ?? activas[0]?.orden ?? 1 }
                          : tipo === "DIAS"
                            ? { tipo, dias: 30 }
                            : { tipo },
                    });
                  }}
                >
                  <option value="INSCRIPCION">Al inscribirse</option>
                  <option value="INICIO_MATERIA">Al empezar una {p.materia}</option>
                  <option value="DIAS">A los N días</option>
                </Select>
                {c.vence.tipo === "INICIO_MATERIA" && (
                  <div className="w-24 shrink-0">
                    <Select
                      aria-label={`${p.Materia} de la cuota ${i + 1}`}
                      value={c.vence.materiaOrden ?? ""}
                      onChange={(e) => cambiarCuota(i, { vence: { tipo: "INICIO_MATERIA", materiaOrden: Number(e.target.value) } })}
                    >
                      {activas.map((m) => (
                        <option key={m.orden} value={m.orden}>
                          M{m.orden}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                {c.vence.tipo === "DIAS" && (
                  <div className="w-20 shrink-0">
                    <Input
                      aria-label={`Días de la cuota ${i + 1}`}
                      type="number"
                      value={String(c.vence.dias ?? "")}
                      onChange={(e) => cambiarCuota(i, { vence: { tipo: "DIAS", dias: Number(e.target.value) || 0 } })}
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label={`Qué cubre la cuota ${i + 1}`}>
                {activas.map((m) => (
                  <button
                    key={m.orden}
                    type="button"
                    aria-pressed={c.cubre.includes(m.orden)}
                    onClick={() => alternarCubre(i, m.orden)}
                    title={m.nombre}
                    className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${
                      c.cubre.includes(m.orden) ? "bg-primary-boton text-white" : "border border-borde bg-white text-texto-3"
                    }`}
                  >
                    M{m.orden}
                  </button>
                ))}
              </div>
              <BotonIcono
                etiqueta={`Quitar la cuota ${i + 1}`}
                icono="trash"
                disabled={cuotas.length === 1}
                onClick={() => setCuotas(cuotas.filter((_, j) => j !== i))}
              />
            </li>
          ))}
        </ul>
        <BotonFila
          icono="plus"
          onClick={() => setCuotas([...cuotas, { n: cuotas.length + 1, monto: 0, vence: { tipo: "DIAS", dias: 30 }, cubre: [] }])}
        >
          Agregar cuota
        </BotonFila>
      </div>

      {/* La base fija del docente por materia ya no se carga (D2): lo que cobra
          sale del % sobre lo pagado. Se manda la que el plan ya tenía. */}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde-soft pt-3">
        <p className="text-sm text-texto-2">
          Total <span className="font-bold tabular-nums text-texto">{fmtMoney(total)}</span>
          {diferencia > 0 && <span className="text-texto-3"> · {fmtMoney(diferencia)} más que {referencia?.nombre}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {plan && (
            <Boton variante="ghost" disabled={guardando} onClick={() => void guardar({ activo: !plan.activo })}>
              {plan.activo ? "Retirar plan" : "Reactivar"}
            </Boton>
          )}
          <Boton
            variante="ghost"
            disabled={guardando}
            onClick={() => {
              if (onCancelar) onCancelar();
              else {
                setAbierto(false);
                setErrores([]);
                if (plan) {
                  setCuotas(plan.calendario);
                  setBase(plan.baseDocente);
                  setNombre(plan.nombre);
                }
              }
            }}
          >
            Cancelar
          </Boton>
          <Boton disabled={guardando} onClick={() => void guardar()}>
            {guardando ? "Guardando…" : "Guardar plan"}
          </Boton>
        </div>
      </div>
      {errores.length > 0 && (
        <ErrorMsg>
          <ul className="list-disc space-y-0.5 pl-4">
            {errores.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </ErrorMsg>
      )}
    </article>
  );
}

/** "de la carrera" / "del curso": la palabra cambia con el rubro y con ella el artículo. */
function deLa(palabra: string) {
  return /a$/i.test(palabra) ? `de la ${palabra}` : `del ${palabra}`;
}
