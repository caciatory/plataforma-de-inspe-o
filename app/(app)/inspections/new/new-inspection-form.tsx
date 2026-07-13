"use client";

import { useActionState, useState } from "react";
import {
  resolveObjetivo,
  tipoClienteValues,
  objetivoValues,
  type TipoCliente,
  type Objetivo,
} from "@/lib/inspection/schema";
import { createInspectionAction, type CreateInspectionState } from "./actions";

const initialState: CreateInspectionState = { status: "idle" };

export function NewInspectionForm() {
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("particular");
  const [objetivo, setObjetivo] = useState<Objetivo>("compra");
  const [state, formAction] = useActionState(createInspectionAction, initialState);

  function handleTipoClienteChange(value: TipoCliente) {
    setTipoCliente(value);
    setObjetivo(resolveObjetivo(value, objetivo));
  }

  return (
    <form action={formAction}>
      <fieldset>
        <legend>Cliente</legend>

        <label htmlFor="tipoCliente">Tipo de cliente</label>
        <select
          id="tipoCliente"
          name="tipoCliente"
          value={tipoCliente}
          onChange={(e) => handleTipoClienteChange(e.target.value as TipoCliente)}
        >
          {tipoClienteValues.map((v) => (
            <option key={v} value={v}>
              {v === "particular" ? "Particular" : "Stand"}
            </option>
          ))}
        </select>

        <label htmlFor="objetivo">Objetivo</label>
        <select
          id="objetivo"
          name="objetivo"
          value={objetivo}
          disabled={tipoCliente === "stand"}
          onChange={(e) => setObjetivo(e.target.value as Objetivo)}
        >
          {objetivoValues.map((v) => (
            <option key={v} value={v}>
              {v === "compra" ? "Compra" : "Venda"}
            </option>
          ))}
        </select>

        <label htmlFor="nomeSolicitante">Nome do solicitante</label>
        <input id="nomeSolicitante" name="nomeSolicitante" required />

        <label htmlFor="contacto">Contacto</label>
        <input id="contacto" name="contacto" />

        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" />

        <label htmlFor="responsavelPresente">Responsável presente</label>
        <input id="responsavelPresente" name="responsavelPresente" />
      </fieldset>

      <fieldset>
        <legend>Veículo</legend>

        <label htmlFor="matricula">Matrícula</label>
        <input id="matricula" name="matricula" required />

        <label htmlFor="marca">Marca</label>
        <input id="marca" name="marca" required />

        <label htmlFor="modelo">Modelo</label>
        <input id="modelo" name="modelo" required />

        <label htmlFor="versaoTrim">Versão</label>
        <input id="versaoTrim" name="versaoTrim" />

        <label htmlFor="anoFabrico">Ano de fabrico</label>
        <input id="anoFabrico" name="anoFabrico" type="number" />

        <label htmlFor="anoModelo">Ano do modelo</label>
        <input id="anoModelo" name="anoModelo" type="number" />

        <label htmlFor="cor">Cor</label>
        <input id="cor" name="cor" />

        <label htmlFor="vin">VIN</label>
        <input id="vin" name="vin" />

        <label htmlFor="numeroMotor">Número do motor</label>
        <input id="numeroMotor" name="numeroMotor" />

        <label htmlFor="numeroPortas">Número de portas</label>
        <input id="numeroPortas" name="numeroPortas" type="number" />

        <label htmlFor="combustivel">Combustível</label>
        <input id="combustivel" name="combustivel" />

        <label htmlFor="caixaVelocidades">Caixa de velocidades</label>
        <input id="caixaVelocidades" name="caixaVelocidades" />

        <label htmlFor="tracao">Tração</label>
        <input id="tracao" name="tracao" />

        <label htmlFor="potenciaCv">Potência (cv)</label>
        <input id="potenciaCv" name="potenciaCv" type="number" />

        <label htmlFor="torqueNm">Torque (Nm)</label>
        <input id="torqueNm" name="torqueNm" type="number" step="0.01" />
      </fieldset>

      {state.status === "error" && <p role="alert">{state.message}</p>}
      <button type="submit">Guardar</button>
    </form>
  );
}
