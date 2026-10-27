import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../../components/Icon";
import MenuMas, { type AccionMenu } from "../../components/MenuMas";
import { Paginacion } from "../../components/Paginacion";
import { AvisoOk, Cargando, ErrorMsg, Vacio, useAviso } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { EVENTO_PREINSCRIPCIONES } from "../../lib/academia/contadorPreinscripciones";
import { avisoFotosPendientes, textoFaltanFotos } from "../../lib/academia/fotos";
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
import { BotonCompartirInscripcion } from "./CompartirInscripcion";
import { BotonFila, Chip, ChipsFiltro, EncabezadoPagina, LISTA, PaginaAcademia, Tarjeta } from "./piezas";

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

  const bloques = descartadas
    ? [{ clave: "todas", titulo: "", sub: "", filas: lista.items }]
    : [
        { clave: "qr", titulo: "Pagaron con QR", sub: "Ya están activas · sólo revisalas", filas: lista.items.filter((s) => s.pagoQr) },
        { clave: "local", titulo: "Pagan en el instituto", sub: "Falta cobrar", filas: lista.items.filter((s) => !s.pagoQr) },
      ];

  // Los filtros van en la barra de la tarjeta que filtran: cuáles y de qué sede.
  const filtros = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 py-3">
      <ChipsFiltro<"PREINSCRITA" | "DESCARTADA">
        etiqueta="Cuáles"
        valor={estado}
        opciones={[
          { clave: "PREINSCRITA", label: "Por atender" },
          { clave: "DESCARTADA", label: "Descartadas" },
        ]}
        onChange={setEstado}
      />
      {sede.elegir && (
        <ChipsFiltro
          etiqueta={p.Sede}
          valor={sede.valorChip}
          opciones={[{ clave: "", label: `Todas las ${p.sedes}` }, ...sede.sucursales.map((a) => ({ clave: String(a.id), label: a.nombre }))]}
          onChange={sede.alElegir}
        />
      )}
    </div>
  );

  return (
    <PaginaAcademia ancho="max-w-5xl">
      <EncabezadoPagina
        volver={{ a: "/academia/alumnos", texto: p.Alumnos }}
        titulo="Inscripciones online"
        bajada={descartadas ? `${lista.total} descartadas` : "Llegan desde la página del instituto, con las 3 fotos subidas"}
        // B9: el enlace de un grupo, para que lleguen más por acá.
        acciones={<BotonCompartirInscripcion />}
      />
      <AvisoOk>{aviso}</AvisoOk>
      <ErrorMsg>{error}</ErrorMsg>

      <Tarjeta etiqueta="Inscripciones online" barra={filtros} sinRelleno>
        {lista.error && !lista.items.length ? (
          <div className="p-4 sm:p-5">
            <ErrorMsg onReintentar={lista.recargar}>{lista.error}</ErrorMsg>
          </div>
        ) : lista.cargando && !lista.items.length ? (
          <Cargando />
        ) : lista.items.length === 0 ? (
          descartadas ? (
            <Vacio icono="bell" titulo="No hay inscripciones descartadas" />
          ) : (
            <Vacio icono="bell" titulo="No hay inscripciones por atender" texto="Cuando alguien se inscriba desde tu página, aparece acá." />
          )
        ) : (
          bloques
            .filter((b) => b.filas.length)
            .map((b) => (
              <section key={b.clave} aria-label={b.titulo || "Descartadas"} className="border-t border-borde-soft first:border-t-0">
                {b.titulo && (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-borde-soft bg-muted px-4 py-2.5 sm:px-5">
                    <h2 className="text-sm font-bold text-texto">
                      {b.titulo}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                          b.clave === "local" ? "bg-warning-bg text-warning-text" : "bg-white text-texto-3"
                        }`}
                      >
                        {b.filas.length}
                      </span>
                    </h2>
                    <span className="text-[13px] text-texto-3">{b.sub}</span>
                  </div>
                )}
                <ul className={LISTA.lista}>
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
            ))
        )}
      </Tarjeta>
      {lista.items.length > 0 && <Paginacion {...lista.paginacion} />}

      {inscribiendo && (
        <Inscribir
          preinscripcion={inscribiendo}
          onCerrar={() => setInscribiendo(null)}
          onInscrito={(r) => {
            setInscribiendo(null);
            const sinFotos = avisoFotosPendientes(r.inscripcion);
            setAviso([`${nombreAlumno(inscribiendo.alumno)} quedó inscrito.`, sinFotos].filter(Boolean).join(" "));
            lista.recargar();
            avisarCambio();
            if (r.cobrar) navigate(rutaCobroInscripcion(r.inscripcion.id, r.inscripcion.grupo?.sede, r.montoHoy), sinFotos ? { state: { aviso: sinFotos } } : undefined);
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
    </PaginaAcademia>
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
  const pago = [forma, descartada ? null : s.pagoQr ? "pagó con QR" : "falta cobrar"].filter(Boolean).join(" · ");
  return (
    <li
      className={`grid gap-3 ${LISTA.itemHover} md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center md:gap-5 ${s.vieja ? "opacity-60" : ""}`}
    >
      <div className="min-w-0 space-y-0.5">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-texto">
          {nombreAlumno(s.alumno)}
          {s.vieja && <Chip tono="gris">vieja</Chip>}
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
        {fotos != null && (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span aria-hidden="true" className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={`flex h-8 items-center justify-center rounded-md ${i === 0 ? "w-7" : "w-11"} ${
                    i < fotos ? "border border-primary-100 bg-primary-50 text-primary-700" : "border border-dashed border-borde bg-white text-texto-4"
                  }`}
                >
                  {i < fotos && <Icon name="lock" size={12} />}
                </span>
              ))}
            </span>
            <Chip tono={fotos >= 3 ? "verde" : "ambar"}>{fotos >= 3 ? "3 fotos subidas" : `${textoFaltanFotos(3 - fotos)}`}</Chip>
          </div>
        )}
      </div>
      <div className="min-w-0 space-y-1 text-[13px]">
        <p className="font-semibold text-texto">{nombreDe(s.grupo.carrera)}</p>
        <p className="text-texto-3">
          {s.grupo.nombre} · {nombreDe(s.grupo.sede)}
        </p>
        {pago && <Chip tono={descartada ? "gris" : s.pagoQr ? "verde" : "ambar"}>{pago}</Chip>}
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        {!descartada && !s.pagoQr && (
          <BotonFila variante="primary" className="max-md:flex-1" onClick={onInscribir}>
            Cobrar e inscribir
          </BotonFila>
        )}
        <MenuMas etiqueta={`Más acciones de ${nombreAlumno(s.alumno)}`} acciones={acciones} />
      </div>
    </li>
  );
}
