import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { Chips } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { Campo, Cargando, ErrorMsg, Input, Select } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import { ApiError } from "../../../lib/api";
import {
  duracionFranja,
  franjaSiguiente,
  problemasFranjas,
} from "../../../lib/academia/calendario";
import type { AjustesAcademia as Ajustes, Carrera, Franja } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";
import { useSucursales } from "../../../lib/useSucursales";
import { BotonFila, BotonIcono, claseBotonFila, Interruptor, LISTA, PaginaAcademia, SeccionAjuste, TABLA } from "../piezas";

/**
 * Ajustes del instituto (N4, `/configuracion/academia`): lo que se configura
 * una vez. Los cursos en resumen (se editan en su pantalla), el día en que
 * empiezan los módulos, las franjas de cada sede (las filas del calendario),
 * el % del docente y lo de la inscripción.
 *
 * No hay botón Guardar: cada cambio se guarda solo al soltar el campo, y la
 * cabecera dice "Cambios guardados". Es lo que muestra el lienzo, y un ajuste
 * que se toca una vez por año no merece un paso más. Para que no se extrañe
 * el botón, la cabecera queda fija arriba con el estado en una píldora (y el
 * error al lado, aunque el campo que falló esté abajo de todo).
 */

type Estado = "listo" | "guardando" | "guardado" | "error";

/** Cuántos grupos usa cada franja (`inicio-fin`), sacado del calendario de la sede. */
function useGruposPorFranja(sede: number | null) {
  const cal = useApi(() => apiAcademia.calendario({ sede, meses: 12 }), [sede]);
  return useMemo(() => {
    const uso = new Map<string, number>();
    for (const fila of cal.datos?.filas ?? []) {
      const ids = new Set(fila.celdas.flatMap((c) => c.grupos.map((g) => g.grupoId)));
      uso.set(`${fila.inicio}-${fila.fin}`, ids.size);
    }
    return { uso, listo: !!cal.datos };
  }, [cal.datos]);
}

export default function AjustesAcademia() {
  const p = usePalabras();
  const carga = useApi(() => apiAcademia.ajustes(), []);
  const cursos = useApi(() => apiAcademia.carreras(), []);
  const { sucursales } = useSucursales();
  const [a, setA] = useState<Ajustes | null>(null);
  const [estado, setEstado] = useState<Estado>("listo");
  const [error, setError] = useState("");
  // Con varias sedes cada una tiene sus franjas; "" = las que valen para todas.
  const [sedeFranjas, setSedeFranjas] = useState("");
  const enVuelo = useRef(0);

  useEffect(() => {
    if (carga.datos) setA(carga.datos);
  }, [carga.datos]);

  const variasSedes = sucursales.length > 1;
  const sedeId = variasSedes && sedeFranjas ? Number(sedeFranjas) : null;
  const { uso, listo: usoListo } = useGruposPorFranja(sedeId);

  if (carga.error && !carga.datos) {
    return (
      <PaginaAcademia ancho="max-w-5xl">
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </PaginaAcademia>
    );
  }
  if (!a) return <Cargando />;

  /** Guarda un cambio parcial; el backend valida y devuelve los ajustes. */
  async function guardar(cambios: Partial<Ajustes>) {
    setA((prev) => (prev ? { ...prev, ...cambios } : prev));
    const mia = ++enVuelo.current;
    setEstado("guardando");
    setError("");
    try {
      const nuevos = await apiAcademia.guardarAjustes(cambios);
      if (mia !== enVuelo.current) return;
      setA(nuevos);
      setEstado("guardado");
    } catch (e) {
      if (mia !== enVuelo.current) return;
      setEstado("error");
      // 400 FRANJAS_INVALIDAS trae el detalle de cada una (cambio #4).
      const detalles = e instanceof ApiError && Array.isArray(e.detalle.detalles) ? (e.detalle.detalles as string[]) : [];
      setError(detalles.length ? detalles.join(" ") : e instanceof Error ? e.message : "No se pudo guardar");
    }
  }

  /** Un número al soltar el campo: vacío o fuera de rango no se manda. */
  const numero = (k: keyof Ajustes, min: number, max: number, opcional = false) => ({
    defaultValue: a[k] == null ? "" : String(a[k]),
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const v = e.target.value.trim();
      if (v === "" && opcional) {
        if (a[k] != null) void guardar({ [k]: null } as Partial<Ajustes>);
        return;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < min || n > max) {
        setError(`El valor tiene que estar entre ${min} y ${max}.`);
        e.target.value = a[k] == null ? "" : String(a[k]);
        return;
      }
      if (n !== a[k]) void guardar({ [k]: n } as Partial<Ajustes>);
    },
  });

  const todas = a.franjas ?? [];
  // En el orden en que se cargaron: ordenar mientras se tipea movería la fila.
  const lista = todas.filter((f) => f.almacenId === sedeId);
  const otras = todas.filter((f) => f.almacenId !== sedeId);
  // Lo que se tipea queda en pantalla y se guarda al soltar el campo.
  const borrador = lista;
  const setBorrador = (nuevas: Franja[]) => setA({ ...a, franjas: [...otras, ...nuevas] });

  /** Guarda las franjas si están bien; si no, avisa y espera a que se corrijan. */
  function guardarFranjas(nuevas: Franja[]) {
    const completas = [...otras, ...nuevas];
    const problemas = problemasFranjas(completas);
    if (problemas.length) {
      setEstado("error");
      setError(problemas[0]);
      return;
    }
    void guardar({ franjas: completas });
  }

  const cambiarFranja = (i: number, campo: "inicio" | "fin", valor: string) =>
    setBorrador(borrador.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

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

      <SeccionAjuste id="s-cursos" titulo={p.Carreras} bajada={`${p.Materias}, precio, cupo y porcentaje del ${p.docente} de cada ${p.carrera}.`}>
        <ResumenCursos cursos={cursos.datos} pctDefecto={a.pctDocenteDefecto} />
        <BotonFila variante="ghost" a="/configuracion/carreras" className="mt-3">
          Administrar {p.carreras} <Icon name="chevronRight" size={15} />
        </BotonFila>
      </SeccionAjuste>

      <SeccionAjuste id="s-cal" titulo="Calendario" bajada="Cada grupo nuevo toma estos valores. Los grupos abiertos no cambian.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label={`Los ${p.materias} empiezan el día`} hint="De cada mes (1 a 28).">
            <Input type="number" inputMode="numeric" {...numero("diaInicioModulo", 1, 28)} />
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
      </SeccionAjuste>

      <SeccionAjuste
        id="s-franjas"
        titulo="Franjas horarias"
        bajada={`Las filas del calendario${variasSedes ? ` de cada ${p.sede}` : ""}. Pueden ser de 1, 2 o 3 horas.`}
      >
        {variasSedes && (
          <div className="mb-3">
            <Chips
              titulo={p.Sede}
              valor={sedeFranjas}
              opciones={[["", `Todas las ${p.sedes}`] as const, ...sucursales.map((s) => [String(s.id), s.nombre] as const)]}
              onChange={setSedeFranjas}
            />
          </div>
        )}
        {lista.length === 0 && (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-texto-3">Sin franjas: el calendario arma una fila por cada horario de grupo.</p>
        )}
        <ul className={lista.length ? `${LISTA.lista} rounded-xl border border-borde-soft` : ""}>
          {lista.map((f, i) => {
            const grupos = uso.get(`${f.inicio}-${f.fin}`) ?? 0;
            return (
              <li
                key={`${i}-${f.almacenId}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:grid-cols-[120px_20px_120px_60px_minmax(0,1fr)_40px] sm:gap-2.5"
              >
                <label>
                  <span className="sr-only">Desde, franja {i + 1}</span>
                  <Input
                    type="time"
                    step={1800}
                    value={f.inicio}
                    onChange={(e) => cambiarFranja(i, "inicio", e.target.value)}
                    onBlur={() => guardarFranjas(borrador)}
                  />
                </label>
                <span className="text-center text-sm text-texto-3">a</span>
                <label>
                  <span className="sr-only">Hasta, franja {i + 1}</span>
                  <Input
                    type="time"
                    step={1800}
                    value={f.fin}
                    onChange={(e) => cambiarFranja(i, "fin", e.target.value)}
                    onBlur={() => guardarFranjas(borrador)}
                  />
                </label>
                <span className="hidden text-sm tabular-nums text-texto-3 sm:block">{duracionFranja(f)}</span>
                <span className="col-span-3 text-[13px] text-texto-3 sm:col-span-1">
                  <span className="sm:hidden">{duracionFranja(f)} · </span>
                  {usoListo ? (grupos === 0 ? "libre" : grupos === 1 ? "1 grupo" : `${grupos} grupos`) : ""}
                </span>
                <BotonIcono
                  icono="trash"
                  etiqueta={`Quitar franja ${f.inicio}–${f.fin}`}
                  disabled={grupos > 0}
                  title={grupos > 0 ? "Tiene grupos: no se puede quitar" : "Quitar franja"}
                  onClick={() => {
                    const nuevas = borrador.filter((_, j) => j !== i);
                    setBorrador(nuevas);
                    guardarFranjas(nuevas);
                  }}
                  className="justify-self-end hover:border-danger/40 hover:text-danger-text disabled:hover:border-borde disabled:hover:bg-white disabled:hover:text-texto-2"
                />
              </li>
            );
          })}
        </ul>
        <BotonFila
          icono="plus"
          className="mt-3"
          onClick={() => {
            const nuevas = [...borrador, franjaSiguiente(borrador, sedeId)];
            setBorrador(nuevas);
            guardarFranjas(nuevas);
          }}
        >
          Agregar franja
        </BotonFila>
      </SeccionAjuste>

      <SeccionAjuste id="s-docentes" titulo={`Pago a ${p.docente}s`} bajada={`Sobre lo que pagó cada ${p.alumno} por el ${p.materia}, mes a mes.`}>
        <div className="flex items-center justify-between gap-4 pb-2">
          <span>
            <label htmlFor="pct-defecto" className="block text-sm text-texto">
              Porcentaje por defecto
            </label>
            <span className="text-[13px] text-texto-3">Cada {p.carrera} lo puede cambiar</span>
          </span>
          <span className="flex items-center gap-2 text-sm text-texto-2">
            <Input id="pct-defecto" type="number" className="!w-20 text-right" {...numero("pctDocenteDefecto", 0, 100)} />%
          </span>
        </div>
        <div className="divide-y divide-borde-soft border-t border-borde-soft">
          <Interruptor
            activo={a.retencionActiva}
            bloqueado
            etiqueta={`Retención por facturación · ${a.retencionPctDefecto} %`}
            detalle="Pronto"
          />
          <Interruptor activo={false} bloqueado etiqueta={`Descuento por atrasos del ${p.docente}`} detalle="Pronto" />
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
            activo={a.topePromoSinPinPct === 0}
            onCambiar={(v) => void guardar({ topePromoSinPinPct: v ? 0 : 100 })}
            etiqueta="Descuentos fuera del pago completo piden PIN del administrador"
            detalle="El descuento del pago completo se aplica solo"
          />
          <Interruptor
            activo={a.preinscripcionActiva}
            onCambiar={(v) => void guardar({ preinscripcionActiva: v })}
            etiqueta="Recibir inscripciones desde la página"
          />
        </div>
      </SeccionAjuste>

      <SeccionAjuste id="s-notas" titulo="Notas y asistencia" bajada="La escala y lo que se exige para aprobar.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Nota mínima para aprobar">
            <Input type="number" {...numero("notaMinima", 0, 1000)} />
          </Campo>
          <Campo label="Nota máxima de la escala">
            <Input type="number" {...numero("escalaMax", 1, 1000)} />
          </Campo>
          <Campo label="Asistencia mínima (%)" hint="Vacío = no se exige.">
            <Input type="number" {...numero("asistenciaMinimaPct", 0, 100, true)} />
          </Campo>
          <Campo label={`El atraso del ${p.docente} cuenta desde (min)`}>
            <Input type="number" {...numero("toleranciaAtrasoMin", 0, 240)} />
          </Campo>
        </div>
      </SeccionAjuste>

      <SeccionAjuste id="s-qr" titulo="Cobro por QR" bajada="El QR del banco por monto exacto: el pago se acredita solo.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-texto-2">
              <Icon name="qr" size={20} />
            </span>
            <span>
              <span className="block text-sm font-semibold text-texto">Banco BISA</span>
              <span className="text-[13px] text-texto-3">Sin configurar</span>
            </span>
          </span>
          <button type="button" disabled className={claseBotonFila("ghost")}>
            Configurar QR de BISA · Pronto
          </button>
        </div>
      </SeccionAjuste>
    </PaginaAcademia>
  );
}

/** Los cursos en una tabla corta: se editan en su pantalla. */
function ResumenCursos({ cursos, pctDefecto }: { cursos: Carrera[] | null; pctDefecto: number }) {
  const p = usePalabras();
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
            return (
              <tr key={c.id} className={TABLA.fila}>
                <td className={`${TABLA.td} font-semibold text-texto`}>{c.nombre}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{mods}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{c.precioModulo != null ? fmtMoney(c.precioModulo) : "—"}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{completo != null ? fmtMoney(completo) : "—"}</td>
                <td className={`${TABLA.td} ${TABLA.numero} text-texto-2`}>{c.cupoDefecto ?? "—"}</td>
                <td className={`${TABLA.td} ${TABLA.numero} ${c.pctDocente == null ? "text-texto-3" : "font-semibold text-texto"}`}>{pct} %</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
