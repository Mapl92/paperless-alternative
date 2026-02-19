"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
}

export default function UploadPage() {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const router = useRouter();

  const ACCEPTED_TYPES = new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/tiff",
    "image/webp",
    "image/bmp",
    "image/gif",
  ]);
  const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp", ".bmp", ".gif"];

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter(
      (f) =>
        ACCEPTED_TYPES.has(f.type) ||
        ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    setFiles((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, status: "pending" as const })),
    ]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);

    const formData = new FormData();
    files.forEach(({ file }) => formData.append("files", file));

    setFiles((prev) => prev.map((f) => ({ ...f, status: "uploading" })));

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setFiles((prev) => prev.map((f) => ({ ...f, status: "done" })));
        toast.success(
          `${files.length} Dokument${files.length > 1 ? "e" : ""} hochgeladen`
        );
        setTimeout(() => {
          router.push("/");
          router.refresh();
        }, 1500);
      } else {
        throw new Error("Upload failed");
      }
    } catch {
      setFiles((prev) => prev.map((f) => ({ ...f, status: "error" })));
      toast.error("Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Dokumente hochladen</h1>

      {/* Drop Zone */}
      <Card
        className={`border-2 border-dashed transition-colors ${
          dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Upload className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-1">
            PDF- und Bild-Dateien hierher ziehen
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            PDF, PNG, JPG, TIFF, WebP, BMP — oder klicken zum Auswählen
          </p>
          <Button variant="outline" asChild>
            <label className="cursor-pointer">
              Dateien auswählen
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp,.bmp,.gif,application/pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                }}
              />
            </label>
          </Button>
        </CardContent>
      </Card>

      {/* File List */}
      {files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border p-3"
            >
              <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="flex-1 text-sm truncate">{f.file.name}</span>
              <span className="text-xs text-muted-foreground">
                {(f.file.size / 1024 / 1024).toFixed(1)} MB
              </span>
              {f.status === "uploading" && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {f.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              )}
              {f.status === "pending" && (
                <button
                  onClick={() => removeFile(i)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}

          <Button
            onClick={handleUpload}
            disabled={uploading || files.every((f) => f.status === "done")}
            className="w-full mt-4"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wird hochgeladen...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {files.length} Dokument{files.length > 1 ? "e" : ""} hochladen
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
