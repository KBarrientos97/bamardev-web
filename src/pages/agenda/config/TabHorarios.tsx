import { useState } from "react";
import {
  AvisoOk,
  Boton,
  Campo,
  Cargando,
  ErrorMsg,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import {
  copiarDia,
  DIAS,
  erroresTramos,
  reemplazarSucursal,
  resumenTramos,
  semanaDeSucursal,
  type Semana,
} from "../../../lib/agenda/horarios";
import type { Recurso, TramoHorario } from "../../../lib/agenda/tiposConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { Casilla } from "./comun";
import { codigoDe, mensajeDe, nombreRecurso, type Pestana, type Sucursal } from "./utilConfig";
import EditorTramos from "./EditorTramos";

/**
 * La semana tipo de cada recurso en cada sucursal: varios tramos por día (el
 * almuerzo es el hueco entre dos, no un bloqueo, §9 del plan de desarrollo).
 */
export default function TabHorarios({
  recursos,
  sucursales,
  irA,
}: {
  recursos: Recurso[];
  sucursales: Sucursal[];
  irA: (p: Pestana) => void;
}) {
  const activos = recursos.filter((r) => r.activo);
  const [recursoId, setRecursoId] = useState<number | null>(activos[0]?.id ?? null);
  const recurso = activos.find((r) => r.id === recursoId) ?? null;
  const suyas = sucursales.filter((s) => recurso?.sucursalIds.includes(s.id));
  const [sucursalElegida, setSucursalElegida] = useState<number | null>(null);
  const sucursalId =
    sucursalElegida && suyas.some((s) => s.id === sucursalElegida) ? sucursalElegida : (suyas[0]?.id ?? null);

  const horarios = useApi(
    () => (recursoId ? apiConfigAgenda.horarios(recursoId) : Promise.resolve([] as TramoHorario[])),
    [recursoId],
  );

  if (!activos.length) {
    return (
      <div className="card">
        <Vacio
          icono="clock"
          titulo="Primero cargá quién atiende"
          texto="El horario es de cada profesional o espacio, en cada sucursal."
          accion={<Boton onClick={() => irA("recursos")}>Ir a cargarlos</Boton>}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
        <Campo label="Horario de">
          <Select
            value={recursoId ?? ""}
            onChange={(e) => {
              setRecursoId(Number(e.target.value));
              setSucursalElegida(null);
            }}
          >
            {activos.map((r) => (
              <option key={r.id} value={r.id}>
                {nombreRecurso(r)}
              </option>
            ))}
          </Select>
        </Campo>
        {suyas.length > 1 && (
          <Campo label="En la sucursal">
            <Select value={sucursalId ?? ""} onChange={(e) => setSucursalElegida(Number(e.target.value))}>
              {suyas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        )}
      </div>

      {!sucursalId ? (
        <div className="card">
          <Vacio
            icono="home"
            titulo="No tiene sucursal"
            texto="Asignale al menos una sucursal donde atiende para cargarle el horario."
            accion={<Boton onClick={() => irA("recursos")}>Asignar sucursal</Boton>}
          />
        </div>
      ) : horarios.error ? (
        <ErrorMsg onReintentar={horarios.recargar}>{horarios.error}</ErrorMsg>
      ) : horarios.cargando || !horarios.datos ? (
        <Cargando />
      ) : (
        <EditorSemana
          // La clave reinicia lo editado al cambiar de recurso o de sucursal:
          // sin ella, lo tecleado para uno se guardaría en el otro.
          key={`${recursoId}-${sucursalId}`}
          recursoId={recursoId!}
          sucursalId={sucursalId}
          sucursales={sucursales}
          todos={horarios.datos}
          onGuardado={horarios.setDatos}
        />
      )}
    </div>
  );
}

function EditorSemana({
  recursoId,
  sucursalId,
  sucursales,
  todos,
  onGuardado,
}: {
  recursoId: number;
  sucursalId: number;
  sucursales: Sucursal[];
  todos: TramoHorario[];
  onGuardado: (t: TramoHorario[]) => void;
}) {
  const [semana, setSemana] = useState<Semana>(() => semanaDeSucursal(todos, sucursalId));
  const [copiandoDe, setCopiandoDe] = useState<number | null>(null);
  const [destinos, setDestinos] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [superpuesto, setSuperpuesto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useAviso();

  const hayErrores = DIAS.some(({ dia }) => erroresTramos(semana[dia] ?? []).length > 0);

  // Lo que ya tiene en las otras sucursales: es lo que el backend va a
  // comparar, y verlo acá evita cargar el lunes en dos lados a la misma hora.
  const otras = sucursales
    .filter((s) => s.id !== sucursalId)
    .map((s) => ({ s, semana: semanaDeSucursal(todos, s.id) }))
    .filter(({ semana: sem }) => DIAS.some(({ dia }) => sem[dia].length));

  const guardar = async () => {
    setGuardando(true);
    setError("");
    setSuperpuesto(false);
    try {
      const tramos = reemplazarSucursal(todos, sucursalId, semana);
      await apiConfigAgenda.guardarHorarios(recursoId, tramos);
      onGuardado(tramos);
      setAviso("Horario guardado.");
    } catch (e) {
      // La base no deja al mismo recurso en dos sucursales a la misma hora.
      setSuperpuesto(codigoDe(e) === "HORARIO_SUPERPUESTO");
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-borde-soft">
        {DIAS.map(({ dia, nombre }) => (
          <li key={dia} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
            <div className="flex items-center justify-between sm:w-36 sm:flex-col sm:items-start sm:gap-1">
              <span className="font-semibold text-texto">{nombre}</span>
              {(semana[dia] ?? []).length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setCopiandoDe(copiandoDe === dia ? null : dia);
                    setDestinos([]);
                  }}
                  aria-expanded={copiandoDe === dia}
                  className="text-xs font-semibold text-primary-700 hover:underline"
                >
                  Copiar a otros días
                </button>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <EditorTramos
                etiqueta={nombre}
                tramos={semana[dia] ?? []}
                onChange={(t) => setSemana({ ...semana, [dia]: t })}
              />
              {copiandoDe === dia && (
                <div className="rounded-xl bg-muted p-3" role="group" aria-label={`Copiar el ${nombre} a`}>
                  <p className="mb-1 text-[13px] font-semibold text-texto-2">
                    Copiar {resumenTramos(semana[dia])} a:
                  </p>
                  <div className="flex flex-wrap gap-x-4">
                    {DIAS.filter((d) => d.dia !== dia).map((d) => (
                      <Casilla
                        key={d.dia}
                        checked={destinos.includes(d.dia)}
                        onChange={(v) =>
                          setDestinos(v ? [...destinos, d.dia] : destinos.filter((x) => x !== d.dia))
                        }
                      >
                        {d.nombre}
                      </Casilla>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Boton
                      variante="soft"
                      disabled={!destinos.length}
                      onClick={() => {
                        setSemana(copiarDia(semana, dia, destinos));
                        setCopiandoDe(null);
                      }}
                    >
                      Copiar
                    </Boton>
                    <Boton variante="ghost" onClick={() => setCopiandoDe(null)}>
                      Cancelar
                    </Boton>
                  </div>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {otras.length > 0 && (
        <div className="rounded-xl bg-info-bg px-3.5 py-2.5 text-[13px] text-info-text">
          <p className="font-semibold">También atiende en:</p>
          {otras.map(({ s, semana: sem }) => (
            <p key={s.id}>
              {s.nombre}:{" "}
              {DIAS.filter(({ dia }) => sem[dia].length)
                .map(({ dia, corto }) => `${corto} ${resumenTramos(sem[dia])}`)
                .join(" · ")}
            </p>
          ))}
        </div>
      )}

      {superpuesto && (
        <ErrorMsg>
          Se pisa con el horario que ya tiene en otra sucursal: una persona no puede estar en dos
          lugares a la misma hora. {error}
        </ErrorMsg>
      )}
      {!superpuesto && <ErrorMsg>{error}</ErrorMsg>}
      <AvisoOk>{aviso}</AvisoOk>

      <div className="flex justify-end gap-2">
        <Boton
          variante="ghost"
          onClick={() => {
            setSemana(semanaDeSucursal(todos, sucursalId));
            setError("");
            setSuperpuesto(false);
          }}
          disabled={guardando}
        >
          Descartar
        </Boton>
        <Boton onClick={guardar} disabled={guardando || hayErrores} icono="save">
          {guardando ? "Guardando…" : "Guardar horario"}
        </Boton>
      </div>
    </div>
  );
}
