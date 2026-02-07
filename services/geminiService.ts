
import { GoogleGenAI, Type } from "@google/genai";
import { BusStatus, BusState } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getBusSummary = async (status: BusStatus, terminal: string, bay: string): Promise<string> => {
  try {
    const prompt = `
      You are an assistive AI for visually impaired commuters.
      Current Context: Terminal "${terminal}", Bay "${bay}".
      Bus Info: Route "${status.route}", State "${status.state}", Confidence: ${status.confidence}%.
      
      Generate a short, clear, and reassuring audio announcement for this commuter. 
      Focus on identifying the bus and its arrival status. 
      If state is ARRIVED, be very explicit that the bus is stopped and ready.
      If state is APPROACHING, mention it is coming soon.
      Keep it under 25 words.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        temperature: 0.7,
        topP: 0.9,
      }
    });

    return response.text || "Status updated.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return `Bus ${status.route} is ${status.state.toLowerCase()}.`;
  }
};

export const analyzeRfidPattern = async (reads: any[]): Promise<{ confidence: number; suggestedState: BusState }> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze these RFID signal patterns and determine the bus arrival state. 
      Data: ${JSON.stringify(reads)}
      Return a JSON object with confidence (0-100) and suggestedState (NOT_PRESENT, APPROACHING, ARRIVED, DEPARTING, PASSING).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            confidence: { type: Type.NUMBER },
            suggestedState: { type: Type.STRING }
          },
          required: ["confidence", "suggestedState"]
        }
      }
    });

    const result = JSON.parse(response.text);
    return result;
  } catch (error) {
    return { confidence: 50, suggestedState: BusState.NOT_PRESENT };
  }
};
