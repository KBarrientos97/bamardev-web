import { useState } from "react";
import {
  AvisoOk,
  Badge,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Select,
  useAviso,
  Vacio,
} from "../../../components/ui";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import {
  erroresTramos,
  fmtFechaNegocio,
  hoyNegocio,
  nombreDia,
  resumenTramos,
  sumarDias,
} from "../../../lib/agenda/horarios";
import type { ExcepcionHorario, Recurso, Tramo } from "../../../lib/agenda/tiposConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { Bloque } from "./comun";
import { mensajeDe, nombreRecurso, type Pestana } from "./utilConfig";
import EditorTramos from "./EditorTramos";

/** Cuánto hacia adelante se listan: medio año alcanza para cualquier salón. */
const DIAS_ADELANTE = 180;

/**
 * Días que no siguen la semana tipo: el feriado en que no trabaja, el sábado
 * que entra más temprano. Con tramos vacíos es "no trabaja ese día".
 */
export default function TabExcepciones({
  recursos,
  irA,
}: {
  recursos: Recurso[];
  irA: (p: Pestana) => void;
}) {
  const activos = recursos.filter((r) => r.activo);
  const [recursoId, setRecursoId] = useState<number | null>(activos[0]?.id ?? null);
  const hoy = hoyNegocio();
  const lista = useApi(
    () =>
      recursoId
        ? apiConfigAgenda.excepciones(recursoId, hoy, sumarDias(hoy, DIAS_ADELANTE))
        : Promise.resolve([] as ExcepcionHorario[]),
    [recursoId],
  );
  const [borrando, setBorrando] = useState<ExcepcionHorario | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  if (!activos.length) {
    return (
      <div className="card">
        <Vacio
          icono="calendar"
          titulo="Primero cargá quién atiende"
          accion={<Boton onClick={() => irA("recursos")}>Ir a cargarlos</Boton>}
        />
      </div>
    );
  }

  const borrar = async () => {
    if (!borrando) return;
    setProcesando(true);
    setError("");
    try {
      await apiConfigAgenda.borrarExcepcion(borrando.id);
      setBorrando(null);
      setAviso("Excepción borrada: ese día vuelve a la semana tipo.");
      lista.recargar();
    } catch (e) {
      setBorrando(null);
      setError(mensajeDe(e, "No se pudo borrar"));
    } finally {
      setProcesando(false);
    }
  };

  const ordenadas = [...(lista.datos ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <Campo label="Excepciones de">
          <Select value={recursoId ?? ""} onChange={(e) => setRecursoId(Number(e.target.value))}>
            {activos.map((r) => (
              <option key={r.id} value={r.id}>
                {nombreRecurso(r)}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bloque titulo="Próximas excepciones">
          {lista.error ? (
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          ) : lista.cargando ? (
            <Cargando />
          ) : ordenadas.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-3">
              Ninguna: todos los días siguen la semana tipo.
            </p>
          ) : (
            <ul className="divide-y divide-borde-soft">
              {ordenadas.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-texto">
                      {nombreDia(x.fecha)} {fmtFechaNegocio(x.fecha)}
                    </p>
                    <p className="text-[13px] text-texto-3">
                      {x.tramos.length ? resumenTramos(x.tramos) : <Badge tono="amarillo">No trabaja</Badge>}
                    </p>
                  </div>
                  <Boton
                    variante="ghost"
                    icono="trash"
                    aria-label={`Borrar la excepción del ${fmtFechaNegocio(x.fecha)}`}
                    onClick={() => setBorrando(x)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        {recursoId && (
          <NuevaExcepcion
            key={recursoId}
            recursoId={recursoId}
            hoy={hoy}
            onCreada={(x) => {
              setAviso(`Excepción del ${fmtFechaNegocio(x.fecha)} guardada.`);
              lista.recargar();
            }}
          />
        )}
      </div>

      <Confirmar
        abierto={!!borrando}
        titulo="Borrar excepción"
        texto={
          borrando
            ? `El ${fmtFechaNegocio(borrando.fecha)} vuelve a seguir la semana tipo.`
            : ""
        }
        etiquetaOk="Borrar"
        peligroso
        procesando={procesando}
        onCancel={() => setBorrando(null)}
        onOk={borrar}
      />
    </div>
  );
}

function NuevaExcepcion({
  recursoId,
  hoy,
  onCreada,
}: {
  recursoId: number;
  hoy: string;
  onCreada: (x: ExcepcionHorario) => void;
}) {
  const [fecha, setFecha] = useState("");
  const [trabaja, setTrabaja] = useState(false);
  const [tramos, setTramos] = useState<Tramo[]>([{ desde: "09:00", hasta: "13:00" }]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const erroresDia = trabaja ? erroresTramos(tramos) : [];

  const guardar = async () => {
    if (!fecha) return setError("Elegí la fecha.");
    if (trabaja && !tramos.length) return setError("Agregá al menos un tramo, o marcá que no trabaja.");
    if (erroresDia.length) return;
    setGuardando(true);
    setError("");
    try {
      const x = await apiConfigAgenda.crearExcepcion(recursoId, {
        fecha,
        tramos: trabaja ? tramos : [],
      });
      setFecha("");
      onCreada(x);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Bloque titulo="Nueva excepción">
      <Campo label="Fecha">
        <Input type="date" min={hoy} value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>
      <div role="radiogroup" aria-label="Ese día" className="space-y-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-2">
          <input
            type="radio"
            name="trabaja"
            className="h-4 w-4 accent-primary"
            checked={!trabaja}
            onChange={() => setTrabaja(false)}
          />
          No trabaja
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-2">
          <input
            type="radio"
            name="trabaja"
            className="h-4 w-4 accent-primary"
            checked={trabaja}
            onChange={() => setTrabaja(true)}
          />
          Trabaja en otro horario
        </label>
      </div>
      {trabaja && <EditorTramos etiqueta="Excepción" tramos={tramos} onChange={setTramos} />}
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex justify-end">
        <Boton onClick={guardar} disabled={guardando || erroresDia.length > 0} icono="save">
          {guardando ? "Guardando…" : "Guardar excepción"}
        </Boton>
      </div>
    </Bloque>
  );
}
