import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env";
import { updateDocumentAIFields } from "../db/repository";

const ai = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;
const model = "gemini-3-flash-preview";

const isSupportedMimeType = (mimeType: string): boolean => {
  return (
    mimeType.startsWith("image/") ||
    mimeType === "application/pdf" ||
    mimeType === "text/plain"
  );
};

const safeParseJson = (value: string): Record<string, any> => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

export const processDocumentWithAI = async (
  docId: number,
  filePath: string,
  mimeType: string,
): Promise<void> => {
  if (!ai || !isSupportedMimeType(mimeType)) {
    return;
  }

  try {
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString("base64");
    const prompt =
      "Analyze this document. Extract all readable text and provide a list of 5 relevant tags and a 1-sentence summary. Format the response as JSON with keys: 'text', 'tags' (array), and 'summary'.";

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Data, mimeType } },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    const result = safeParseJson(response.text || "{}");

    await updateDocumentAIFields(
      docId,
      result.text || "",
      Array.isArray(result.tags) ? result.tags.join(", ") : "",
      result.summary || "",
    );

    console.log(`AI processing complete for document ${docId}`);
  } catch (error) {
    console.error("AI processing failed:", error);
  }
};
