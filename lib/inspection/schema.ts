import { z } from "zod";

export const tipoClienteValues = ["particular", "stand"] as const;
export const objetivoValues = ["compra", "venda"] as const;

export type TipoCliente = (typeof tipoClienteValues)[number];
export type Objetivo = (typeof objetivoValues)[number];

export function resolveObjetivo(tipoCliente: TipoCliente, objetivo: Objetivo): Objetivo {
  return tipoCliente === "stand" ? "venda" : objetivo;
}

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
    versaoTrim: z.string().optional(),
    anoFabrico: z.coerce.number().int().optional(),
    anoModelo: z.coerce.number().int().optional(),
    cor: z.string().optional(),
    vin: z.string().optional(),
    numeroMotor: z.string().optional(),
    numeroPortas: z.coerce.number().int().optional(),
    combustivel: z.string().optional(),
    caixaVelocidades: z.string().optional(),
    tracao: z.string().optional(),
    potenciaCv: z.coerce.number().int().optional(),
    torqueNm: z.coerce.number().optional(),
  })
  .refine((data) => data.tipoCliente !== "stand" || data.objetivo === "venda", {
    message: "Objetivo deve ser 'venda' quando o tipo de cliente é stand",
    path: ["objetivo"],
  });

export type InspectionFormValues = z.infer<typeof inspectionFormSchema>;
