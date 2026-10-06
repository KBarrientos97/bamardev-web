/**
 * Lo que la fase 3 le suma al formulario del servicio (espacio y pose), sin
 * pantalla: los valores del formulario y cómo se convierten en el cuerpo del
 * PATCH. Aparte del componente para que el refresco en caliente funcione.
 */
export interface ValoresSpaServicio {
  requiereEspacioTipoId: string;
  poseInicio: string;
  poseMin: string;
}

export function valoresIniciales(s: {
  requiereEspacioTipoId?: number | null;
  poseInicioMin?: number | null;
  poseMin?: number | null;
}): ValoresSpaServicio {
  return {
    requiereEspacioTipoId: s.requiereEspacioTipoId != null ? String(s.requiereEspacioTipoId) : "",
    poseInicio: s.poseInicioMin != null ? String(s.poseInicioMin) : "",
    poseMin: s.poseMin != null ? String(s.poseMin) : "",
  };
}

/**
 * Lo que se manda al backend, o el error para mostrar. La pose va completa
 * (cuándo empieza y cuánto dura) o no va, y tiene que terminar antes del fin:
 * después hay un último tramo de trabajo (el backend dice lo mismo).
 *
 * Sólo viaja lo que cambió respecto de `inicial`: guardar un servicio sin
 * tocar la pose manda el mismo cuerpo de siempre.
 */
export function aCambiosSpa(
  v: ValoresSpaServicio,
  duracionMin: number | null,
  conEspacios: boolean,
  inicial?: ValoresSpaServicio,
):
  | { error: string }
  | { cambios: { requiereEspacioTipoId?: number | null; poseInicioMin?: number | null; poseMin?: number | null } } {
  const inicio = v.poseInicio.trim() === "" ? null : Number(v.poseInicio);
  const min = v.poseMin.trim() === "" ? null : Number(v.poseMin);
  if ((inicio == null) !== (min == null)) {
    return { error: "Para la pose indicá a los cuántos minutos empieza y cuánto dura." };
  }
  if (inicio != null && min != null) {
    if (!Number.isInteger(inicio) || !Number.isInteger(min) || inicio < 1 || min < 1) {
      return { error: "La pose va en minutos enteros, mayores que cero." };
    }
    if (duracionMin == null || inicio + min >= duracionMin) {
      return { error: "La pose tiene que terminar antes del fin del servicio." };
    }
  }
  const cambioEspacio = !inicial || v.requiereEspacioTipoId !== inicial.requiereEspacioTipoId;
  const cambioPose = !inicial || v.poseInicio.trim() !== inicial.poseInicio || v.poseMin.trim() !== inicial.poseMin;
  return {
    cambios: {
      ...(conEspacios && cambioEspacio
        ? { requiereEspacioTipoId: v.requiereEspacioTipoId ? Number(v.requiereEspacioTipoId) : null }
        : {}),
      ...(cambioPose ? { poseInicioMin: inicio, poseMin: min } : {}),
    },
  };
}

