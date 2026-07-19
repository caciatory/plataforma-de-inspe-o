export type InspectionValidityStatus = "nao_emitida" | "valida" | "expirada";

export type InspectionValidity = {
  status: InspectionValidityStatus;
  validoAte: Date | null;
  kmLimite: number | null;
};

export function computeInspectionValidity(
  certificadoEmitidoEm: string | null,
  quilometragem: number,
  now: Date = new Date()
): InspectionValidity {
  if (certificadoEmitidoEm === null) {
    return { status: "nao_emitida", validoAte: null, kmLimite: null };
  }

  const validoAte = new Date(certificadoEmitidoEm);
  validoAte.setMonth(validoAte.getMonth() + 6);

  const kmLimite = quilometragem + 100;
  const status: InspectionValidityStatus = now.getTime() <= validoAte.getTime() ? "valida" : "expirada";

  return { status, validoAte, kmLimite };
}
