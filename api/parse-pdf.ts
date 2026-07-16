import { GoogleGenAI, Type } from "@google/genai";

type AnyJson = Record<string, any>;

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Metodo non consentito" });
  }

  try {
    const { pdfBase64, mimeType, userInstructions } = (req.body || {}) as AnyJson;

    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return res.status(400).json({ error: "Nessun file inviato o file corrotto." });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error:
          "Chiave API Gemini non configurata. Imposta GEMINI_API_KEY nelle Environment Variables di Vercel.",
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Accetta sia base64 "pulito" che DataURL
    let cleanBase64 = pdfBase64;
    let detectedMimeType = mimeType || "application/pdf";
    if (pdfBase64.startsWith("data:")) {
      const matches = pdfBase64.match(/^data:([^;]+);base64,/);
      if (matches?.[1]) detectedMimeType = matches[1];
      cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
    }

    const promptText = `
Analizza accuratamente il documento caricato (che può essere un PDF o un'immagine JPEG/PNG). Questo documento contiene il programma di lavoro del giorno per un'officina meccanica.

${userInstructions ? `⚠️ REQUISITO MANDATORIO ED ESCLUSIVO - ISTRUZIONI SPECIFICHE DELL'UTENTE:
"${userInstructions}"

Se l'utente specifica di voler estrarre solo determinate macchine, particolari operatori, o solo alcune informazioni:
- Estrai ESCLUSIVAMENTE le macchine o gli operatori richiesti dall'utente.
- Escludi tutte le altre macchine ed operatori che non appartengono alle richieste specifiche dell'utente (lascia vuoti o rimuovi tali elementi dal JSON).
- Se l'utente chiede di ignorare o non estrarre lo staff, l'elenco 'operators' e 'shiftLeaders' deve essere rigorosamente vuoto [].
` : ""}

Esegui le seguenti operazioni standard, applicando i vincoli delle istruzioni dell'utente (se presenti):
1. Rileva i due capoturni.
2. Rileva tutti i nomi degli operatori ed addetti menzionati nel file.
3. Identifica le lavorazioni/commesse affidate alle varie macchine.

Mappa ciascun macchinario trovato nel documento specificando tassativamente uno degli ID ufficiali del nostro planner (es. "CLT 25" -> "clt25").
Assicurati che la risposta segua rigorosamente lo schema JSON fornito, evitando testi di contorno.
`.trim();

    const attempts = [
      { model: "gemini-3.5-flash", delay: 800 },
      { model: "gemini-3.1-flash-lite", delay: 1200 },
      { model: "gemini-flash-latest", delay: 1600 },
    ];

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let response: any = null;
    let lastError: any = null;
    for (let i = 0; i < attempts.length; i++) {
      try {
        response = await ai.models.generateContent({
          model: attempts[i].model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: detectedMimeType,
                  data: cleanBase64,
                },
              },
              { text: promptText },
            ],
          },
          config: {
            systemInstruction:
              "Sei un assistente industriale di altissimo livello. Il tuo compito è estrarre con grande sensibilità ai dettagli i nomi dei due capoturni, i nomi di tutti gli operatori e la programmazione delle lavorazioni dei vari centri di lavoro CNC partendo dall'immagine o file PDF caricati.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                shiftLeaders: { type: Type.ARRAY, items: { type: Type.STRING } },
                operators: { type: Type.ARRAY, items: { type: Type.STRING } },
                assignments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      machineId: { type: Type.STRING },
                      jobName: { type: Type.STRING },
                      processTime: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      status: { type: Type.STRING },
                      notes: { type: Type.STRING },
                      assignedOperators: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["machineId"],
                  },
                },
              },
              required: ["shiftLeaders", "operators", "assignments"],
            },
          },
        });
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        if (i < attempts.length - 1) await sleep(attempts[i].delay);
      }
    }

    if (lastError) throw lastError;

    const extractedText = response?.text;
    if (!extractedText) {
      return res.status(500).json({
        error: "Impossibile ottenere dati validi dal modello IA.",
      });
    }

    const parsedResult = JSON.parse(extractedText);
    return res.json({ success: true, data: parsedResult });
  } catch (err: any) {
    return res.status(500).json({
      error:
        "Si è verificato un errore nel motore di intelligenza artificiale durante l'elaborazione del file: " +
        (err?.message || String(err)),
    });
  }
}

