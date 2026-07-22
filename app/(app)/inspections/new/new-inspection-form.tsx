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
    <form action={formAction} className="stack">
      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">Cliente</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="tipoCliente" className="label">
              Tipo de cliente
            </label>
            <select
              id="tipoCliente"
              name="tipoCliente"
              className="input"
              value={tipoCliente}
              onChange={(e) => handleTipoClienteChange(e.target.value as TipoCliente)}
            >
              {tipoClienteValues.map((v) => (
                <option key={v} value={v}>
                  {v === "particular" ? "Particular" : "Stand"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="objetivo" className="label">
              Objetivo
            </label>
            <select
              id="objetivo"
              name="objetivo"
              className="input"
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
          </div>

          <div className="field">
            <label htmlFor="nomeSolicitante" className="label">
              Nome do solicitante
            </label>
            <input
              id="nomeSolicitante"
              name="nomeSolicitante"
              className="input"
              required
              value={nomeSolicitante}
              onChange={(e) => setNomeSolicitante(e.target.value)}
            />
          </div>

          {tipoCliente === "stand" && <StandAutocomplete onSelect={handleStandSelect} />}

          <div className="field">
            <label htmlFor="contacto" className="label">
              Contacto
            </label>
            <input
              id="contacto"
              name="contacto"
              className="input"
              value={contacto}
              onChange={(e) => setContacto(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="responsavelPresente" className="label">
              Responsável presente
            </label>
            <input id="responsavelPresente" name="responsavelPresente" className="input" />
          </div>
        </div>
      </fieldset>

      <fieldset className="panel form-fieldset">
        <legend className="form-fieldset__legend">Veículo</legend>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="matricula" className="label">
              Matrícula
            </label>
            <input id="matricula" name="matricula" className="input" required />
          </div>

          <div className="field">
            <label htmlFor="marca" className="label">
              Marca
            </label>
            <input id="marca" name="marca" className="input" required />
          </div>

          <div className="field">
            <label htmlFor="modelo" className="label">
              Modelo
            </label>
            <input id="modelo" name="modelo" className="input" required />
          </div>

          <div className="field">
            <label htmlFor="quilometragem" className="label">
              Quilometragem
            </label>
            <input id="quilometragem" name="quilometragem" type="number" className="input" required min={0} />
          </div>

          <div className="field">
            <label htmlFor="versaoTrim" className="label">
              Versão
            </label>
            <input id="versaoTrim" name="versaoTrim" className="input" />
          </div>

          <div className="field">
            <label htmlFor="anoFabrico" className="label">
              Ano de fabrico
            </label>
            <input id="anoFabrico" name="anoFabrico" type="number" className="input" />
          </div>

          <div className="field">
            <label htmlFor="anoModelo" className="label">
              Ano do modelo
            </label>
            <input id="anoModelo" name="anoModelo" type="number" className="input" />
          </div>

          <div className="field">
            <label htmlFor="cor" className="label">
              Cor
            </label>
            <input id="cor" name="cor" className="input" />
          </div>

          <div className="field">
            <label htmlFor="vin" className="label">
              VIN
            </label>
            <input id="vin" name="vin" className="input" />
          </div>

          <div className="field">
            <label htmlFor="numeroMotor" className="label">
              Número do motor
            </label>
            <input id="numeroMotor" name="numeroMotor" className="input" />
          </div>

          <div className="field">
            <label htmlFor="numeroPortas" className="label">
              Número de portas
            </label>
            <input id="numeroPortas" name="numeroPortas" type="number" className="input" />
          </div>

          <div className="field">
            <label htmlFor="combustivel" className="label">
              Combustível
            </label>
            <input id="combustivel" name="combustivel" className="input" />
          </div>

          <div className="field">
            <label htmlFor="caixaVelocidades" className="label">
              Caixa de velocidades
            </label>
            <input id="caixaVelocidades" name="caixaVelocidades" className="input" />
          </div>

          <div className="field">
            <label htmlFor="tracao" className="label">
              Tração
            </label>
            <input id="tracao" name="tracao" className="input" />
          </div>

          <div className="field">
            <label htmlFor="potenciaCv" className="label">
              Potência (cv)
            </label>
            <input id="potenciaCv" name="potenciaCv" type="number" className="input" />
          </div>

          <div className="field">
            <label htmlFor="torqueNm" className="label">
              Torque (Nm)
            </label>
            <input id="torqueNm" name="torqueNm" type="number" step="0.01" className="input" />
          </div>
        </div>
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="error-text">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn btn-primary">
        Guardar
      </button>
    </form>
  );
}
