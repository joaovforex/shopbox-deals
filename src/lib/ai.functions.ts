import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const GenerateProductDescriptionInput = z.object({
  productName: z.string().min(1),
  category: z.string().optional(),
  tone: z.enum(["friendly", "professional", "funny"]).default("friendly"),
});

/**
 * Exemplo de função de servidor com IA.
 * Gera uma descrição curta de produto em português.
 */
export const generateProductDescription = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GenerateProductDescriptionInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const result = await generateText({
      model: gateway("google/gemini-3.7-flash"),
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente de e-commerce que escreve descrições curtas e persuasivas de produtos em português do Brasil. Responda apenas com o texto da descrição, sem markdown, sem listas e sem emojis.",
        },
        {
          role: "user",
          content: `Produto: ${data.productName}${data.category ? ` | Categoria: ${data.category}` : ""} | Tom: ${data.tone}`,
        },
      ],
    });

    return { description: result.text.trim() };
  });
