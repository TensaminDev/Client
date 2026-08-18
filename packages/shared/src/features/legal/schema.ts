import { z } from "zod";

const legalDocSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const legalDocsSchema = z.object({
  tos: legalDocSchema,
  pp: legalDocSchema,
});
