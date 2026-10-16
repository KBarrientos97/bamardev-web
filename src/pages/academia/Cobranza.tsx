import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Chips, EncabezadoPagina, FilaFiltros } from "../../components/filtros";
import { Paginacion } from "../../components/Paginacion";
import PanelLateral from "../../components/PanelLateral";
import { Boton, Cargando, ErrorMsg, Select, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import type { Antiguedad, FilaCobranza, RespuestaCobranza, TipoCobranza } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, nombreCuota, rutaCobroInscripcion } from "../../lib/academia/vista";
import { fmtMoney, tiempoRelativo } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { cobraCuotas } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { EstadoDeCuenta, FiltrosConteo } from "./piezas";

const TIPOS: TipoCobranza[] = ["vencidas", "por-vencer", "parciales"];

/** "Recordada hace 3 días", "Nunca recordado". */
function textoRecordatorio(f: Pick<FilaCobranza, "ultimoRecordatorioEn" | "recordatorios">): string {
  if (!f.ultimoRecordatorioEn) return "Nunca recordado";
  const cuando = tiempoRelativo(f.ultimoRecordatorioEn).toLowerCase();
  return f.recordatorios > 1 ? `Recordado ${f.recordatorios} veces · ${cuando}` : `Recordado ${cuando}`;
}

/** La cuota a recordar: la vencida más vieja, si no la primera con saldo. */
function cuotaARecordar(f: FilaCobranza) {
  const conSaldo = f.cuotas.filter((c) => c.saldo > 0 && c.estado !== "ANULADA");
  return conSaldo.find((c) => c.vencida) ?? conSaldo[0] ?? null;
}

/**
 * E8 · Cobranza (PLAN-ACADEMIAS §5): las cuotas que se deben. Las pestañas
 * son los indicadores (Vencidas · Por vencer · Abonos parciales); filtros de
 * sede, carrera y antigüedad. Cada fila es una inscripción con sus cuotas:
 * el que debe dos se ve una sola vez (el backend ya las agrupa). WhatsApp pide al backend el mensaje armado (y deja
 * anotado el recordatorio) y abre `wa.me`; Cobrar lleva al POS.
 */
export default function Cobranza() {
  const { usuario, negocio, rubro } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const inicial = TIPOS.includes(params.get("tipo") as TipoCobranza) ? (params.get("tipo") as TipoCobranza) : "vencidas";
  const sede = useFiltroSede();
  const [tipo, setTipo] = useState<TipoCobranza>(inicial);
  const [carreraId, setCarreraId] = useState<number | null>(null);
  const [antiguedad, setAntiguedad] = useState<"" | Antiguedad>("");
  const [elegida, setElegida] = useState<FilaCobranza | null>(null);
  const [totales, setTotales] = useState<RespuestaCobranza["totales"] | null>(null);
  const [error, setError] = useState("");
  const [avisando, setAvisando] = useState<number | null>(null);

  const carreras = useApi(() => apiAcademia.carreras().catch(() => []), []);
  const lista = usePaginado(
    async (pg) => {
      const r = await apiAcademia.cobranza({
        ...pg,
        tipo,
        sede: sede.sucursalId,
        carreraId,
        antiguedad: tipo === "vencidas" ? antiguedad : "",
      });
      setTotales(r.totales);
      return r;
    },
    [tipo, sede.sucursalId, carreraId, antiguedad],
  );
  const cobra = cobraCuotas({ features: negocio?.features, rubro, permisos: usuario?.permisos, permisosPropios: usuario?.permisosPropios });

  async function recordar(f: FilaCobranza) {
    const cuota = cuotaARecordar(f);
    if (!cuota) return;
    setError("");
    setAvisando(cuota.id);
    try {
      const r = await apiAcademia.recordatorio(cuota.id);
      abrirWhatsapp(r.url);
      // Queda anotado: la fila lo dice sin recargar la lista.
      const ahora = new Date().toISOString();
      const marcar = (x: FilaCobranza) =>
        x === f ? { ...x, ultimoRecordatorioEn: ahora, recordatorios: x.recordatorios + 1 } : x;
      lista.setItems(lista.items.map(marcar));
      setElegida((e) => (e ? marcar(e) : e));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo armar el mensaje");
    } finally {
      setAvisando(null);
    }
  }

  function cobrar(f: FilaCobranza) {
    // Con la inscripción, su carrito; si no vino, el POS busca al alumno.
    const destino = f.inscripcionId
      ? rutaCobroInscripcion(f.inscripcionId, f.sede)
      : `/pos?alumno=${f.alumno.id}&q=${encodeURIComponent(f.alumno.codigo ?? f.alumno.nombre)}`;
    navigate(destino);
  }

  const t = totales;
  return (
    <div className={`mx-auto max-w-6xl space-y-5 p-4 sm:p-6 lg:p-8 ${elegida ? "md:mr-[380px]" : ""}`}>
      <EncabezadoPagina titulo="Cobranza" subtitulo={`Las cuotas que se deben${sede.nombre ? ` en ${sede.nombre}` : ""}.`} />

      <FilaFiltros>
        {sede.selector}
        {tipo === "vencidas" ? (
          <Chips
            titulo="Antigüedad"
            valor={antiguedad}
            opciones={[
              ["", "Todas"],
              ["1-7", "1–7 días"],
              ["8-30", "8–30 días"],
              ["30+", "Más de 30"],
            ]}
            onChange={setAntiguedad}
          />
        ) : null}
      </FilaFiltros>
      <div className="flex flex-wrap items-center gap-3">
        {(carreras.datos?.length ?? 0) > 1 && (
          <div className="w-full sm:w-56">
            <Select aria-label={p.Carrera} value={carreraId ?? ""} onChange={(e) => setCarreraId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">{p.Carrera}: todas</option>
              {carreras.datos?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>

      <FiltrosConteo
        etiqueta="Qué cuotas"
        opciones={[
          { clave: "vencidas", label: "Vencidas", n: t?.vencidoCuotas ?? null, urgente: true },
          { clave: "por-vencer", label: "Por vencer", n: t?.venceMesCuotas ?? null },
          { clave: "parciales", label: "Abonos parciales" },
        ]}
        valor={tipo}
        onChange={(v) => {
          setTipo(v);
          setElegida(null);
        }}
      />
      {t && (
        <p className="text-[13px] text-texto-3">
          {tipo === "vencidas"
            ? `${fmtMoney(t.vencido)} vencido · ${t.vencidoAlumnos} ${t.vencidoAlumnos === 1 ? p.alumno : p.alumnos}`
            : tipo === "por-vencer"
              ? `Vence esta semana ${fmtMoney(t.venceSemana)} · este mes ${fmtMoney(t.venceMes)}`
              : null}
          {tipo !== "parciales" ? " · " : ""}Cobrado este mes {fmtMoney(t.cobradoMes)}
        </p>
      )}
      <ErrorMsg>{error}</ErrorMsg>

      {lista.error && !lista.items.length ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.items.length ? (
        <Cargando />
      ) : lista.items.length === 0 ? (
        <Vacio
          icono="coins"
          titulo={tipo === "vencidas" ? "No hay cuotas vencidas" : tipo === "por-vencer" ? "Nada por vencer" : "No hay abonos parciales"}
        />
      ) : (
        <>
          <ListaCobranza
            filas={lista.items}
            tipo={tipo}
            conSede={sede.variasSedes}
            cobra={cobra}
            avisando={avisando}
            elegida={elegida}
            onElegir={setElegida}
            onWhatsapp={(f) => void recordar(f)}
            onCobrar={cobrar}
          />
          <Paginacion {...lista.paginacion} />
        </>
      )}

      {elegida && (
        <PanelLateral
          abierto
          titulo={elegida.alumno.nombre}
          subtitulo={[elegida.alumno.codigo, elegida.grupo.nombre, sede.variasSedes ? elegida.sede.nombre : null].filter(Boolean).join(" · ")}
          onClose={() => setElegida(null)}
          acciones={
            <>
              {cobra && (
                <Boton className="w-full" onClick={() => cobrar(elegida)}>
                  Cobrar {fmtMoney(elegida.saldo)}
                </Boton>
              )}
              <Boton variante="ghost" className="w-full" disabled={avisando !== null} onClick={() => void recordar(elegida)}>
                {elegida.contacto.esTutor ? "WhatsApp al tutor" : "WhatsApp"}
              </Boton>
            </>
          }
        >
          <div className="space-y-5">
            <section className="space-y-2.5">
              <h3 className="text-[12px] text-texto-3">Cuotas</h3>
              <EstadoDeCuenta cuotas={elegida.cuotas} />
            </section>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[12px] text-texto-3">{elegida.contacto.esTutor ? "Tutor" : "Contacto"}</dt>
                <dd className="text-texto">
                  {elegida.contacto.nombre}
                  {elegida.contacto.telefono ? ` · ${elegida.contacto.telefono}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-[12px] text-texto-3">Recordatorio</dt>
                <dd className="text-texto-2">{textoRecordatorio(elegida)}</dd>
              </div>
            </dl>
          </div>
        </PanelLateral>
      )}
    </div>
  );
}

function ListaCobranza({
  filas,
  tipo,
  conSede,
  cobra,
  avisando,
  elegida,
  onElegir,
  onWhatsapp,
  onCobrar,
}: {
  filas: FilaCobranza[];
  tipo: TipoCobranza;
  conSede: boolean;
  cobra: boolean;
  avisando: number | null;
  elegida: FilaCobranza | null;
  onElegir: (f: FilaCobranza) => void;
  onWhatsapp: (f: FilaCobranza) => void;
  onCobrar: (f: FilaCobranza) => void;
}) {
  const urgente = tipo === "vencidas";
  const detalleCuotas = (f: FilaCobranza) =>
    f.cuotas.length === 1
      ? `${nombreCuota(f.cuotas[0])}${f.cuotas[0].pagado > 0 ? ` · abonó ${fmtMoney(f.cuotas[0].pagado)} de ${fmtMoney(f.cuotas[0].monto)}` : ""}`
      : `${f.cuotas.length} cuotas`;
  const contacto = (f: FilaCobranza) =>
    f.contacto.esTutor ? `Tutor: ${f.contacto.nombre}${f.contacto.telefono ? ` · ${f.contacto.telefono}` : ""}` : f.contacto.telefono ?? "";
  const ocupada = (f: FilaCobranza) => avisando !== null && f.cuotas.some((c) => c.id === avisando);
  // Con el panel abierto las acciones de la fila quedarían debajo de él: el
  // panel ya trae WhatsApp y Cobrar, así que la columna se va.
  const conAcciones = !elegida;
  const col = conAcciones
    ? "grid-cols-[minmax(180px,1.6fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_100px_80px_150px]"
    : "grid-cols-[minmax(160px,1.6fr)_minmax(130px,1.3fr)_minmax(130px,1.3fr)_100px_70px]";

  return (
    <>
      <div className="hidden md:block">
        <div className={`grid ${col} gap-3 px-3 pb-2 text-[12px] text-texto-3`}>
          <span>Alumno</span>
          <span>Grupo</span>
          <span>Cuota</span>
          <span className="text-right">Saldo</span>
          <span className="text-right">{urgente ? "Atraso" : ""}</span>
          {conAcciones && <span />}
        </div>
        <ul>
          {filas.map((f, i) => (
            <li key={`${f.alumno.id}-${f.cuotas[0]?.id ?? i}`}>
              {/* La fila no es un botón: el nombre abre el panel (estirado
                  sobre la fila con `after:`) y WhatsApp y Cobrar son botones
                  aparte, encima. Nada de un botón dentro de otro. */}
              <div
                className={`relative grid ${col} items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                  elegida === f ? "bg-primary-50" : "hover:bg-muted"
                }`}
              >
                <span className="min-w-0">
                  <button
                    type="button"
                    aria-label={`Ver a ${f.alumno.nombre}`}
                    aria-expanded={elegida === f}
                    onClick={() => onElegir(f)}
                    className="block max-w-full truncate text-left text-sm font-semibold text-texto after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary"
                  >
                    {f.alumno.nombre}
                  </button>
                  <span className="block truncate text-[12px] text-texto-3">{contacto(f)}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-texto-2">{f.grupo.nombre}</span>
                  {conSede && <span className="block truncate text-[12px] text-texto-3">{f.sede.nombre}</span>}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-texto-2">{detalleCuotas(f)}</span>
                  <span className="block truncate text-[12px] text-texto-4">{textoRecordatorio(f)}</span>
                </span>
                <span className={`text-right text-sm font-semibold tabular-nums ${urgente ? "text-danger-text" : "text-texto"}`}>
                  {fmtMoney(f.saldo)}
                </span>
                <span className="text-right text-sm tabular-nums text-texto-2">{urgente ? `${f.diasAtraso} d` : ""}</span>
                {conAcciones && (
                  <span className="relative z-10 flex justify-end gap-3 text-[13px] font-semibold">
                    <button
                      type="button"
                      disabled={ocupada(f)}
                      onClick={() => onWhatsapp(f)}
                      className="text-primary-700 hover:underline disabled:opacity-50"
                    >
                      WhatsApp
                    </button>
                    {cobra && (
                      <button type="button" onClick={() => onCobrar(f)} className="text-primary-700 hover:underline">
                        Cobrar
                      </button>
                    )}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <ul className="space-y-2 md:hidden">
        {filas.map((f, i) => (
          <li key={`${f.alumno.id}-${f.cuotas[0]?.id ?? i}`} className="rounded-xl border border-borde bg-white p-3.5">
            <button type="button" onClick={() => onElegir(f)} className="block w-full text-left">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 truncate text-[15px] font-semibold text-texto">{f.alumno.nombre}</span>
                <span className={`shrink-0 text-[15px] font-bold tabular-nums ${urgente ? "text-danger-text" : "text-texto"}`}>
                  {fmtMoney(f.saldo)}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] text-texto-3">
                {[f.grupo.nombre, detalleCuotas(f), urgente ? `${f.diasAtraso} días` : null].filter(Boolean).join(" · ")}
              </span>
              <span className="block truncate text-[12px] text-texto-4">{textoRecordatorio(f)}</span>
            </button>
            <div className="mt-3 flex gap-2">
              <Boton variante="ghost" className="flex-1" disabled={ocupada(f)} onClick={() => onWhatsapp(f)}>
                WhatsApp
              </Boton>
              {cobra && (
                <Boton className="flex-1" onClick={() => onCobrar(f)}>
                  Cobrar
                </Boton>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
