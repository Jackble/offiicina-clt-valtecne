// Nota: su Vercel (serverless) il filesystem non è persistente.
// Questo endpoint mantiene un "best-effort cache" in memoria (quando possibile),
// ma la fonte di verità rimane il localStorage del browser.

type ScheduleData = {
  machines: any[];
  employees: any[];
  shiftLeaders: any[];
  updatedAt?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var __SCHEDULE_CACHE__: ScheduleData | undefined;
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method === "GET") {
      if (global.__SCHEDULE_CACHE__) {
        return res.json({ success: true, data: global.__SCHEDULE_CACHE__ });
      }
      return res.json({ success: false, message: "No data stored yet.", data: null });
    }

    if (req.method === "POST") {
      const { machines, employees, shiftLeaders, updatedAt } = req.body || {};
      if (!machines || !employees || !shiftLeaders) {
        return res.status(400).json({ error: "Dati incompleti o non validi caricate sul server." });
      }

      global.__SCHEDULE_CACHE__ = {
        machines,
        employees,
        shiftLeaders,
        updatedAt: updatedAt || new Date().toISOString(),
      };

      return res.json({ success: true, updatedAt: global.__SCHEDULE_CACHE__.updatedAt });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Metodo non consentito" });
  } catch (e: any) {
    return res.status(500).json({ error: "Errore durante la gestione del piano di lavoro." });
  }
}

