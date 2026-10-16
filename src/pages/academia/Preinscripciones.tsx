import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EncabezadoPagina } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import { Paginacion } from "../../components/Paginacion";
import { AvisoOk, Boton, Cargando, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { EVENTO_PREINSCRIPCIONES } from "../../lib/academia/contadorPreinscripciones";
import { nombreAlumno, nombreDe } from "../../lib/academia/formato";
import type { Preinscripcion } from "../../lib/academia/tipos";
import { useFiltroSede } from "../../lib/academia/useFiltroSede";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, rutaCobroInscripcion } from "../../lib/academia/vista";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { tiempoRelativo } from "../../lib/format";
import { usePaginado } from "../../lib/paginado";
import { useAuth } from "../../store/AuthContext";
import PedirMotivo from "../agenda/PedirMotivo";
import Inscribir from "./Inscribir";

const MOTIVOS_DESCARTE = ["No contestó", "Eligió otro instituto", "Ya no le interesa", "Otro"] as const;

/**
 * E20 · Preinscripciones (PLAN-ACADEMIAS §5): lo que llega desde la página
 * del instituto. No pagan nada: se les escribe por WhatsApp y se los inscribe
 * cuando vienen ("Inscribir" abre E5 con los datos cargados) o se descartan
 * con motivo. Las de más de 30 días quedan marcadas como viejas.
 */
export default function Preinscripciones() {
  const { negocio } = useAuth();
  const p = usePalabras();
  const navigate = useNavigate();
  const sede = useFiltroSede();
  const [aviso, setAviso] = useAviso(5000);
  const [error, setError] = useState("");
  const [inscribiendo, setInscribiendo] = useState<Preinscripcion | null>(null);
  const [descartando, setDescartando] = useState<Preinscripcion | null>(null);
  const lista = usePaginado((pg) => apiAcademia.preinscripciones({ ...pg, sede: sede.sucursalId }), [sede.sucursalId]);

  const avisarCambio = () => window.dispatchEvent(new Event(EVENTO_PREINSCRIPCIONES));

  function whatsapp(s: Preinscripcion) {
    const aTutor = s.alumno.menor && s.tutor?.telefono;
    const telefono = aTutor ? s.tutor!.telefono : s.alumno.telefono;
    const nombre = (aTutor ? s.tutor!.nombre : s.alumno.nombres).split(" ")[0];
    const texto = `Hola ${nombre}, te escribimos de ${negocio?.nombre ?? "la academia"} por la preinscripción ${
      aTutor ? `de ${s.alumno.nombres} ` : ""
    }a ${nombreDe(s.grupo.carrera)} (${s.grupo.nombre}).`;
    const url = enlaceWhatsApp(telefono, texto);
    if (url) abrirWhatsapp(url);
    else setError("No dejó un teléfono válido.");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6 lg:p-8">
      <nav className="text-[13px] text-texto-3">
        <Link to="/academia/alumnos" className="hover:underline">
          {p.Alumnos}
        </Link>{" "}
        / Preinscripciones
      </nav>
      <EncabezadoPagina
        titulo="Preinscripciones"
        subtitulo={lista.total ? `${lista.total} por atender` : "Llegan desde la página del instituto."}
      />
      {sede.selector}
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {lista.error && !lista.items.length ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.items.length ? (
        <Cargando />
      ) : lista.items.length === 0 ? (
        <Vacio icono="bell" titulo="No hay preinscripciones por atender" texto="Cuando alguien se preinscriba desde tu página, aparece acá." />
      ) : (
        <>
          <ul className="divide-y divide-borde-soft border-y border-borde-soft">
            {lista.items.map((s) => (
              <li key={s.id} className={`flex flex-wrap items-start gap-3 py-4 ${s.vieja ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1 basis-60 space-y-1">
                  <p className="text-[15px] font-semibold text-texto">
                    {nombreAlumno(s.alumno)}
                    {s.vieja && <span className="ml-2 text-[12px] font-normal text-texto-3">vieja</span>}
                  </p>
                  <p className="text-[13px] text-texto-2">
                    {nombreDe(s.grupo.carrera)} · {s.grupo.nombre} · {nombreDe(s.grupo.sede)}
                  </p>
                  <p className="text-[13px] text-texto-3">
                    {[
                      s.alumno.telefono,
                      s.alumno.menor ? `Menor · tutor: ${s.tutor?.nombre ?? "sin cargar"}` : null,
                      s.turnoPreferido ? `Prefiere: ${s.turnoPreferido}` : null,
                      `llegó ${tiempoRelativo(s.preinscritaEn).toLowerCase()}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {s.mensaje && <p className="text-[13px] italic text-texto-3">“{s.mensaje}”</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Boton variante="ghost" onClick={() => whatsapp(s)}>
                    WhatsApp
                  </Boton>
                  <Boton onClick={() => setInscribiendo(s)}>Inscribir</Boton>
                  <button
                    type="button"
                    aria-label={`Descartar la preinscripción de ${nombreAlumno(s.alumno)}`}
                    onClick={() => setDescartando(s)}
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-texto-3 hover:bg-muted"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <Paginacion {...lista.paginacion} />
        </>
      )}

      {inscribiendo && (
        <Inscribir
          preinscripcion={inscribiendo}
          onCerrar={() => setInscribiendo(null)}
          onInscrito={(r) => {
            setInscribiendo(null);
            setAviso(`${nombreAlumno(inscribiendo.alumno)} quedó inscrito.`);
            lista.recargar();
            avisarCambio();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede));
          }}
        />
      )}
      {descartando && (
        <PedirMotivo
          titulo="Descartar la preinscripción"
          texto={`${nombreAlumno(descartando.alumno)} · ${descartando.grupo.nombre}`}
          motivos={MOTIVOS_DESCARTE}
          etiquetaOk="Descartar"
          peligroso
          onCancelar={() => setDescartando(null)}
          onConfirmar={async (motivo) => {
            const s = descartando;
            try {
              await apiAcademia.descartar(s.id, motivo);
              setDescartando(null);
              lista.setItems(lista.items.filter((x) => x.id !== s.id));
              setAviso("Preinscripción descartada.");
              avisarCambio();
            } catch (e) {
              setDescartando(null);
              setError(e instanceof Error ? e.message : "No se pudo descartar");
            }
          }}
        />
      )}
    </div>
  );
}
