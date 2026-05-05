import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Layout, 
  Search, 
  Menu, 
  X, 
  ChevronRight, 
  FileUp,
  BrainCircuit,
  Sparkles,
  ArrowLeft,
  Loader2,
  Download
} from 'lucide-react';
import { TOOLS } from './constants';
import { GoogleGenAI } from "@google/genai";

// AI Instance
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

import JSZip from 'jszip';

export default function App() {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ url: string; name: string }[]>([]);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [compressionLevel, setCompressionLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [rotationAngle, setRotationAngle] = useState<'90' | '180' | '270'>('90');
  const [annotations, setAnnotations] = useState<any[]>([]);
  const [history, setHistory] = useState<any[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentText, setCurrentText] = useState("");
  const [annotationType, setAnnotationType] = useState<'text' | 'highlight' | 'square'>('text');
  const [isDragging, setIsDragging] = useState(false);
  const [isChatDragging, setIsChatDragging] = useState(false);

  const pushToHistory = (newAnnotations: any[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newAnnotations);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setAnnotations(newAnnotations);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prev = historyIndex - 1;
      setHistoryIndex(prev);
      setAnnotations(history[prev]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const next = historyIndex + 1;
      setHistoryIndex(next);
      setAnnotations(history[next]);
    }
  };

  const addAnnotation = () => {
    let newAnn: any = { 
      type: annotationType,
      x: 10 + (annotations.length * 2), // Stagger positions slightly
      y: 10 + (annotations.length * 5),
      page: 0 // Default to first page
    };

    if (annotationType === 'text') {
      if (!currentText.trim()) return;
      newAnn = { 
        ...newAnn,
        text: currentText, 
        r: 0.2, g: 0.4, b: 0.8, 
        size: 16 
      };
      setCurrentText("");
    } else if (annotationType === 'highlight') {
      newAnn = {
        ...newAnn,
        w: 120,
        h: 20,
        r: 1, g: 1, b: 0 // Yellow
      };
    } else if (annotationType === 'square') {
      newAnn = {
        ...newAnn,
        w: 100,
        h: 100,
        r: 0.8, g: 0.2, b: 0.2 // Red border
      };
    }

    pushToHistory([...annotations, newAnn]);
  };
  const [ocrLanguage, setOcrLanguage] = useState("auto");
  const [ocrHint, setOcrHint] = useState("");
  const [summaryStyle, setSummaryStyle] = useState<'balanced' | 'concise' | 'detailed' | 'executive'>('balanced');

  const filteredTools = TOOLS.filter(tool => 
    tool.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toolsByCategory = filteredTools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, typeof TOOLS>);

  const categoryOrder = ['AI', 'Basic', 'Convert', 'Security'];
  const sortedCategories = Object.keys(toolsByCategory).sort((a, b) => {
    return categoryOrder.indexOf(a) - categoryOrder.indexOf(b);
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      let validFiles: File[] = [];

      if (activeTool === 'image-to-pdf') {
        validFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      } else {
        // Most other tools expect PDF
        validFiles = droppedFiles.filter(f => f.type === 'application/pdf');
      }

      if (validFiles.length > 0) {
        // If we already have files, and the tool supports multiple (merge, image-to-pdf), we append.
        // Otherwise we replace.
        if (files.length > 0 && (activeTool === 'merge' || activeTool === 'image-to-pdf')) {
          setFiles(prev => [...prev, ...validFiles]);
        } else {
          setFiles(validFiles);
        }
        setResults([]);
        setAiResponse(null);
      }
    }
  };

  const handleChatDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsChatDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      const pdfOnly = droppedFiles.filter(f => f.type === "application/pdf");
      if (pdfOnly.length > 0) {
        setResults([]);
        setAiResponse(null);
        setFiles(pdfOnly);
        // We'll let the user click "Analyze" or automatically trigger? 
        // Wording "directly into chat" usually suggests immediate action if possible.
        // But better to let state update first.
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const resetTool = () => {
    activeTool && setActiveTool(null);
    setFiles([]);
    setError(null);
    setResults([]);
    setAiResponse(null);
    setExtractedText(null);
    setChatInput("");
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    let res: Response;
    try {
      res = await fetch(url, options);
    } catch (e: any) {
      if (e.name === 'TypeError' && e.message === 'Failed to fetch') {
        throw new Error('Connection failed. The server might be restarting or your payload is too large.');
      }
      throw e;
    }

    const contentType = res.headers.get('content-type') || "";
    const isJson = contentType.includes('application/json');
    
    if (!res.ok) {
      const text = await res.text();
      if (isJson) {
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || `Server Error: ${res.status}`);
        } catch (parseError) {
          throw new Error(`Server returned error ${res.status}. Body: ${text.substring(0, 500)}`);
        }
      } else {
        if (text.includes('<!doctype html') || text.includes('<html')) {
          throw new Error(`The server returned an unexpected HTML response (${res.status}). This often happens if the backend crashed or the route is incorrect.`);
        }
        throw new Error(text || `Request failed with status ${res.status}`);
      }
    }
    
    return res;
  };

  const extractTextFallback = async (file: File, isForStructure: boolean = false): Promise<string> => {
    try {
      setIsProcessing(true); // Ensure processing state is true during Gemini OCR
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(file);
      });

      let prompt = isForStructure 
        ? "Extract the content of this PDF into a structural representation. Preserve formatting like **bold** and *italic* where clear. Use # for headings (e.g. # Heading 1, ## Heading 2), - for bullet points, and standard Markdown tables for any tables found. Do not add conversational text, just the document content."
        : "Extract all readable text from this PDF accurately. Return ONLY the content.";

      if (ocrLanguage !== "auto") {
        prompt += ` The document is primarily in ${ocrLanguage}. Use your best knowledge of this language to improve OCR accuracy.`;
      }

      if (ocrHint) {
        prompt += ` Special Instruction for extraction: ${ocrHint}`;
      }

      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType: "application/pdf" } }
          ]
        }]
      });
      return response.text || "";
    } catch (e) {
      console.error('Gemini OCR failed:', e);
      throw new Error("Optical Character Recognition (OCR) failed. The document might be encrypted, too large, or contain blocked content.");
    }
  };

  const processPDF = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setError(null);

    try {
      if (activeTool === 'merge') {
        const formData = new FormData();
        files.forEach(f => formData.append('pdfs', f));
        const res = await safeFetch('/api/pdf/merge', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: 'merged_document.pdf' }]);
      } else if (activeTool === 'split') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        const res = await safeFetch('/api/pdf/split', { method: 'POST', body: formData });
        const zipBlob = await res.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const extracted: { url: string; name: string }[] = [];
        
        for (const filename of Object.keys(zip.files)) {
          const file = zip.files[filename];
          const blob = await file.async('blob');
          extracted.push({ url: URL.createObjectURL(blob), name: filename });
        }
        setResults(extracted);
      } else if (activeTool === 'word' || activeTool === 'ppt' || activeTool === 'pdf-to-text' || activeTool === 'summarize' || activeTool === 'chat') {
        let textResult = "";
        let isScanned = false;

        // For Word and PPT, we prefer high-quality structural reconstruction
        const useHighQuality = activeTool === 'word' || activeTool === 'ppt';

        if (useHighQuality) {
          textResult = await extractTextFallback(files[0], true);
        } else {
          try {
            const formData = new FormData();
            formData.append('pdf', files[0]);
            const res = await safeFetch('/api/pdf/extract-text', { method: 'POST', body: formData });
            const data = await res.json();
            
            if (data.scanned) {
              isScanned = true;
            } else {
              textResult = data.text;
            }
          } catch (e: any) {
            // If it's a real error (not just scanned), report it
            throw e;
          }

          if (isScanned) {
            textResult = await extractTextFallback(files[0], false);
          }
        }

        if (!textResult || textResult.trim().length === 0) {
          throw new Error("No readable text found in document.");
        }

        setExtractedText(textResult);

        if (activeTool === 'pdf-to-text') {
          const blob = new Blob([textResult], { type: 'text/plain' });
          setResults([{ url: URL.createObjectURL(blob), name: 'document_text.txt' }]);
        } else if (activeTool === 'word') {
          const res = await safeFetch('/api/pdf/word', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textResult })
          });
          const blob = await res.blob();
          setResults([{ url: URL.createObjectURL(blob), name: 'converted_document.docx' }]);
        } else if (activeTool === 'ppt') {
          const res = await safeFetch('/api/pdf/ppt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: textResult })
          });
          const blob = await res.blob();
          setResults([{ url: URL.createObjectURL(blob), name: 'converted_presentation.pptx' }]);
        } else if (activeTool === 'summarize') {
          let systemInstruction = "You are a professional document analyst.";
          let userPrompt = `Please summarize the following document text.\n\nText:\n${textResult.substring(0, 30000)}`;

          if (summaryStyle === 'concise') {
            systemInstruction = "You are an expert at creating ultra-short, punchy TL;DR summaries.";
            userPrompt = `Provide a 2-3 sentence TL;DR of this document. Focus only on the most critical information.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else if (summaryStyle === 'detailed') {
            systemInstruction = "You are a thorough academic researcher and analyst.";
            userPrompt = `Provide a comprehensive and detailed analysis of this document. Include sections for Purpose, Core Arguments, Supporting Data, and Nuanced Conclusions.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else if (summaryStyle === 'executive') {
            systemInstruction = "You are a high-level corporate strategist.";
            userPrompt = `Provide an Executive Briefing of this document. Structure it with: \n1. Strategic Overview\n2. Key Business Implications\n3. Critical Action Items\n4. Risk Assessment.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else {
            userPrompt = `Summarize this text into a well-structured format with bullet points for key takeaways.\n\nText:\n${textResult.substring(0, 30000)}`;
          }

          const summaryResponse = await genAI.models.generateContent({
            model: "gemini-3-flash-preview",
            config: {
              systemInstruction: systemInstruction
            },
            contents: userPrompt
          });
          setAiResponse(summaryResponse.text);

          try {
            const renameResponse = await genAI.models.generateContent({
              model: "gemini-3-flash-preview",
              contents: `Look at this summary and suggest a professional, descriptive filename (under 5 words, lowercase, underscores, ending in .pdf) that perfectly describes the content. Do not include quotes or conversational text: ${summaryResponse.text.substring(0, 500)}`
            });
            const suggestedName = renameResponse.text.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '_').toLowerCase();
            const finalName = suggestedName.endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`;
            
            setResults([
              { url: URL.createObjectURL(files[0]), name: finalName },
              { url: URL.createObjectURL(new Blob([summaryResponse.text], { type: 'text/plain' })), name: finalName.replace('.pdf', '_summary.txt') }
            ]);
          } catch (e) {
            setResults([{ url: URL.createObjectURL(files[0]), name: "document.pdf" }]);
          }
        } else if (activeTool === 'chat') {
          setAiResponse(`I have analyzed "${files[0].name}". You can now ask me questions about its content below.`);
        }
      } else if (activeTool === 'image-to-pdf') {
        const formData = new FormData();
        files.forEach(f => formData.append('images', f));
        const res = await safeFetch('/api/pdf/image-to-pdf', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: 'images_to_pdf.pdf' }]);
      } else if (activeTool === 'pdf-to-jpg') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        const res = await safeFetch('/api/pdf/pdf-to-jpg', { method: 'POST', body: formData });
        const zipBlob = await res.blob();
        const jszip = new JSZip();
        const zip = await jszip.loadAsync(zipBlob);
        const extracted: { url: string; name: string }[] = [];
        
        for (const filename of Object.keys(zip.files)) {
          const file = zip.files[filename];
          const blob = await file.async('blob');
          extracted.push({ url: URL.createObjectURL(blob), name: filename });
        }
        setResults(extracted);
      } else if (activeTool === 'rotate') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('degrees', rotationAngle);
        const res = await safeFetch('/api/pdf/rotate', { method: 'POST', body: formData });
        const pdfBlob = await res.blob();
        setResults([{ url: URL.createObjectURL(pdfBlob), name: `rotated_${files[0].name}` }]);
      } else if (activeTool === 'annotate') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('annotations', JSON.stringify(annotations));
        const res = await safeFetch('/api/pdf/annotate', { method: 'POST', body: formData });
        const pdfBlob = await res.blob();
        setResults([{ url: URL.createObjectURL(pdfBlob), name: `annotated_${files[0].name}` }]);
      } else if (activeTool === 'compress') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('level', compressionLevel);
        const res = await safeFetch('/api/pdf/compress', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `compressed_${files[0].name}` }]);
      }
    } catch (err: any) {
      console.error('Processing error:', err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadAll = async () => {
    if (results.length === 0) return;
    if (results.length === 1) {
      const link = document.createElement('a');
      link.href = results[0].url;
      link.download = results[0].name;
      link.click();
      return;
    }

    const zip = new JSZip();
    for (const res of results) {
      const blob = await fetch(res.url).then(r => r.blob());
      zip.file(res.name, blob);
    }
    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = 'smartpdf_results.zip';
    link.click();
  };

  const handleChat = async () => {
    if (!chatInput || !extractedText) return;
    setIsProcessing(true);
    setError(null);
    try {
      const aiResponse = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Based on the following document content, please answer the user's question.\n\nDocument Content:\n${extractedText.substring(0, 30000)}\n\nUser Question: ${chatInput}`
      });
      setAiResponse(aiResponse.text);
    } catch (err: any) {
      setError('AI failed to respond. The document might be too large or the query too complex.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 font-sans flex flex-col">
      {/* Navigation */}
      <nav className="h-16 px-8 bg-white border-b border-slate-200 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={resetTool}>
            <div className="w-8 h-8 relative shrink-0">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
                <path d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z" className="fill-red-600"/>
                <path d="M14 2V8H20L14 2Z" className="fill-red-700/50"/>
                <path d="M7 13H17M7 15.5H17M7 10.5H11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                <text x="5.5" y="20" fill="white" fontSize="4.5" fontWeight="900" fontFamily="sans-serif">PDF</text>
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight">Smart PDF<span className="text-red-600">.ai</span></span>
          </div>
          
          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-500 uppercase tracking-wider">
            <a href="#" className="hover:text-indigo-600 transition-colors">All Tools</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Convert</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">AI Features</a>
            <a href="#" className="hover:text-indigo-600 transition-colors">Pricing</a>
          </div>

          <div className="hidden md:flex ml-8 items-center bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200 focus-within:border-indigo-400 focus-within:bg-white transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[10px] font-bold px-2 w-48 placeholder:text-slate-300 uppercase tracking-wider" 
              placeholder="Search tools..." 
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="ml-1 text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>


      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!activeTool ? (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-8"
            >
              {/* Hero Section */}
              <header className="pt-10 pb-12 text-center">
                <motion.h1 
                  className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                >
                  Every tool you need to work with PDFs <br className="hidden md:block" /> in one place
                </motion.h1>
                <p className="text-lg text-slate-500 max-w-2xl mx-auto font-medium">
                  AI-powered document processing. Fast, secure, and accurate conversion at your fingertips.
                </p>
              </header>

              {/* Tools Grid by Categories */}
              <div className="space-y-16 pb-20">
                {sortedCategories.length > 0 ? (
                  sortedCategories.map((category) => (
                    <div key={category} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] whitespace-nowrap">
                          {category === 'Convert' ? 'Conversion Tools' : 
                           category === 'AI' ? 'AI Features' : 
                           category === 'Basic' ? 'Standard PDF Tools' : 
                           category}
                        </h2>
                        <div className="h-px bg-slate-200 w-full"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {toolsByCategory[category].map((tool) => (
                          <motion.div
                            key={tool.id}
                            whileHover={{ y: -2 }}
                            className={`bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all flex flex-col items-center text-center cursor-pointer group ${tool.category === 'AI' ? 'border-dashed border-indigo-200 bg-indigo-50/10' : ''}`}
                            onClick={() => setActiveTool(tool.id)}
                          >
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                              tool.id === 'summarize' || tool.id === 'chat' ? 'bg-indigo-100 text-indigo-600' : 
                              tool.id === 'merge' ? 'bg-red-50 text-red-600' :
                              tool.id === 'split' ? 'bg-blue-50 text-blue-600' :
                              tool.id === 'word' ? 'bg-blue-50 text-blue-700' :
                              tool.id === 'ppt' ? 'bg-red-50 text-red-600' :
                              tool.id === 'pdf-to-text' ? 'bg-zinc-100 text-zinc-600' :
                              tool.id === 'rotate' ? 'bg-purple-50 text-purple-600' :
                              tool.id === 'annotate' ? 'bg-indigo-50 text-indigo-600' :
                              tool.id === 'pdf-to-jpg' ? 'bg-orange-50 text-orange-600' :
                              tool.id === 'compress' ? 'bg-yellow-50 text-yellow-600' :
                              'bg-slate-50 text-slate-600'
                            }`}>
                              <tool.icon className="w-6 h-6" />
                            </div>
                            <h3 className={`font-bold mb-1 ${tool.category === 'AI' ? 'text-indigo-700' : 'text-slate-900'}`}>{tool.title}</h3>
                            <p className={`text-xs ${tool.category === 'AI' ? 'text-indigo-400' : 'text-slate-400'} font-medium uppercase tracking-wide`}>
                              {tool.description}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-20 text-center">
                    <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.2em]">No tools found for "{searchQuery}"</p>
                    <button 
                      onClick={() => setSearchQuery("")}
                      className="mt-4 text-indigo-600 text-xs font-bold uppercase tracking-widest hover:underline"
                    >
                      Clear search
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="tool-view"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-8 max-w-4xl mx-auto"
            >
              <button 
                onClick={resetTool}
                className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-indigo-600 mb-8 transition-colors uppercase tracking-widest"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Tools
              </button>

              <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-xl">
                <div className="flex items-center gap-6 mb-12">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white ${TOOLS.find(t => t.id === activeTool)?.color}`}>
                    {React.createElement(TOOLS.find(t => t.id === activeTool)?.icon || FileUp, { className: 'w-7 h-7' })}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-slate-900">{TOOLS.find(t => t.id === activeTool)?.title}</h2>
                    <p className="text-slate-400 text-sm font-medium">{TOOLS.find(t => t.id === activeTool)?.description}</p>
                  </div>
                </div>

                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3"
                  >
                    <X className="w-5 h-5 text-red-500 shrink-0 mt-0.5" onClick={() => setError(null)} />
                    <div>
                      <p className="text-sm font-bold text-red-700 uppercase tracking-wider mb-1">Process Failed</p>
                      <p className="text-sm text-red-600 font-medium">{error}</p>
                    </div>
                  </motion.div>
                )}

                {results.length === 0 && !aiResponse && (
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`relative border-2 border-dashed rounded-xl p-16 text-center transition-all group ${
                      isDragging 
                        ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-50/50' 
                        : 'border-slate-200 bg-slate-50/50 hover:border-indigo-400 hover:bg-slate-50'
                    }`}
                  >
                    {!files.length && (
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                        multiple={activeTool === 'merge' || activeTool === 'image-to-pdf'}
                        onChange={handleFileChange}
                        accept={activeTool === 'image-to-pdf' ? "image/*" : "application/pdf"}
                      />
                    )}
                    <div className={`w-16 h-16 bg-white border rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 shadow-sm transition-transform ${
                      isDragging ? 'border-indigo-200 scale-110' : 'border-slate-100'
                    }`}>
                      <FileUp className={`w-8 h-8 transition-colors ${
                        isDragging ? 'text-indigo-600' : 'text-slate-300 group-hover:text-indigo-500'
                      }`} />
                    </div>

                    {!files.length ? (
                      <>
                        <p className={`text-lg font-bold mb-1 transition-colors ${
                          isDragging ? 'text-indigo-700' : 'text-slate-700'
                        }`}>
                          {isDragging ? 'Drop to upload' : 'Choose files'}
                        </p>
                        <p className={`text-xs font-bold uppercase tracking-widest transition-colors ${
                          isDragging ? 'text-indigo-400' : 'text-slate-400'
                        }`}>
                          {activeTool === 'image-to-pdf' ? 'Supports JPG, PNG, WebP' : 'Or drop PDFs here'}
                        </p>
                      </>
                    ) : (
                      <div className="space-y-4 text-left max-w-lg mx-auto relative z-20">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {files.length} {files.length === 1 ? 'file' : 'files'} selected
                          </h4>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setFiles([]); }}
                            className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-widest"
                          >
                            Clear All
                          </button>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                          {files.map((file, i) => (
                            <motion.div 
                              key={`${file.name}-${i}`} 
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 relative group/item"
                            >
                              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                                <FileUp className="w-5 h-5 text-indigo-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                  <p className="text-xs font-bold text-slate-700 truncate">{file.name}</p>
                                  <p className="text-[10px] font-medium text-slate-400">{formatFileSize(file.size)}</p>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <motion.div 
                                    className="h-full bg-indigo-500" 
                                    initial={{ width: 0 }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 0.5, delay: i * 0.1 }}
                                  />
                                </div>
                              </div>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFiles(prev => prev.filter((_, index) => index !== i));
                                }}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </motion.div>
                          ))}
                        </div>

                        <div className="flex justify-center pt-2">
                           <label className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 uppercase tracking-widest cursor-pointer">
                              + Add more files
                              <input 
                                type="file" 
                                className="hidden" 
                                multiple 
                                onChange={(e) => {
                                  if (e.target.files) {
                                    setFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                  }
                                }}
                                accept={activeTool === 'image-to-pdf' ? "image/*" : "application/pdf"}
                              />
                           </label>
                        </div>
                      </div>
                    )}
                    
                    {files.length > 0 && (
                      <div className="mt-10 space-y-6 relative z-20">
                        {activeTool === 'compress' && (
                          <div className="mt-8 mb-4 max-w-sm mx-auto">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Select compression level</p>
                            <div className="flex bg-white p-1 border border-slate-200 rounded-lg">
                              {(['low' as const, 'medium' as const, 'high' as const]).map((level) => (
                                <button
                                  key={level}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCompressionLevel(level);
                                  }}
                                  className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                                    compressionLevel === level 
                                      ? 'bg-indigo-600 text-white shadow-sm' 
                                      : 'text-slate-400 hover:text-slate-600'
                                  }`}
                                >
                                  {level === 'low' ? 'Less' : level === 'medium' ? 'Standard' : 'Extreme'}
                                </button>
                              ))}
                            </div>
                            <p className="mt-4 text-[10px] text-slate-400 font-medium italic">
                              {compressionLevel === 'low' ? 'Prioritizes high quality, minimal file size reduction.' :
                               compressionLevel === 'medium' ? 'Balanced! Optimized for web and email sharing.' :
                               'Maximum size reduction. May affect visual quality slightly.'}
                            </p>
                          </div>
                        )}

                        {activeTool === 'rotate' && (
                          <div className="flex flex-col items-center gap-3">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Rotation Angle</p>
                            <div className="bg-white p-1 rounded-lg border border-slate-200 flex gap-1 shadow-sm">
                              {['90', '180', '270'].map((angle) => (
                                <button
                                  key={angle}
                                  onClick={() => setRotationAngle(angle as any)}
                                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold transition-all ${
                                    rotationAngle === angle 
                                      ? 'bg-purple-600 text-white shadow-md' 
                                      : 'text-slate-500 hover:bg-slate-50'
                                  }`}
                                >
                                  {angle}°
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {activeTool === 'annotate' && (
                          <div className="w-full max-w-sm mx-auto space-y-6">
                            <div className="flex justify-between items-center px-1">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Added Annotations ({annotations.length})</label>
                              <div className="flex gap-2">
                                <button 
                                  onClick={undo}
                                  disabled={historyIndex <= 0}
                                  className="p-1 px-3 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors uppercase tracking-tight"
                                >
                                  Undo
                                </button>
                                <button 
                                  onClick={redo}
                                  disabled={historyIndex >= history.length - 1}
                                  className="p-1 px-3 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 disabled:opacity-30 hover:bg-slate-50 transition-colors uppercase tracking-tight"
                                >
                                  Redo
                                </button>
                              </div>
                            </div>

                            <div className="space-y-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                              <div className="flex bg-white p-1 border border-slate-200 rounded-xl">
                                {(['text', 'highlight', 'square'] as const).map((type) => (
                                  <button
                                    key={type}
                                    onClick={() => setAnnotationType(type)}
                                    className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all ${
                                      annotationType === type 
                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    {type}
                                  </button>
                                ))}
                              </div>

                              <div className="flex gap-2">
                                {annotationType === 'text' ? (
                                  <>
                                    <input 
                                      type="text"
                                      value={currentText}
                                      onChange={(e) => setCurrentText(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && addAnnotation()}
                                      placeholder="Type a note..."
                                      className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm"
                                    />
                                    <button 
                                      onClick={addAnnotation}
                                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-sm"
                                    >
                                      Add
                                    </button>
                                  </>
                                ) : (
                                  <button 
                                    onClick={addAnnotation}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors shadow-lg flex items-center justify-center gap-2"
                                  >
                                    <Sparkles className="w-4 h-4" />
                                    Add New {annotationType === 'highlight' ? 'Highlight' : 'Square'}
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-400 px-1 text-center font-medium italic">
                                {annotationType === 'text' ? 'Notes are placed at the top-left area.' : 
                                 annotationType === 'highlight' ? 'Places a semi-transparent yellow highlight.' :
                                 'Places a red border square for marking sections.'}
                              </p>
                            </div>

                            {annotations.length > 0 && (
                              <div className="max-h-40 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                {[...annotations].reverse().map((a, idx) => (
                                  <div key={idx} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center group hover:border-indigo-200 transition-all shadow-sm">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase shrink-0 ${
                                        a.type === 'text' ? 'bg-blue-50 text-blue-600' :
                                        a.type === 'highlight' ? 'bg-yellow-50 text-yellow-600' :
                                        'bg-red-50 text-red-600'
                                      }`}>
                                        {a.type[0]}
                                      </div>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-700 truncate">
                                          {a.type === 'text' ? a.text : `${a.type.charAt(0).toUpperCase() + a.type.slice(1)} Annotation`}
                                        </p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pos: {Math.round(a.x)}, {Math.round(a.y)}</p>
                                      </div>
                                    </div>
                                    <button 
                                      onClick={() => {
                                        const newAnns = annotations.filter((_, i) => i !== (annotations.length - 1 - idx));
                                        pushToHistory(newAnns);
                                      }}
                                      className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {(activeTool === 'pdf-to-text' || activeTool === 'word' || activeTool === 'ppt' || activeTool === 'summarize') && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-slate-50/50 rounded-2xl border border-slate-200/50 space-y-6">
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">AI OCR Advanced Settings</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Primary Language</label>
                                        <select 
                                            value={ocrLanguage}
                                            onChange={(e) => setOcrLanguage(e.target.value)}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm font-medium"
                                        >
                                            <option value="auto">Auto-detect</option>
                                            <option value="English">English</option>
                                            <option value="Spanish">Spanish</option>
                                            <option value="French">French</option>
                                            <option value="German">German</option>
                                            <option value="Chinese">Chinese</option>
                                            <option value="Japanese">Japanese</option>
                                            <option value="Multilingual">Multilingual/Mixed</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Extraction Hint</label>
                                        <select 
                                            value={ocrHint}
                                            onChange={(e) => setOcrHint(e.target.value)}
                                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none transition-all shadow-sm font-medium"
                                        >
                                            <option value="">Default Accuracy</option>
                                            <option value="Preserve original document layout strictly.">Preserve Layout</option>
                                            <option value="Ignore headers and footers, focus on body text.">Ignore Headers/Footers</option>
                                            <option value="Focus on extracting data from tables correctly.">Table Priority</option>
                                            <option value="This is a handwritten document.">Handwriting Mode</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {activeTool === 'summarize' && (
                              <div className="pt-2 border-t border-slate-200/50">
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block mb-3">Summary Depth & Style</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {(['balanced', 'concise', 'detailed', 'executive'] as const).map((style) => (
                                    <button
                                      key={style}
                                      onClick={() => setSummaryStyle(style)}
                                      className={`px-2 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${
                                        summaryStyle === style 
                                          ? 'bg-indigo-600 text-white shadow-md' 
                                          : 'bg-white text-slate-500 border border-slate-200 hover:border-indigo-300'
                                      }`}
                                    >
                                      {style}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <button 
                          onClick={processPDF}
                          disabled={isProcessing}
                          className="px-10 py-4 bg-indigo-600 text-white rounded-xl font-bold text-base shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center gap-3 mx-auto disabled:opacity-50"
                        >
                          {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                          {isProcessing ? 'Processing...' : (
                            activeTool === 'summarize' ? 'Summarize & Rename' : 
                            activeTool === 'chat' ? 'Analyze Document' : 
                            activeTool === 'compress' ? 'Compress PDF' :
                            activeTool === 'merge' ? 'Merge PDFs' :
                            activeTool === 'rotate' ? 'Rotate PDF' :
                            activeTool === 'annotate' ? 'Add Annotation' :
                            'Convert'
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {(results.length > 0 || aiResponse) && (
                  <div className="space-y-6">
                    {results.length > 0 && (
                      <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-xl">
                        <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                              <Sparkles className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-slate-900">Success! {results.length} {results.length === 1 ? 'File' : 'Files'} Ready</h3>
                              <p className="text-emerald-700/80 text-[10px] font-bold uppercase tracking-widest">Documents processed successfully</p>
                            </div>
                          </div>
                          {results.length > 1 && (
                            <button 
                              onClick={handleDownloadAll}
                              className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold text-[10px] uppercase tracking-widest hover:bg-indigo-700 shadow-sm transition-all flex items-center gap-2"
                            >
                              <Download className="w-3 h-3" />
                              Download All
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                          {results.filter(r => r.url).map((res, i) => (
                            <div key={i} className="bg-white p-4 rounded-lg border border-emerald-100 flex items-center justify-between group relative overflow-hidden">
                              {activeTool === 'summarize' && i === 0 && (
                                <div className="absolute top-0 right-0 px-2 py-0.5 bg-indigo-500 text-white text-[8px] font-bold uppercase tracking-tighter">AI Rename</div>
                              )}
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div className="w-8 h-8 bg-slate-50 rounded flex items-center justify-center shrink-0">
                                  <FileUp className="w-4 h-4 text-slate-400" />
                                </div>
                                <span className="text-xs font-bold text-slate-700 truncate">{res.name}</span>
                              </div>
                              <a 
                                href={res.url} 
                                download={res.name}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                                title="Download File"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            </div>
                          ))}
                        </div>

                        {results.length === 1 && results[0].url && (
                          <div className="text-center mt-6">
                            <a 
                              href={results[0].url} 
                              download={results[0].name}
                              className="inline-flex items-center gap-2 px-10 py-3 bg-indigo-600 text-white rounded-lg font-bold text-sm shadow-md hover:bg-indigo-700 transition-all"
                            >
                              <Download className="w-4 h-4" />
                              Download {results[0].name.split('.').pop()?.toUpperCase()}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {aiResponse && (
                      <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl">
                        <h3 className="flex items-center gap-2 text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mb-6">
                          <BrainCircuit className="w-4 h-4 text-indigo-500" />
                          AI Analysis Results
                        </h3>
                        <div className="prose prose-slate max-w-none text-slate-600 text-sm leading-relaxed font-medium">
                          {aiResponse.split('\n').map((line, i) => (
                            <p key={i}>{line}</p>
                          ))}
                        </div>

                        {activeTool === 'chat' && (
                          <div className={`mt-8 pt-8 border-t border-slate-200 transition-all ${isChatDragging ? 'bg-indigo-50 -mx-4 px-4 rounded-xl' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsChatDragging(true); }}
                            onDragLeave={() => setIsChatDragging(false)}
                            onDrop={handleChatDrop}
                          >
                            <div className="flex gap-2 relative">
                              {isChatDragging && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-600/10 rounded-lg border-2 border-dashed border-indigo-400">
                                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-white px-3 py-1 rounded-full shadow-sm">
                                    Drop PDF to replace document
                                  </p>
                                </div>
                              )}
                              <input 
                                className="flex-1 bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm outline-none focus:border-indigo-400 transition-all placeholder:text-slate-300 font-medium"
                                placeholder="Ask a follow-up question or drop a new PDF..."
                                value={chatInput}
                                onChange={(e) => setChatInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                              />
                              <button 
                                onClick={handleChat}
                                disabled={isProcessing}
                                className="px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
                              >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Info Bar */}
      <footer className="bg-white border-t border-slate-200 py-8 px-8 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">
          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            <span>Trusted by 2M+ Teams</span>
            <span>ISO 27001 Certified</span>
            <span>GDPR Compliant</span>
          </div>
          <div className="flex items-center gap-2 text-slate-600 hover:text-indigo-600 cursor-pointer transition-colors group">
            <span>View all 24 tools</span>
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </footer>
    </div>
  );
}
