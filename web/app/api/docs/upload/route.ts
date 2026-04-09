import { cookies } from "next/headers";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(cookieStore);

  // Verify user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = formData.get("title") as string | null;

    if (!file || !title?.trim()) {
      return Response.json(
        { error: "File and title are required" },
        { status: 400 }
      );
    }

    // Generate a unique path
    const ext = file.name.split(".").pop() || "bin";
    const safeName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 100);
    const filePath = `${user.id}/${Date.now()}-${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("docs")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return Response.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Extract text for text/markdown files
    let extractedText: string | null = null;
    const textTypes = [
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ];
    const isTextFile =
      textTypes.some((t) => file.type.startsWith(t)) ||
      ["md", "txt", "csv", "json", "yaml", "yml", "toml"].includes(
        ext.toLowerCase()
      );

    if (isTextFile) {
      try {
        extractedText = await file.text();
        // Cap at 50KB of text
        if (extractedText.length > 50_000) {
          extractedText = extractedText.slice(0, 50_000);
        }
      } catch {
        // Non-critical: just skip text extraction
      }
    }

    // Insert document record
    const displayName =
      user.user_metadata?.display_name || user.email || "Unknown";

    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        title: title.trim(),
        file_path: filePath,
        mime_type: file.type || null,
        uploaded_by: displayName,
        user_id: user.id,
        extracted_text: extractedText,
      })
      .select()
      .single();

    if (insertError) {
      return Response.json(
        { error: `Database error: ${insertError.message}` },
        { status: 500 }
      );
    }

    return Response.json(doc, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
