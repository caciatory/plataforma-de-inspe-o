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
import { StandAutocomplete, type StandContact } from "./stand-autocomplete";

const initialState: CreateInspectionState = { status: "idle" };

export function NewInspectionForm() {
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("particular");
  const [objetivo, setObjetivo] = useState<Objetivo>("compra");
  const [nomeSolicitante, setNomeSolicitante] = useState("");
  const [contacto, setContacto] = useState("");
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState(createInspectionAction, initialState);

  function handleTipoClienteChange(value: TipoCliente) {
    setTipoCliente(value);
    setObjetivo(resolveObjetivo(value, objetivo));
  }

  function handleStandSelect(contact: StandContact) {
    setNomeSolicitante(contact.nome_solicitante);
    setContacto(contact.contacto ?? "");
    setEmail(contact.email ?? "");
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
        {tipoCliente === "stand" && <input type="hidden" name="objetivo" value={objetivo} />}

        <label htmlFor="nomeSolicitante">Nome do solicitante</label>
        <input
          id="nomeSolicitante"
          name="nomeSolicitante"
          required
          value={nomeSolicitante}
          onChange={(e) => setNomeSolicitante(e.target.value)}
        />

        {tipoCliente === "stand" && <StandAutocomplete onSelect={handleStandSelect} />}

        <label htmlFor="contacto">Contacto</label>
        <input id="contacto" name="contacto" value={contacto} onChange={(e) => setContacto(e.target.value)} />

        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

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

        <label htmlFor="quilometragem">Quilometragem</label>
        <input id="quilometragem" name="quilometragem" type="number" required min={0} />

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
