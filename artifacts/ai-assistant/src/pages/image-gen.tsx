import { useState } from "react";
import { useGenerateGeminiImage } from "@workspace/api-client-react";
import { ImageIcon, Wand2, Download, Loader2 } from "lucide-react";

export default function ImageGenPage() {
  const [prompt, setPrompt] = useState("");
  const [generatedImage, setGeneratedImage] = useState<{b64_json: string; mimeType: string} | null>(null);
  
  const generateImage = useGenerateGeminiImage();

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    generateImage.mutate(
      { data: { prompt } },
      {
        onSuccess: (data) => {
          setGeneratedImage(data);
        }
      }
    );
  };

  const handleDownload = () => {
    if (!generatedImage) return;
    const link = document.createElement('a');
    link.href = `data:${generatedImage.mimeType};base64,${generatedImage.b64_json}`;
    link.download = `lumina-gen-${Date.now()}.${generatedImage.mimeType.split('/')[1]}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Header */}
      <div className="px-6 py-5 md:px-10 border-b border-border/50 shrink-0">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <ImageIcon className="w-6 h-6 text-purple-400" />
          Visual Synthesis
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Describe an image and Lumina will create it.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col items-center">
        
        <div className="w-full max-w-3xl flex flex-col items-center">
          {/* Result Area */}
          <div className="w-full aspect-square md:aspect-video bg-black/20 border border-white/5 rounded-3xl mb-8 flex items-center justify-center overflow-hidden relative shadow-2xl">
            {generateImage.isPending ? (
              <div className="flex flex-col items-center text-purple-400/80">
                <Loader2 className="w-12 h-12 animate-spin mb-4" />
                <p className="text-sm font-medium animate-pulse">Synthesizing visual...</p>
              </div>
            ) : generatedImage ? (
              <div className="w-full h-full relative group">
                <img 
                  src={`data:${generatedImage.mimeType};base64,${generatedImage.b64_json}`} 
                  alt={prompt} 
                  className="w-full h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 bg-white text-black px-6 py-3 rounded-full font-medium hover:scale-105 transition-transform"
                  >
                    <Download className="w-5 h-5" /> Download Image
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center text-muted-foreground/40 text-center p-6">
                <Wand2 className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">Your imagination awaits</p>
                <p className="text-sm">Enter a prompt below to generate an image.</p>
              </div>
            )}
          </div>

          {/* Input Area */}
          <form onSubmit={handleGenerate} className="w-full">
            <div className="glass-input-wrapper rounded-2xl p-1 bg-black/20 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="A cinematic shot of a futuristic coffee shop in Tokyo, neon lighting, 8k..."
                  className="flex-1 bg-transparent border-none text-foreground placeholder:text-muted-foreground px-5 py-4 focus:outline-none focus:ring-0"
                  disabled={generateImage.isPending}
                />
                <button
                  type="submit"
                  disabled={!prompt.trim() || generateImage.isPending}
                  className="bg-purple-500 hover:bg-purple-600 text-white rounded-xl px-6 py-3 font-medium transition-colors disabled:opacity-50 flex items-center gap-2 mr-1"
                >
                  {generateImage.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Wand2 className="w-5 h-5" />
                  )}
                  <span className="hidden sm:inline">Generate</span>
                </button>
              </div>
            </div>
          </form>
          
        </div>
      </div>
    </div>
  );
}