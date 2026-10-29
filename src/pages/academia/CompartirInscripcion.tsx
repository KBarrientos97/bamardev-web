import { useState } from "react";
import { Link } from "react-router-dom";
import { Boton, Cargando, ErrorMsg, Input, Modal, Select, useAviso, AvisoOk } from "../../components/ui";
import { apiAcademia } from "../../lib/academia/apiAcademia";
import { fechaCorta, horarioGrupo, nombreDe } from "../../lib/academia/formato";
import type { GrupoResumen } from "../../lib/academia/tipos";
import type { GrupoParaCompartir } from "../../lib/academia/vista";
import { usePalabras } from "../../lib/academia/usePalabras";
import { abrirWhatsapp, enlaceInscripcion, textoInscripcion } from "../../lib/academia/vista";
import { copiarTexto } from "../../lib/agenda/recordatorio";
import { apiPagina } from "../../lib/pagina/apiPagina";
import { useApi } from "../../lib/useApi";
import { useAuth } from "../../store/AuthContext";
import { BotonFila } from "./piezas";

type GrupoCompartible = GrupoParaCompartir & Partial<Pick<GrupoResumen, "inscripcionAbierta" | "publicarEnPagina" | "estado" | "cancelado">>;

/** Para qué es el enlace: la bajada del diálogo y del despliegue en el panel. */
const BAJADA = "Para que se preinscriban desde el celular, con sus datos y las 3 fotos";

/**
 * El subdominio del negocio, que arma la dirección, y si la página está
 * publicada. Lo da `GET /academia/ajustes` (que también lee la recepción) si
 * el backend lo manda; si no, "Mi página", que es sólo del dueño. Sin ninguno
 * de los dos, null: no hay enlace que dar. `publicada` undefined = no se sabe.
 */
function useSubdominio(conPagina: boolean) {
  return useApi(async (): Promise<{ subdominio: string | null; publicada?: boolean }> => {
    const ajustes = await apiAcademia.ajustes().catch(() => null);
    if (ajustes?.subdominio !== undefined) return { subdominio: ajustes.subdominio, publicada: ajustes.paginaPublicada };
    if (!conPagina) return { subdominio: null };
    const pagina = await apiPagina.estado().catch(() => null);
    return {
      subdominio: pagina?.subdominio ?? null,
      ...(pagina?.pagina ? { publicada: pagina.pagina.publicada && !pagina.pagina.bloqueada } : {}),
    };
  }, [conPagina]);
}

/**
 * B9 · "Compartir enlace de inscripción" (reunión con Derick, 22-oct): la
 * página pública de preinscripción de un grupo, para copiar o mandar por
 * WhatsApp. Con el grupo fijo (la ficha del grupo) o eligiendo entre los que
 * tienen la inscripción abierta (Preinscripciones, Cursos).
 *
 * El acortador (`go`) existe, pero sus enlaces son del dueño y se arman a
 * mano en "Mis enlaces": acá va la dirección directa, que ya es la de la
 * página.
 *
 * `enLinea`: dentro de un panel (el del curso) el enlace se despliega ahí
 * mismo, debajo del botón, en vez de abrir un diálogo encima del panel (en
 * el celular eran dos hojas, una sobre otra).
 */
export function BotonCompartirInscripcion({
  grupo,
  carreraId,
  variante = "ghost",
  enLinea = false,
}: {
  grupo?: GrupoCompartible;
  carreraId?: number;
  variante?: "ghost" | "soft";
  enLinea?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  if (enLinea) {
    return (
      <div>
        <BotonFila variante={variante} icono="compartir" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>
          Compartir enlace de inscripción
        </BotonFila>
        {abierto && (
          <section aria-label="Compartir enlace de inscripción" className="mt-3 space-y-3 rounded-xl border border-borde-soft bg-white p-3.5">
            <p className="text-[13px] text-texto-3">{BAJADA}</p>
            <ContenidoCompartir grupo={grupo} carreraId={carreraId} />
          </section>
        )}
      </div>
    );
  }
  return (
    <>
      <BotonFila variante={variante} icono="compartir" onClick={() => setAbierto(true)}>
        Compartir enlace de inscripción
      </BotonFila>
      {abierto && <DialogoCompartir grupo={grupo} carreraId={carreraId} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

export function DialogoCompartir({
  grupo,
  carreraId,
  onCerrar,
}: {
  grupo?: GrupoCompartible;
  carreraId?: number;
  onCerrar: () => void;
}) {
  return (
    <Modal
      abierto
      titulo="Compartir enlace de inscripción"
      subtitulo={BAJADA}
      onClose={onCerrar}
      ancho="max-w-md"
      acciones={
        <Boton variante="ghost" onClick={onCerrar}>
          Cerrar
        </Boton>
      }
    >
      <ContenidoCompartir grupo={grupo} carreraId={carreraId} onSalir={onCerrar} />
    </Modal>
  );
}

/**
 * Lo de compartir, sin marco: el diálogo (Preinscripciones, el grupo) y el
 * despliegue dentro del panel del curso lo comparten. `onSalir`, si el
 * enlace a "Mi página" tiene que cerrar el diálogo al irse.
 */
function ContenidoCompartir({
  grupo: fijo,
  carreraId,
  onSalir,
}: {
  grupo?: GrupoCompartible;
  carreraId?: number;
  onSalir?: () => void;
}) {
  const p = usePalabras();
  const { puede } = useAuth();
  const conPagina = puede("mi_pagina");
  const sub = useSubdominio(conPagina);
  const grupos = useApi(
    () => (fijo ? Promise.resolve(null) : apiAcademia.grupos({ pageSize: 100, ...(carreraId ? { carreraId } : {}) })),
    [fijo, carreraId],
  );
  const abiertos = (grupos.datos?.items ?? []).filter((g) => g.estado !== "TERMINADO" && g.inscripcionAbierta && !g.cancelado);
  const [elegidoId, setElegidoId] = useState<number | null>(null);
  const grupo = fijo ?? abiertos.find((g) => g.id === elegidoId) ?? (abiertos.length === 1 ? abiertos[0] : null);
  const [aviso, setAviso] = useAviso(4000);

  const subdominio = sub.datos?.subdominio ?? null;
  const sinPublicar = sub.datos?.publicada === false;
  const enlace = grupo && subdominio ? enlaceInscripcion(subdominio, grupo.id) : null;
  const texto = grupo && enlace ? textoInscripcion(grupo, enlace) : "";

  return (
    <div className="space-y-3">
      {!fijo &&
        (grupos.cargando ? (
          <Cargando />
        ) : grupos.error ? (
          <ErrorMsg onReintentar={grupos.recargar}>{grupos.error}</ErrorMsg>
        ) : abiertos.length === 0 ? (
          <p className="text-sm text-texto-3">No hay grupos con la inscripción abierta.</p>
        ) : abiertos.length > 1 ? (
          <Select aria-label="Grupo" value={grupo?.id ?? ""} onChange={(e) => setElegidoId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Elegí el grupo…</option>
            {abiertos.map((g) => (
              <option key={g.id} value={g.id}>
                {nombreDe(g.carrera)} · {horarioGrupo(g)} · {nombreDe(g.sede)}
              </option>
            ))}
          </Select>
        ) : null)}

      {grupo && (
        <p className="text-sm text-texto-2">
          {nombreDe(grupo.carrera)} · {horarioGrupo(grupo)} · {p.Sede} {nombreDe(grupo.sede)} · empieza el {fechaCorta(grupo.fechaInicio)}
        </p>
      )}
      {grupo && grupo.publicarEnPagina === false && (
        <p role="note" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text">
          Este grupo no está publicado en la página: el enlace funciona, pero no aparece en la lista de cursos.
        </p>
      )}

      {sub.cargando ? (
        <Cargando />
      ) : !subdominio ? (
        <p className="text-sm text-texto-3">
          El instituto todavía no tiene página propia (o no la podés ver con tu usuario). Pedile al administrador el enlace.
        </p>
      ) : enlace ? (
        <>
          {/* QA 23-oct: sin publicar, el enlace abre "Esta página no está disponible". */}
          {sinPublicar && (
            <p role="alert" className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] font-semibold text-warning-text">
              Tu página no está publicada: quien abra el enlace no va a poder inscribirse.
              {conPagina && (
                <>
                  {" "}
                  <Link to="/mi-pagina" className="underline" onClick={onSalir}>
                    Publicarla en Mi página
                  </Link>
                </>
              )}
            </p>
          )}
          <Input readOnly value={enlace} aria-label="Enlace de inscripción" className="font-mono text-[13px]" onFocus={(e) => e.target.select()} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Boton
              variante="ghost"
              className="min-h-11 flex-1"
              onClick={async () => setAviso((await copiarTexto(enlace)) ? "Enlace copiado." : "No se pudo copiar: seleccionalo a mano.")}
            >
              Copiar enlace
            </Boton>
            <Boton className="min-h-11 flex-1" onClick={() => abrirWhatsapp(`https://wa.me/?text=${encodeURIComponent(texto)}`)}>
              Mandar por WhatsApp
            </Boton>
          </div>
          <AvisoOk>{aviso}</AvisoOk>
        </>
      ) : null}
    </div>
  );
}
