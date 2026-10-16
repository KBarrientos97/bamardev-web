import { useEffect, useState } from "react";
import { EncabezadoPagina } from "../../../components/filtros";
import { Icon } from "../../../components/Icon";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, Modal, Select, Vacio, useAviso } from "../../../components/ui";
import { apiAcademia, CODIGOS_ACADEMIA } from "../../../lib/academia/apiAcademia";
import { problemasDelPlan, textoCubre, totalCalendario } from "../../../lib/academia/formato";
import type { Carrera, CategoriaCctp, CuotaPlan, Materia, PlanPago, TipoVence } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { ApiError } from "../../../lib/api";
import { fmtMoney } from "../../../lib/format";
import { useApi } from "../../../lib/useApi";

/**
 * E17 · Carreras y planes (PLAN-ACADEMIAS §5): la carrera (nombre, horas,
 * categoría y si sale en la página), sus materias en orden y sus planes de
 * pago, cada uno con su calendario de cuotas y la base del docente por
 * materia. El backend valida el plan (400 PLAN_INVALIDO); acá se avisa antes
 * de guardar con las mismas reglas.
 *
 * No se ofrece un cargo de "matrícula": el reglamento de CCTP lo prohíbe en
 * el contrato (art. 39.II), así que el calendario sólo tiene cuotas que
 * cubren materias.
 */
export default function Carreras() {
  const p = usePalabras();
  const [verInactivas, setVerInactivas] = useState(false);
  const lista = useApi(() => apiAcademia.carreras(verInactivas), [verInactivas]);
  const [elegidaId, setElegidaId] = useState<number | null>(null);
  const [creando, setCreando] = useState(false);
  const [aviso, setAviso] = useAviso(5000);

  const carreras = lista.datos ?? [];
  const elegida = carreras.find((c) => c.id === elegidaId) ?? carreras[0] ?? null;

  /** Reemplaza una carrera en la lista con lo que devolvió el backend. */
  const actualizar = (c: Carrera) => lista.setDatos(carreras.map((x) => (x.id === c.id ? c : x)));
  const recargarUna = async (id: number) => {
    try {
      actualizar(await apiAcademia.carrera(id));
    } catch {
      lista.recargar();
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8">
      <EncabezadoPagina
        titulo={`${p.Carreras} y planes`}
        subtitulo="Configuración"
        accion={
          <Boton icono="plus" onClick={() => setCreando(true)}>
            Nueva {p.carrera}
          </Boton>
        }
      />
      <AvisoOk>{aviso}</AvisoOk>

      {lista.error && !lista.datos ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.datos ? (
        <Cargando />
      ) : carreras.length === 0 ? (
        <Vacio
          icono="birrete"
          titulo={`Todavía no hay ${p.carreras}`}
          texto={`Cargá la primera con sus ${p.materias} y sus planes de pago.`}
          accion={
            <Boton icono="plus" onClick={() => setCreando(true)}>
              Nueva {p.carrera}
            </Boton>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-2">
            <ul className="space-y-1">
              {carreras.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-current={elegida?.id === c.id ? "true" : undefined}
                    onClick={() => setElegidaId(c.id)}
                    className={`w-full rounded-xl border-l-4 px-3 py-2.5 text-left transition-colors ${
                      elegida?.id === c.id
                        ? "border-primary bg-primary-50"
                        : "border-transparent hover:bg-muted"
                    } ${c.activa ? "" : "opacity-60"}`}
                  >
                    <span className={`block text-sm font-semibold ${elegida?.id === c.id ? "text-primary-700" : "text-texto"}`}>
                      {c.nombre}
                    </span>
                    <span className="block text-[12px] text-texto-3">
                      {c.horasTotales} h · {c.materias.filter((m) => m.activa).length} {p.materias} · {c.planes.filter((x) => x.activo).length}{" "}
                      planes · {c.gruposActivos} {c.gruposActivos === 1 ? "grupo" : "grupos"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <label className="flex items-center gap-2 px-3 text-[13px] text-texto-3">
              <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary-boton)]" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
              Ver las retiradas
            </label>
          </aside>
          {elegida && (
            <DetalleCarrera
              key={elegida.id}
              carrera={elegida}
              onCambio={actualizar}
              onRecargar={() => void recargarUna(elegida.id)}
              onAviso={setAviso}
            />
          )}
        </div>
      )}

      {creando && (
        <NuevaCarrera
          onCerrar={() => setCreando(false)}
          onCreada={(c) => {
            setCreando(false);
            lista.setDatos([...carreras, c]);
            setElegidaId(c.id);
            setAviso(`${p.Carrera} creada. Ahora sus ${p.materias} y sus planes.`);
          }}
        />
      )}
    </div>
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
    <div className="min-w-0 space-y-8">
      <section className="space-y-3" aria-label={`Datos de la ${p.carrera}`}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_120px_minmax(0,1fr)]">
          <Campo label={`Nombre de la ${p.carrera}`}>
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
                <span className="flex items-center">
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
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void hacer(() => apiAcademia.editarMateria(m.id, { activa: !m.activa }))}
                    className="ml-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-texto-3 hover:bg-muted"
                  >
                    {m.activa ? "Retirar" : "Reactivar"}
                  </button>
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

function BotonIcono({
  etiqueta,
  icono,
  onClick,
  disabled,
}: {
  etiqueta: string;
  icono: "arrowUp" | "arrowDown" | "edit" | "trash";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-texto-3 hover:bg-muted disabled:opacity-30"
    >
      <Icon name={icono} size={16} />
    </button>
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
    const problemas = extra.activo === false ? [] : problemasDelPlan(cuotas, materias);
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
              {!plan.activo && <span className="ml-2 text-[12px] font-normal text-texto-3">retirado</span>}
            </p>
            <p className="text-[13px] text-texto-3">
              {plan.calendario.length === 1 ? "Un pago" : `${plan.calendario.length} cuotas`} · total {fmtMoney(plan.total)}
              {diferencia > 0 && ` · ${fmtMoney(diferencia)} más que ${referencia?.nombre}`}
            </p>
          </div>
          <Boton variante="ghost" icono="edit" onClick={() => setAbierto(true)}>
            Editar
          </Boton>
        </div>
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
              <button
                key={k}
                type="button"
                onClick={() => setCuotas(calendarioBase(k, materias))}
                className="rounded-full border border-borde px-3 py-1.5 text-[13px] font-semibold text-texto-2 hover:bg-muted"
              >
                {label}
              </button>
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
        <button
          type="button"
          onClick={() => setCuotas([...cuotas, { n: cuotas.length + 1, monto: 0, vence: { tipo: "DIAS", dias: 30 }, cubre: [] }])}
          className="text-[13px] font-semibold text-primary-700 hover:underline"
        >
          + Agregar cuota
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-semibold text-texto-2">Base del {p.docente} por {p.materia}</p>
        <div className="flex flex-wrap gap-2">
          {activas.map((m) => (
            <label key={m.orden} className="flex items-center gap-1.5 text-sm text-texto-2">
              M{m.orden}
              <span className="w-24">
                <Input
                  aria-label={`Base del ${p.docente} en M${m.orden}`}
                  type="number"
                  value={base[String(m.orden)] != null ? String(base[String(m.orden)]) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const copia = { ...base };
                    if (v === "") delete copia[String(m.orden)];
                    else copia[String(m.orden)] = Number(v) || 0;
                    setBase(copia);
                  }}
                />
              </span>
            </label>
          ))}
        </div>
      </div>

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

function NuevaCarrera({ onCerrar, onCreada }: { onCerrar: () => void; onCreada: (c: Carrera) => void }) {
  const p = usePalabras();
  const [nombre, setNombre] = useState("");
  const [horas, setHoras] = useState("");
  const [categoria, setCategoria] = useState<"" | CategoriaCctp>("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function crear() {
    if (!nombre.trim()) return setError("Falta el nombre.");
    if (!(Number(horas) > 0)) return setError("Las horas totales tienen que ser más que cero.");
    setGuardando(true);
    setError("");
    try {
      onCreada(
        await apiAcademia.crearCarrera({
          nombre: nombre.trim(),
          horasTotales: Number(horas),
          ...(categoria ? { categoriaCctp: categoria } : {}),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      abierto
      titulo={`Nueva ${p.carrera}`}
      onClose={onCerrar}
      cerrarAlClicAfuera={false}
      acciones={
        <>
          <Boton variante="ghost" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Boton>
          <Boton onClick={() => void crear()} disabled={guardando}>
            {guardando ? "Creando…" : "Crear"}
          </Boton>
        </>
      }
    >
      <div className="space-y-3">
        <Campo label="Nombre">
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Barbería y Peluquería" autoFocus />
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Horas totales">
            <Input type="number" inputMode="numeric" value={horas} onChange={(e) => setHoras(e.target.value)} />
          </Campo>
          <Campo label="Categoría (CCTP)">
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value as "" | CategoriaCctp)}>
              <option value="">Sin categoría</option>
              <option value="A">A · 20 a 80 h</option>
              <option value="B">B · 80 a 400 h</option>
            </Select>
          </Campo>
        </div>
        <ErrorMsg>{error}</ErrorMsg>
      </div>
    </Modal>
  );
}
