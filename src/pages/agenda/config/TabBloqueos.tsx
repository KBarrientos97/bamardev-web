import { useState } from "react";
import {
  AvisoOk,
  Boton,
  Campo,
  Cargando,
  Confirmar,
  ErrorMsg,
  Input,
  Select,
  useAviso,
} from "../../../components/ui";
import { apiConfigAgenda } from "../../../lib/agenda/apiConfigAgenda";
import {
  fmtRangoBloqueo,
  hoyNegocio,
  instanteNegocio,
  sumarDias,
} from "../../../lib/agenda/horarios";
import type { Bloqueo, CitaAfectada, Recurso } from "../../../lib/agenda/tiposConfigAgenda";
import { useApi } from "../../../lib/useApi";
import { AvisoCitasAfectadas, Bloque, Casilla, PuntoColor } from "./comun";
import { mensajeDe, nombreRecurso, type Sucursal } from "./utilConfig";

const DIAS_ADELANTE = 180;

/**
 * Bloqueos de una sola vez: vacaciones, un curso, el feriado de una sucursal.
 * Lo recurrente (el almuerzo) no va acá: es el hueco entre dos tramos del
 * horario.
 *
 * Cargar un bloqueo NUNCA cancela citas (§7.3): si quedan citas adentro, se
 * listan para que recepción las reprograme o cancele una por una.
 */
export default function TabBloqueos({
  recursos,
  sucursales,
}: {
  recursos: Recurso[];
  sucursales: Sucursal[];
}) {
  const hoy = hoyNegocio();
  const [filtroSucursal, setFiltroSucursal] = useState<number | null>(null);
  const lista = useApi(
    () =>
      apiConfigAgenda.bloqueos({
        desde: hoy,
        hasta: sumarDias(hoy, DIAS_ADELANTE),
        sucursalId: filtroSucursal,
      }),
    [filtroSucursal],
  );
  const [afectadas, setAfectadas] = useState<CitaAfectada[]>([]);
  const [borrando, setBorrando] = useState<Bloqueo | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso();

  const recursoDe = (id: number | null) => recursos.find((r) => r.id === id) ?? null;
  const sucursalDe = (id: number | null) => sucursales.find((s) => s.id === id)?.nombre ?? null;

  const borrar = async () => {
    if (!borrando) return;
    setProcesando(true);
    setError("");
    try {
      await apiConfigAgenda.borrarBloqueo(borrando.id);
      setBorrando(null);
      setAviso("Bloqueo borrado.");
      lista.recargar();
    } catch (e) {
      setBorrando(null);
      setError(mensajeDe(e, "No se pudo borrar"));
    } finally {
      setProcesando(false);
    }
  };

  const ordenados = [...(lista.datos ?? [])].sort((a, b) => a.inicio.localeCompare(b.inicio));

  return (
    <div className="space-y-4">
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <AvisoCitasAfectadas citas={afectadas} donde="dentro del bloqueo" onCerrar={() => setAfectadas([])} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Bloque
          titulo="Próximos bloqueos"
          accion={
            sucursales.length > 1 ? (
              <div className="w-48">
                <Select
                  aria-label="Filtrar por sucursal"
                  value={filtroSucursal ?? ""}
                  onChange={(e) => setFiltroSucursal(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">Todas las sucursales</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </Select>
              </div>
            ) : undefined
          }
        >
          {lista.error ? (
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          ) : lista.cargando ? (
            <Cargando />
          ) : ordenados.length === 0 ? (
            <p className="py-4 text-center text-sm text-texto-3">No hay bloqueos cargados.</p>
          ) : (
            <ul className="divide-y divide-borde-soft">
              {ordenados.map((b) => {
                const r = recursoDe(b.recursoId);
                return (
                  <li key={b.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-texto">{b.motivo}</p>
                      <p className="text-[13px] text-texto-3">{fmtRangoBloqueo(b.inicio, b.fin)}</p>
                      <p className="flex items-center gap-1.5 text-xs text-texto-4">
                        {r && <PuntoColor color={r.color} />}
                        {r
                          ? r.nombre
                          : `Toda la sucursal${sucursalDe(b.sucursalId) ? ` ${sucursalDe(b.sucursalId)}` : ""}`}
                      </p>
                    </div>
                    <Boton
                      variante="ghost"
                      icono="trash"
                      aria-label={`Borrar el bloqueo ${b.motivo}`}
                      onClick={() => setBorrando(b)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Bloque>

        <NuevoBloqueo
          recursos={recursos.filter((r) => r.activo)}
          sucursales={sucursales}
          hoy={hoy}
          onCreado={(citas) => {
            setAfectadas(citas);
            setAviso("Bloqueo guardado.");
            lista.recargar();
          }}
        />
      </div>

      <Confirmar
        abierto={!!borrando}
        titulo="Borrar bloqueo"
        texto={borrando ? `"${borrando.motivo}" deja de bloquear la agenda.` : ""}
        etiquetaOk="Borrar"
        peligroso
        procesando={procesando}
        onCancel={() => setBorrando(null)}
        onOk={borrar}
      />
    </div>
  );
}

function NuevoBloqueo({
  recursos,
  sucursales,
  hoy,
  onCreado,
}: {
  recursos: Recurso[];
  sucursales: Sucursal[];
  hoy: string;
  onCreado: (afectadas: CitaAfectada[]) => void;
}) {
  const [alcance, setAlcance] = useState<"recurso" | "sucursal">(recursos.length ? "recurso" : "sucursal");
  const [recursoId, setRecursoId] = useState(recursos[0] ? String(recursos[0].id) : "");
  const [sucursalId, setSucursalId] = useState(sucursales[0] ? String(sucursales[0].id) : "");
  const [todoElDia, setTodoElDia] = useState(true);
  const [fechaDesde, setFechaDesde] = useState(hoy);
  const [horaDesde, setHoraDesde] = useState("09:00");
  const [fechaHasta, setFechaHasta] = useState(hoy);
  const [horaHasta, setHoraHasta] = useState("13:00");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  /** El rango en instantes, o un error para mostrar. */
  const rango = (): { inicio: string; fin: string } | string => {
    if (!fechaDesde || !fechaHasta) return "Completá las fechas.";
    // Todo el día: de la medianoche del primero a la del día después del
    // último, que es como la agenda lee "del 20 al 24".
    const inicio = instanteNegocio(fechaDesde, todoElDia ? "00:00" : horaDesde);
    const fin = todoElDia
      ? instanteNegocio(sumarDias(fechaHasta, 1), "00:00")
      : instanteNegocio(fechaHasta, horaHasta);
    if (Number.isNaN(Date.parse(inicio)) || Number.isNaN(Date.parse(fin))) return "Revisá las horas.";
    if (Date.parse(fin) <= Date.parse(inicio)) return "El fin tiene que ser posterior al inicio.";
    return { inicio, fin };
  };

  const r = rango();
  const errorRango = typeof r === "string" ? r : "";

  const guardar = async () => {
    if (typeof r === "string") return setError(r);
    if (!motivo.trim()) return setError("Poné el motivo: vacaciones, curso, feriado…");
    if (alcance === "recurso" && !recursoId) return setError("Elegí a quién se bloquea.");
    if (alcance === "sucursal" && !sucursalId) return setError("Elegí la sucursal.");
    setGuardando(true);
    setError("");
    try {
      const creado = await apiConfigAgenda.crearBloqueo({
        recursoId: alcance === "recurso" ? Number(recursoId) : null,
        sucursalId: alcance === "sucursal" ? Number(sucursalId) : null,
        inicio: r.inicio,
        fin: r.fin,
        motivo: motivo.trim(),
      });
      setMotivo("");
      onCreado(creado.citasAfectadas ?? []);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Bloque titulo="Nuevo bloqueo">
      <div role="radiogroup" aria-label="Qué se bloquea" className="flex flex-wrap gap-x-4 gap-y-1.5">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-2">
          <input
            type="radio"
            name="alcance"
            className="h-4 w-4 accent-primary"
            checked={alcance === "recurso"}
            onChange={() => setAlcance("recurso")}
            disabled={!recursos.length}
          />
          Una persona o espacio
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-2">
          <input
            type="radio"
            name="alcance"
            className="h-4 w-4 accent-primary"
            checked={alcance === "sucursal"}
            onChange={() => setAlcance("sucursal")}
          />
          Toda la sucursal
        </label>
      </div>
      {alcance === "recurso" ? (
        <Campo label="Quién">
          <Select value={recursoId} onChange={(e) => setRecursoId(e.target.value)}>
            {recursos.map((x) => (
              <option key={x.id} value={x.id}>
                {nombreRecurso(x)}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <Campo label="Sucursal">
          <Select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      )}

      <Casilla checked={todoElDia} onChange={setTodoElDia}>
        Todo el día
      </Casilla>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Desde">
          <Input
            type="date"
            min={hoy}
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              if (fechaHasta < e.target.value) setFechaHasta(e.target.value);
            }}
          />
        </Campo>
        {!todoElDia ? (
          <Campo label="Hora de inicio">
            <Input type="time" value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} />
          </Campo>
        ) : (
          <span />
        )}
        <Campo label="Hasta">
          <Input type="date" min={fechaDesde || hoy} value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </Campo>
        {!todoElDia && (
          <Campo label="Hora de fin">
            <Input type="time" value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} />
          </Campo>
        )}
      </div>
      {errorRango && <p className="text-xs text-danger-text">{errorRango}</p>}
      <Campo label="Motivo">
        <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Vacaciones, curso, feriado…" />
      </Campo>
      <ErrorMsg>{error}</ErrorMsg>
      <div className="flex justify-end">
        <Boton onClick={guardar} disabled={guardando || !!errorRango} icono="lock">
          {guardando ? "Guardando…" : "Bloquear"}
        </Boton>
      </div>
    </Bloque>
  );
}
