import express from "express";
import path from "path";
import { promises as fs } from "fs";
import { createServer as createViteServer, loadEnv } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const env = loadEnv(mode, process.cwd(), "");
  if (env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }

  const app = express();
  const PORT = 3000;

  // Set standard parsing with a high payload size limit for PDFs
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // SECURE API ENDPOINT: Document parsing proxy via Gemini API (supports PDF and images)
  app.post("/api/parse-pdf", async (req, res) => {
    try {
      const { pdfBase64, mimeType, userInstructions } = req.body;
      if (!pdfBase64) {
        return res.status(400).json({ error: "Nessun file inviato o file corrotto." });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ 
          error: "Chiave API Gemini non configurata sul server (LOCAL DEV). Verifica il file .env.local e riavvia il server." 
        });
      }

      // Initialize Google GenAI client according to safety specs (UA telemetry header included)
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Handle custom file data or standard data URLs (PDF, JPEG, PNG, etc.)
      let cleanBase64 = pdfBase64;
      let detectedMimeType = mimeType || "application/pdf";

      if (pdfBase64.startsWith("data:")) {
        const matches = pdfBase64.match(/^data:([^;]+);base64,/);
        if (matches && matches[1]) {
          detectedMimeType = matches[1];
        }
        cleanBase64 = pdfBase64.replace(/^data:[^;]+;base64,/, "");
      }

      const promptText = `
        Analizza accuratamente il documento caricato (che può essere un PDF o un'immagine JPEG/PNG). Questo documento contiene il programma di lavoro del giorno per un'officina meccanica.
        
        ${userInstructions ? `⚠️ REQUISITO MANDATORIO ED ESCLUSIVO - ISTRUZIONI SPECIFICHE DELL'UTENTE:
        L'utente ha stabilito regole di filtraggio stringenti. SEGUI RIGOROSAMENTE le indicazioni seguenti su cosa leggere, cosa ignorare o come filtrare il file:
        "${userInstructions}"
        
        Se l'utente specifica di voler estrarre solo determinate macchine, particolari operatori, o solo alcune informazioni:
        - Estrai ESCLUSIVAMENTE le macchine o gli operatori richiesti dall'utente.
        - Escludi tutte le altre macchine ed operatori che non appartengono alle richieste specifiche dell'utente (lascia vuoti o rimuovi tali elementi dal JSON).
        - Se l'utente chiede di ignorare o non estrarre lo staff, l'elenco 'operators' e 'shiftLeaders' deve essere rigorosamente vuoto [].
        \n` : ""}
        
        Esegui le seguenti operazioni standard, applicando i vincoli delle istruzioni dell'utente (se presenti):
        1. Rileva i due capoturni ("due capoturni" in italiano, coordinatori di turno) menzionati. Di solito scritti all'inizio, nella parte superiore, o identificati esplicitamente come 'capoturno', 'capo turno', 'responsabile turno'.
        2. Rileva tutti i nomi degli operatori ed addetti menzionati nel file, in modo da poterli inserire automaticamente nello staff.
        3. Identifica le lavorazioni/commesse affidate alle varie macchine.
        
        Mappa ciascun macchinario trovato nel documento specificando tassativamente uno degli ID ufficiali del nostro planner. Mappa in modo intelligente se scritti leggermente diversi (es. "CLT 25" e "CLT-25" -> "clt25"):
        - CLT 25 -> "clt25"
        - CLT 24 -> "clt24"
        - CLT 23 -> "clt23"
        - CLT 22 -> "clt22"
        - CLT 28 -> "clt28"
        - CLT 21 -> "clt21"
        - CLT 20 -> "clt20"
        - CLT 6 -> "clt6"
        - CLV 10 -> "clv10"
        - CLT 15 -> "clt15"
        - CLT 12 -> "clt12"
        - CLO 15 -> "clo15"
        - CLT 17 -> "clt17"
        - CLT 16 -> "clt16"
        - CLT 5 -> "clt5"
        - CLT 9 -> "clt9"
        - CLT 14 -> "clt14"
        - CLT 7 -> "clt7"
        - CLT 10 -> "clt10"
        - CLT 13 -> "clt13"
        - CLT 11 -> "clt11"
        - CLT 19 -> "clt19"
        - CLT 27 -> "clt27"
        - CLT 26 -> "clt26"
        
        Assicurati che la risposta segua rigorosamente lo schema JSON fornito, evitando testi di contorno.
      `;

      // Helper function to sleep and wait between retries
      const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      // Attempt schedule: we try twice with gemini-3.5-flash, fallback to gemini-3.1-flash-lite, and gemini-flash-latest.
      const attempts = [
        { model: "gemini-3.5-flash", delay: 1000 },
        { model: "gemini-3.1-flash-lite", delay: 1500 },
        { model: "gemini-flash-latest", delay: 1800 },
        { model: "gemini-3.5-flash", delay: 2500 },
        { model: "gemini-3.1-flash-lite", delay: 3000 }
      ];

      let response: any = null;
      let lastError: any = null;

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i];
        try {
          console.log(`[Gemini API] Analisi file - Tentativo ${i + 1}/${attempts.length} con modello: ${attempt.model}`);
          
          response = await ai.models.generateContent({
            model: attempt.model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: detectedMimeType,
                    data: cleanBase64
                  }
                },
                {
                  text: promptText
                }
              ]
            },
            config: {
              systemInstruction: "Sei un assistente industriale di altissimo livello. Il tuo compito è estrarre con grande sensibilità ai dettagli i nomi dei due capoturni, i nomi di tutti gli operatori e la programmazione delle lavorazioni dei vari centri di lavoro CNC partendo dall'immagine o file PDF caricati.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  shiftLeaders: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Vettore con i nomi dei capoturni identificati. Massimo due nomi."
                  },
                  operators: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Tutti gli operatori e dipendenti nominati nel file."
                  },
                  assignments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        machineId: {
                          type: Type.STRING,
                          description: "L'ID ufficiale del macchinario schedulato (es: 'clt25')."
                        },
                        jobName: {
                          type: Type.STRING,
                          description: "Il nome, articolo, commessa o tipo di operazione attiva."
                        },
                        processTime: {
                          type: Type.STRING,
                          description: "La stima temporale come ad esempio '2h 15m' o '45 min' se specificato nel PDF."
                        },
                        priority: {
                          type: Type.STRING,
                          description: "Livello di priorità assegnato. Usa rigorosamente una stringa tra: 'Low', 'Medium', 'High', 'Urgent'."
                        },
                        status: {
                          type: Type.STRING,
                          description: "Stato della postazione di lavoro. Scegli a seconda del testo letto tra: 'Attrezzaggio', 'In Lavorazione', 'Ferma'."
                        },
                        notes: {
                          type: Type.STRING,
                          description: "Eventuali dettagli come diametri, note di fermo macchina o altro materiale utile."
                        },
                        assignedOperators: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                          description: "Nomi personali dei singoli operatori destinati a presidiare questo macchinario."
                        }
                      },
                      required: ["machineId"]
                    }
                  }
                },
                required: ["shiftLeaders", "operators", "assignments"]
              }
            }
          });

          // If reached here, call succeeded! Reset error and break
          lastError = null;
          break;
        } catch (err: any) {
          lastError = err;
          const errMsg = err.message || JSON.stringify(err) || "Errore non specificato";
          console.error(`[Gemini API] Fallito tentativo ${i + 1}/${attempts.length} (${attempt.model}):`, errMsg);
          
          if (i < attempts.length - 1) {
            console.log(`[Gemini API] In attesa di ${attempt.delay}ms prima di riprovare...`);
            await sleep(attempt.delay);
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      const extractedText = response?.text;
      if (!extractedText) {
        return res.status(500).json({ error: "Impossibile ottenere dati validi dal modello IA dopo più tentativi di recupero." });
      }

      const parsedResult = JSON.parse(extractedText);
      return res.json({ success: true, data: parsedResult });

    } catch (err: any) {
      console.error("Errore del server durante l'analisi del file:", err);
      return res.status(500).json({ 
        error: "Si è verificato un errore nel motore di intelligenza artificiale durante l'elaborazione del file: " + (err.message || err) 
      });
    }
  });

  // REST ENDPOINTS: Load and Save schedule-data for cloud sync between PC and mobile phones
  app.get("/api/schedule", async (req, res) => {
    try {
      const DATA_FILE = path.join(process.cwd(), "schedule-data.json");
      const exists = await fs.access(DATA_FILE).then(() => true).catch(() => false);
      if (!exists) {
        return res.json({ success: false, message: "No data stored yet.", data: null });
      }
      const rawData = await fs.readFile(DATA_FILE, "utf-8");
      const parsed = JSON.parse(rawData);
      return res.json({ success: true, data: parsed });
    } catch (err: any) {
      console.error("Errore lettura schedule dal server:", err);
      return res.status(500).json({ error: "Errore durante la lettura del piano di lavoro dal server." });
    }
  });

  app.post("/api/schedule", async (req, res) => {
    try {
      const DATA_FILE = path.join(process.cwd(), "schedule-data.json");
      const { machines, employees, shiftLeaders, updatedAt } = req.body;
      if (!machines || !employees || !shiftLeaders) {
        return res.status(400).json({ error: "Dati incompleti o non validi caricate sul server." });
      }
      const payload = { 
        machines, 
        employees, 
        shiftLeaders, 
        updatedAt: updatedAt || new Date().toISOString() 
      };
      await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf-8");
      return res.json({ success: true, updatedAt: payload.updatedAt });
    } catch (err: any) {
      console.error("Errore scrittura schedule sul server:", err);
      return res.status(500).json({ error: "Errore durante il salvataggio del piano di lavoro sul server." });
    }
  });

  // Setup Vite Dev Middleware in local workspace, or serve production client assets
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      // Disabilitiamo HMR per evitare l’errore in console:
      // "[vite] failed to connect to websocket".
      // Non impatta la UI, ma confonde durante l’uso in preview.
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Serving compiled static assets from 'dist' folder.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`full-stack server booted and bound to http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Critical server failure on startup:", error);
});
