import { Buscador } from "../../components/filtros";
import { PLACEHOLDER_BUSCAR_ESTUDIANTE } from "../../lib/academia/useBusquedaEstudiante";
import { usePalabras } from "../../lib/academia/usePalabras";

/**
 * El buscador de estudiante, uno solo (auditoría 26-oct, D2): el mismo en
 * Estudiantes, Cobrar, Inscribir y Cobranza. La demora y el mínimo de letras
 * viven en `lib/academia/useBusquedaEstudiante.ts`.
 */
export default function BuscadorEstudiante({
  valor,
  onChange,
  autoFocus,
}: {
  valor: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
}) {
  const p = usePalabras();
  return (
    <Buscador
      valor={valor}
      onChange={onChange}
      placeholder={PLACEHOLDER_BUSCAR_ESTUDIANTE}
      etiqueta={`Buscar ${p.alumno}`}
      autoFocus={autoFocus}
    />
  );
}
