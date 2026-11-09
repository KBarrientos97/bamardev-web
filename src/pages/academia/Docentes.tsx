import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { AvisoOk, Boton, Cargando, ErrorMsg, Vacio } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { mesDe } from "../../lib/academia/calendario";
import { enlaceAccesoDocente, esCargoDocente, mensajeAccesoDocente, telefonoOculto } from "../../lib/academia/docentes";
import { nombreDe } from "../../lib/academia/formato";
import type { Calendario } from "../../lib/academia/tipos";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp } from "../../lib/academia/vista";
import { enlaceWhatsApp } from "../../lib/agenda/recordatorio";
import { iniciales } from "../../lib/format";
import { apiPersonal, type CargoRol, type Persona } from "../../lib/personal";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { HorarioDocente } from "./HorarioDocente";
import { NuevoDocenteRapido, type AltaDocente } from "./NuevoDocenteRapido";
import { Chip, EncabezadoPagina, PaginaAcademia, Tarjeta } from "./piezas";

/** Un grupo que dicta el docente este mes, como se lo nombra en su tarjeta. */
interface GrupoDelDocente {
  grupoId: number;
  texto: string;
}

/**
 * Docentes (rediseño de noviembre): los docentes del instituto en un solo
 * lugar. Un docente es una persona de Personal con el cargo de docente (por
 * sus permisos, `esCargoDocente`); acá se ve si entra al sistema, qué grupos
 * dicta este mes (los del Calendario) y, a un toque, se le manda el acceso por
 * WhatsApp: el enlace abre el login con el negocio y su usuario puestos. La
 * clave nunca viaja: la pone y la pasa el admin.
 *
 * Sin «cobra el N %»: el % del docente lo pone cada curso (o los Ajustes),
 * no la persona (C3), así que no hay uno solo que decir en su tarjeta.
 *
 * Pide lo mismo que Personal (`personal.gestionar`): es la misma gente. Dar el
 * acceso sigue siendo la ficha de Personal (`?persona=`), y el alta es la
 * rápida de «Abrir grupo», con el usuario propuesto por el nombre.
 *
 * Tanda 2 del 08-nov: cada tarjeta tiene «Ver su horario» (sus clases de las
 * dos semanas que vienen, abajo de la tarjeta) y «Pagos», que abre su planilla
 * (`/academia/planilla?docente=`), para quien la ve.
 */
export default function Docentes() {
  const p = usePalabras();
  const { negocio } = useAuth();
  const personas = useApi(() => apiPersonal.listar(), []);
  const cargos = useApi(() => apiPersonal.cargos().catch(() => [] as CargoRol[]), []);
  // Los grupos salen del Calendario de este mes (cada módulo con su docente). Si
  // no se pueden leer, la lista va igual, sin los grupos.
  const calendario = useApi(() => apiAcademia.calendario({ desde: mesDe(new Date()), meses: 1 }).catch(() => null), []);
  const [creando, setCreando] = useState(false);
  const [recien, setRecien] = useState<{ nombre: string; alta: AltaDocente; aviso?: string } | null>(null);

  const idsDocente = new Set((cargos.datos ?? []).filter(esCargoDocente).map((c) => c.id));
  const docentes = (personas.datos ?? [])
    .filter((x) => x.activo && x.cargoRolId != null && idsDocente.has(x.cargoRolId))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const grupos = useMemo(() => gruposPorDocente(calendario.datos), [calendario.datos]);

  /** El `wa.me` con el acceso, o null si no hay WhatsApp o usuario. */
  const whatsappDe = (nombre: string, telefono: string | null | undefined, usuario: string | null | undefined) => {
    if (!usuario) return null;
    const enlace = enlaceAccesoDocente(window.location.origin, negocio?.alias, usuario);
    return enlaceWhatsApp(telefono, mensajeAccesoDocente({ nombre, negocio: negocio?.nombre, enlace, usuario }));
  };
  const waRecien = recien ? whatsappDe(recien.nombre, recien.alta.telefono, recien.alta.username) : null;

  return (
    <PaginaAcademia ancho="max-w-4xl">
      <EncabezadoPagina
        titulo={`${p.Docente}s`}
        bajada="Quién dicta, si entra al sistema y sus grupos de este mes. Para cambiar sus datos, Personal."
        acciones={
          !creando && (
            <Boton icono="plus" onClick={() => setCreando(true)}>
              Nuevo {p.docente}
            </Boton>
          )
        }
      />

      {creando && (
        <Tarjeta etiqueta={`Nuevo ${p.docente}`}>
          <NuevoDocenteRapido
            onCerrar={() => setCreando(false)}
            onCreado={(nuevo, aviso, alta) => {
              setCreando(false);
              setRecien({ nombre: nuevo.nombre, alta: alta ?? { telefono: null, username: null }, aviso });
              personas.recargar();
            }}
          />
        </Tarjeta>
      )}

      {recien && (
        <div role="status" className="space-y-2">
          {recien.aviso ? (
            <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-sm text-warning-text">{recien.aviso}</p>
          ) : (
            <AvisoOk>
              «{recien.nombre}» quedó guardado{recien.alta.username ? ` y entra como «${recien.alta.username}»` : ", sin acceso al sistema"}.
            </AvisoOk>
          )}
          {waRecien && (
            <Boton variante="soft" icono="phone" className="min-h-11" onClick={() => abrirWhatsapp(waRecien)}>
              Mandarle el acceso por WhatsApp
            </Boton>
          )}
        </div>
      )}

      {personas.error && !personas.datos ? (
        <ErrorMsg onReintentar={personas.recargar}>{personas.error}</ErrorMsg>
      ) : !personas.datos || !cargos.datos ? (
        <Cargando />
      ) : docentes.length === 0 ? (
        <Tarjeta etiqueta={`Sin ${p.docente}s`}>
          <Vacio
            icono="users"
            titulo={`Todavía no hay ${p.docente}s`}
            texto={`Cargá a tus ${p.docente}s con «Nuevo ${p.docente}»: entren o no al sistema, después se los elige en cada grupo.`}
          />
        </Tarjeta>
      ) : (
        <ul aria-label={`${p.Docente}s`} className="space-y-3">
          {docentes.map((x) => (
            <TarjetaDocente
              key={x.id}
              persona={x}
              grupos={calendario.datos ? (grupos.get(x.id) ?? []) : null}
              whatsapp={x.conAcceso ? whatsappDe(x.nombre, x.telefono, x.acceso?.username) : null}
            />
          ))}
        </ul>
      )}
    </PaginaAcademia>
  );
}

function TarjetaDocente({
  persona: x,
  grupos,
  whatsapp,
}: {
  persona: Persona;
  /** null = no se pudieron leer los grupos (no se dice «sin grupos»). */
  grupos: GrupoDelDocente[] | null;
  whatsapp: string | null;
}) {
  const { puede } = useAuth();
  const tel = telefonoOculto(x.telefono);
  const [verHorario, setVerHorario] = useState(false);
  return (
    <li aria-label={x.nombre} className="card space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-50 text-sm font-bold text-primary-700"
        >
          {iniciales(x.nombre)}
        </span>
        <div className="min-w-0 flex-1 basis-48 space-y-0.5">
          <p className="text-[15px] font-bold text-texto">{x.nombre}</p>
          <p className="text-[13px] text-texto-3">{tel ? `WhatsApp ${tel}` : "Sin WhatsApp cargado"}</p>
        </div>
        {x.conAcceso && x.acceso ? (
          <Chip tono="verde" className="text-[12px]">
            Puede entrar · usuario {x.acceso.username}
          </Chip>
        ) : (
          <Chip tono="gris" className="text-[12px]">
            Sin acceso
          </Chip>
        )}
      </div>

      {grupos && grupos.length > 0 && (
        <ul aria-label={`Grupos de ${x.nombre}`} className="flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <li key={g.grupoId}>
              <Link
                to={`/academia/grupos/${g.grupoId}`}
                className="inline-flex min-h-8 items-center rounded-full bg-muted px-3 text-[12px] font-semibold text-texto-2 hover:bg-primary-50 hover:text-primary-700"
              >
                {g.texto}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {grupos && grupos.length === 0 && <p className="text-[13px] text-texto-3">Este mes no dicta ningún grupo.</p>}

      <div className="flex flex-wrap gap-2">
        <Boton variante="ghost" icono="calendar" className="min-h-11" aria-expanded={verHorario} onClick={() => setVerHorario((v) => !v)}>
          {verHorario ? "Ocultar horario" : "Ver su horario"}
        </Boton>
        {puede("academia_planilla") && (
          <Link
            to={`/academia/planilla?docente=${x.id}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 hover:bg-muted"
          >
            <Icon name="billetera" size={16} />
            Pagos
          </Link>
        )}
        {whatsapp && (
          <Boton variante="soft" icono="phone" className="min-h-11" onClick={() => abrirWhatsapp(whatsapp)}>
            Mandarle el acceso por WhatsApp
          </Boton>
        )}
        {!x.conAcceso && (
          <Link
            to={`/personal?persona=${x.id}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-borde bg-white px-4 text-sm font-semibold text-texto-2 hover:bg-muted"
          >
            <Icon name="key" size={16} />
            Darle acceso
          </Link>
        )}
      </div>
      {verHorario && <HorarioDocente personalId={x.id} nombre={x.nombre} />}
    </li>
  );
}

/**
 * Los grupos de cada docente (por `personalId`) en el Calendario: el módulo de
 * este mes de cada grupo, con su horario. «Barbería · L-M-V 09:00–11:00 · M2
 * Degradados». Un grupo se nombra una vez aunque esté en varias filas.
 */
function gruposPorDocente(cal: Calendario | null): Map<number, GrupoDelDocente[]> {
  const m = new Map<number, GrupoDelDocente[]>();
  for (const fila of cal?.filas ?? []) {
    for (const celda of fila.celdas) {
      for (const g of celda.grupos) {
        if (!g.docente) continue;
        const lista = m.get(g.docente.personalId) ?? [];
        if (lista.some((x) => x.grupoId === g.grupoId)) continue;
        lista.push({
          grupoId: g.grupoId,
          texto: [nombreDe(g.carrera), g.nombre, `M${g.modulo.orden} ${g.modulo.nombre}`, g.aula].filter(Boolean).join(" · "),
        });
        m.set(g.docente.personalId, lista);
      }
    }
  }
  return m;
}
