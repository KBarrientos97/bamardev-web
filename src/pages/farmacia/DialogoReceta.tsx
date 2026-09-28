import { useState } from "react";
import { Boton, Campo, Input, Modal } from "../../components/ui";
import { isoDia } from "../../lib/format";
import type { Producto, RecetaVenta } from "../../types";
import { CONDICION } from "./medicamento";
import { erroresReceta, libroDe, NOMBRE_LIBRO, recetaLimpia } from "./receta";

/**
 * Los datos de la receta de un controlado, al agregarlo a la venta.
 *
 * Reemplaza al "Tengo la receta" de un clic: el papel ya está en la mano de
 * quien atiende, y lo que se anota acá es lo que la farmacia presenta al
 * SEDES en el libro de psicotrópicos o de estupefacientes. Si en la misma
 * venta ya se cargó una receta, arranca con el paciente, el médico y la fecha
 * de esa —suele ser el mismo papel—, pero el número no: cada receta valorada
 * es un formulario distinto.
 */
export default function DialogoReceta({
  producto: p,
  inicial,
  agregando,
  onGuardar,
  onCancelar,
}: {
  producto: Producto;
  /** La que ya tiene este renglón, o la última de la venta para no reescribir. */
  inicial: RecetaVenta | null;
  /** true al agregarlo a la venta; false al corregir la de un renglón. */
  agregando: boolean;
  onGuardar: (r: RecetaVenta) => void;
  onCancelar: () => void;
}) {
  const hoy = isoDia(new Date());
  const [r, setR] = useState<RecetaVenta>(
    () =>
      inicial ?? {
        pacienteNombre: "",
        pacienteDocumento: "",
        medicoNombre: "",
        medicoMatricula: "",
        recetaNumero: "",
        recetaFecha: hoy,
      },
  );
  // Los errores se muestran recién al intentar guardar: marcar en rojo un
  // formulario que se acaba de abrir es retar antes de que escriba.
  const [intentado, setIntentado] = useState(false);
  const errores = erroresReceta(p, r, hoy);
  const ver = (campo: keyof RecetaVenta) => (intentado ? errores[campo] : undefined);
  const valorada = p.condicionVenta === "RECETA_VALORADA";
  const libro = libroDe(p);
  const cond = CONDICION[p.condicionVenta];

  const cambiar = (campo: keyof RecetaVenta) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setR((prev) => ({ ...prev, [campo]: e.target.value }));

  function guardar() {
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    onGuardar(recetaLimpia(r));
  }

  return (
    <Modal
      abierto
      titulo="Datos de la receta"
      subtitulo={`${p.nombre}${cond ? ` — ${cond.largo}` : p.controlado ? " — controlado" : ""}`}
      onClose={onCancelar}
      cerrarAlClicAfuera={false}
      ancho="max-w-md"
      acciones={
        <>
          <Boton variante="ghost" onClick={onCancelar}>
            Cancelar
          </Boton>
          <Boton onClick={guardar} icono="check">
            {agregando ? "Agregar a la venta" : "Guardar"}
          </Boton>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
        className="space-y-3"
      >
        <p className="rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning-text">
          Pedí la receta y quedátela. Estos datos van al libro de{" "}
          <strong>{libro ? NOMBRE_LIBRO[libro] : "controlados"}</strong>.
        </p>

        <Campo label="Paciente *" error={ver("pacienteNombre")}>
          <Input
            value={r.pacienteNombre}
            onChange={cambiar("pacienteNombre")}
            placeholder="Nombre y apellido"
            autoFocus
            maxLength={120}
          />
        </Campo>
        <Campo label="CI del paciente" hint="Si la receta lo trae">
          <Input
            value={r.pacienteDocumento ?? ""}
            onChange={cambiar("pacienteDocumento")}
            maxLength={30}
          />
        </Campo>

        <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
          <Campo label="Médico *" error={ver("medicoNombre")}>
            <Input
              value={r.medicoNombre}
              onChange={cambiar("medicoNombre")}
              placeholder="Dr. / Dra."
              maxLength={120}
            />
          </Campo>
          <Campo label="Matrícula *" error={ver("medicoMatricula")}>
            <Input
              value={r.medicoMatricula}
              onChange={cambiar("medicoMatricula")}
              maxLength={40}
            />
          </Campo>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            label={valorada ? "N° de receta valorada *" : "N° de receta"}
            error={ver("recetaNumero")}
          >
            <Input
              value={r.recetaNumero ?? ""}
              onChange={cambiar("recetaNumero")}
              maxLength={40}
            />
          </Campo>
          <Campo label="Fecha de la receta *" error={ver("recetaFecha")}>
            <Input
              type="date"
              value={r.recetaFecha}
              max={hoy}
              onChange={cambiar("recetaFecha")}
            />
          </Campo>
        </div>
        {/* Enter en cualquier campo guarda. */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
