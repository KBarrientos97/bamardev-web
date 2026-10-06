import { Campo, Input, Select } from "../../../components/ui";
import type { TipoEspacio } from "../../../lib/agenda/tiposSpa";
import type { ValoresSpaServicio } from "../../../lib/agenda/servicioSpa";

/**
 * Lo que la fase 3 le suma al servicio: el espacio que ocupa (feature
 * `espacios`) y el tiempo de pose (§7.5: trabajo · pose · trabajo, la pose
 * deja libre al profesional para otra cita).
 *
 * Componente aparte para que el formulario del servicio sólo sume unas
 * líneas: la pestaña de servicios la tocan varias ramas a la vez.
 */
export default function CamposSpaServicio({
  valores,
  onChange,
  tipos,
  conEspacios,
}: {
  valores: ValoresSpaServicio;
  onChange: (v: ValoresSpaServicio) => void;
  tipos: TipoEspacio[];
  conEspacios: boolean;
}) {
  const set = (campo: keyof ValoresSpaServicio) => (valor: string) =>
    onChange({ ...valores, [campo]: valor });
  return (
    <div className="space-y-3 rounded-xl border border-borde-soft p-3">
      {conEspacios && (
        <Campo label="Espacio que ocupa" hint="Si pide cabina, se agenda sólo cuando haya una libre.">
          <Select
            value={valores.requiereEspacioTipoId}
            onChange={(e) => set("requiereEspacioTipoId")(e.target.value)}
            aria-label="Espacio que ocupa"
          >
            <option value="">No ocupa espacio</option>
            {tipos
              .filter((t) => t.activo || String(t.id) === valores.requiereEspacioTipoId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nombre}
                </option>
              ))}
          </Select>
        </Campo>
      )}
      <div>
        <p className="text-[13px] font-semibold text-texto-2">Tiempo de pose</p>
        <p className="mb-2 text-xs text-texto-4">
          Mientras actúa el producto, el profesional queda libre para otra cita. Vacío = ocupa todo el servicio.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Empieza a los (min)">
            <Input
              type="number"
              inputMode="numeric"
              value={valores.poseInicio}
              onChange={(e) => set("poseInicio")(e.target.value)}
              placeholder="30"
            />
          </Campo>
          <Campo label="Dura (min)">
            <Input
              type="number"
              inputMode="numeric"
              value={valores.poseMin}
              onChange={(e) => set("poseMin")(e.target.value)}
              placeholder="40"
            />
          </Campo>
        </div>
      </div>
    </div>
  );
}
