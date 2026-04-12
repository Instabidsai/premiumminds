"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase";
import {
  FileText,
  Upload,
  Clock,
  User,
  Bot,
  ArrowUpRight,
  FileType2,
  FileImage,
  FileSpreadsheet,
  FileCode2,
  FileArchive,
  File as FileIcon,
  CloudUpload,
  X,
  HardDrive,
} from "lucide-react";

interface Doc {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null; // author UUID (FK)
  uploader?: {
    kind: "human" | "agent";
    agent_name: string | null;
    member?: { handle: string; display_name: string | null } | null;
  } | null;
  created_at: string;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (bytes == null) return null;
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val >= 10 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${sizes[i]}`;
}

function mimeMeta(mime: string | null | undefined): {
  label: string;
  Icon: typeof FileText;
  tint: string;
  bg: string;
} {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/"))
    return { label: "Image", Icon: FileImage, tint: "text-pink-300", bg: "bg-pink-500/10" };
  if (m === "application/pdf")
    return { label: "PDF", Icon: FileType2, tint: "text-red-300", bg: "bg-red-500/10" };
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv" ||
    m.endsWith("/csv")
  )
    return {
      label: "Spreadsheet",
      Icon: FileSpreadsheet,
      tint: "text-emerald-300",
      bg: "bg-emerald-500/10",
    };
  if (m.includes("zip") || m.includes("tar") || m.includes("compressed"))
    return { label: "Archive", Icon: FileArchive, tint: "text-amber-300", bg: "bg-amber-500/10" };
  if (
    m.includes("json") ||
    m.includes("javascript") ||
    m.includes("typescript") ||
    m.includes("xml") ||
    m.includes("yaml")
  )
    return { label: "Code", Icon: FileCode2, tint: "text-sky-300", bg: "bg-sky-500/10" };
  if (m.startsWith("text/"))
    return { label: "Text", Icon: FileText, tint: "text-purple-300", bg: "bg-purple-500/15" };
  if (m)
    return { label: m.split("/")[1] || "File", Icon: FileIcon, tint: "text-gray-300", bg: "bg-gray-500/10" };
  return { label: "Unknown", Icon: FileIcon, tint: "text-gray-400", bg: "bg-gray-500/10" };
}

export default function DocsPage() {
  const supabase = createBrowserClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select(
        `id, title, storage_path, mime_type, size_bytes, uploaded_by, created_at,
         uploader:authors!documents_uploaded_by_fkey (
           kind, agent_name,
           member:members!authors_member_id_fkey ( handle, display_name )
         )`
      )
      .order("created_at", { ascending: false });
    if (data) {
      const normalized: Doc[] = data.map((d: Record<string, unknown>) => {
        const uploaderRaw = Array.isArray(d.uploader) ? d.uploader[0] : d.uploader;
        let uploader: Doc["uploader"] = null;
        if (uploaderRaw) {
          const u = uploaderRaw as {
            kind: "human" | "agent";
            agent_name: string | null;
            member: unknown;
          };
          const memberRaw = Array.isArray(u.member) ? u.member[0] : u.member;
          uploader = {
            kind: u.kind,
            agent_name: u.agent_name,
            member: (memberRaw as { handle: string; display_name: string | null } | null) ?? null,
          };
        }
        return {
          id: d.id as string,
          title: d.title as string,
          storage_path: d.storage_path as string,
          mime_type: d.mime_type as string | null,
          size_bytes: (d.size_bytes as number | null) ?? null,
          uploaded_by: d.uploaded_by as string | null,
          uploader,
          created_at: d.created_at as string,
        };
      });
      setDocs(normalized);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  function pickFile(f: File | null) {
    setFile(f);
    if (f && !title.trim()) {
      // auto-populate title from filename (strip extension)
      const base = f.name.replace(/\.[^.]+$/, "");
      setTitle(base);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pickFile(dropped);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title.trim());

      const res = await fetch("/api/docs/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      setTitle("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      await loadDocs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-purple-400" />
          <h1 className="text-lg font-semibold text-gray-100">Documents</h1>
        </div>
        {!loading && docs.length > 0 && (
          <span className="rounded-full border border-gray-800 bg-gray-900 px-2.5 py-0.5 text-xs text-gray-400">
            {docs.length} {docs.length === 1 ? "doc" : "docs"}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Upload form */}
        <form
          onSubmit={handleUpload}
          className="mb-8 overflow-hidden rounded-xl border border-gray-800 bg-gray-900"
        >
          <div className="flex items-center gap-2 border-b border-gray-800 bg-gray-900/80 px-5 py-3">
            <Upload className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-gray-100">Upload document</h2>
            <span className="ml-2 text-xs text-gray-500">
              Title + file, then drop it into the group mind
            </span>
          </div>

          <div className="grid gap-5 p-5 md:grid-cols-5">
            {/* Title field */}
            <div className="md:col-span-2">
              <label
                htmlFor="doc-title"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500"
              >
                Title
              </label>
              <input
                id="doc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Onboarding playbook v2"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 transition-colors focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <p className="mt-1.5 text-xs text-gray-600">
                Pick something searchable — this becomes the card headline.
              </p>
            </div>

            {/* Drag-and-drop zone */}
            <div className="md:col-span-3">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                File
              </label>
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                }}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
                  dragActive
                    ? "drop-zone-pulse border-purple-500 bg-purple-500/10"
                    : file
                      ? "border-purple-600/60 bg-purple-600/5"
                      : "border-gray-700 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/70"
                }`}
              >
                <input
                  ref={fileInputRef}
                  id="file-input"
                  type="file"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                  required
                  className="sr-only"
                />
                {file ? (
                  <div className="flex w-full items-center gap-3 text-left">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-600/20">
                      {(() => {
                        const { Icon, tint } = mimeMeta(file.type);
                        return <Icon className={`h-5 w-5 ${tint}`} />;
                      })()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-100">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatBytes(file.size) || ""}
                        {file.type ? ` - ${file.type}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-200"
                      aria-label="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <CloudUpload
                      className={`mb-2 h-8 w-8 transition-colors ${
                        dragActive ? "text-purple-300" : "text-gray-600 group-hover:text-gray-500"
                      }`}
                    />
                    <p className="text-sm text-gray-300">
                      <span className="font-medium text-purple-300">Click to browse</span>{" "}
                      or drag and drop
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      PDF, text, images, code, spreadsheets
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mx-5 mb-5 rounded-lg border border-red-800 bg-red-900/30 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-gray-800 bg-gray-900/60 px-5 py-3">
            <p className="text-xs text-gray-500">
              Uploads flow into Graphiti so agents can find them.
            </p>
            <button
              type="submit"
              disabled={uploading || !file || !title.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Upload
                </>
              )}
            </button>
          </div>
        </form>

        {/* Documents grid */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-gray-800 bg-gray-900 p-5"
              >
                <div className="mb-4 flex items-start gap-3">
                  <div className="h-10 w-10 flex-shrink-0 rounded-lg bg-gray-800" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-gray-800" />
                    <div className="h-3 w-1/3 rounded bg-gray-800" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-3 w-16 rounded bg-gray-800" />
                  <div className="h-3 w-20 rounded bg-gray-800" />
                </div>
              </div>
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/15">
              <CloudUpload className="h-7 w-7 text-purple-300" />
            </div>
            <h3 className="text-base font-semibold text-gray-100">
              No documents yet
            </h3>
            <p className="mt-1 text-sm text-gray-400">
              Drop in a PDF, spec, or meeting note. Agents can reference it the
              moment it lands.
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-purple-600/40 bg-purple-600/10 px-4 py-2 text-sm font-medium text-purple-200 transition-colors hover:bg-purple-600/20"
            >
              <Upload className="h-4 w-4" />
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => {
              const meta = mimeMeta(doc.mime_type);
              const Icon = meta.Icon;
              const size = formatBytes(doc.size_bytes);
              const uploaderName =
                doc.uploader?.kind === "agent"
                  ? doc.uploader?.agent_name || "agent"
                  : doc.uploader?.member?.display_name ||
                    doc.uploader?.member?.handle ||
                    "member";
              const isAgent = doc.uploader?.kind === "agent";
              return (
                <div
                  key={doc.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 transition-all hover:-translate-y-0.5 hover:border-purple-600/60 hover:shadow-lg hover:shadow-purple-950/30"
                >
                  <div className="flex items-start gap-3 p-5 pb-4">
                    <div
                      className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg ${meta.bg}`}
                    >
                      <Icon className={`h-5 w-5 ${meta.tint}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-gray-100 group-hover:text-white">
                        {doc.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${meta.bg} ${meta.tint}`}
                        >
                          {meta.label}
                        </span>
                        {size && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                            <HardDrive className="h-2.5 w-2.5" />
                            {size}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-800/80 bg-gray-900/60 px-5 py-3">
                    <div className="flex min-w-0 items-center gap-3 text-xs text-gray-500">
                      {doc.uploader && (
                        <span
                          className="flex min-w-0 items-center gap-1"
                          title={uploaderName}
                        >
                          {isAgent ? (
                            <Bot className="h-3 w-3 flex-shrink-0 text-purple-400" />
                          ) : (
                            <User className="h-3 w-3 flex-shrink-0" />
                          )}
                          <span className="truncate">{uploaderName}</span>
                        </span>
                      )}
                      <span className="flex flex-shrink-0 items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(doc.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors group-hover:text-purple-300">
                      View
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
