import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { capitalizar, duracionTexto, fechaLarga, fechaNegocio } from "../lib/agenda/horaAgenda";
import { apiReserva, ErrorReserva, huecosDelConflicto, type CitaPublica, type EstadoCitaPublica } from "./apiReserva";
import { Aviso, BotonPrincipal, BotonSecundario, Cabecera, CargandoPublico, Circulo, IconoCalendario, IconoCheck, IconoX, Marco } from "./piezas";
import { horaCorta, rutaPublica, ultimaReserva, useNegocioPublico } from "./util";
import SelectorHorario from "./SelectorHorario";

/** Cómo se dice cada estado en la tarjeta del cliente. */
const ETIQUETA: Partial<Record<EstadoCitaPublica, { texto: string; tono: "gris" | "marca" | "rojo" }>> = {
  SOLICITADA: { texto: "POR CONFIRMAR", tono: "gris" },
  RESERVADA: { texto: "RESERVADA", tono: "marca" },
  CONFIRMADA: { texto: "CONFIRMADA", tono: "marca" },
  EN_ESPERA: { texto: "EN EL LOCAL", tono: "marca" },
  EN_ATENCION: { texto: "EN ATENCIÓN", tono: "marca" },
  POR_COBRAR: { texto: "ATENDIDA", tono: "gris" },
  COMPLETADA: { texto: "ATENDIDA", tono: "gris" },
  CANCELADA: { texto: "CANCELADA", tono: "rojo" },
  RECHAZADA: { texto: "NO APROBADA", tono: "rojo" },
  EXPIRADA: { texto: "VENCIDA", tono: "rojo" },
  NO_ASISTIO: { texto: "NO ASISTIÓ", tono: "rojo" },
};

const TONO = {
  gris: "bg-[#F3F4F6] text-[#374151]",
  marca: "bg-primary-50 text-primary-700",
  rojo: "bg-red-50 text-[#B91C1C]",
};

/**
 * P7 (lienzo ReservaGestion): la cita del enlace secreto. Muestra sólo lo
 * mínimo (§8.4: primer nombre, servicios, horario, profesional y sucursal) y
 * deja confirmar que va, cambiar la hora o cancelar dentro de la ventana.
 * Afuera de la ventana, o con la cita ya terminada, sólo muestra y da el
 * teléfono. Abajo, el pedido de borrado de datos (§8.8).
 */
export default function Gestion() {
  const { sub, datos } = useNegocioPublico();
  const { token = "" } = useParams();
  const [cita, setCita] = useState<CitaPublica | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEsta, setNoEsta] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modo, setModo] = useState<"ver" | "reprogramar" | "cancelar" | "borrar">("ver");

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    apiReserva
      .ver(sub, token)
      .then((c) => {
        if (!vigente) return;
        setCita(c);
        ultimaReserva.guardar(sub, token);
      })
      .catch((e: unknown) => {
        if (!vigente) return;
        if (e instanceof ErrorReserva && e.status === 404) setNoEsta(true);
        else setError((e as Error).message);
      })
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [sub, token]);

  const accion = useCallback(
    async (fn: () => Promise<CitaPublica>, ok: string) => {
      setEnviando(true);
      setError("");
      setAviso("");
      try {
        setCita(await fn());
        setAviso(ok);
        setModo("ver");
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  if (cargando) return <CargandoPublico />;
  if (noEsta || !cita) {
    return (
      <Marco datos={datos} titulo="Reserva">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <Circulo>
            <IconoX />
          </Circulo>
          <h1 className="text-xl font-bold">No encontramos esa reserva</h1>
          <p className="max-w-xs text-sm text-[#4B5563]">
            {error || "Revisá que el enlace esté completo, tal como te llegó."}
          </p>
          {datos && (
            <Link to={rutaPublica(sub, "/reservar")} className="font-bold text-primary-700 underline">
              Hacer una reserva
            </Link>
          )}
        </div>
      </Marco>
    );
  }

  const etiqueta = ETIQUETA[cita.estado] ?? { texto: cita.estado, tono: "gris" as const };
  const telefono = cita.sucursal.telefono ?? cita.negocio.telefono;
  const duracion = cita.servicios.reduce((t, s) => t + s.duracionMin, 0);
  const activa = ["SOLICITADA", "RESERVADA", "CONFIRMADA"].includes(cita.estado);
  const sucursalCatalogo = datos?.sucursales.find((s) => s.slug === cita.sucursal.slug);
  const servicioIds = cita.servicios.map((s) => s.id);
  const quienes =
    sucursalCatalogo?.profesionales.filter((p) => servicioIds.every((id) => p.servicioIds.includes(id))) ?? [];
  const puedeReprogramar = cita.puede.reprogramar && !!sucursalCatalogo;

  return (
    <Marco datos={datos} titulo="Mi reserva" fondo="bg-[#F6F7F9]">
      <Cabecera arriba={cita.negocio.nombre} titulo={cita.primerNombre ? `Hola, ${cita.primerNombre}` : "Tu reserva"} />
      <div className="flex flex-1 flex-col gap-4 p-5">
        <section className="flex flex-col gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[#6B7280]">Tu cita · {cita.codigo}</span>
            <span className={`rounded-lg px-2 py-[3px] text-[11px] font-bold ${TONO[etiqueta.tono]}`}>{etiqueta.texto}</span>
          </div>
          <strong className="text-lg">
            {capitalizar(fechaLarga(fechaNegocio(cita.inicio)))} · {horaCorta(cita.inicio)}
          </strong>
          <span className="text-sm text-[#374151]">
            {cita.servicios.map((s) => s.nombre).join(" + ")} · {duracionTexto(duracion)}
            {cita.profesional ? ` · con ${cita.profesional.nombre}` : ""}
          </span>
          <span className="text-sm text-[#374151]">
            {[cita.sucursal.nombre, cita.sucursal.direccion].filter(Boolean).join(" · ")}
          </span>
          <Explicacion cita={cita} />
        </section>

        <Aviso tono="info">{aviso}</Aviso>
        <Aviso>{error}</Aviso>

        {modo === "ver" && (
          <>
            {cita.puede.confirmar && cita.estado === "RESERVADA" && (
              <BotonPrincipal disabled={enviando} onClick={() => accion(() => apiReserva.confirmar(sub, token), "¡Listo! Le avisamos al negocio que vas.")}>
                <IconoCheck />
                Confirmo que voy
              </BotonPrincipal>
            )}
            {puedeReprogramar && (
              <BotonSecundario disabled={enviando} onClick={() => setModo("reprogramar")}>
                Cambiar día u hora
              </BotonSecundario>
            )}
            {cita.puede.cancelar && (
              <BotonSecundario peligro disabled={enviando} onClick={() => setModo("cancelar")}>
                Cancelar mi cita
              </BotonSecundario>
            )}
            {activa && (
              <p className="text-center text-[13px] text-[#6B7280]">
                {cita.puede.cancelar
                  ? cita.ventanaCancelacionHoras > 0
                    ? `Podés cambiar o cancelar hasta ${cita.ventanaCancelacionHoras} horas antes. Después, llamá al negocio.`
                    : "Podés cambiar o cancelar hasta la hora de la cita."
                  : "Ya no se puede cambiar ni cancelar por acá: llamá al negocio."}
              </p>
            )}
            {activa && (
              <a
                href={apiReserva.urlIcs(sub, token)}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-[15px] text-[#374151]"
              >
                <IconoCalendario />
                Agregar a mi calendario
              </a>
            )}
            {!activa && datos && (
              <Link
                to={rutaPublica(sub, "/reservar")}
                className="flex min-h-12 items-center justify-center rounded-xl bg-primary-boton text-[15px] font-bold text-white"
              >
                Hacer otra reserva
              </Link>
            )}
          </>
        )}

        {modo === "cancelar" && (
          <section className="flex flex-col gap-3 rounded-2xl border border-[#FECACA] bg-white p-4">
            <p className="text-sm">¿Seguro que querés cancelar? El horario queda libre para otra persona.</p>
            <BotonSecundario
              peligro
              disabled={enviando}
              onClick={() => accion(() => apiReserva.cancelar(sub, token), "Cancelaste tu cita.")}
            >
              {enviando ? "Cancelando…" : "Sí, cancelar mi cita"}
            </BotonSecundario>
            <BotonSecundario disabled={enviando} onClick={() => setModo("ver")}>
              No, volver
            </BotonSecundario>
          </section>
        )}

        {modo === "reprogramar" && sucursalCatalogo && (
          <Reprogramar
            sub={sub}
            token={token}
            cita={cita}
            sucursal={sucursalCatalogo.slug}
            profesionales={quienes}
            primeraFecha={sucursalCatalogo.reglas.primeraFecha}
            ultimaFecha={sucursalCatalogo.reglas.ultimaFecha}
            manual={sucursalCatalogo.reglas.modoConfirmacion === "MANUAL"}
            onListo={(c) => {
              setCita(c);
              setModo("ver");
              setAviso(
                c.estado === "SOLICITADA"
                  ? "Pediste el cambio: el negocio lo confirma en un rato."
                  : "Listo, tu cita quedó en el nuevo horario.",
              );
            }}
            onVolver={() => setModo("ver")}
          />
        )}

        {telefono && (
          <p className="text-center text-[13px] text-[#6B7280]">
            ¿Dudas? Llamá al negocio:{" "}
            <a href={`tel:${telefono}`} className="underline">
              {telefono}
            </a>
          </p>
        )}

        <div className="mt-auto border-t border-[#E5E7EB] pt-4 text-center">
          {cita.borradoSolicitado ? (
            <p className="text-xs text-[#6B7280]">
              Pediste que borren tus datos. {cita.negocio.nombre} se encarga y te avisa.
            </p>
          ) : modo === "borrar" ? (
            <div className="flex flex-col gap-2">
              <p className="text-[13px] text-[#374151]">
                Le vamos a pedir a {cita.negocio.nombre} que borre tu nombre y tu teléfono. Lo hace el negocio, que es
                el responsable de tus datos.
              </p>
              <BotonSecundario
                disabled={enviando}
                onClick={() => accion(() => apiReserva.pedirBorrado(sub, token), "Pedido enviado.")}
              >
                Sí, pedir que borren mis datos
              </BotonSecundario>
              <button type="button" className="text-xs text-[#6B7280] underline" onClick={() => setModo("ver")}>
                Volver
              </button>
            </div>
          ) : (
            cita.puede.pedirBorrado && (
              <button type="button" className="text-xs text-[#6B7280] underline" onClick={() => setModo("borrar")}>
                Quiero que borren mis datos
              </button>
            )
          )}
          <p className="mt-2 text-xs text-[#9CA3AF]">
            <Link to={rutaPublica(sub, "/privacidad")} className="underline">
              Política de privacidad
            </Link>
          </p>
        </div>
      </div>
    </Marco>
  );
}

/** Lo que el cliente tiene que saber según el estado. */
function Explicacion({ cita }: { cita: CitaPublica }) {
  const texto = (() => {
    switch (cita.estado) {
      case "SOLICITADA":
        return "El negocio todavía no la aprobó. Mirá este enlace más tarde para ver si la confirmaron.";
      case "RECHAZADA":
        return cita.motivoRechazo
          ? `El negocio no pudo aceptarla: «${cita.motivoRechazo}».`
          : "El negocio no pudo aceptar esta reserva.";
      case "EXPIRADA":
        return "Nadie la confirmó a tiempo y el horario se liberó. Podés volver a reservar.";
      case "CANCELADA":
        return cita.canceladaPorCliente ? "Cancelaste esta cita." : "El negocio canceló esta cita.";
      case "NO_ASISTIO":
        return "La cita figura como no asistida.";
      default:
        return null;
    }
  })();
  return texto ? <p className="text-[13px] text-[#4B5563]">{texto}</p> : null;
}

function Reprogramar({
  sub,
  token,
  cita,
  sucursal,
  profesionales,
  primeraFecha,
  ultimaFecha,
  manual,
  onListo,
  onVolver,
}: {
  sub: string;
  token: string;
  cita: CitaPublica;
  sucursal: string;
  profesionales: { id: number; nombre: string; servicioIds: number[] }[];
  primeraFecha: string;
  ultimaFecha: string;
  manual: boolean;
  onListo: (c: CitaPublica) => void;
  onVolver: () => void;
}) {
  const [profesional, setProfesional] = useState<number | null>(cita.profesional?.id ?? null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  async function guardar() {
    if (!inicio) return setError("Elegí el nuevo horario.");
    setEnviando(true);
    setError("");
    try {
      onListo(await apiReserva.reprogramar(sub, token, { inicio, profesionalId: profesional }));
    } catch (e) {
      if (huecosDelConflicto(e)) {
        setInicio(null);
        setVersion((v) => v + 1);
      }
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-4" aria-label="Cambiar día u hora">
      <SelectorHorario
        sub={sub}
        sucursal={sucursal}
        servicioIds={cita.servicios.map((s) => s.id)}
        profesionales={profesionales}
        profesional={profesional}
        onProfesional={(id) => {
          setProfesional(id);
          setInicio(null);
        }}
        inicio={inicio}
        onInicio={setInicio}
        primeraFecha={primeraFecha}
        ultimaFecha={ultimaFecha}
        token={token}
        version={version}
      />
      {manual && (
        <p className="text-[13px] text-[#6B7280]">El cambio vuelve a pasar por el negocio, que lo confirma.</p>
      )}
      <Aviso>{error}</Aviso>
      <BotonPrincipal disabled={enviando || !inicio} onClick={guardar}>
        {enviando
          ? "Guardando…"
          : inicio
            ? `Cambiar a ${capitalizar(fechaLarga(fechaNegocio(inicio)).split(" ").slice(0, 2).join(" "))} · ${horaCorta(inicio)}`
            : "Elegí el nuevo horario"}
      </BotonPrincipal>
      <BotonSecundario disabled={enviando} onClick={onVolver}>
        Volver
      </BotonSecundario>
    </section>
  );
}
