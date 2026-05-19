/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Send, Paperclip, Bot, User, FileText, X, Globe, Loader2, Menu, Plus, MessageSquare, Trash2, BookOpen, StickyNote, PenTool, Sparkles, Copy, UserCircle, Search, Shield, ShieldAlert, WifiOff, File, Download, Share2, Clock, Play, Pause, RotateCcw, Users, Flag, LayoutTemplate } from "lucide-react";
import Markdown from "react-markdown";
import { motion, AnimatePresence } from "motion/react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChatPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface ChatMessage {
  role: "user" | "model";
  parts: ChatPart[];
  uiFiles?: File[];
}

interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
}

interface DelegateProfile {
  country: string;
  speakingStyle: string;
  policyPoints: string;
}

interface MUNDocument {
  id: string;
  title: string;
  type: "gsl" | "resolution" | "position_paper" | "other";
  content: string;
  updatedAt: number;
}

const INIT_MESSAGE: ChatMessage = {
  role: "model",
  parts: [{ text: "Welcome to MUN Assistant Pro. I'm here to help you prepare for your upcoming Model UN conference. I can help you draft your opening speech, research country policies, summarize treaties, or clarify MUN procedures. What committee and country are you representing?" }]
};

export default function App() {
  const [threads, setThreads] = useState<Thread[]>(() => {
    const saved = localStorage.getItem("mun_threads");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse threads from localstorage", e);
      }
    }
    return [{
      id: Date.now().toString(),
      title: "Welcome Chat",
      messages: [INIT_MESSAGE],
      updatedAt: Date.now()
    }];
  });

  const [activeThreadId, setActiveThreadId] = useState<string>(threads[0]?.id);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
  const [ropOpen, setRopOpen] = useState(false);
  const [ropSearchQuery, setRopSearchQuery] = useState("");
  const [ropSearchResult, setRopSearchResult] = useState("");
  const [isSearchingRop, setIsSearchingRop] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isSessionMode, setIsSessionMode] = useState(false);
  const [activeTool, setActiveTool] = useState<"notepad" | "chit">("notepad");
  const [sessionActiveRightTab, setSessionActiveRightTab] = useState<"notepad" | "intel" | "guide">("notepad");
  const [timerLeft, setTimerLeft] = useState(60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerPreset, setTimerPreset] = useState(60);
  const [intelText, setIntelText] = useState(() => localStorage.getItem("mun_intel") || "");
  const [notepadText, setNotepadText] = useState(() => localStorage.getItem("mun_notepad") || "");
  const [profile, setProfile] = useState<DelegateProfile>(() => {
    const saved = localStorage.getItem("mun_profile");
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return { country: "", speakingStyle: "", policyPoints: "" };
  });
  const [documents, setDocuments] = useState<MUNDocument[]>(() => {
    const saved = localStorage.getItem("mun_documents");
    if (saved) {
      try { return JSON.parse(saved); } catch(e) {}
    }
    return [];
  });
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [docsModalOpen, setDocsModalOpen] = useState(false);

  const [chitDraft, setChitDraft] = useState("");
  const [refinedChit, setRefinedChit] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save to local storage whenever threads change
  useEffect(() => {
    localStorage.setItem("mun_threads", JSON.stringify(threads));
  }, [threads]);

  useEffect(() => {
    localStorage.setItem("mun_notepad", notepadText);
  }, [notepadText]);

  useEffect(() => {
    localStorage.setItem("mun_intel", intelText);
  }, [intelText]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isTimerRunning && timerLeft > 0) {
      interval = setInterval(() => {
        setTimerLeft((prev) => prev - 1);
      }, 1000);
    } else if (timerLeft === 0) {
      setIsTimerRunning(false);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerLeft]);

  useEffect(() => {
    localStorage.setItem("mun_profile", JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem("mun_documents", JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    if (isSessionMode) {
      setRopOpen(false);
      if (activeTool === 'chit') setActiveTool('notepad');
    }
  }, [isSessionMode]);

  // Handle window resize for sidebar
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeThread = threads.find(t => t.id === activeThreadId) || threads[0];
  const messages = activeThread?.messages || [];

  const SUGGESTED_PROMPTS = [
    "What are the key priorities of my country for this agenda?",
    "Draft an opening speech for my committee.",
    "Summarize the recent UN actions on this topic.",
    "How do I raise a point of information during the committee?"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPendingFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewChat = () => {
    const newThread: Thread = {
      id: Date.now().toString(),
      title: "New Chat",
      messages: [INIT_MESSAGE],
      updatedAt: Date.now()
    };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(newThread.id);
    if (window.innerWidth <= 768) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteThread = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setThreads(prev => {
      const filtered = prev.filter(t => t.id !== id);
      if (filtered.length === 0) {
        const newThread: Thread = {
          id: Date.now().toString(),
          title: "New Chat",
          messages: [INIT_MESSAGE],
          updatedAt: Date.now()
        };
        setActiveThreadId(newThread.id);
        return [newThread];
      }
      if (activeThreadId === id) {
        setActiveThreadId(filtered[0].id);
      }
      return filtered;
    });
  };

  const handleRefineChit = async () => {
    if (!chitDraft.trim()) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/refine-chit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: chitDraft, profile })
      });
      if (!res.ok) throw new Error("Failed to refine chit");
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Server returned HTML. The dev server might be restarting.");
      }
      
      const data = await res.json();
      setRefinedChit(data.text);
    } catch(err) {
      console.error(err);
      setRefinedChit("Error refining chit. Please try again.");
    } finally {
      setIsRefining(false);
    }
  };

  const handleUpdateDocContent = (id: string, content: string) => {
    setDocuments(prev => prev.map(doc => doc.id === id ? { ...doc, content, updatedAt: Date.now() } : doc));
  };

  const handleDeleteDoc = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDocuments(prev => prev.filter(doc => doc.id !== id));
    if (editingDocId === id) setEditingDocId(null);
  };

  const handleDownloadDoc = (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    
    const element = document.createElement("div");
    element.innerHTML = `<h1 style="font-family: sans-serif; font-size: 24px; padding-bottom: 20px; color: #1e293b;">${doc.title || 'Document'}</h1><div style="font-family: sans-serif; font-size: 14px; line-height: 1.6; color: #334155;">${doc.content}</div>`;
    
    // @ts-ignore
    import('html2pdf.js').then((html2pdf) => {
      html2pdf.default().set({
        margin: 15,
        filename: `${doc.title || 'Document'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(element).save();
    });
  };

  const handleShareDoc = async (docId: string) => {
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = doc.content;
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    
    const shareData = {
      title: doc.title,
      text: `${doc.title}\n\n${plainText}`,
    };

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.error("Error sharing", err);
      }
    } else {
      navigator.clipboard.writeText(shareData.text);
      alert("Document text copied to clipboard!");
    }
  };

  const handleRopSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!ropSearchQuery.trim()) {
      setRopSearchResult("");
      return;
    }
    setIsSearchingRop(true);
    try {
      const res = await fetch("/api/search-rop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: ropSearchQuery })
      });
      if (!res.ok) throw new Error("Search failed");
      
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Server returned HTML. The dev server might be restarting.");
      }
      
      const data = await res.json();
      setRopSearchResult(data.text);
    } catch(err) {
      console.error(err);
      setRopSearchResult("Failed to query rules of procedure. Please try again.");
    } finally {
      setIsSearchingRop(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent, overrideText?: string) => {
    e?.preventDefault();
    const textToSubmit = overrideText !== undefined ? overrideText : input;
    if (!textToSubmit.trim() && pendingFiles.length === 0) return;

    const currentText = textToSubmit;
    const currentFiles = [...pendingFiles];
    
    if (overrideText === undefined) {
      setInput("");
    }
    setPendingFiles([]);
    
    const newUserMessage: ChatMessage = {
      role: "user",
      parts: [{ text: currentText }],
      uiFiles: currentFiles.length > 0 ? currentFiles : undefined,
    };

    setThreads((prev) => prev.map(t => {
      if (t.id === activeThreadId) {
        const title = (t.title === "Welcome Chat" || t.title === "New Chat") 
          ? (currentText.substring(0, 30) + (currentText.length > 30 ? "..." : "")) 
          : t.title;
        return {
          ...t,
          title,
          messages: [...t.messages, newUserMessage],
          updatedAt: Date.now()
        };
      }
      return t;
    }));
    
    setIsTyping(true);

    try {
      const formData = new FormData();
      
      const currentT = threads.find(t => t.id === activeThreadId) || threads[0];
      const historyToSend = currentT.messages.map(msg => ({
        role: msg.role,
        parts: msg.parts.map(p => {
          if (p.text) return { text: p.text };
          return p; 
        })
      }));
      
      historyToSend.push({
        role: "user",
        parts: [{ text: currentText }],
      });

      formData.append("history", JSON.stringify(historyToSend));
      
      // Provide context from other past threads to give the agent "memory"
      const otherThreadsContext = threads
        .filter(t => t.id !== activeThreadId)
        .map(t => ({
          title: t.title,
          messages: t.messages.slice(-5).map(m => ({ 
            role: m.role, 
            text: m.parts[0]?.text?.substring(0, 400) 
          }))
        }));
      formData.append("otherThreads", JSON.stringify(otherThreadsContext));
      formData.append("profile", JSON.stringify(profile));

      currentFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errData = {};
        const contentType = response.headers.get("content-type");
        if (contentType && !contentType.includes("text/html")) {
          errData = await response.json().catch(() => ({}));
        }
        throw new Error((errData as any).error || `Server error: ${response.status}`);
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        throw new Error("Server returned HTML. The dev server might be restarting or proxy failed.");
      }

      const data = await response.json();
      
      setThreads((prev) => prev.map(t => {
        if (t.id === activeThreadId) {
          return {
            ...t,
            messages: [...t.messages, { role: "model", parts: [{ text: data.text }] }],
            updatedAt: Date.now()
          };
        }
        return t;
      }));
      
    } catch (error: any) {
      console.error(error);
      setThreads((prev) => prev.map(t => {
        if (t.id === activeThreadId) {
          return {
            ...t,
            messages: [...t.messages, { role: "model", parts: [{ text: `**Error:** ${error.message || 'Failed to get a response.'}` }] }],
            updatedAt: Date.now()
          };
        }
        return t;
      }));
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleTimerReset = () => {
    setIsTimerRunning(false);
    setTimerLeft(timerPreset);
  };

  const handleSetTimerPreset = (secs: number) => {
    setTimerPreset(secs);
    setTimerLeft(secs);
    setIsTimerRunning(false);
  };

  const profileModalJSX = (
    <AnimatePresence>
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-safe sm:pb-6">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setProfileOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="bg-white w-full max-w-lg max-h-full rounded-2xl shadow-2xl relative z-10 flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                  <UserCircle size={20} />
                </div>
                <div>
                  <h2 className="font-display font-semibold text-lg text-slate-900">Delegate Profile</h2>
                  <p className="text-slate-500 text-sm">Personalize AI responses</p>
                </div>
              </div>
              <button onClick={() => setProfileOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-50 flex-1 space-y-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Country</label>
                <input 
                  type="text" 
                  placeholder="e.g. France, United States..." 
                  value={profile.country}
                  onChange={e => setProfile({ ...profile, country: e.target.value })}
                  className="w-full bg-white outline-none px-3 py-2.5 rounded-lg border border-slate-200 text-slate-800 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                />
                <span className="text-xs text-slate-500">The agent will research this country's past resolutions.</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Speaking Style</label>
                <input 
                  type="text" 
                  placeholder="e.g. Aggressive and assertive, Diplomatic and cooperative..." 
                  value={profile.speakingStyle}
                  onChange={e => setProfile({ ...profile, speakingStyle: e.target.value })}
                  className="w-full bg-white outline-none px-3 py-2.5 rounded-lg border border-slate-200 text-slate-800 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700">Key Policy Points</label>
                <textarea 
                  placeholder="e.g. Strongly opposes militarization of space. Favors international research sharing." 
                  rows={4}
                  value={profile.policyPoints}
                  onChange={e => setProfile({ ...profile, policyPoints: e.target.value })}
                  className="w-full resize-none bg-white outline-none px-3 py-2.5 rounded-lg border border-slate-200 text-slate-800 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-400 transition"
                />
                <span className="text-xs text-slate-500">Drafts and suggestions will align with these core tenets.</span>
              </div>
            </div>
            <div className="p-4 bg-white border-t border-slate-100 shrink-0 flex justify-end">
              <button 
                onClick={() => setProfileOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition shadow-sm active:scale-95"
              >
                Save Profile
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (isSessionMode) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 w-full font-sans overflow-hidden">
        {profileModalJSX}
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-slate-800">
            <div className="bg-slate-100 p-1.5 rounded-md">
              <FileText size={18} className="text-slate-600" />
            </div>
            <h1 className="font-display font-semibold text-lg">Debate Workspace</h1>
          </div>
          
          {/* Timer Component */}
          <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-1.5 shadow-sm">
            <div className="flex items-center gap-2">
              <Clock size={16} className={cn("text-slate-500", isTimerRunning && timerLeft <= 10 && "text-red-500 animate-pulse")} />
              <span className={cn(
                "font-mono text-lg font-bold w-12 text-center",
                isTimerRunning && timerLeft <= 10 ? "text-red-600" : "text-slate-700"
              )}>
                {formatTime(timerLeft)}
              </span>
            </div>
            <div className="w-px h-6 bg-slate-200"></div>
            <div className="flex items-center gap-1.5">
              {[30, 60, 90].map(secs => (
                <button
                  key={secs}
                  onClick={() => handleSetTimerPreset(secs)}
                  className={cn(
                    "text-xs px-2 py-1 rounded transition-colors font-medium",
                    timerPreset === secs ? "bg-blue-100 text-blue-700" : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                  )}
                >
                  {secs}s
                </button>
              ))}
            </div>
            <div className="w-px h-6 bg-slate-200"></div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setIsTimerRunning(!isTimerRunning)} 
                className="p-1.5 rounded-md hover:bg-slate-200 text-slate-700 transition"
              >
                {isTimerRunning ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button 
                onClick={handleTimerReset}
                className="p-1.5 rounded-md hover:bg-slate-200 text-slate-700 transition"
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setProfileOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              title="Open Profile"
            >
              <UserCircle size={14} />
              <span className="hidden sm:inline">Profile</span>
            </button>
            <button 
              onClick={() => setIsSessionMode(false)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="Exit Workspace Mode"
            >
              <Shield size={14} />
              <span className="hidden sm:inline">Exit Session</span>
            </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar: Document Library */}
          <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
            <div className="p-4 border-b border-slate-200 flex flex-col gap-2">
              <button 
                onClick={() => {
                  const newDoc: MUNDocument = {
                    id: Date.now().toString(),
                    title: "Untitled Document",
                    type: "other",
                    content: "",
                    updatedAt: Date.now()
                  };
                  setDocuments(prev => [newDoc, ...prev]);
                  setEditingDocId(newDoc.id);
                }}
                className="w-full bg-white border border-slate-200 hover:border-slate-300 text-slate-700 p-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm font-medium text-sm"
              >
                <Plus size={16} />
                <span>New Document</span>
              </button>
              <button 
                onClick={() => {
                  const templateContent = `<h3><b>Preambulatory Clauses</b></h3><p><em>Recalling</em> previous resolutions on this matter,</p><p><em>Deeply concerned</em> by the recent developments,</p><p><em>Acknowledging</em> the efforts of member states,</p><br/><h3><b>Operative Clauses</b></h3><p>1. <u>Encourages</u> member states to...</p><p>2. <u>Requests</u> immediate action to...</p><p>3. <u>Calls upon</u> the United Nations to...</p>`;
                  const newDoc: MUNDocument = {
                    id: Date.now().toString(),
                    title: "Draft Resolution",
                    type: "other",
                    content: templateContent,
                    updatedAt: Date.now()
                  };
                  setDocuments(prev => [newDoc, ...prev]);
                  setEditingDocId(newDoc.id);
                }}
                className="w-full bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 p-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm font-medium text-sm"
              >
                <LayoutTemplate size={16} />
                <span>Resolution Builder</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {documents.length === 0 ? (
                <p className="text-xs text-center text-slate-400 mt-4">No documents</p>
              ) : (
                documents.map(doc => (
                  <div 
                    key={doc.id}
                    onClick={() => setEditingDocId(doc.id)}
                    className={cn(
                      "p-3 rounded-xl cursor-pointer transition-all border group",
                      editingDocId === doc.id ? "bg-white shadow-sm border-slate-200 text-slate-800" : "bg-transparent border-transparent hover:bg-slate-100/80 text-slate-600"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                       <h4 className="text-sm font-medium truncate">{doc.title}</h4>
                       <button 
                         onClick={(e) => handleDeleteDoc(doc.id, e)}
                         className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                       >
                         <Trash2 size={14} />
                       </button>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 opacity-70">{new Date(doc.updatedAt).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Center: Editor */}
          <div className="flex-1 bg-white flex flex-col relative overflow-hidden">
            {editingDocId ? (
              <div className="flex flex-col h-full absolute inset-0">
                <div className="px-12 pt-8 pb-4 shrink-0 flex items-center justify-between border-b border-slate-100">
                  <input 
                    className="text-3xl font-display font-semibold text-slate-900 bg-transparent border-none focus:ring-0 p-0 placeholder:text-slate-300 outline-none flex-1 min-w-0"
                    value={documents.find(d => d.id === editingDocId)?.title || ""}
                    placeholder="Untitled Document"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDocuments(prev => prev.map(d => d.id === editingDocId ? { ...d, title: val } : d));
                    }}
                  />
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <button 
                      onClick={() => handleDownloadDoc(editingDocId)}
                      className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                      title="Download as HTML"
                    >
                      <Download size={16} />
                      <span className="hidden sm:inline">Download</span>
                    </button>
                    <button 
                      onClick={() => handleShareDoc(editingDocId)}
                      className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                      title="Share or Copy text"
                    >
                      <Share2 size={16} />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 px-12">
                  <div className="max-w-4xl mx-auto h-full pb-32">
                    <ReactQuill 
                      theme="snow"
                      value={documents.find(d => d.id === editingDocId)?.content || ""}
                      onChange={(val) => handleUpdateDocContent(editingDocId, val)}
                      placeholder="Start drafting here..."
                      modules={{
                        toolbar: [
                          [{'header': [1, 2, 3, false]}],
                          ['bold', 'italic', 'underline', 'strike'],
                          [{'list': 'ordered'}, {'list': 'bullet'}],
                          [{'align': []}],
                          ['clean']
                        ]
                      }}
                      className="h-full rounded-xl border border-transparent transition-colors [&_.ql-toolbar]:border-none [&_.ql-toolbar]:bg-slate-50 [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:text-[15px] [&_.ql-editor]:min-h-[400px] [&_.ql-editor]:font-sans [&_.ql-editor]:text-slate-800 [&_.ql-blank::before]:text-slate-300"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-300">
                <FileText size={48} className="opacity-30 mb-4" />
                <p className="text-sm font-medium">Select a document from the library to edit.</p>
              </div>
            )}
          </div>

          {/* Right Sidebar: Intel & Notepad */}
          <div className="w-80 border-l border-slate-200 bg-slate-50 flex flex-col shrink-0">
            <div className="flex border-b border-slate-200">
              <button 
                onClick={() => setSessionActiveRightTab("notepad")}
                className={cn(
                  "flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5", 
                  sessionActiveRightTab === "notepad" ? "border-amber-500 text-amber-700 bg-amber-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                )}
              >
                <StickyNote size={14} /> Notepad
              </button>
              <button 
                onClick={() => setSessionActiveRightTab("intel")}
                className={cn(
                  "flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5", 
                  sessionActiveRightTab === "intel" ? "border-indigo-500 text-indigo-700 bg-indigo-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                )}
              >
                <Users size={14} /> Intel
              </button>
              <button 
                onClick={() => setSessionActiveRightTab("guide")}
                className={cn(
                  "flex-1 py-3 text-xs font-medium border-b-2 transition-colors flex items-center justify-center gap-1.5", 
                  sessionActiveRightTab === "guide" ? "border-emerald-500 text-emerald-700 bg-emerald-50/50" : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                )}
              >
                <BookOpen size={14} /> Guide
              </button>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto">
              {sessionActiveRightTab === "notepad" ? (
                <textarea
                  className="w-full h-full resize-none bg-transparent outline-none text-slate-700 text-[15px] leading-relaxed placeholder:text-slate-400 font-sans border-none focus:ring-0 p-0"
                  placeholder="Jot down quick thoughts during the session..."
                  value={notepadText}
                  onChange={(e) => setNotepadText(e.target.value)}
                />
              ) : sessionActiveRightTab === "intel" ? (
                <div className="h-full flex flex-col">
                  <div className="mb-2 flex items-center gap-2 text-indigo-800 bg-indigo-100/50 p-2 rounded-lg text-xs font-medium">
                    <Flag size={14} className="text-indigo-600" />
                    Track other country stances & alliances
                  </div>
                  <textarea
                    className="flex-1 w-full resize-none bg-transparent outline-none text-slate-700 text-[14px] leading-relaxed placeholder:text-slate-400 font-sans border-none focus:ring-0 p-0"
                    placeholder="E.g.,&#10;USA: Supports free market space policy.&#10;China: Pushing for state-led tracking.&#10;UK: Potential ally on resolution 1.2"
                    value={intelText}
                    onChange={(e) => setIntelText(e.target.value)}
                  />
                </div>
              ) : (
                <div className="h-full space-y-6 text-sm text-slate-700 pb-8">
                  <div>
                    <h3 className="font-semibold text-amber-600 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-amber-500 rounded-full"></span>
                      Confidence Challenge
                    </h3>
                    <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 flex items-start gap-3">
                      <div className="bg-amber-100 p-1.5 rounded-md mt-0.5">
                        <Flag size={14} className="text-amber-700" />
                      </div>
                      <div>
                        <p className="font-medium text-amber-900 text-xs mb-1">Your next step:</p>
                        <p className="text-amber-800 text-xs">Try raising your placard during the next moderated caucus to state your core policy point in 30 seconds.</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                      What's Happening?
                    </h3>
                    <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100/50">
                      <p className="font-medium text-slate-900 mb-1">If Moderated Caucus:</p>
                      <p className="text-slate-600 text-xs mb-3">Raise placard. Prepare ONE clear point. Speak when called.</p>
                      <p className="font-medium text-slate-900 mb-1">If Unmoderated Caucus:</p>
                      <p className="text-slate-600 text-xs text-xs mb-3">Leave seat. Form alliances. Draft clauses.</p>
                      <p className="font-medium text-slate-900 mb-1">If GSL:</p>
                      <p className="text-slate-600 text-xs">General debate. You must yield your remaining time.</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                      Speech Structure
                    </h3>
                    <div className="space-y-2">
                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <p className="font-mono text-xs text-slate-800 font-medium">1. HOOK</p>
                        <p className="text-xs text-slate-500">"Honorable chair, delegates..."</p>
                      </div>
                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <p className="font-mono text-xs text-slate-800 font-medium">2. STANCE</p>
                        <p className="text-xs text-slate-500">"The delegation of [Country] believes..."</p>
                      </div>
                      <div className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <p className="font-mono text-xs text-slate-800 font-medium">3. SOLUTION</p>
                        <p className="text-xs text-slate-500">"We propose implementing..."</p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-emerald-800 mb-2 flex items-center gap-2">
                      <span className="w-1 h-4 bg-emerald-500 rounded-full"></span>
                      Common Motions
                    </h3>
                    <ul className="space-y-3">
                      <li className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <strong className="text-slate-900 block text-xs mb-0.5">Moderated Caucus</strong>
                        <span className="text-xs text-slate-600 block">"Motion for a 10-minute mod, 1-minute speaking time, on the topic of..."</span>
                      </li>
                      <li className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <strong className="text-slate-900 block text-xs mb-0.5">Unmoderated Caucus</strong>
                        <span className="text-xs text-slate-600 block">"Motion for a 15-minute unmod to draft resolutions."</span>
                      </li>
                      <li className="bg-white border border-slate-200 p-2.5 rounded-lg">
                        <strong className="text-slate-900 block text-xs mb-0.5">Point of Information</strong>
                        <span className="text-xs text-slate-600 block">To ask a question to the speaker.</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 w-full font-sans overflow-hidden">
      {profileModalJSX}
      <AnimatePresence>
        {docsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="bg-white w-full h-full max-w-7xl rounded-2xl shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 px-6 border-b border-slate-200 shrink-0 bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-600 text-white p-2 rounded-lg">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h2 className="font-display font-semibold text-lg text-slate-900 leading-tight">Document Editor</h2>
                    <p className="text-slate-500 text-xs">Offline drafting suite (No AI)</p>
                  </div>
                </div>
                <button onClick={() => setDocsModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex-1 flex overflow-hidden">
                {/* Left Sidebar: Library */}
                <div className="w-64 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
                  <div className="p-4 border-b border-slate-200">
                    <button 
                      onClick={() => {
                        const newDoc: MUNDocument = {
                          id: Date.now().toString(),
                          title: "Untitled Document",
                          type: "other",
                          content: "",
                          updatedAt: Date.now()
                        };
                        setDocuments(prev => [newDoc, ...prev]);
                        setEditingDocId(newDoc.id);
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      <Plus size={16} />
                      <span className="text-sm font-medium">New Document</span>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {documents.length === 0 ? (
                      <p className="text-xs text-center text-slate-400 mt-4">Library is empty.</p>
                    ) : (
                      documents.map(doc => (
                        <div 
                          key={doc.id}
                          onClick={() => setEditingDocId(doc.id)}
                          className={cn(
                            "p-3 rounded-xl cursor-pointer transition-all border group",
                            editingDocId === doc.id ? "bg-white shadow-sm border-blue-200" : "bg-transparent border-transparent hover:bg-white hover:border-slate-200"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className={cn("text-sm font-medium truncate", editingDocId === doc.id ? "text-blue-700" : "text-slate-700")}>{doc.title}</h4>
                            <button 
                              onClick={(e) => handleDeleteDoc(doc.id, e)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">{new Date(doc.updatedAt).toLocaleDateString()}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Right: Editor */}
                <div className="flex-1 bg-white overflow-hidden flex flex-col relative">
                  {editingDocId ? (
                    <div className="flex flex-col h-full absolute inset-0">
                      <div className="px-12 pt-10 pb-4 shrink-0 flex items-center justify-between border-b border-slate-100">
                        <input 
                          className="text-3xl font-display font-semibold text-slate-900 bg-transparent border-none focus:ring-0 p-0 placeholder:text-slate-300 flex-1 min-w-0"
                          value={documents.find(d => d.id === editingDocId)?.title || ""}
                          placeholder="Untitled Document"
                          onChange={(e) => {
                            const val = e.target.value;
                            setDocuments(prev => prev.map(d => d.id === editingDocId ? { ...d, title: val } : d));
                          }}
                        />
                        <div className="flex items-center gap-1 shrink-0 ml-4">
                          <button 
                            onClick={() => handleDownloadDoc(editingDocId)}
                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                            title="Download as HTML"
                          >
                            <Download size={16} />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                          <button 
                            onClick={() => handleShareDoc(editingDocId)}
                            className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors flex items-center gap-1.5 text-sm font-medium"
                            title="Share or Copy text"
                          >
                            <Share2 size={16} />
                            <span className="hidden sm:inline">Share</span>
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-4 px-12">
                        <div className="max-w-4xl mx-auto h-full pb-32">
                          <ReactQuill 
                            theme="snow"
                            value={documents.find(d => d.id === editingDocId)?.content || ""}
                            onChange={(val) => handleUpdateDocContent(editingDocId, val)}
                            placeholder="Start drafting here... Remember, AI is not allowed during debate."
                            modules={{
                              toolbar: [
                                [{'header': [1, 2, 3, false]}],
                                ['bold', 'italic', 'underline', 'strike'],
                                [{'list': 'ordered'}, {'list': 'bullet'}],
                                [{'align': []}],
                                ['clean']
                              ]
                            }}
                            className="h-full rounded-xl border border-transparent hover:border-slate-100 transition-colors [&_.ql-toolbar]:border-none [&_.ql-toolbar]:bg-slate-50 [&_.ql-toolbar]:rounded-t-xl [&_.ql-container]:border-none [&_.ql-container]:text-[15px] [&_.ql-editor]:min-h-[400px] [&_.ql-editor]:font-sans [&_.ql-editor]:text-slate-800"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                      <FileText size={48} className="opacity-20 mb-4" />
                      <p className="text-sm font-medium">Select a document from the library to edit.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ROP Modal */}
      <AnimatePresence>
        {ropOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pb-safe sm:pb-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setRopOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white w-full max-w-3xl max-h-full rounded-2xl shadow-2xl relative z-10 flex flex-col overflow-hidden"
            >
              <div className="flex flex-col p-5 border-b border-slate-100 shrink-0 gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-600 p-2 rounded-lg">
                      <BookOpen size={20} />
                    </div>
                    <div>
                      <h2 className="font-display font-semibold text-lg text-slate-900">Rules of Procedure</h2>
                      <p className="text-slate-500 text-sm">Search or browse ROP</p>
                    </div>
                  </div>
                  <button onClick={() => setRopOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
                </div>
                <form onSubmit={handleRopSearch} className="relative flex items-center">
                  <Search size={18} className="absolute left-3 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Ask about a point, motion, or procedure..."
                    value={ropSearchQuery}
                    onChange={(e) => setRopSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100/50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-sans"
                  />
                  <button type="submit" disabled={isSearchingRop || !ropSearchQuery.trim()} className="absolute right-2 p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50">
                    {isSearchingRop ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </form>
              </div>
              <div className="p-6 overflow-y-auto bg-slate-50/50 flex-1">
                {ropSearchResult ? (
                  <div className="bg-white p-5 rounded-xl border border-blue-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Bot size={18} className="text-blue-500" />
                      <span className="font-semibold text-slate-900 text-sm">ROP Assistant Answer</span>
                    </div>
                    <div className="markdown-body text-[14px]">
                      <Markdown>{ropSearchResult}</Markdown>
                    </div>
                    <button onClick={() => { setRopSearchResult(""); setRopSearchQuery(""); }} className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-700">
                      Clear Search & Browse All
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8 text-[15px] text-slate-700">
                    <section>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-6 bg-blue-500 rounded-full"></span>
                      Points
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Point of Personal Privilege</strong>
                        <p className="text-slate-600 text-sm mb-2">Used if you experience discomfort that impairs your ability to participate (e.g., cannot hear the speaker).</p>
                        <div className="bg-slate-50 p-2 rounded-lg text-sm font-mono text-slate-600">"Point of personal privilege. Could the delegate please speak louder?"</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Point of Order</strong>
                        <p className="text-slate-600 text-sm mb-2">Used to point out a violation of the rules of procedure.</p>
                        <div className="bg-slate-50 p-2 rounded-lg text-sm font-mono text-slate-600">"Point of order. Is it in order to yield time to another delegate during a moderated caucus?"</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Point of Parliamentary Inquiry</strong>
                        <p className="text-slate-600 text-sm mb-2">Used to ask the Chair a question about the rules of procedure.</p>
                        <div className="bg-slate-50 p-2 rounded-lg text-sm font-mono text-slate-600">"Point of parliamentary inquiry. Are we currently in a 2-for-2 voting procedure?"</div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-6 bg-purple-500 rounded-full"></span>
                      Motions (Examples)
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Moderated Caucus</strong>
                        <p className="text-slate-600 text-sm mb-2">Formal debate with a specific topic, total time, and speaking time.</p>
                        <div className="bg-purple-50 p-2 text-purple-700 rounded-lg text-sm font-mono">"The delegate of [Country] motions for a 10-minute moderated caucus with 1 minute speaking time, on the topic of 'Funding approaches for the refugee crisis'."</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Unmoderated Caucus</strong>
                        <p className="text-slate-600 text-sm mb-2">Informal debate to form blocs and write resolutions.</p>
                        <div className="bg-purple-50 p-2 text-purple-700 rounded-lg text-sm font-mono">"Motion for a 15-minute unmoderated caucus to draft working papers regarding committee agenda 1."</div>
                      </div>
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <strong className="block text-slate-900 mb-1">Motion to Introduce a Draft Resolution</strong>
                        <p className="text-slate-600 text-sm mb-2">Used once a working paper has been approved by the Chair.</p>
                        <div className="bg-purple-50 p-2 text-purple-700 rounded-lg text-sm font-mono">"Motion to introduce Draft Resolution 1.1."</div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <span className="w-1.5 h-6 bg-emerald-500 rounded-full"></span>
                      Debate Etiquette
                    </h3>
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                      <div>
                        <strong className="block text-slate-900">Third-Person Speech</strong>
                        <p className="text-slate-600 text-sm">Always refer to yourself and others in the third person. Never say "I" or "You".</p>
                        <div className="text-emerald-700 text-sm mt-1 bg-emerald-50 p-1.5 rounded inline-block">✅ "The delegate of China believes..." | ❌ "I believe..."</div>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <strong className="block text-slate-900">Yielding Time</strong>
                        <p className="text-slate-600 text-sm">When on the General Speaker's List, you must yield your remaining time.</p>
                        <ul className="list-disc list-inside text-sm text-slate-600 mt-2 space-y-1">
                          <li><strong className="font-medium text-slate-700">To the Chair:</strong> "I yield my time to the Chair."</li>
                          <li><strong className="font-medium text-slate-700">To Another Delegate:</strong> "I yield my time to the delegate of Brazil."</li>
                          <li><strong className="font-medium text-slate-700">To Questions:</strong> "I yield my remaining time to points of information."</li>
                        </ul>
                      </div>
                    </div>
                  </section>
                </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-20 md:hidden" 
            onClick={() => setSidebarOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.div
            initial={{ x: -300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="fixed md:static inset-y-0 left-0 w-72 bg-slate-900 text-white shadow-xl md:shadow-none flex flex-col z-30 shrink-0 border-r border-slate-800"
          >
            <div className="p-4 py-5 flex items-center justify-between border-b border-slate-800 shrink-0 sticky top-0 bg-slate-900 z-10">
              <div className="flex items-center gap-2">
                <div className="bg-blue-600 p-1.5 rounded-lg">
                  <Globe className="w-5 h-5 text-white" />
                </div>
                <h2 className="font-display font-semibold tracking-tight text-lg">MUN Agent</h2>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-3 shrink-0">
              <button 
                onClick={handleNewChat}
                className="w-full flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm active:scale-[0.98]"
              >
                <Plus size={18} />
                New Consultation
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 mt-2 overscroll-contain">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-3 pt-2">
                Recent Sessions
              </div>
              {threads.sort((a,b) => b.updatedAt - a.updatedAt).map(thread => (
                <div 
                  key={thread.id}
                  onClick={() => {
                    setActiveThreadId(thread.id);
                    if (window.innerWidth <= 768) setSidebarOpen(false);
                  }}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-all border",
                    activeThreadId === thread.id 
                      ? "bg-slate-800 text-white border-slate-700" 
                      : "text-slate-400 border-transparent hover:bg-slate-800/50 hover:text-white hover:border-slate-800"
                  )}
                >
                  <div className="flex items-center gap-3 overflow-hidden flex-1 truncate">
                    <MessageSquare size={16} className={activeThreadId === thread.id ? "text-blue-400 shrink-0" : "shrink-0"} />
                    <span className="truncate text-sm font-medium">{thread.title}</span>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteThread(thread.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 transition-all shrink-0 focus:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative z-10 transition-all bg-white overflow-hidden">
        
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3.5 flex items-center justify-between shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            {!sidebarOpen && (
              <button 
                onClick={() => setSidebarOpen(true)}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors mr-1"
              >
                <Menu size={20} />
              </button>
            )}
            <div>
              <h1 className="font-display font-semibold text-[17px] text-slate-900 tracking-tight leading-none flex items-center gap-2">
                {activeThread?.title}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsSessionMode(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/50 shadow-sm"
            >
              <Shield size={16} className="text-emerald-600" />
              <span className="hidden lg:inline">Enter MUN Session</span>
            </button>
            <button 
              onClick={() => setProfileOpen(true)}
              className="hidden lg:flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <UserCircle size={16} />
              <span>Profile</span>
            </button>
            {!isSessionMode && (
              <button 
                onClick={() => setRopOpen(true)}
                className="hidden lg:flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <BookOpen size={16} />
                <span>ROP</span>
              </button>
            )}
            <button 
              onClick={() => { setToolsOpen(!toolsOpen); setActiveTool("notepad"); }}
              className="flex items-center gap-2 bg-amber-100/50 hover:bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-amber-200/50"
            >
              <StickyNote size={16} />
              <span className="hidden sm:inline">Notepad</span>
            </button>
            {!isSessionMode && (
              <button 
                onClick={() => { setToolsOpen(!toolsOpen); setActiveTool("chit"); }}
                className="flex items-center gap-2 bg-purple-100/50 hover:bg-purple-100 text-purple-800 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-purple-200/50"
              >
                <Sparkles size={16} />
                <span className="hidden sm:inline">Chits</span>
              </button>
            )}
            <button 
              onClick={() => setDocsModalOpen(true)}
              className="flex items-center gap-2 bg-blue-100/50 hover:bg-blue-100 text-blue-800 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-blue-200/50"
            >
              <FileText size={16} />
              <span className="hidden sm:inline">Docs</span>
            </button>
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto w-full relative scroll-smooth p-4 md:p-6" id="messages-container">
          <div className="max-w-3xl mx-auto space-y-6 pb-24">
            <AnimatePresence initial={false}>
              {messages.map((message, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={cn(
                    "flex gap-4 md:gap-5",
                    message.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm border",
                    message.role === "user" ? "bg-slate-800 text-white border-slate-700" : "bg-blue-600 text-white border-blue-500"
                  )}>
                    {message.role === "user" ? <User size={18} /> : <Bot size={18} />}
                  </div>

                  <div className={cn(
                    "flex flex-col gap-2 max-w-[85%] md:max-w-[75%]",
                    message.role === "user" ? "items-end" : "items-start"
                  )}>
                    {message.uiFiles && message.uiFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 justify-end mb-1">
                        {message.uiFiles.map((f, fi) => (
                          <div key={fi} className="flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm">
                            <FileText size={14} className="text-blue-600" />
                            <span className="truncate max-w-[150px] font-medium">{f.name}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className={cn(
                      "px-5 py-4 rounded-2xl shadow-sm leading-relaxed",
                      message.role === "user" 
                        ? "bg-slate-800 text-white rounded-tr-none text-[15px]" 
                        : "bg-white text-slate-800 border border-slate-200 rounded-tl-none font-sans"
                    )}>
                      {message.parts.map((part, pidx) => (
                        <div key={pidx}>
                          {part.text && (
                            message.role === "user" ? (
                              <div className="whitespace-pre-wrap">{part.text}</div>
                            ) : (
                              <div className="markdown-body text-[15px]">
                                <Markdown>{part.text}</Markdown>
                              </div>
                            )
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
              
              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-4 md:gap-5"
                >
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-blue-600 text-white">
                    <Bot size={18} />
                  </div>
                  <div className="bg-white border border-slate-200 px-5 py-4 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-3">
                    <Loader2 size={16} className="animate-spin text-blue-600" />
                    <span className="text-sm text-slate-500 font-medium">Assistant is thinking...</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            
            {messages.length === 1 && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-8 mb-4 max-w-2xl mx-auto"
              >
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 px-2 text-center md:text-left">Suggested for you</h3>
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 justify-center md:justify-start">
                  {SUGGESTED_PROMPTS.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSubmit(undefined, prompt)}
                      className="text-left text-[14px] font-medium text-slate-700 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-700 hover:bg-blue-50 hover:shadow-sm px-4 py-3 rounded-xl transition-all shadow-sm flex-1 min-w-[240px]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="bg-white shadow-[0_-4px_24px_-4px_rgba(0,0,0,0.02)] border-t border-slate-100 p-3 sm:p-4 shrink-0 pb-safe z-20">
          <div className="max-w-3xl mx-auto relative">
            
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                <AnimatePresence>
                  {pendingFiles.map((file, idx) => (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      key={idx} 
                      className="flex items-center gap-2 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg text-sm shadow-sm"
                    >
                      <FileText size={14} className="text-blue-500" />
                      <span className="truncate max-w-[120px] text-slate-700 font-medium">{file.name}</span>
                      <button 
                        onClick={() => removePendingFile(idx)}
                        className="p-1 hover:bg-slate-200 rounded-md text-slate-500 transition-colors ml-1"
                      >
                        <X size={14} />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl p-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 focus-within:bg-white transition-all">
                
                <input 
                  type="file" 
                  multiple 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileChange}
                  accept=".pdf,.doc,.docx,.txt,.csv" 
                />
                
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 sm:p-3 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-xl transition-colors shrink-0 flex items-center justify-center self-end mb-0.5"
                  title="Attach Document"
                >
                  <Paperclip size={20} />
                </button>

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your MUN agenda..."
                  className="flex-1 max-h-[200px] min-h-[44px] bg-transparent border-none focus:ring-0 resize-none py-3 px-1 text-[15px] outline-none text-slate-800 placeholder:text-slate-400 leading-relaxed"
                  rows={Math.min(6, input.split("\n").length || 1)}
                />

                <button
                  onClick={handleSubmit}
                  disabled={(!input.trim() && pendingFiles.length === 0) || isTyping}
                  className={cn(
                    "p-3 sm:px-4 sm:py-3 rounded-xl transition-all font-medium self-end flex items-center gap-2 mb-0.5",
                    (!input.trim() && pendingFiles.length === 0) || isTyping
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-slate-900 text-white hover:bg-blue-600 shadow-md active:scale-[0.98]"
                  )}
                >
                  <span className="hidden sm:inline text-sm font-semibold">Send</span>
                  <Send size={18} className={(!input.trim() && pendingFiles.length === 0) || isTyping ? "" : "sm:translate-x-0.5"} />
                </button>
              </div>
          </div>
        </div>
      </div>

      {/* Tools Sidebar */}
      <AnimatePresence>
        {toolsOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-30 lg:hidden" 
              onClick={() => setToolsOpen(false)} 
            />
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: "spring", bounce: 0, duration: 0.3 }}
              className="fixed lg:static inset-y-0 right-0 w-[320px] lg:w-80 bg-white border-l border-slate-200 shadow-2xl lg:shadow-none z-40 flex flex-col shrink-0"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="font-semibold text-slate-900">Delegate Tools</h2>
                <button onClick={() => setToolsOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                  <X size={18} />
                </button>
              </div>
              <div className="flex border-b border-slate-100 p-2 gap-2 bg-slate-50">
                <button onClick={() => setActiveTool("notepad")} className={cn("flex-1 py-1.5 rounded-md text-sm font-medium transition", activeTool === "notepad" ? "bg-white shadow-sm text-amber-600 border border-slate-200" : "text-slate-500 hover:text-slate-700 border border-transparent")}>
                  <div className="flex items-center justify-center gap-2"><StickyNote size={14}/> Notepad</div>
                </button>
                <button onClick={() => setActiveTool("chit")} className={cn("flex-1 py-1.5 rounded-md text-sm font-medium transition", activeTool === "chit" ? "bg-white shadow-sm text-purple-600 border border-slate-200" : "text-slate-500 hover:text-slate-700 border border-transparent")}>
                  <div className="flex items-center justify-center gap-2"><Sparkles size={14}/> Chit Refiner</div>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col">
                {activeTool === "notepad" ? (
                  <textarea
                    className="flex-1 w-full h-full resize-none bg-amber-50/40 outline-none p-4 rounded-xl border border-amber-200/50 text-slate-700 text-[15px] leading-relaxed focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 transition-all font-sans"
                    placeholder="Jot down quick thoughts... here..."
                    value={notepadText}
                    onChange={(e) => setNotepadText(e.target.value)}
                  />
                ) : (
                  <div className="flex flex-col h-full gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rough Draft</label>
                      <textarea
                        className="w-full resize-none bg-slate-50 outline-none p-3 rounded-xl border border-slate-200 text-slate-700 text-sm focus:border-purple-400 focus:ring-1 focus:ring-purple-400 transition"
                        rows={4}
                        placeholder="E.g., Let's join blocs, we both want to fund space stuff."
                        value={chitDraft}
                        onChange={(e) => setChitDraft(e.target.value)}
                      />
                      <button 
                        onClick={handleRefineChit}
                        disabled={!chitDraft.trim() || isRefining}
                        className="mt-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition active:scale-[0.98]"
                      >
                        {isRefining ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
                        Refine Diplomatic Language
                      </button>
                    </div>
                    
                    {refinedChit && (
                      <div className="flex flex-col gap-2 mt-4">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Refined Chit</label>
                        <div className="relative group">
                          <div className="w-full bg-purple-50/50 p-4 rounded-xl border border-purple-200 text-purple-900 text-[14px] leading-relaxed">
                            {refinedChit}
                          </div>
                          <button 
                            onClick={() => navigator.clipboard.writeText(refinedChit)}
                            className="absolute top-2 right-2 p-1.5 bg-white shadow-sm border border-purple-100 rounded-md text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title="Copy to clipboard"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
