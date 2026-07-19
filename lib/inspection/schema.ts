import { z } from "zod";

export const tipoClienteValues = ["particular", "stand"] as const;
export const objetivoValues = ["compra", "venda"] as const;

export type TipoCliente = (typeof tipoClienteValues)[number];
export type Objetivo = (typeof objetivoValues)[number];

export function resolveObjetivo(tipoCliente: TipoCliente, objetivo: Objetivo): Objetivo {
  return tipoCliente === "stand" ? "venda" : objetivo;
}

// ponytail: blank <input type="number"> submits FormData value "", which
// z.coerce.number() reads as Number("") === 0 — .optional() only skips
// undefined, not "". Preprocess "" -> undefined so blanks stay null downstream.
const optionalInt = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().optional());
const optionalNumber = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().optional());

// Same footgun as above, but for a required field: blank must fail with
// "obrigatória", not silently become 0. Preprocess "" -> undefined so the
// required_error fires; non-numeric strings pass through untouched so the
// default invalid_type_error fires instead.
const requiredNonNegativeInt = z.preprocess((v) => {
  if (v === "" || v === undefined) return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? v : n;
}, z.number({ required_error: "Quilometragem é obrigatória" }).int().min(0, "Quilometragem não pode ser negativa"));

export const inspectionFormSchema = z
  .object({
    tipoCliente: z.enum(tipoClienteValues),
    objetivo: z.enum(objetivoValues),
    nomeSolicitante: z.string().min(1, "Nome do solicitante é obrigatório"),
    contacto: z.string().optional(),
    email: z.union([z.string().email("Email inválido"), z.literal("")]).optional(),
    responsavelPresente: z.string().optional(),
    matricula: z.string().min(1, "Matrícula é obrigatória"),
    marca: z.string().min(1, "Marca é obrigatória"),
    modelo: z.string().min(1, "Modelo é obrigatório"),
    quilometragem: requiredNonNegativeInt,
    versaoTrim: z.string().optional(),
    anoFabrico: optionalInt,
    anoModelo: optionalInt,
    cor: z.string().optional(),
    vin: z.string().optional(),
    numeroMotor: z.string().optional(),
    numeroPortas: optionalInt,
    combustivel: z.string().optional(),
    caixaVelocidades: z.string().optional(),
    tracao: z.string().optional(),
    potenciaCv: optionalInt,
    torqueNm: optionalNumber,
  })
  .refine((data) => data.tipoCliente !== "stand" || data.objetivo === "venda", {
    message: "Objetivo deve ser 'venda' quando o tipo de cliente é stand",
    path: ["objetivo"],
  });

export type InspectionFormValues = z.infer<typeof inspectionFormSchema>;
