import { useEffect, useRef, useState, type FocusEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Icon } from "../../../components/Icon";
import { Campo, Cargando, Confirmar, ErrorMsg, Input, Select } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { ApiError } from "../../../lib/api";
import { RUTA_SEDES } from "../../../lib/academia/vista";
import type { AjustesAcademia as Ajustes, Carrera } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { BotonFila, Interruptor, PaginaAcademia, SeccionAjuste, Segmentos, TABLA } from "../piezas";
import { InscripcionEnLinea } from "./InscripcionEnLinea";

/**
 * Ajustes del instituto (N4, `/configuracion/academia`): lo que se configura
 * una vez. Los cursos en resumen (se editan en su pantalla), el día en que
 * empiezan los módulos, el % del docente y lo de la inscripción. Las franjas
 * horarias (las filas del calendario) ya no se editan acá: se cargan en cada
 * sede (WEB-8, C5), para tener un solo lugar. El backend sigue aceptándolas en
 * `PATCH /ajustes`, pero esta pantalla nunca las manda: cada guardado lleva
 * sólo el campo que se tocó, así que no pisa las que tiene cada sede.
 *
 * No hay botón Guardar: cada cambio se guarda solo al soltar el campo, y la
 * cabecera dice "Cambios guardados". Es lo que muestra el lienzo, y un ajuste
 * que se toca una vez por año no merece un paso más. Para que no se extrañe
 * el botón, la cabecera queda fija arriba con el estado en una píldora (y el
 * error al lado, aunque el campo que falló esté abajo de todo).
 */

type Estado = "listo" | "guardando" | "guardado" | "error";

/** Cómo se pide el adelanto mínimo (07-nov): un % del curso o un monto fijo en Bs. */
type ModoAdelanto = "PCT" | "BS";

export default function AjustesAcademia() {
  const p = usePalabras();
  const carga = useApi(() => apiAcademia.ajustes(), []);
  const cursos = useApi(() => apiAcademia.carreras(), []);
  const [a, setA] = useState<Ajustes | null>(null);
  const [estado, setEstado] = useState<Estado>("listo");
  const [error, setError] = useState("");
  const enVuelo = useRef(0);
  /**
   * Lista 2 #9 (decisión del dueño): cambiar el día en que empiezan los módulos
   * se confirma antes de guardar. Guarda el valor nuevo y cómo devolver el
   * campo si se arrepiente. Los grupos abiertos no cambian, pero los que se
   * abran desde ahora sí, y el cambio se hacía con sólo salir del campo.
   */
  const [cambioDia, setCambioDia] = useState<{ n: number; volver: () => void } | null>(null);
  /**
   * La opción elegida del adelanto mínimo. null = la que tenga valor guardado:
   * se deriva de los ajustes porque llegan después del primer render.
   */
  const [modoElegido, setModoElegido] = useState<ModoAdelanto | null>(null);

  useEffect(() => {
    if (carga.datos) setA(carga.datos);
  }, [carga.datos]);

  // `/configuracion/academia#s-insc` (el aviso de Cursos «Activarlo en Ajustes»):
  // la página arma las secciones recién cuando cargan los ajustes, así que el
  // navegador no encuentra el ancla solo; se baja a ella al terminar de cargar (ronda 1, W11).
  const { hash } = useLocation();
  const listo = !!a;
  useEffect(() => {
    if (!listo || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: "start" });
  }, [listo, hash]);

  if (carga.error && !carga.datos) {
    return (
      <PaginaAcademia ancho="max-w-5xl">
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </PaginaAcademia>
    );
  }
  if (!a) return <Cargando />;

  /**
   * Guarda un cambio parcial; el backend valida y devuelve los ajustes. La
   * pantalla se adelanta; si el guardado falla vuelve a lo que había (ronda 1,
   * W6) y devuelve `false` para que el campo también lo haga.
   */
  async function guardar(cambios: Partial<Ajustes>): Promise<boolean> {
    const antes = Object.fromEntries(Object.keys(cambios).map((k) => [k, a![k as keyof Ajustes]])) as Partial<Ajustes>;
    setA((prev) => (prev ? { ...prev, ...cambios } : prev));
    const mia = ++enVuelo.current;
    setEstado("guardando");
    setError("");
    try {
      const nuevos = await apiAcademia.guardarAjustes(cambios);
      if (mia !== enVuelo.current) return true;
      setA(nuevos);
      setEstado("guardado");
      return true;
    } catch (e) {
      if (mia !== enVuelo.current) return false;
      setA((prev) => (prev ? { ...prev, ...antes } : prev));
      setEstado("error");
      // 400 FRANJAS_INVALIDAS trae el detalle de cada una (cambio #4).
      const detalles = e instanceof ApiError && Array.isArray(e.detalle.detalles) ? (e.detalle.detalles as string[]) : [];
      setError(detalles.length ? detalles.join(" ") : e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    }
  }

  /**
   * Un número al soltar el campo: vacío o fuera de rango no se manda. `junto`
   * viaja con el valor cuando se guarda uno: el adelanto en Bs lleva el % en
   * null y al revés, para que nunca queden los dos (07-nov).
   */
  const numero = (
    k: keyof Ajustes,
    min: number,
    max: number,
    opcional = false,
    confirmar?: (n: number, volver: () => void) => void,
    junto: Partial<Ajustes> = {},
  ) => ({
    defaultValue: a[k] == null ? "" : String(a[k]),
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      // El campo vuelve a lo que vale si el guardado falla: `defaultValue` no sigue al estado.
      const volver = (ok: boolean) => {
        if (!ok) e.target.value = a[k] == null ? "" : String(a[k]);
      };
      if (v === "" && opcional) {
        setError("");
        if (a[k] != null) void guardar({ [k]: null } as Partial<Ajustes>).then(volver);
        return;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        setError(`El valor tiene que estar entre ${min} y ${max}.`);
        e.target.value = a[k] == null ? "" : String(a[k]);
        return;
      }
      // Un valor válido borra el reproche del anterior inválido.
      setError("");
      const cambiaJunto = Object.entries(junto).some(([j, v]) => a[j as keyof Ajustes] !== v);
      if (n === a[k] && !cambiaJunto) return;
      if (confirmar) {
        // El campo muestra lo tecleado hasta que se confirme; si se cancela, vuelve.
        confirmar(n, () => volver(false));
        return;
      }
      void guardar({ [k]: n, ...junto } as Partial<Ajustes>).then(volver);
    },
  });

  // El monto fijo sólo se ofrece si el backend ya lo conoce; si no, queda el % solo.
  const conAdelantoBs = a.adelantoMinimoBs !== undefined;
  const modoAdelanto: ModoAdelanto = conAdelantoBs ? (modoElegido ?? (a.adelantoMinimoBs != null ? "BS" : "PCT")) : "PCT";
  // Al cambiar de opción el campo nuevo arranca vacío y lo guardado sigue valiendo hasta poner otro valor: se avisa.
  const sigueValiendo =
    modoAdelanto === "BS"
      ? a.adelantoMinimoBs == null && a.adelantoMinimoPct != null && `${a.adelantoMinimoPct} % del ${p.carrera}`
      : a.adelantoMinimoPct == null && a.adelantoMinimoBs != null && fmtMoney(a.adelantoMinimoBs);

  return (
    <PaginaAcademia ancho="max-w-5xl">
      {/* Fija arriba: el estado del guardado (y el error) siempre a la vista. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 space-y-3 border-b border-borde-soft bg-fondo/95 px-4 pb-3 pt-4 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6 lg:-mx-8 lg:-mt-8 lg:px-8 lg:pt-8">
        <header className="flex items-start justify-between gap-3 sm:items-center sm:gap-6">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-texto">Ajustes</h1>
            <p className="text-sm text-texto-3">Lo que se configura una vez</p>
          </div>
          <span
            role="status"
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold shadow-sm transition-colors ${
              estado === "guardado"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-borde bg-white text-texto-3"
            }`}
          >
            {estado === "guardando" ? (
              <>
                <Icon name="clock" size={15} /> Guardando…
              </>
            ) : estado === "guardado" ? (
              <>
                <Icon name="check" size={15} /> Cambios guardados
              </>
            ) : (
              <>
                <Icon name="save" size={15} /> Cada cambio se guarda solo
              </>
            )}
          </span>
        </header>
        <ErrorMsg>{error}</ErrorMsg>
      </div>

      <Confirmar
        abierto={cambioDia != null}
        titulo={`¿Cambiar el día de inicio al ${cambioDia?.n ?? ""}?`}
        texto={`Hoy los ${p.materias} empiezan el día ${a.diaInicioModulo} de cada mes. Los grupos que abras desde ahora van a empezar el ${cambioDia?.n ?? ""}. Los grupos que ya están abiertos no cambian.`}
        etiquetaOk="Cambiar el día"
        onCancel={() => {
          cambioDia?.volver();
          setCambioDia(null);
        }}
        onOk={() => {
          const c = cambioDia;
          setCambioDia(null);
          if (c) void guardar({ diaInicioModulo: c.n }).then((ok) => !ok && c.volver());
        }}
      />

      <SeccionAjuste id="s-cursos" titulo={p.Carreras} bajada={`${p.Materias}, precio, cupo y porcentaje del ${p.docente} de cada ${p.carrera}.`}>
        <ResumenCursos cursos={cursos.datos} error={cursos.error} onReintentar={cursos.recargar} pctDefecto={a.pctDocenteDefecto} />
        <BotonFila variante="ghost" a="/configuracion/carreras" className="mt-3">
          Administrar {p.carreras} <Icon name="chevronRight" size={15} />
        </BotonFila>
      </SeccionAjuste>

      <SeccionAjuste id="s-cal" titulo="Calendario" bajada="Cuándo empiezan los módulos y las filas del calendario. Cada grupo nuevo toma estos valores; los abiertos no cambian.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label={`Los ${p.materias} empiezan el día`} hint="De cada mes (1 a 28).">
            <Input
              type="number"
              inputMode="numeric"
              {...numero("diaInicioModulo", 1, 28, false, (n, volver) => setCambioDia({ n, volver }))}
            />
          </Campo>
          <Campo label={`Duración de un ${p.materia}`}>
            <Select
              value={String(a.duracionModuloMeses)}
              onChange={(e) => void guardar({ duracionModuloMeses: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? "1 mes" : `${n} meses`}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <div className="mt-6 border-t border-borde-soft pt-5">
          <h3 id="s-franjas" className="text-sm font-bold text-texto">
            Franjas horarias
          </h3>
          <p className="mt-1 text-[13px] text-texto-3">
            Las franjas horarias ahora se cargan en cada{" "}
            <Link to={RUTA_SEDES} className="font-semibold text-primary-700 hover:underline">
              {p.sede}
            </Link>
            , junto con sus aulas.
          </p>
        </div>
      </SeccionAjuste>

      <SeccionAjuste id="s-insc" titulo="Inscripción" bajada="Lo que se pide en el mostrador y en la página.">
        <div className="divide-y divide-borde-soft">
          <Interruptor
            activo={a.fotosObligatorias}
            bloqueado
            etiqueta={`Pedir foto del ${p.alumno} y carnet por ambos lados`}
            detalle={
              <span className="inline-flex items-center gap-1">
                <Icon name="lock" size={13} /> Obligatorio: sin las 3 fotos la inscripción no se activa
              </span>
            }
          />
          <Interruptor
            activo={a.preinscripcionActiva}
            onCambiar={(v) => void guardar({ preinscripcionActiva: v })}
            etiqueta="Recibir inscripciones desde la página"
          />
        </div>
        {/* C7: lo que tiene que estar prendido, en cinco lugares, para que la página reciba inscripciones. */}
        <InscripcionEnLinea ajustes={a} cursos={cursos.error ? "error" : cursos.datos} onActivarRecibir={() => void guardar({ preinscripcionActiva: true })} />
      </SeccionAjuste>

      <SeccionAjuste id="s-cobro" titulo="Cobro" bajada="Los descuentos, el adelanto que asegura el cupo y cuándo una cuota vencida se marca en rojo.">
        <div className="space-y-4">
          <div className="divide-y divide-borde-soft">
            <Interruptor
              activo={a.topePromoSinPinPct === 0}
              onCambiar={(v) => void guardar({ topePromoSinPinPct: v ? 0 : 100 })}
              etiqueta="Descuentos fuera del pago completo piden PIN del administrador"
              detalle="El descuento del pago completo se aplica solo"
            />
          </div>
          {/* B7: el semáforo del docente. Sólo si el backend ya lo conoce. */}
          {a.diasEspera !== undefined && (
            <Campo
              label="Días de espera antes de marcar en rojo"
              hint={`Desde que vence la cuota, el ${p.docente} ve en amarillo a quien debe; después, en rojo. No bloquea nada.`}
            >
              <Input type="number" inputMode="numeric" className="sm:max-w-[140px]" {...numero("diasEspera", 0, 60)} />
            </Campo>
          )}
          {/*
            03-nov: el adelanto que asegura el cupo. Sólo si el backend ya lo conoce.
            07-nov: también como monto fijo en Bs; el selector va fuera del <label>
            de Campo para que tocar el campo no apriete una opción.
          */}
          {a.adelantoMinimoPct !== undefined && (
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-texto-2">Adelanto mínimo para asegurar el cupo</p>
              {conAdelantoBs && (
                <div className="sm:max-w-sm">
                  <Segmentos<ModoAdelanto>
                    etiqueta="Cómo se pide el adelanto mínimo"
                    valor={modoAdelanto}
                    onChange={(m) => {
                      setError("");
                      setModoElegido(m);
                    }}
                    opciones={[
                      ["PCT", `Porcentaje del ${p.carrera}`],
                      ["BS", "Monto fijo (Bs)"],
                    ]}
                  />
                </div>
              )}
              {modoAdelanto === "BS" ? (
                <Campo label="Monto mínimo (Bs)" hint={`El mismo en todos los ${p.carreras}. Vacío = no se ofrece adelanto.`}>
                  <Input
                    key="BS"
                    type="number"
                    inputMode="numeric"
                    className="sm:max-w-[140px]"
                    {...numero("adelantoMinimoBs", 1, 100000, true, undefined, { adelantoMinimoPct: null })}
                  />
                </Campo>
              ) : (
                <Campo label={`Porcentaje del ${p.carrera} (%)`} hint={`Depende del precio de cada ${p.carrera}. Vacío = no se ofrece adelanto.`}>
                  <Input
                    key="PCT"
                    type="number"
                    inputMode="numeric"
                    className="sm:max-w-[140px]"
                    {...numero("adelantoMinimoPct", 1, 99, true, undefined, conAdelantoBs ? { adelantoMinimoBs: null } : {})}
                  />
                </Campo>
              )}
              {sigueValiendo && (
                <p className="text-xs font-semibold text-texto-3">Hasta que lo cambies sigue valiendo el de antes: {sigueValiendo}.</p>
              )}
              <p className="text-xs text-texto-4">
                La página lo ofrece a cuenta del primer mes, sólo si es menos que la primera cuota y hay un QR de cobro cargado. El
                mostrador no cobra un adelanto menor.
              </p>
            </div>
          )}
        </div>
      </SeccionAjuste>

      <SeccionAjuste id="s-docentes" titulo={`${p.Docente}s`} bajada="Cuánto se les paga y desde cuándo cuenta un atraso.">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <span>
              <label htmlFor="pct-defecto" className="block text-sm text-texto">
                Porcentaje de pago por defecto
              </label>
              <span className="text-[13px] text-texto-3">
                {`Sobre lo que pagó cada ${p.alumno} por el ${p.materia}, mes a mes. Cada ${p.carrera} lo puede cambiar.`}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm text-texto-2">
              <Input id="pct-defecto" type="number" className="!w-20 text-right" {...numero("pctDocenteDefecto", 0, 100)} />%
            </span>
          </div>
          <Campo label={`El atraso del ${p.docente} cuenta desde (min)`}>
            <Input type="number" className="sm:max-w-[140px]" {...numero("toleranciaAtrasoMin", 0, 240)} />
          </Campo>
        </div>
      </SeccionAjuste>

      <SeccionAjuste id="s-notas" titulo="Notas y asistencia" bajada="La escala y lo que se exige para aprobar.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Nota mínima para aprobar">
            <Input type="number" {...numero("notaMinima", 1, 1000)} />
          </Campo>
          <Campo label="Nota máxima de la escala">
            <Input type="number" {...numero("escalaMax", 1, 1000)} />
          </Campo>
          <Campo label="Asistencia mínima (%)" hint="Vacío = no se exige.">
            <Input type="number" {...numero("asistenciaMinimaPct", 0, 100, true)} />
          </Campo>
        </div>
      </SeccionAjuste>
    </PaginaAcademia>
  );
}

/** Los cursos en una tabla corta: se editan en su pantalla. */
function ResumenCursos({
  cursos,
  error,
  onReintentar,
  pctDefecto,
}: {
  cursos: Carrera[] | null;
  error: string;
  onReintentar: () => void;
  pctDefecto: number;
}) {
  const p = usePalabras();
  // Si la carga falla no se queda en «Cargando…» para siempre (ronda 1, W9).
  if (!cursos && error) return <ErrorMsg onReintentar={onReintentar}>{error}</ErrorMsg>;
  if (!cursos) return <p className="text-sm text-texto-3">Cargando…</p>;
  if (!cursos.length) return <p className="text-sm text-texto-3">Todavía no hay {p.carreras}.</p>;
  return (
    <div className={`${TABLA.envoltura} rounded-xl border border-borde-soft`}>
      <table className={`${TABLA.tabla} min-w-[520px] whitespace-nowrap tabular-nums`}>
        <thead>
          <tr className={TABLA.encabezado}>
            <th className={TABLA.th}>{p.Carrera}</th>
            <th className={`${TABLA.th} ${TABLA.numero}`}>{p.Materias}</th>
            <th className={`${TABLA.th} ${TABLA.numero}`}>Por {p.materia}</th>
            <th className={`${TABLA.th} ${TABLA.numero}`}>Completo</th>
            <th className={`${TABLA.th} ${TABLA.numero}`}>Cupo</th>
            <th className={`${TABLA.th} ${TABLA.numero}`}>{p.Docente}</th>
          </tr>
        </thead>
        <tbody>
          {cursos.map((c) => {
            const mods = c.materias.filter((m) => m.activa).length;
            const completo = c.planes.find((pl) => pl.activo && pl.generado === "COMPLETO")?.total ?? c.precioCompleto;
            const pct = c.pctDocente ?? pctDefecto;
            // A5: un curso con monto fijo no cobra el % por defecto (QA 23-oct).
            const montoFijo = c.pagoDocenteModo === "MONTO" || (c.pagoDocenteModo == null && c.montoDocente != null);
            return (
              <tr key={c.id} className={TABLA.fila}>
                <td className={`${TABLA.td} font-semibold text-texto`}>{c.nombre}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{mods}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{c.precioModulo != null ? fmtMoney(c.precioModulo) : "—"}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{completo != null ? fmtMoney(completo) : "—"}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{c.cupoDefecto ?? "—"}</td>
                {montoFijo ? (
                  <td className={`${TABLA.td} ${TABLA.numero} font-semibold text-texto`}>{fmtMoney(c.montoDocente ?? 0)} fijo</td>
                ) : (
                  <td className={`${TABLA.td} ${TABLA.numero} ${c.pctDocente == null ? "text-texto-3" : "font-semibold text-texto"}`}>{pct} %</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
