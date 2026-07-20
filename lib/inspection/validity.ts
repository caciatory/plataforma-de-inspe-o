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
  const originalDate = validoAte.getDate();
  validoAte.setMonth(validoAte.getMonth() + 6);
  // setMonth overflows into the following month when the target month is
  // shorter (e.g. Aug 31 + 6 -> "Feb 31" becomes Mar 3). Clamp back to the
  // last day of the intended target month.
  if (validoAte.getDate() !== originalDate) {
    validoAte.setDate(0);
  }

  const kmLimite = quilometragem + 100;
  const status: InspectionValidityStatus = now.getTime() <= validoAte.getTime() ? "valida" : "expirada";

  return { status, validoAte, kmLimite };
}
