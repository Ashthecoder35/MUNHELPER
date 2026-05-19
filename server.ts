import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import multer from "multer";

const upload = multer({ storage: multer.memoryStorage() });

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

  // API Routes
  app.post("/api/refine-chit", async (req, res) => {
    try {
      const aiClient = getAi();
      const { draft, profile } = req.body;
      
      let systemInstruction = "You are an expert Model United Nations delegate helping another delegate write a chit. Make the language formal, diplomatic, and persuasive.";
      if (profile) {
        systemInstruction += `\n\nYou are representing ${profile.country || "a member state"}. Your usual speaking style is ${profile.speakingStyle || "diplomatic"}. Your key policy points are: ${profile.policyPoints || "none"}. Reflect this perspective if relevant, but prioritize making the chit effective.`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Refine the following rough idea for a Model UN chit into a diplomatic, effective, and concise message to another delegate. Keep it short (1-3 sentences) as it's meant to be passed on a small piece of paper during debate. Return only the refined message.\n\nDraft: ${draft}`,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
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
        model: "gemini-2.5-flash",
        contents: `Explain the following Model UN Rules of Procedure topic clearly and concisely: ${query}`,
        config: {
          systemInstruction: "You are an expert Model UN Chair explaining Rules of Procedure (ROP). Provide a clear, definitive, and concise answer to the procedural question. If helpful, provide a quick example of what a delegate should say (e.g. 'Motion for a...'). Use Markdown formatting for readability. Keep responses under 200 words.",
          temperature: 0.1,
        }
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
        systemInstruction += `\n\nYou are representing ${profile.country || "a member state"}. Your usual speaking style is ${profile.speakingStyle || "diplomatic"}. Your key policy points are: ${profile.policyPoints || "none"}. Ensure the draft strictly follows this country's perspective and mentioned policy points.`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Draft a ${type === "gsl" ? "General Speakers List speech" : type} based on the following notes/prompt: ${prompt}`,
        config: {
          systemInstruction,
          temperature: 0.4,
        }
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message || "Failed to draft document" });
    }
  });

  app.post("/api/chat", upload.array("files"), async (req, res) => {
    try {
      const aiClient = getAi();
      const { history, otherThreads, profile } = req.body;
      let parsedHistory = typeof history === "string" ? JSON.parse(history) : history;
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

      let systemInstruction = "You are an expert Model United Nations (MUN) assistant. Your user is currently a delegate in the Special Political and Decolonization Committee (SPECPOL) discussing the agenda: 'Examining International Cooperation in the Peaceful Uses of Outer Space and Preventing the Militarization and Territorial Appropriation of Mars'. You provide instant, highly accurate answers to MUN rules, procedures (like ROPs, points, motions), country policies, historical facts, and international relations. Tailor examples and advice to this agenda when applicable. When asked to summarize a research paper or historical document, be thorough, highlight the main arguments, relevance to specific committees or topics, and provide actionable insights for delegates. Maintain a professional, diplomatic, and objective tone.";
      
      if (parsedProfile && (parsedProfile.country || parsedProfile.speakingStyle || parsedProfile.policyPoints)) {
        systemInstruction += `\n\n--- DELEGATE PROFILE ---\nThe user represents the country: ${parsedProfile.country || "Not specified"}.\nSpeaking Style: ${parsedProfile.speakingStyle || "Diplomatic and professional"}.\nKey Policy Points: ${parsedProfile.policyPoints || "None specified"}.\nUse this profile to deeply personalize your responses, speeches, and suggestions.`;
      }

      if (parsedOtherThreads && parsedOtherThreads.length > 0) {
        systemInstruction += `\n\n--- CROSS-CHAT MEMORY ---\nThe user has interacted with you in other sessions. Rely on the following summaries of past chat threads to remember the user's country, preferences, and previous discussions seamlessly:\n${JSON.stringify(parsedOtherThreads)}`;
      }

      const response = await aiClient.models.generateContent({
        model: "gemini-2.5-flash", // Use flash model for fast responses
        contents: parsedHistory,
        config: {
          systemInstruction,
          temperature: 0.2, // Keep it grounded and factual
        }
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
    app.use((req, res, next) => {
      vite.middlewares.handle(req, res, next);
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
