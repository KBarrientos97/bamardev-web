import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { completo, cuantosHechos, pasosEsperados, pasosPrimeros } from "../../lib/academia/primerosPasos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { tienePermiso } from "../../lib/permisos";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { BotonFila, claseBotonFila, Tarjeta } from "./piezas";

/**
 * C1 · «Primeros pasos» (auditoría 26-oct): la lista de seis casillas que le
 * dice a un instituto nuevo por dónde empezar. Va arriba del Calendario y de
 * la Configuración mientras haya pasos pendientes. Se marca sola con los datos
 * que ya existen (sedes, ajustes, cursos, docentes y grupos: nada nuevo en el
 * backend) y desaparece sola al completarse. Quien configura también puede
 * ocultarla con «Ya lo sé»; esa preferencia, y el «ya está completa», se
 * guardan en este navegador (si el almacenamiento no anda, la lista simplemente
 * vuelve a mostrarse). La recepción y el docente no la ven: no son quienes
 * arman el instituto.
 */

type Marca = "oculto" | "completo";

const clave = (negocioId: number | undefined) => `bamardev_primeros_pasos_${negocioId ?? 0}`;

function leerMarca(negocioId: number | undefined): Marca | null {
  try {
    const v = localStorage.getItem(clave(negocioId));
    return v === "oculto" || v === "completo" ? v : null;
  } catch {
    return null;
  }
}

function guardarMarca(negocioId: number | undefined, marca: Marca) {
  try {
    localStorage.setItem(clave(negocioId), marca);
  } catch {
    // Modo privado o almacenamiento bloqueado: se vuelve a mostrar la próxima vez.
  }
}

/** Una carga que si falla (un permiso, un corte) deja `null` en vez de romper: ese paso no se muestra. */
const segura = <T,>(pedir: () => Promise<T>) => Promise.resolve().then(pedir).catch(() => null);

export default function PrimerosPasos() {
  const { usuario, negocio, rubro } = useAuth();
  const [marca, setMarca] = useState<Marca | null>(() => leerMarca(negocio?.id));
  // Sólo quien arma el instituto. Y sin pedir nada al backend si no le toca verla.
  const configura = rubro === "ACADEMIA" && tienePermiso(usuario, "academia.configurar");
  if (!configura || marca) return null;
  return (
    <ListaPrimerosPasos
      onOcultar={() => {
        guardarMarca(negocio?.id, "oculto");
        setMarca("oculto");
      }}
      onCompleta={() => {
        guardarMarca(negocio?.id, "completo");
        setMarca("completo");
      }}
    />
  );
}

function ListaPrimerosPasos({ onOcultar, onCompleta }: { onOcultar: () => void; onCompleta: () => void }) {
  const p = usePalabras();
  const { negocio } = useAuth();
  const sedes = useApi(() => segura(() => apiAcademia.sedes()), []);
  const ajustes = useApi(() => segura(() => apiAcademia.ajustes()), []);
  const cursos = useApi(() => segura(() => apiAcademia.carreras()), []);
  const docentes = useApi(() => segura(() => apiAcademia.docentes()), []);
  const grupos = useApi(() => segura(async () => (await apiAcademia.grupos({ pageSize: 100 })).items), []);

  const cargando = [sedes, ajustes, cursos, docentes, grupos].some((c) => c.cargando);
  const pasos = pasosPrimeros({
    sedes: sedes.datos,
    ajustes: ajustes.datos,
    cursos: cursos.datos,
    docentes: docentes.datos,
    grupos: grupos.datos,
    features: negocio?.features,
    palabras: { carrera: p.carrera, docente: p.docente, sede: p.sede, Sede: p.Sede, Sedes: p.Sedes },
  });
  const lista = !cargando && pasos.length > 0;
  const terminada = lista && completo(pasos);
  // «Completa» se recuerda sólo con todos los pasos a la vista: si uno no se pudo
  // saber (un permiso que falta), no se la da por terminada para siempre.
  const sinDudas = pasos.length >= pasosEsperados(negocio?.features);
  useEffect(() => {
    if (terminada && sinDudas) onCompleta();
    // `onCompleta` cambia en cada render del padre; sólo importa el momento en que se completa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminada, sinDudas]);

  if (!lista || terminada) return null;
  const hechos = cuantosHechos(pasos);

  return (
    <Tarjeta
      titulo="Primeros pasos"
      id="t-primeros-pasos"
      bajada={`${hechos} de ${pasos.length} listos. Se marca sola a medida que lo vas cargando.`}
      acciones={
        <BotonFila variante="ghost" onClick={onOcultar} title="Ocultar esta lista en este navegador">
          Ya lo sé
        </BotonFila>
      }
    >
      <div
        role="progressbar"
        aria-label="Primeros pasos"
        aria-valuemin={0}
        aria-valuemax={pasos.length}
        aria-valuenow={hechos}
        className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(hechos / pasos.length) * 100}%` }} />
      </div>
      <ol className="divide-y divide-borde-soft">
        {pasos.map((paso, i) => (
          <li key={paso.clave} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <span
              aria-hidden="true"
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                paso.hecho ? "bg-emerald-100 text-emerald-700" : "border border-borde bg-white text-texto-3"
              }`}
            >
              {paso.hecho ? <Icon name="check" size={14} /> : i + 1}
            </span>
            <span className="min-w-0 flex-1 basis-48">
              <span className={`block text-sm font-semibold ${paso.hecho ? "text-texto-3 line-through decoration-texto-4/60" : "text-texto"}`}>
                <span className="sr-only">{paso.hecho ? "Listo: " : "Falta: "}</span>
                {paso.titulo}
              </span>
              {!paso.hecho && <span className="block text-[13px] text-texto-3">{paso.detalle}</span>}
            </span>
            {!paso.hecho && (
              <Link to={paso.a} className={claseBotonFila("soft")}>
                {paso.accion}
                <Icon name="chevronRight" size={15} />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}
