import { useEffect, useState, type ReactNode } from "react";
import { EncabezadoPagina } from "../../../components/filtros";
import { AvisoOk, Boton, Campo, Cargando, ErrorMsg, Input, useAviso } from "../../../components/ui";
import { apiAcademia } from "../../../lib/academia/apiAcademia";
import type { AjustesAcademia as Ajustes } from "../../../lib/academia/tipos";
import { usePalabras } from "../../../lib/academia/usePalabras";
import { useApi } from "../../../lib/useApi";

type Numerico = Exclude<keyof Ajustes, "preinscripcionActiva" | "textosWhatsapp" | "franjas" | "fotosObligatorias" | "retencionActiva" | "diaInicioModulo" | "duracionModuloMeses">;

/** Los que pueden quedar vacíos (null = no aplica). */
const OPCIONALES: Numerico[] = ["descuentoAtrasoPorMin", "asistenciaMinimaPct"];

/**
 * Ajustes académicos (PLAN-ACADEMIAS-TECNICO §8, `/configuracion/academia`):
 * los topes de becas y promociones, las reglas del docente por defecto y lo
 * de notas y asistencia. Cada número se guarda tal cual; el backend valida.
 */
export default function AjustesAcademia() {
  const p = usePalabras();
  const carga = useApi(() => apiAcademia.ajustes(), []);
  const [form, setForm] = useState<Record<Numerico, string> | null>(null);
  const [preinscripcion, setPreinscripcion] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useAviso(4000);

  useEffect(() => {
    const a = carga.datos;
    if (!a) return;
    setForm({
      notaMinima: String(a.notaMinima ?? ""),
      escalaMax: String(a.escalaMax ?? ""),
      toleranciaAtrasoMin: String(a.toleranciaAtrasoMin ?? ""),
      descuentoAtrasoPorMin: a.descuentoAtrasoPorMin == null ? "" : String(a.descuentoAtrasoPorMin),
      pctDocenteDefecto: String(a.pctDocenteDefecto ?? ""),
      retencionPctDefecto: String(a.retencionPctDefecto ?? ""),
      topePromoSinPinPct: String(a.topePromoSinPinPct ?? ""),
      asistenciaMinimaPct: a.asistenciaMinimaPct == null ? "" : String(a.asistenciaMinimaPct),
    });
    setPreinscripcion(a.preinscripcionActiva);
  }, [carga.datos]);

  if (carga.error && !carga.datos) {
    return (
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        <ErrorMsg onReintentar={carga.recargar}>{carga.error}</ErrorMsg>
      </div>
    );
  }
  if (!form || !carga.datos) return <Cargando />;

  const campo = (k: Numerico, label: string, hint?: string) => (
    <Campo label={label} hint={hint}>
      <Input type="number" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </Campo>
  );

  async function guardar() {
    const cambios: Partial<Ajustes> = { preinscripcionActiva: preinscripcion };
    for (const [k, v] of Object.entries(form!) as [Numerico, string][]) {
      if (v.trim() === "") {
        if (!OPCIONALES.includes(k)) return setError("Completá los números (sólo el descuento por minuto y la asistencia mínima pueden quedar vacíos).");
        (cambios as Record<string, unknown>)[k] = null;
      } else {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return setError("Los números no pueden ser negativos.");
        (cambios as Record<string, unknown>)[k] = n;
      }
    }
    setGuardando(true);
    setError("");
    try {
      carga.setDatos(await apiAcademia.guardarAjustes(cambios));
      setAviso("Ajustes guardados.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <EncabezadoPagina
        titulo="Ajustes académicos"
        subtitulo="Configuración"
        accion={
          <Boton onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Boton>
        }
      />
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <Bloque titulo="Becas y promociones">
        {campo("topePromoSinPinPct", "Tope sin autorización (%)", "Más que eso pide el PIN de quien autoriza.")}
      </Bloque>

      <Bloque titulo={`Reglas del ${p.docente} (por defecto)`}>
        {campo("pctDocenteDefecto", `% del ${p.docente}`, "De lo cobrado de su materia.")}
        {campo("retencionPctDefecto", "Retención si no factura (%)")}
        {campo("toleranciaAtrasoMin", "El atraso cuenta desde (min)")}
        {campo("descuentoAtrasoPorMin", "Descuento por minuto de atraso (Bs)", "Vacío = no se descuenta.")}
      </Bloque>

      <Bloque titulo="Notas y asistencia">
        {campo("notaMinima", "Nota mínima para aprobar")}
        {campo("escalaMax", "Nota máxima de la escala")}
        {campo("asistenciaMinimaPct", "Asistencia mínima (%)", "Vacío = no se exige.")}
      </Bloque>

      <Bloque titulo="Página del instituto">
        <label className="flex items-center gap-2 text-sm text-texto sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[var(--color-primary-boton)]"
            checked={preinscripcion}
            onChange={(e) => setPreinscripcion(e.target.checked)}
          />
          Recibir preinscripciones desde la página
        </label>
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className="space-y-3 border-t border-borde-soft pt-5">
      <h2 className="text-base font-bold text-texto">{titulo}</h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
