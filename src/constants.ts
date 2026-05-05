import { 
  Combine, 
  Scissors, 
  Zap, 
  FileText, 
  Image as ImageIcon, 
  Brain, 
  MessageSquareText, 
  Lock, 
  Unlock,
  RotateCcw,
  RotateCw,
  Type,
  FilePlus2,
  Presentation
} from 'lucide-react';

export const TOOLS = [
  {
    id: 'merge',
    title: 'Merge PDF',
    description: 'Combine multiple PDFs into one document easily.',
    icon: Combine,
    color: 'bg-red-500',
    category: 'Basic'
  },
  {
    id: 'split',
    title: 'Split PDF',
    description: 'Extract pages or split your PDF into separate files.',
    icon: Scissors,
    color: 'bg-blue-500',
    category: 'Basic'
  },
  {
    id: 'summarize',
    title: 'AI Summarize',
    description: 'Get an instant AI-powered summary of your document.',
    icon: Brain,
    color: 'bg-purple-600',
    category: 'AI'
  },
  {
    id: 'chat',
    title: 'Chat with PDF',
    description: 'Ask questions and get answers from your PDF using AI.',
    icon: MessageSquareText,
    color: 'bg-indigo-600',
    category: 'AI'
  },
  {
    id: 'word',
    title: 'PDF to Word',
    description: 'Transform documents while preserving text structure.',
    icon: FileText,
    color: 'bg-blue-600',
    category: 'Convert'
  },
  {
    id: 'image-to-pdf',
    title: 'Image to PDF',
    description: 'Convert JPG, PNG, and other images to PDF.',
    icon: ImageIcon,
    color: 'bg-green-600',
    category: 'Convert'
  },
  {
    id: 'protect',
    title: 'Protect PDF',
    description: 'Encrypt your PDF with a password for security.',
    icon: Lock,
    color: 'bg-orange-600',
    category: 'Security'
  },
  {
    id: 'unlock',
    title: 'Unlock PDF',
    description: 'Remove password and encryption from your documents.',
    icon: Unlock,
    color: 'bg-teal-600',
    category: 'Security'
  },
  {
    id: 'pdf-to-text',
    title: 'PDF to Text',
    description: 'Extract all text content from your PDF files into a TXT.',
    icon: FileText,
    color: 'bg-zinc-600',
    category: 'Convert'
  },
  {
    id: 'ppt',
    title: 'PDF to PPT',
    description: 'Turn your PDF documents into editable PPTX slides.',
    icon: Presentation,
    color: 'bg-red-600',
    category: 'Convert'
  },
  {
    id: 'pdf-to-jpg',
    title: 'PDF to JPG',
    description: 'Convert every PDF page into a high-quality JPG image.',
    icon: ImageIcon,
    color: 'bg-orange-500',
    category: 'Convert'
  },
  {
    id: 'rotate',
    title: 'Rotate PDF',
    description: 'Rotate your PDF pages by 90, 180, or 270 degrees.',
    icon: RotateCw,
    color: 'bg-purple-500',
    category: 'Edit'
  },
  {
    id: 'annotate',
    title: 'Markup PDF',
    description: 'Add text annotations, basic shapes, or highlights to your PDF pages.',
    icon: Type,
    color: 'bg-indigo-600',
    category: 'Edit'
  },
  {
    id: 'compress',
    title: 'Compress PDF',
    description: 'Reduce the file size of your PDF while maintaining quality.',
    icon: Zap,
    color: 'bg-yellow-500',
    category: 'Basic'
  }
];
