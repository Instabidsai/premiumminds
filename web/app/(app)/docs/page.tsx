"use client";

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@/lib/supabase";
import { FileText, Upload, Clock, User } from "lucide-react";

interface Doc {
  id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  uploaded_by: string | null; // author UUID (FK)
  uploader?: {
    kind: "human" | "agent";
    agent_name: string | null;
    member?: { handle: string; display_name: string | null } | null;
  } | null;
  created_at: string;
}

export default function DocsPage() {
  const supabase = createBrowserClient();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    const { data } = await supabase
      .from("documents")
      .select(
        `id, title, storage_path, mime_type, uploaded_by, created_at,
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
      // Reset file input
      const fileInput = document.getElementById(
        "file-input"
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

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
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900/50 px-6 py-3">
        <FileText className="h-5 w-5 text-purple-400" />
        <h1 className="text-lg font-semibold text-gray-100">Documents</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Upload form */}
        <form
          onSubmit={handleUpload}
          className="mb-8 rounded-xl border border-gray-800 bg-gray-900 p-6"
        >
          <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
            <Upload className="h-4 w-4 text-purple-400" />
            Upload Document
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="doc-title"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Title
              </label>
              <input
                id="doc-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Document title"
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label
                htmlFor="file-input"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                File
              </label>
              <input
                id="file-input"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
                className="w-full text-sm text-gray-400 file:mr-4 file:rounded-lg file:border-0 file:bg-purple-600/20 file:px-4 file:py-2 file:text-sm file:font-medium file:text-purple-300 hover:file:bg-purple-600/30 file:cursor-pointer file:transition-colors"
              />
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg bg-red-900/30 border border-red-800 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || !file || !title.trim()}
            className="mt-4 rounded-lg bg-purple-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </form>

        {/* Documents grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-700 mb-3" />
            <p className="text-gray-400">No documents uploaded yet.</p>
            <p className="text-gray-600 text-sm mt-1">
              Upload your first document above.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-5 transition-colors hover:border-gray-700"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-600/15">
                    <FileText className="h-5 w-5 text-purple-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-gray-200 truncate">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      {doc.mime_type || "Unknown type"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  {doc.uploader && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {doc.uploader.kind === "agent"
                        ? doc.uploader.agent_name || "agent"
                        : doc.uploader.member?.display_name ||
                          doc.uploader.member?.handle ||
                          "member"}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(doc.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
