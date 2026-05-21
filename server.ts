import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fieldSize: 50 * 1024 * 1024 } // 50MB
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize Gemini
  let ai: GoogleGenAI | null = null;
  const getAi = () => {
    if (!ai) {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY environment variable is required");
      }
      ai = new GoogleGenAI({ 
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });
    }
    return ai;
  };

  app.use(express.json({ limit: "50mb" }));

  // Request logging for debugging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", env: process.env.NODE_ENV, hasKey: !!process.env.GEMINI_API_KEY });
  });

  app.post("/api/refine-chit", async (req, res) => {
    console.log("Refining chit...");
    try {
      const aiClient = getAi();
      const { draft, profile } = req.body;
      
      if (!draft) {
        return res.status(400).json({ error: "Draft is required" });
      }
      let systemInstruction = "You are an expert Model United Nations delegate helping another delegate write a chit. Make the language formal, diplomatic, and persuasive.";
      if (profile) {
        systemInstruction += `\n\nYou are representing ${profile.country || "a member state"}. Your usual speaking style is ${profile.speakingStyle || "diplomatic"}. Your key policy points are: ${profile.policyPoints || "none"}. Reflect this perspective if relevant, but prioritize making the chit effective.`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: `Refine the following rough idea for a Model UN chit into a diplomatic, effective, and concise message to another delegate. Keep it short (1-3 sentences) as it's meant to be passed on a small piece of paper during debate. Return only the refined message.\n\nDraft: ${draft}` }] }],
        config: {
          temperature: 0.3,
          systemInstruction,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to refine chit" });
    }
  });

  app.post("/api/search-rop", async (req, res) => {
    try {
      const aiClient = getAi();
      const { query } = req.body;
      
      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: `Explain the following Model UN Rules of Procedure topic clearly and concisely: ${query}` }] }],
        config: {
          temperature: 0.1,
          systemInstruction: "You are an expert Model UN Chair explaining Rules of Procedure (ROP). Provide a clear, definitive, and concise answer to the procedural question. If helpful, provide a quick example of what a delegate should say (e.g. 'Motion for a...'). Use Markdown formatting for readability. Keep responses under 200 words.",
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to search ROP" });
    }
  });

  app.post("/api/draft-document", async (req, res) => {
    try {
      const aiClient = getAi();
      const { type, prompt, profile } = req.body;
      
      let systemInstruction = `You are an expert Model United Nations delegate. Your task is to draft a formal ${type === "gsl" ? "General Speakers List (GSL) speech" : type}. 
      The document must be professional, diplomatic, and adhere to standard MUN conventions. 
      For speeches, aim for a length that takes approximately 60-90 seconds to deliver at a moderate pace (around 150-200 words).`;

      if (profile) {
        systemInstruction += `\n\nYou are representing ${profile.country || "a member state"}. Your usual speaking style is ${profile.speakingStyle || "diplomatic"}. Your key policy points are: ${profile.policyPoints || "none"}.`;
        if (profile.committee || profile.agenda) {
          systemInstruction += `\nThis is for the ${profile.committee || "committee"} discussing the topic: '${profile.agenda || "the agenda"}'.`;
        }
        systemInstruction += `\nEnsure the draft strictly follows this country's perspective and listed policies.`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: `Draft a ${type === "gsl" ? "General Speakers List speech" : type} based on the following notes/prompt: ${prompt}` }] }],
        config: {
          temperature: 0.4,
          systemInstruction,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to draft document" });
    }
  });

  app.post("/api/simulate-country-document", async (req, res) => {
    try {
      const aiClient = getAi();
      const { country, committee, agenda, type } = req.body;

      if (!country || !committee || !agenda || !type) {
        return res.status(400).json({ error: "Missing required simulation fields" });
      }

      const systemInstruction = `You are an expert Model United Nations (MUN) diplomat representing the sovereign nation of ${country} in the ${committee}. 
The committee is discussing the agenda: '${agenda}'.
Your task is to draft a formal, high-quality MUN document of type: ${type === "position_paper" ? "Position Paper" : type === "gsl" ? "General Speakers List Speech" : "Resolution Clause draft"}.
You MUST represent ${country}'s real-world foreign policy, strategic alliances, development level, and ideological perspective with absolute geopolitical realism.
For speeches, keep them concise and deliverable in ~60-90 seconds (under 220 words).
For draft resolutions, format them with appropriate preambulatory (italicized) or operative (underlined) verbs. Use HTML tags (such as <h3>, <p>, <b>, <em>) for clean rich-text layout.`;

      let prompt = "";
      if (type === "position_paper") {
        prompt = `Write a comprehensive, professional Model UN Position Paper for ${country} on the topic: "${agenda}".
Please organize it into three standard sections using clean HTML tagging (headers, paragraphs, bolding, etc.):
1. Topic Background & National Context (Why this topic is vital to ${country})
2. Domestic Actions & Global Policy (Past treaties, initiatives, and actions taken by ${country})
3. Proposed Resolutions & Solutions (Constructive, specific solutions ${country} urges the committee to adopt)
Do not use markdown blocks (\`\`\`). Output valid HTML snippets.`;
      } else if (type === "gsl") {
        prompt = `Draft a formal, powerful General Speakers List (GSL) speech for ${country}'s delegation on: "${agenda}". 
The speech must take about 60 to 90 seconds to deliver. It should begin with formal addresses, contain a core thesis regarding our stance, and list our key call to action. Return only the final speech content as HTML (paragraphs and bold text).`;
      } else {
        prompt = `Draft three formal draft resolution clauses sponsored by ${country} on: "${agenda}". 
Include one preambulatory clause and two operative clauses. Reflect standard MUN mechanics. Bold/Underline the initiation phrases carefully. Output as clean HTML.`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        config: {
          temperature: 0.3,
          systemInstruction,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Simulation Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to simulate country document" });
    }
  });

  app.post("/api/chat", upload.array("files"), async (req, res) => {
    console.log("Chat request received");
    try {
      const aiClient = getAi();
      const { history, otherThreads, profile } = req.body;
      
      let parsedHistory = [];
      try {
        parsedHistory = typeof history === "string" ? JSON.parse(history) : (history || []);
      } catch (e) {
        console.error("Failed to parse history:", e);
        return res.status(400).json({ error: "Invalid history format" });
      }
      let parsedOtherThreads: any[] = [];
      try {
        if (otherThreads) {
          parsedOtherThreads = typeof otherThreads === "string" ? JSON.parse(otherThreads) : otherThreads;
        }
      } catch (e) {
        console.error("Failed to parse otherThreads:", e);
      }
      let parsedProfile: any = null;
      try {
        if (profile) {
          parsedProfile = typeof profile === "string" ? JSON.parse(profile) : profile;
        }
      } catch (e) {
        console.error("Failed to parse profile:", e);
      }
      
      const files = req.files as Express.Multer.File[];
      
      // If there are files attached in this request, we append them to the last user message
      if (files && files.length > 0) {
        const lastMessage = parsedHistory[parsedHistory.length - 1];
        if (lastMessage && lastMessage.role === "user") {
          for (const file of files) {
            lastMessage.parts.push({
              inlineData: {
                data: file.buffer.toString("base64"),
                mimeType: file.mimetype,
              }
            });
          }
        }
      }

      const committee = parsedProfile?.committee || "Special Political and Decolonization Committee (SPECPOL)";
      const agenda = parsedProfile?.agenda || "Examining International Cooperation in the Peaceful Uses of Outer Space & Preventing the Militarization and Territorial Appropriation of Mars";

      let systemInstruction = `You are an expert Model United Nations (MUN) assistant. Your user is currently a delegate in the ${committee} discussing the agenda: '${agenda}'. You provide instant, highly accurate answers to MUN rules, procedures (like ROPs, points, motions), country policies, historical facts, and international relations. Tailor examples and advice to this agenda and committee when applicable. When asked to summarize a research paper or historical document, be thorough, highlight the main arguments, relevance to specific committees or topics, and provide actionable insights for delegates. Maintain a professional, diplomatic, and objective tone.`;
      
      if (parsedProfile && (parsedProfile.country || parsedProfile.speakingStyle || parsedProfile.policyPoints)) {
        systemInstruction += `\n\n--- DELEGATE PROFILE ---\nThe user represents the country: ${parsedProfile.country || "Not specified"}.\nSpeaking Style: ${parsedProfile.speakingStyle || "Diplomatic and professional"}.\nKey Policy Points: ${parsedProfile.policyPoints || "None specified"}.\nUse this profile to deeply personalize your responses, speeches, and suggestions.`;
      }

      if (parsedOtherThreads && parsedOtherThreads.length > 0) {
        systemInstruction += `\n\n--- CROSS-CHAT MEMORY ---\nThe user has interacted with you in other sessions. Rely on the following summaries of past chat threads to remember the user's country, preferences, and previous discussions seamlessly:\n${JSON.stringify(parsedOtherThreads)}`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: parsedHistory,
        config: {
          temperature: 0.2, // Keep it grounded and factual
          systemInstruction,
        },
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to communicate with AI" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Global error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global Error Handler caught:", err);
    if (req.path.startsWith('/api/')) {
      res.status(500).json({ error: err.message || "Internal Server Error" });
    } else {
      next(err);
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
  });
}

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception caught to prevent crash:", err);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection detected to prevent crash:", promise, "reason:", reason);
});

startServer().catch(err => {
  console.error("CRITICAL: Failed to start server:", err);
  process.exit(1);
});
