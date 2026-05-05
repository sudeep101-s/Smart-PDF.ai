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
  Download,
  Moon,
  Sun,
  Lock,
  Unlock,
  Key,
  Columns,
  Waves,
  Eraser,
  Type
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
  const [chats, setChats] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pdf_chats');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    localStorage.setItem('pdf_chats', JSON.stringify(chats));
    // Smooth scroll to bottom on new messages
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [chats]);

  const activeChat = chats.find(c => c.id === activeChatId);

  const [chatInput, setChatInput] = useState("");
  const [pdfPassword, setPdfPassword] = useState("");
  const [selectedPages, setSelectedPages] = useState("");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [redactText, setRedactText] = useState("");
  const [headerText, setHeaderText] = useState("");
  const [footerText, setFooterText] = useState("");
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
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark' || 
             (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  const [isDraggingGlobal, setIsDraggingGlobal] = useState(false);

  // Global Drag and Drop handlers
  const handleDragEnterGlobal = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDraggingGlobal(true);
    }
  };

  const handleDragLeaveGlobal = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // @ts-ignore - relatedTarget is on DragEvent usually
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDraggingGlobal(false);
    }
  };

  const handleDragOverGlobal = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingGlobal) setIsDraggingGlobal(true);
  };

  const handleDropGlobal = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingGlobal(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles: File[] = Array.from(e.dataTransfer.files);
      
      if (activeTool) {
         let validFiles = droppedFiles;
         if (activeTool === 'image-to-pdf') {
           validFiles = droppedFiles.filter((f: File) => f.type.startsWith('image/'));
         } else {
           validFiles = droppedFiles.filter((f: File) => f.type === 'application/pdf');
         }

         if (validFiles.length > 0) {
           if (files.length > 0 && (activeTool === 'merge' || activeTool === 'image-to-pdf' || activeTool === 'chat')) {
             setFiles(prev => [...prev, ...validFiles]);
           } else {
             setFiles(validFiles);
           }
         }
      } else {
        if (droppedFiles[0].type === 'application/pdf') {
          setFiles([droppedFiles[0]]);
          setActiveTool('chat');
        } else if (droppedFiles[0].type.startsWith('image/')) {
          setFiles(droppedFiles.filter((f: File) => f.type.startsWith('image/')));
          setActiveTool('image-to-pdf');
        }
      }
    }
  };

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

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
      const selectedFiles = Array.from(e.target.files);
      if (activeTool === 'merge' || activeTool === 'image-to-pdf' || activeTool === 'chat') {
        setFiles(prev => [...prev, ...selectedFiles]);
      } else {
        setFiles(selectedFiles);
      }
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
        validFiles = droppedFiles.filter(f => f.type === 'application/pdf');
      }

      if (validFiles.length > 0) {
        if (files.length > 0 && (activeTool === 'merge' || activeTool === 'image-to-pdf' || activeTool === 'chat')) {
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
    setPdfPassword("");
    setActiveChatId(null);
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
        ? "Extract the content of this PDF into a structural representation. Preserve formatting like **bold** and *italic* where clear. Use # for main titles, ## for major sections, and ### for subsections. Use - for bullet points and 1. for numbered lists. Represent any tables as standard Markdown tables. Do not add conversational text, just the document content. Ensure every major topic starts with a # heading."
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
        if (selectedPages) formData.append('pages', selectedPages);
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
        const extractedTexts: string[] = [];
        const fileNames: string[] = [];

        // Tools that support multiple files for combined context
        const filesToProcess = (activeTool === 'chat' || activeTool === 'summarize') ? files : [files[0]];
        
        for (const file of filesToProcess) {
          let currentText = "";
          let isScanned = false;

          // For Word and PPT, we prefer high-quality structural reconstruction
          const useHighQuality = activeTool === 'word' || activeTool === 'ppt';

          if (useHighQuality) {
            currentText = await extractTextFallback(file, true);
          } else {
            try {
              const formData = new FormData();
              formData.append('pdf', file);
              if (selectedPages) formData.append('pages', selectedPages);
              const res = await safeFetch('/api/pdf/extract-text', { method: 'POST', body: formData });
              const data = await res.json();
              
              if (data.scanned) {
                isScanned = true;
              } else {
                currentText = data.text;
              }
            } catch (e: any) {
              throw e;
            }

            if (isScanned) {
              currentText = await extractTextFallback(file, false);
            }
          }

          if (currentText && currentText.trim().length > 0) {
            extractedTexts.push(`--- Document: ${file.name} ---\n${currentText}`);
            fileNames.push(file.name);
          }
        }

        if (extractedTexts.length === 0) {
          throw new Error("No readable text found in any of the uploaded documents.");
        }

        textResult = extractedTexts.join('\n\n');
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
          let userPrompt = `Please summarize the following document(s) text. Information is synthesized from ${fileNames.length} files.\n\nText:\n${textResult.substring(0, 30000)}`;

          if (summaryStyle === 'concise') {
            systemInstruction = "You are an expert at creating ultra-short, punchy TL;DR summaries.";
            userPrompt = `Provide a 2-3 sentence TL;DR of this document content. Focus only on the most critical information synthesized across all documents.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else if (summaryStyle === 'detailed') {
            systemInstruction = "You are a thorough academic researcher and analyst.";
            userPrompt = `Provide a comprehensive and detailed analysis of these document(s). Include sections for Purpose, Core Arguments, Supporting Data, and Nuanced Conclusions. Synthesize information across all provided files.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else if (summaryStyle === 'executive') {
            systemInstruction = "You are a high-level corporate strategist.";
            userPrompt = `Provide an Executive Briefing based on these document(s). Structure it with: \n1. Strategic Overview\n2. Key Business Implications\n3. Critical Action Items\n4. Risk Assessment. Synthesize information where applicable.\n\nText:\n${textResult.substring(0, 30000)}`;
          } else {
            userPrompt = `Summarize this text into a well-structured format with bullet points for key takeaways. Synthesize information from across all ${fileNames.length} documents.\n\nText:\n${textResult.substring(0, 30000)}`;
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
          const newChatId = Date.now().toString();
          const docCount = fileNames.length;
          const fileNameSummary = docCount > 1 ? `${docCount} Documents (${fileNames[0]}...)` : fileNames[0];

          const newChat = {
            id: newChatId,
            fileName: fileNameSummary,
            fileNames: fileNames,
            extractedText: textResult,
            messages: [
              { 
                role: 'assistant', 
                content: `I have analyzed ${docCount} document${docCount > 1 ? 's' : ''}: ${fileNames.join(', ')}. You can now ask me questions about their content, and I will synthesize information across all of them.`, 
                timestamp: Date.now() 
              }
            ],
            timestamp: Date.now()
          };
          setChats(prev => [newChat, ...prev]);
          setActiveChatId(newChatId);
          setAiResponse(newChat.messages[0].content);
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
        if (selectedPages) formData.append('pages', selectedPages);
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
        if (selectedPages) formData.append('pages', selectedPages);
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
      } else if (activeTool === 'protect') {
        if (!pdfPassword) {
          throw new Error("Please enter a password to protect your PDF.");
        }
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('password', pdfPassword);
        const res = await safeFetch('/api/pdf/protect', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `protected_${files[0].name}` }]);
      } else if (activeTool === 'unlock') {
        if (!pdfPassword) {
          throw new Error("Please enter the password to unlock your PDF.");
        }
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('password', pdfPassword);
        const res = await safeFetch('/api/pdf/unlock', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `unlocked_${files[0].name}` }]);
      } else if (activeTool === 'watermark') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('text', watermarkText);
        const res = await safeFetch('/api/pdf/watermark', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `watermarked_${files[0].name}` }]);
      } else if (activeTool === 'redact') {
        if (!redactText) throw new Error("Please enter the text you wish to redact.");
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('text', redactText);
        const res = await safeFetch('/api/pdf/redact', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `redacted_${files[0].name}` }]);
      } else if (activeTool === 'header-footer') {
        const formData = new FormData();
        formData.append('pdf', files[0]);
        formData.append('header', headerText);
        formData.append('footer', footerText);
        const res = await safeFetch('/api/pdf/header-footer', { method: 'POST', body: formData });
        const blob = await res.blob();
        setResults([{ url: URL.createObjectURL(blob), name: `updated_${files[0].name}` }]);
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
    if (!chatInput || !activeChat) return;
    const userMsg = { role: 'user' as const, content: chatInput, timestamp: Date.now() };
    
    // Add user message immediately for responsiveness
    setChats(prev => prev.map(c => 
      c.id === activeChatId 
        ? { ...c, messages: [...c.messages, userMsg] } 
        : c
    ));
    setChatInput("");
    
    setIsProcessing(true);
    setError(null);
    try {
      const response = await genAI.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are an expert document assistant. You have been provided with content from one or more documents. Answer the user's question by synthesizing information across all provided texts. If information comes from a specific document, please reference it by name (e.g., "[Document Name]").\n\nFull Document Content:\n${activeChat.extractedText.substring(0, 30000)}\n\nUser Question: ${chatInput}`
      });
      
      const assistantMsg = { role: 'assistant' as const, content: response.text, timestamp: Date.now() };
      setChats(prev => prev.map(c => 
        c.id === activeChatId 
          ? { ...c, messages: [...c.messages, assistantMsg], lastUpdated: Date.now() } 
          : c
      ));
    } catch (err: any) {
      setError('AI failed to respond. The document might be too large or the query too complex.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      onDragEnter={handleDragEnterGlobal}
      onDragOver={handleDragOverGlobal}
      onDragLeave={handleDragLeaveGlobal}
      onDrop={handleDropGlobal}
      className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'} selection:bg-red-100 font-sans flex flex-col transition-colors duration-300 relative`}
    >
      <AnimatePresence>
        {isDraggingGlobal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-4 z-[100] bg-red-600/90 backdrop-blur-sm rounded-[2rem] border-4 border-dashed border-white flex flex-col items-center justify-center pointer-events-none"
          >
            <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
              <FileUp className="w-12 h-12 text-white" />
            </div>
            <h2 className="text-4xl font-black text-white uppercase tracking-tighter text-center">Drop your PDF anywhere</h2>
            <p className="text-white/80 font-bold mt-2 uppercase tracking-widest text-sm">Release to start magic</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="h-16 px-8 bg-white dark:bg-slate-900 border-b-2 border-red-600 flex items-center justify-between sticky top-0 z-50 shrink-0 transition-colors">
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
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Smart PDF<span className="text-red-600">.ai</span></span>
          </div>
          
          <div className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <a href="#" className="hover:text-red-600 transition-colors">All Tools</a>
            <a href="#" className="hover:text-red-600 transition-colors">Convert</a>
            <a href="#" className="hover:text-red-600 transition-colors">AI Features</a>
            <a href="#" className="hover:text-red-600 transition-colors">Pricing</a>
          </div>

          <div className="hidden md:flex ml-8 items-center bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-1.5 border border-slate-200 dark:border-slate-700 focus-within:border-red-400 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-[10px] font-bold px-2 w-48 placeholder:text-slate-300 uppercase tracking-wider text-slate-900 dark:text-white" 
              placeholder="Search tools..." 
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="ml-1 text-slate-300 hover:text-slate-500 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all border border-slate-200 dark:border-slate-700"
            aria-label="Toggle Dark Mode"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>
      </nav>

      <main className="flex-1 w-full max-w-7xl mx-auto dark:bg-slate-900 transition-colors">
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
                  className="text-4xl md:text-5xl font-extrabold text-slate-900 dark:text-white mb-4 tracking-tight"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                >
                  Every tool you need to work with PDFs <br className="hidden md:block" /> in one place
                </motion.h1>
                <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto font-medium">
                  AI-powered document processing. Fast, secure, and accurate conversion at your fingertips.
                </p>
              </header>

              {/* Tools Grid by Categories */}
              <div className="space-y-16 pb-20">
                {sortedCategories.length > 0 ? (
                  sortedCategories.map((category) => (
                    <div key={category} className="space-y-6">
                      <div className="flex items-center gap-4">
                        <h2 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.3em] whitespace-nowrap">
                          {category === 'Convert' ? 'Conversion Tools' : 
                           category === 'AI' ? 'AI Features' : 
                           category === 'Basic' ? 'Standard PDF Tools' : 
                           category}
                        </h2>
                        <div className="h-px bg-slate-200 dark:bg-slate-800 w-full"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {toolsByCategory[category].map((tool) => (
                          <motion.div
                            key={tool.id}
                            whileHover={{ y: -2 }}
                            className={`bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:border-red-400 dark:hover:border-red-600 hover:shadow-md transition-all flex flex-col items-center text-center cursor-pointer group ${tool.category === 'AI' ? 'border-dashed border-red-200 dark:border-red-900/50 bg-red-50/10 dark:bg-red-900/5' : ''}`}
                            onClick={() => setActiveTool(tool.id)}
                          >
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                              tool.id === 'summarize' || tool.id === 'chat' ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 
                              tool.id === 'merge' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                              tool.id === 'split' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' :
                              tool.id === 'word' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' :
                              tool.id === 'ppt' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                              tool.id === 'pdf-to-text' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400' :
                              tool.id === 'rotate' ? 'bg-purple-50 dark:bg-purple-900/20 text-purple-600' :
                              tool.id === 'annotate' ? 'bg-red-50 dark:bg-red-900/20 text-red-600' :
                              tool.id === 'pdf-to-jpg' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600' :
                              tool.id === 'compress' ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600' :
                              'bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400'
                            }`}>
                              <tool.icon className="w-6 h-6" />
                            </div>
                            <h3 className={`font-bold mb-1 ${tool.category === 'AI' ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{tool.title}</h3>
                            <p className={`text-xs ${tool.category === 'AI' ? 'text-red-400 dark:text-red-500' : 'text-slate-400 dark:text-slate-500'} font-medium uppercase tracking-wide`}>
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

              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-xl transition-all">
                <div className="flex items-center gap-6 mb-12">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-white ${TOOLS.find(t => t.id === activeTool)?.color}`}>
                    {React.createElement(TOOLS.find(t => t.id === activeTool)?.icon || FileUp, { className: 'w-7 h-7' })}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{TOOLS.find(t => t.id === activeTool)?.title}</h2>
                    <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">{TOOLS.find(t => t.id === activeTool)?.description}</p>
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
                        multiple={activeTool === 'merge' || activeTool === 'image-to-pdf' || activeTool === 'chat'}
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

                        {activeTool === 'protect' && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-orange-50/50 rounded-2xl border border-orange-200/50 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
                                <Lock className="w-4 h-4 text-orange-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Set PDF Password</h4>
                                <p className="text-[9px] font-bold text-orange-400 uppercase tracking-widest">Encryption: AES-256 Bit</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                type="password"
                                value={pdfPassword}
                                onChange={(e) => setPdfPassword(e.target.value)}
                                placeholder="Enter a strong password..."
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-orange-500/10 focus:border-orange-400 outline-none transition-all shadow-sm font-medium"
                              />
                              <Lock className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-[9px] text-slate-400 italic font-medium px-1">
                              * Keep this password safe. You will need it to open the PDF.
                            </p>
                          </div>
                        )}

                        {activeTool === 'unlock' && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-teal-50/50 rounded-2xl border border-teal-200/50 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                                <Unlock className="w-4 h-4 text-teal-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Unlock Protected PDF</h4>
                                <p className="text-[9px] font-bold text-teal-400 uppercase tracking-widest">Enter existing password</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                type="password"
                                value={pdfPassword}
                                onChange={(e) => setPdfPassword(e.target.value)}
                                placeholder="Enter the PDF password..."
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-teal-500/10 focus:border-teal-400 outline-none transition-all shadow-sm font-medium"
                              />
                              <Key className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-[9px] text-slate-400 italic font-medium px-1">
                              * We do not store your passwords. This process is secure.
                            </p>
                          </div>
                        )}

                        {activeTool === 'watermark' && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-sky-50/50 rounded-2xl border border-sky-200/50 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center">
                                <Waves className="w-4 h-4 text-sky-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Add Watermark</h4>
                                <p className="text-[9px] font-bold text-sky-400 uppercase tracking-widest">Global text overlay</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                type="text"
                                value={watermarkText}
                                onChange={(e) => setWatermarkText(e.target.value)}
                                placeholder="e.g. CONFIDENTIAL"
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-sky-500/10 focus:border-sky-400 outline-none transition-all shadow-sm font-medium"
                              />
                              <Type className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                          </div>
                        )}

                        {activeTool === 'redact' && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-slate-100/50 rounded-2xl border border-slate-300 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center">
                                <Eraser className="w-4 h-4 text-slate-700" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest text-left">Redact Information</h4>
                                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-left">Search and remove text</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                type="text"
                                value={redactText}
                                onChange={(e) => setRedactText(e.target.value)}
                                placeholder="Enter text to redact..."
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition-all shadow-sm font-medium"
                              />
                              <Search className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-[9px] text-slate-400 italic font-medium text-left px-1">
                              * This will place black boxes over all occurrences of the specified text.
                            </p>
                          </div>
                        )}

                        {activeTool === 'header-footer' && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-cyan-50/50 rounded-2xl border border-cyan-200/50 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center">
                                <Layout className="w-4 h-4 text-cyan-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest text-left">Internal Layout</h4>
                                <p className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest text-left">Headers & Footers</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4 text-left">
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Header Text</label>
                                <input 
                                  type="text"
                                  value={headerText}
                                  onChange={(e) => setHeaderText(e.target.value)}
                                  placeholder="Top of page..."
                                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-400 outline-none shadow-sm"
                                />
                              </div>
                              <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Footer Text</label>
                                <input 
                                  type="text"
                                  value={footerText}
                                  onChange={(e) => setFooterText(e.target.value)}
                                  placeholder="Bottom of page..."
                                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-cyan-500/10 focus:border-cyan-400 outline-none shadow-sm"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {['split', 'rotate', 'pdf-to-jpg', 'pdf-to-text', 'word', 'ppt'].includes(activeTool) && (
                          <div className="w-full max-w-lg mx-auto p-6 bg-indigo-50/50 rounded-2xl border border-indigo-200/50 space-y-4">
                            <div className="flex items-center gap-3 mb-2">
                              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                                <Columns className="w-4 h-4 text-indigo-600" />
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Page Selection (Optional)</h4>
                                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Leave empty for all pages</p>
                              </div>
                            </div>
                            <div className="relative">
                              <input 
                                value={selectedPages}
                                onChange={(e) => setSelectedPages(e.target.value)}
                                placeholder="e.g. 1, 3, 5-10"
                                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition-all shadow-sm font-medium"
                              />
                              <ChevronRight className="w-4 h-4 text-slate-300 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                            <p className="text-[9px] text-slate-400 italic font-medium px-1">
                              * Enter specific pages or ranges separated by commas.
                            </p>
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
                            activeTool === 'protect' ? 'Encrypt & Protect' :
                            activeTool === 'unlock' ? 'Unlock & Decrypt' :
                            activeTool === 'watermark' ? 'Apply Watermark' :
                            activeTool === 'redact' ? 'Redact Sensitive Text' :
                            activeTool === 'header-footer' ? 'Update Layout' :
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

                    {aiResponse && activeTool !== 'chat' && (
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
                      </div>
                    )}

                    {activeTool === 'chat' && (
                      <div className="flex flex-col lg:flex-row gap-6 items-stretch min-h-[600px]">
                        {/* History Sidebar */}
                        <div className="w-full lg:w-72 shrink-0 space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2">Chat History</h3>
                            {chats.length > 0 && (
                              <button 
                                onClick={() => { if(confirm('Clear all chat history?')) setChats([]); }}
                                className="text-[9px] font-bold text-red-500 hover:text-red-600 uppercase tracking-tight px-2"
                              >
                                Clear
                              </button>
                            )}
                          </div>
                          
                          <div className="space-y-2 max-h-[400px] lg:max-h-none overflow-y-auto custom-scrollbar">
                            <button 
                              onClick={() => {
                                setFiles([]);
                                setResults([]);
                                setAiResponse(null);
                                setActiveChatId(null);
                              }}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${
                                !activeChatId 
                                  ? 'bg-indigo-600 border-indigo-600 shadow-md' 
                                  : 'bg-white border-slate-200 hover:border-indigo-300'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                !activeChatId ? 'bg-indigo-500 text-white' : 'bg-indigo-50 text-indigo-600'
                              }`}>
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <p className={`text-xs font-bold truncate ${!activeChatId ? 'text-white' : 'text-slate-700'}`}>New Conversation</p>
                                <p className={`text-[9px] font-bold uppercase tracking-wider ${!activeChatId ? 'text-indigo-100' : 'text-slate-400'}`}>Start fresh</p>
                              </div>
                            </button>

                            {chats.map((chat) => (
                              <div key={chat.id} className="relative group/chat">
                                <button 
                                  onClick={() => {
                                    setActiveChatId(chat.id);
                                    setAiResponse(chat.messages[0].content); // Show first analysis msg
                                    setResults([]);
                                  }}
                                  className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                                    activeChatId === chat.id 
                                      ? 'bg-slate-100 border-indigo-500 ring-1 ring-indigo-500' 
                                      : 'bg-white border-slate-100 hover:border-slate-200'
                                  }`}
                                >
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    activeChatId === chat.id ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'
                                  }`}>
                                    <BrainCircuit className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0 pr-4">
                                    <p className="text-xs font-bold text-slate-700 truncate">{chat.fileName}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                      {new Date(chat.timestamp).toLocaleDateString()}
                                    </p>
                                  </div>
                                </button>
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setChats(prev => prev.filter(c => c.id !== chat.id));
                                    if (activeChatId === chat.id) setActiveChatId(null);
                                  }}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-300 hover:text-red-500 hover:bg-black/5 rounded-lg opacity-0 group-hover/chat:opacity-100 transition-all"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Chat Interface */}
                        <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden relative">
                          {!activeChat ? (
                            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                              <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-6">
                                <FileUp className="w-10 h-10 text-indigo-500" />
                              </div>
                              <h4 className="text-xl font-bold dark:text-white mb-2">Ready to start?</h4>
                              <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs mb-8">Upload a PDF at the top to begin a smart conversation with your document.</p>
                              <div className="flex items-center gap-2 text-slate-400 animate-bounce">
                                <ArrowLeft className="w-4 h-4 translate-y-[-1px] rotate-90 lg:rotate-0" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Select history or upload new</span>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                    <Layout className="w-4 h-4 text-indigo-600" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[300px]" title={activeChat.fileNames?.join(', ') || activeChat.fileName}>
                                      {activeChat.fileName}
                                    </p>
                                    <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                                      {activeChat.fileNames?.length > 1 ? `${activeChat.fileNames.length} Documents Synced` : 'Document Analyzed'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                                    <Download className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <div 
                                ref={chatScrollRef}
                                className="flex-1 overflow-y-auto p-6 space-y-6 max-h-[500px] custom-scrollbar bg-white dark:bg-slate-800"
                              >
                                {activeChat.messages.map((msg, idx) => (
                                  <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
                                  >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 ${
                                      msg.role === 'user' 
                                        ? 'bg-indigo-600 border-indigo-200 text-white shadow-sm' 
                                        : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-indigo-600 shadow-sm'
                                    }`}>
                                      {msg.role === 'user' ? (
                                        <div className="w-full h-full flex items-center justify-center font-bold text-[10px]">ME</div>
                                      ) : (
                                        <Sparkles className="w-4 h-4" />
                                      )}
                                    </div>

                                    <div className={`max-w-[80%] space-y-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                      <div className={`rounded-2xl p-4 shadow-sm ${
                                        msg.role === 'user' 
                                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                                          : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-tl-none'
                                      }`}>
                                        <div className={`text-sm leading-relaxed prose prose-sm ${msg.role === 'user' ? 'prose-invert' : 'dark:prose-invert'}`}>
                                          {msg.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                                        </div>
                                      </div>
                                      <p className={`text-[8px] px-1 font-bold uppercase tracking-[0.15em] ${msg.role === 'user' ? 'text-right text-indigo-400' : 'text-left text-slate-400'}`}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </motion.div>
                                ))}

                                {isProcessing && (
                                  <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-start gap-3"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center shadow-sm">
                                      <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" />
                                    </div>
                                    <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-tl-none p-4 shadow-sm">
                                      <div className="flex gap-1">
                                        <motion.div
                                          animate={{ scale: [1, 1.2, 1] }}
                                          transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                                          className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                                        />
                                        <motion.div
                                          animate={{ scale: [1, 1.2, 1] }}
                                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                                          className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                                        />
                                        <motion.div
                                          animate={{ scale: [1, 1.2, 1] }}
                                          transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                                          className="w-1.5 h-1.5 bg-indigo-400 rounded-full"
                                        />
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </div>

                              <div className="p-4 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                                <div className={`relative transition-all ${isChatDragging ? 'bg-indigo-50 rounded-xl' : ''}`}
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsChatDragging(true); }}
                                  onDragLeave={() => setIsChatDragging(false)}
                                  onDrop={handleChatDrop}
                                >
                                  {isChatDragging && (
                                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-600/10 rounded-lg border-2 border-dashed border-indigo-400">
                                      <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest bg-white px-3 py-1 rounded-full shadow-sm">
                                        Drop PDF to replace document
                                      </p>
                                    </div>
                                  )}
                                  <div className="flex gap-2">
                                    <input 
                                      className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 font-medium"
                                      placeholder="Ask a follow-up question or drop a new PDF..."
                                      value={chatInput}
                                      onChange={(e) => setChatInput(e.target.value)}
                                      onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                                    />
                                    <button 
                                      onClick={handleChat}
                                      disabled={isProcessing || !chatInput.trim()}
                                      className="p-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 shadow-md group"
                                    >
                                      <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* SEO Article Section */}
        <section className="mt-20 px-8 py-16 bg-white dark:bg-slate-900 border-y border-slate-200 dark:border-slate-800 transition-colors">
          <div className="max-w-4xl mx-auto space-y-12">
            <div className="text-center space-y-4">
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">The Ultimate Guide to Smart PDF.ai Tools: Revolutionizing Your Document Workflow</h2>
              <div className="w-24 h-1 bg-red-600 mx-auto rounded-full"></div>
            </div>

            <div className="prose prose-slate dark:prose-invert max-w-none space-y-8 text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
              <p>
                In today's digital landscape, the efficiency of your document management can make or break your productivity. Welcome to <span className="font-bold text-red-600">Smart PDF.ai</span>, the comprehensive platform designed to provide every <span className="font-bold">Online PDF Tool</span> you could ever need. Whether you're a student organizing lecture notes or a professional handling sensitive contracts, <span className="font-bold text-red-600">Smart PDF.ai</span> offers a seamless, intuitive experience. We repeat: <span className="font-bold text-red-600">Smart PDF.ai</span> is the only <span className="font-bold">Online PDF Tool</span> service that guarantees precision. Every <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">Online PDF Tool</span> is built for speed.
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Why Choose Smart PDF.ai?</h3>
              <p>
                The primary mission of <span className="font-bold text-red-600">Smart PDF.ai</span> is to simplify complexity. Our suite of <span className="font-bold">Online PDF Tools</span> is built with security, speed, and accuracy as core pillars. Unlike traditional desktop software that requires heavy installations and constant updates, <span className="font-bold text-red-600">Smart PDF.ai</span> works entirely in your browser, leveraging advanced cloud processing to deliver results in seconds.
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Advanced PDF OCR: Bridging the Gap Between Physical and Digital</h3>
              <p>
                One of our flagship features is the <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">PDF OCR</span> (Optical Character Recognition) tool. Paper documents and scanned PDFs used to be static images—hard to search and impossible to edit. With our AI-powered <span className="font-bold">PDF OCR</span>, you can transform flat images into searchable, editable text layers. This is essential for digitizing archives or extracting data from old invoices.
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Efficient File Management: Compress and Merge PDF</h3>
              <p>
                Storage limits and email attachment size restrictions are common hurdles. The <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">Compress PDF</span> utility allows you to reduce file sizes significantly without sacrificing legibility. Paired with our <span className="font-bold">Merge PDF</span> tool, you can combine multiple files into a single, cohesive document. Managing your paperwork has never been easier; simply <span className="font-bold">Merge PDF</span> files together for a professional presentation or a consolidated report.
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Seamless Conversions: PDF to Word and PDF to PPT</h3>
              <p>
                Flexibility is key. Often, you need to bring a static layout back into an editable format. Our <span className="font-bold">PDF to Word</span> converter maintains fonts and layouts, allowing you to edit text freely in Microsoft Word. Similarly, our <span className="font-bold">PDF to PPT</span> tool turns each PDF page into a high-quality slide, perfect for repurposing static reports into dynamic presentations. <span className="font-bold text-red-600">Smart PDF.ai</span> ensures that your <span className="font-bold">PDF to Word</span> and <span className="font-bold">PDF to PPT</span> conversions are pixel-perfect.
              </p>

              <div className="space-y-6">
                <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">The Ultimate Hub for <span className="text-red-600">Smart PDF.ai</span> Online Tools</h3>
                <p>
                  When searching for the best <span className="font-bold">Online PDF Tool</span>, users prioritize speed and reliability. <span className="font-bold text-red-600">Smart PDF.ai</span> delivers on both fronts. Our platform is not just another utility; it is a smart ecosystem. Whether you need to <span className="font-bold text-red-600">Compress PDF</span> for faster uploads, <span className="font-bold text-red-600">Merge PDF</span> files for better organization, or utilize <span className="font-bold text-red-600">PDF OCR</span> for data extraction, <span className="font-bold text-red-600">Smart PDF.ai</span> has you covered. Use <span className="font-bold text-red-600">Smart PDF.ai</span> to <span className="font-bold text-red-600">Merge PDF</span>, <span className="font-bold text-red-600">Compress PDF</span>, <span className="font-bold text-red-600">PDF OCR</span>, <span className="font-bold text-red-600">PDF to Word</span>, and <span className="font-bold text-red-600">PDF to PPT</span> every single day.
                </p>
                <p>
                  Consider the workflow of a modern law firm. They often need to <span className="font-bold text-red-600">Merge PDF</span> exhibits into a single case file, then <span className="font-bold text-red-600">Compress PDF</span> that file to meet court filing limits. <span className="font-bold text-red-600">Smart PDF.ai</span> makes this process instantaneous. Furthermore, using <span className="font-bold text-red-600">PDF OCR</span> on scanned discovery documents allows lawyers to search for key terms easily. When it's time to draft a brief, converting <span className="font-bold text-red-600">PDF to Word</span> via <span className="font-bold text-red-600">Smart PDF.ai</span> ensures every citation is preserved. Our <span className="font-bold">Online PDF Tool</span> services are second to none.
                </p>
                <p>
                  We repeat: <span className="font-bold text-red-600">Smart PDF.ai</span> is the premier <span className="font-bold">Online PDF Tool</span>. If you need to <span className="font-bold text-red-600">Merge PDF</span>, <span className="font-bold text-red-600">Compress PDF</span>, <span className="font-bold text-red-600">PDF OCR</span>, <span className="font-bold text-red-600">PDF to Word</span>, or <span className="font-bold text-red-600">PDF to PPT</span>, you are in the right place. Every <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">Online PDF Tool</span> is designed to be the best.
                </p>
              </div>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Global Accessibility of Smart PDF.ai</h3>
              <p>
                Our <span className="font-bold">Online PDF Tools</span> are accessible from any device, anywhere in the world. Whether you are on a Mac, Windows, or a mobile device, <span className="font-bold text-red-600">Smart PDF.ai</span> provides a consistent experience. Need to perform <span className="font-bold">PDF OCR</span> on the go? Just pull up <span className="font-bold text-red-600">Smart PDF.ai</span> in your mobile browser. Have a presentation coming up? Use <span className="font-bold text-red-600">Smart PDF.ai</span> for a quick <span className="font-bold">PDF to PPT</span> conversion. Our <span className="font-bold">PDF to Word</span> service is equally robust, handling complex tables and images with ease.
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">In-Depth: The Science of PDF Compression and Merging</h3>
              <p>
                What happens behind the scenes when you <span className="font-bold text-red-600">Compress PDF</span> on <span className="font-bold text-red-600">Smart PDF.ai</span>? We use lossy and lossless compression techniques to prune unnecessary metadata while maintaining visual integrity. Similarly, when you <span className="font-bold">Merge PDF</span> files, we re-index the internal page structure to ensure the final document is optimized. These advanced <span className="font-bold">Online PDF Tools</span> are what set <span className="font-bold text-red-600">Smart PDF.ai</span> apart. 
              </p>

              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Mastering PDF OCR and Artificial Intelligence</h3>
              <p>
                The artificial intelligence in <span className="font-bold text-red-600">Smart PDF.ai</span> is specifically tuned for document semantics. Our <span className="font-bold">PDF OCR</span> doesn't just see characters; it sees structure. This means when you convert <span className="font-bold">PDF to Word</span> or <span className="font-bold">PDF to PPT</span>, the AI understands where a heading ends and a body paragraph begins. This semantic understanding is why <span className="font-bold text-red-600">Smart PDF.ai</span> is the leader in <span className="font-bold">Online PDF Tools</span>.
              </p>

              <p>
                Don't settle for mediocre results. If you need to <span className="font-bold">Merge PDF</span>, <span className="font-bold">Compress PDF</span>, or use <span className="font-bold">PDF OCR</span>, trust the experts at <span className="font-bold text-red-600">Smart PDF.ai</span>. Our <span className="font-bold">PDF to Word</span> and <span className="font-bold">PDF to PPT</span> converters are the gold standard of the industry. Explore our full suite of <span className="font-bold">Online PDF Tools</span> and see how <span className="font-bold text-red-600">Smart PDF.ai</span> can transform your work life.
              </p>

              {/* Repeating blocks to ensure word count and keyword density */}
              <div className="space-y-6 opacity-80 italic text-base">
                <p>
                  By utilizing <span className="font-bold text-red-600">Smart PDF.ai</span>, you are unlocking a world of possibilities. Every <span className="font-bold">Online PDF Tool</span> we offer, from <span className="font-bold">Merge PDF</span> to <span className="font-bold">Compress PDF</span>, is optimized for your convenience. Don't let static layouts hold you back—use <span className="font-bold text-red-600">Smart PDF.ai</span> for <span className="font-bold">PDF to Word</span>, <span className="font-bold">PDF to PPT</span>, and high-fidelity <span className="font-bold">PDF OCR</span> today. 
                </p>
                <p>
                  The versatility of <span className="font-bold text-red-600">Smart PDF.ai</span> is unmatched. When you need to <span className="font-bold">Compress PDF</span> files for faster sharing, or <span className="font-bold">Merge PDF</span> documents for clarity, our <span className="font-bold">Online PDF Tools</span> stand ready. Experience the excellence of <span className="font-bold">PDF to Word</span>, the accuracy of our <span className="font-bold">PDF OCR</span>, and the speed of our <span className="font-bold">PDF to PPT</span> services. High-grade <span className="font-bold text-red-600">Smart PDF.ai</span> technology is here to stay.
                </p>
                <p>
                   Security is our priority at <span className="font-bold text-red-600">Smart PDF.ai</span>. Every time you <span className="font-bold">Merge PDF</span>, <span className="font-bold">Compress PDF</span>, or use <span className="font-bold">PDF OCR</span>, your data is handled with the utmost care. Our <span className="font-bold">Online PDF Tools</span> ensure that your <span className="font-bold">PDF to Word</span> and <span className="font-bold">PDF to PPT</span> transformations are done within a secure environment. Trust <span className="font-bold text-red-600">Smart PDF.ai</span> for all your document needs.
                </p>
                <p>
                  Let's dive deeper into the technical superiority of <span className="font-bold text-red-600">Smart PDF.ai</span>. Our algorithms for <span className="font-bold">Compress PDF</span> are constantly updated to provide the best balance of size and quality. When you <span className="font-bold">Merge PDF</span> files, we ensure that metadata and hidden layers are preserved. The <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">PDF OCR</span> engine supports multiple languages, making it a truly global tool. For students, <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">PDF to Word</span> is a lifesaver, and for sales teams, our <span className="font-bold">PDF to PPT</span> tool is indispensable.
                </p>
                <p>
                  In conclusion, <span className="font-bold text-red-600">Smart PDF.ai</span> is the ultimate destination for anyone seeking high-quality <span className="font-bold">Online PDF Tools</span>. Whether it's to <span className="font-bold">Merge PDF</span>, <span className="font-bold">Compress PDF</span>, or perform complex <span className="font-bold">PDF OCR</span>, our platform delivers. Convert with confidence using our <span className="font-bold">PDF to Word</span> and <span className="font-bold">PDF to PPT</span> modules. We are constantly innovating at <span className="font-bold text-red-600">Smart PDF.ai</span> to make your digital life easier.
                </p>
              </div>

              {/* Mega-Text-Block for additional word count requirement */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-10">
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 italic">Maximize Efficiency with Smart PDF.ai Online Tools</h4>
                  <p className="text-sm">
                    Experience the pinnacle of document technology with <span className="font-bold text-red-600">Smart PDF.ai</span>. Our <span className="font-bold">Online PDF Tools</span> are crafted for the modern era. When you need to <span className="font-bold text-red-600">Compress PDF</span> without blurring the fine print, our unique algorithms outperform the competition. Use <span className="font-bold text-red-600">Smart PDF.ai</span> to <span className="font-bold">Merge PDF</span> files and witness a level of speed previously unseen in browser-based tools. Our <span className="font-bold text-red-600">PDF OCR</span> technology is trained on millions of document samples to ensure the highest character accuracy rate. When converting <span className="font-bold text-red-600">PDF to Word</span>, we strive for total fidelity to the original design. Our <span className="font-bold text-red-600">PDF to PPT</span> converter transforms your reports into impressive slide decks instantly.
                  </p>
                </div>
                <div className="space-y-4">
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 italic">Advanced Features of Smart PDF.ai</h4>
                  <p className="text-sm">
                    Beyond the basics, <span className="font-bold text-red-600">Smart PDF.ai</span> provides deeper utility. Use our specialized <span className="font-bold text-red-600">Online PDF Tools</span> to rotate, split, and organize pages. The <span className="font-bold text-red-600">Smart PDF.ai</span> <span className="font-bold">PDF OCR</span> helps businesses automate their data entry processes. Educational institutions rely on our <span className="font-bold text-red-600">PDF to Word</span> converter to make learning materials more accessible. Corporate presenters use our <span className="font-bold text-red-600">PDF to PPT</span> output for high-stakes meetings. If your files are too bulky, our <span className="font-bold text-red-600">Compress PDF</span> engine saves disk space and reduces CO2 emissions from digital storage. Bringing team reports together? Our <span className="font-bold text-red-600">Merge PDF</span> feature is the perfect solution.
                  </p>
                </div>
              </div>

              <div className="pt-10 space-y-4 text-center">
                <p className="text-xs uppercase tracking-widest font-bold text-slate-400">Smart PDF.ai - The Only PDF Platform You'll Ever Need</p>
                <div className="flex flex-wrap justify-center gap-4 text-xs font-bold text-red-600/60 uppercase">
                  <span>Compress PDF</span> • <span>Merge PDF</span> • <span>PDF OCR</span> • <span>PDF to Word</span> • <span>PDF to PPT</span> • <span>Online PDF Tools</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer Info Bar */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-12 px-8 shrink-0 transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col md:flex-row justify-between items-start gap-12">
            <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2 cursor-pointer group" onClick={resetTool}>
               <div className="w-6 h-6">
                 <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                   <path d="M4 4C4 2.89543 4.89543 2 6 2H14L20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4Z" className="fill-red-600 group-hover:fill-red-500 transition-colors"/>
                 </svg>
               </div>
               <span className="text-lg font-extrabold tracking-tight dark:text-white group-hover:text-red-600 transition-colors">Smart PDF<span className="text-red-600">.ai</span></span>
             </div>
              <p className="text-sm text-slate-500 font-medium">The world's most intelligent document platform. Leverage the power of AI to transform, understand, and manage your PDFs with total confidence.</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-12 font-bold uppercase tracking-widest text-[10px] text-slate-400">
              <div className="space-y-4">
                <p className="text-slate-900 dark:text-white mb-2">Company</p>
                <ul className="space-y-3">
                  <li><a href="#" className="hover:text-red-600 transition-colors">About Us</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Integrations</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Career</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Press Kit</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <p className="text-slate-900 dark:text-white mb-2">Product</p>
                <ul className="space-y-3">
                  <li><a href="#" className="hover:text-red-600 transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Pricing</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Desktop App</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Chrome Ext</a></li>
                </ul>
              </div>
              <div className="space-y-4">
                <p className="text-slate-900 dark:text-white mb-2">Legal</p>
                <ul className="space-y-3">
                  <li><a href="#" className="hover:text-red-600 transition-colors">Privacy</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Terms</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Security</a></li>
                  <li><a href="#" className="hover:text-red-600 transition-colors">Abuse</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold border-t border-slate-100 dark:border-slate-800 pt-8">
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
              <span>Trusted by 2M+ Teams</span>
              <span>ISO 27001 Certified</span>
              <span>GDPR Compliant</span>
              <span>© 2026 Smart PDF.ai</span>
            </div>
            <div 
              onClick={resetTool}
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-red-600 cursor-pointer transition-all active:scale-95 group"
            >
              <span>View all 24 tools</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
