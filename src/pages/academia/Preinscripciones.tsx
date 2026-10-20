import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Chips, EncabezadoPagina, FilaFiltros } from "../../components/filtros";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Paginacion } from "../../components/Paginacion";
import { AvisoOk, Boton, Cargando, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { EVENTO_PREINSCRIPCIONES } from "../../lib/academia/contadorPreinscripciones";
import { textoFaltanFotos } from "../../lib/academia/fotos";
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
 * E20 · Inscripciones online (PLAN-ACADEMIAS §5, ronda 2): lo que llega desde
 * la página del instituto, ya con las 3 fotos y la forma de pago elegida.
 * Van en dos bloques: las que pagaron con el QR del banco (activas, sólo se
 * revisan) y las que pagan en el instituto ("Cobrar e inscribir" abre N5 con
 * todo cargado). Mientras el QR de BISA no exista (D10) todas caen en el
 * segundo. WhatsApp y Descartar van en el menú ⋯ de cada una.
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
  // Por atender (PREINSCRITA) o las descartadas, que quedan con su estado (#7).
  const [estado, setEstado] = useState<"PREINSCRITA" | "DESCARTADA">("PREINSCRITA");
  const descartadas = estado === "DESCARTADA";
  const lista = usePaginado(
    (pg) => apiAcademia.preinscripciones({ ...pg, sede: sede.sucursalId, estado }),
    [sede.sucursalId, estado],
  );

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
      <nav aria-label="Ruta" className="text-[13px] text-texto-3">
        <Link to="/academia/alumnos" className="hover:underline">
          {p.Alumnos}
        </Link>{" "}
        / Inscripciones online
      </nav>
      <EncabezadoPagina
        titulo="Inscripciones online"
        subtitulo={descartadas ? `${lista.total} descartadas` : "Llegan desde la página del instituto, con las 3 fotos subidas"}
      />
      <FilaFiltros>
        <Chips
          titulo="Cuáles"
          valor={estado}
          opciones={[
            ["PREINSCRITA", "Por atender"],
            ["DESCARTADA", "Descartadas"],
          ]}
          onChange={setEstado}
        />
        {sede.selector}
      </FilaFiltros>
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      {lista.error && !lista.items.length ? (
        <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
      ) : lista.cargando && !lista.items.length ? (
        <Cargando />
      ) : lista.items.length === 0 ? (
        descartadas ? (
          <Vacio icono="bell" titulo="No hay inscripciones descartadas" />
        ) : (
          <Vacio icono="bell" titulo="No hay inscripciones por atender" texto="Cuando alguien se inscriba desde tu página, aparece acá." />
        )
      ) : (
        <>
          {(descartadas
            ? [{ clave: "todas", titulo: "", sub: "", filas: lista.items }]
            : [
                { clave: "qr", titulo: "Pagaron con QR", sub: "Ya están activas · sólo revisalas", filas: lista.items.filter((s) => s.pagoQr) },
                { clave: "local", titulo: "Pagan en el instituto", sub: "Falta cobrar", filas: lista.items.filter((s) => !s.pagoQr) },
              ]
          )
            .filter((b) => b.filas.length)
            .map((b) => (
              <section key={b.clave} aria-label={b.titulo || "Descartadas"} className="space-y-2">
                {b.titulo && (
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="text-base font-bold text-texto">
                      {b.titulo} <span className={`tabular-nums ${b.clave === "local" ? "text-warning-text" : "text-texto-4"}`}>{b.filas.length}</span>
                    </h2>
                    <span className="text-[13px] text-texto-3">{b.sub}</span>
                  </div>
                )}
                <ul className="divide-y divide-borde-soft border-y border-borde-soft">
                  {b.filas.map((s) => (
                    <FilaInscripcion
                      key={s.id}
                      s={s}
                      descartada={descartadas}
                      onInscribir={() => setInscribiendo(s)}
                      onWhatsapp={() => whatsapp(s)}
                      onDescartar={() => setDescartando(s)}
                    />
                  ))}
                </ul>
              </section>
            ))}
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
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy));
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
          faltaMotivo="Elegí el motivo: queda anotado en la ficha."
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

/**
 * Una inscripción que llegó por la página: quién es, las 3 fotos (con
 * candado: la imagen sólo la ve el administrador), el curso, la forma de pago
 * que eligió y qué falta. Una sola acción a la vista; lo demás en ⋯.
 */
function FilaInscripcion({
  s,
  descartada,
  onInscribir,
  onWhatsapp,
  onDescartar,
}: {
  s: Preinscripcion;
  descartada: boolean;
  onInscribir: () => void;
  onWhatsapp: () => void;
  onDescartar: () => void;
}) {
  const fotos = s.fotos ?? null;
  const forma = s.planElegido
    ? s.planElegido.generado === "MES_A_MES"
      ? "Mes a mes"
      : s.planElegido.generado === "COMPLETO"
        ? "Pago completo"
        : s.planElegido.nombre
    : null;
  const acciones: AccionMenu[] = [
    { clave: "whatsapp", etiqueta: "WhatsApp", icono: "phone", onClick: onWhatsapp },
    // Una descartada ya no se convierte (400 NO_ES_PREINSCRIPCION).
    ...(descartada ? [] : [{ clave: "descartar", etiqueta: "Descartar", icono: "close" as const, peligrosa: true, separar: true, onClick: onDescartar }]),
  ];
  return (
    <li className={`grid gap-3 py-4 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto] md:items-center ${s.vieja ? "opacity-60" : ""}`}>
      <div className="min-w-0 space-y-0.5">
        <p className="text-[15px] font-semibold text-texto">
          {nombreAlumno(s.alumno)}
          {s.vieja && <span className="ml-2 text-[12px] font-normal text-texto-3">vieja</span>}
        </p>
        <p className="text-[13px] text-texto-3">
          {[
            s.alumno.menor ? `menor · tutor: ${s.tutor ? `${s.tutor.nombre}${s.tutor.parentesco ? ` (${s.tutor.parentesco})` : ""}` : "sin cargar"}` : null,
            s.alumno.menor && s.tutor?.telefono ? s.tutor.telefono : s.alumno.telefono,
            tiempoRelativo(s.preinscritaEn).toLowerCase(),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {s.turnoPreferido && <p className="text-[13px] text-texto-3">Prefiere: {s.turnoPreferido}</p>}
        {s.mensaje && <p className="text-[13px] italic text-texto-3">“{s.mensaje}”</p>}
      </div>
      {fotos != null && (
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`flex h-9 items-center justify-center rounded-md ${i === 0 ? "w-8" : "w-12"} ${
                  i < fotos ? "bg-primary-50 text-primary-700" : "border border-dashed border-borde text-texto-4"
                }`}
              >
                {i < fotos && <Icon name="lock" size={12} />}
              </span>
            ))}
          </span>
          <span className={`text-xs ${fotos >= 3 ? "text-texto-3" : "font-semibold text-warning-text"}`}>
            {fotos >= 3 ? "3 fotos subidas" : `${textoFaltanFotos(3 - fotos)}`}
          </span>
        </div>
      )}
      <div className="min-w-0 text-[13px]">
        <p className="font-semibold text-texto">{nombreDe(s.grupo.carrera)}</p>
        <p className="text-texto-3">
          {s.grupo.nombre} · {nombreDe(s.grupo.sede)}
        </p>
        <p className={descartada ? "text-texto-3" : s.pagoQr ? "text-texto-3" : "font-semibold text-warning-text"}>
          {[forma, descartada ? null : s.pagoQr ? "pagó con QR" : "falta cobrar"].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {!descartada && !s.pagoQr && <Boton onClick={onInscribir}>Cobrar e inscribir</Boton>}
        <MenuMas etiqueta={`Más acciones de ${nombreAlumno(s.alumno)}`} acciones={acciones} />
      </div>
    </li>
  );
}
