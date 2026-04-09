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
    const channelSlug = (formData.get("channel_slug") as string | null) || "general";

    if (!file || !title?.trim()) {
      return Response.json(
        { error: "File and title are required" },
        { status: 400 }
      );
    }

    // Resolve channel_id from slug
    const { data: channel } = await supabase
      .from("channels")
      .select("id")
      .eq("slug", channelSlug)
      .maybeSingle();

    if (!channel) {
      return Response.json(
        { error: `Channel '${channelSlug}' not found` },
        { status: 400 }
      );
    }

    // Resolve member -> author for current user (create if missing)
    let { data: member } = await supabase
      .from("members")
      .select("id, handle")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!member) {
      const handle =
        user.user_metadata?.handle ||
        user.email?.split("@")[0] ||
        `user-${user.id.slice(0, 8)}`;
      const { data: newMember, error: memberErr } = await supabase
        .from("members")
        .insert({
          auth_user_id: user.id,
          handle,
          display_name: user.user_metadata?.display_name || handle,
        })
        .select("id, handle")
        .single();
      if (memberErr || !newMember) {
        return Response.json(
          { error: `Could not create member: ${memberErr?.message}` },
          { status: 500 }
        );
      }
      member = newMember;
    }

    let { data: author } = await supabase
      .from("authors")
      .select("id")
      .eq("member_id", member.id)
      .eq("kind", "human")
      .maybeSingle();

    if (!author) {
      const { data: newAuthor, error: authorErr } = await supabase
        .from("authors")
        .insert({ kind: "human", member_id: member.id })
        .select("id")
        .single();
      if (authorErr || !newAuthor) {
        return Response.json(
          { error: `Could not create author: ${authorErr?.message}` },
          { status: 500 }
        );
      }
      author = newAuthor;
    }

    // Generate a unique storage path
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const storagePath = `${user.id}/${Date.now()}-${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("docs")
      .upload(storagePath, file, {
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
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const isTextFile =
      file.type.startsWith("text/") ||
      file.type === "application/json" ||
      ["md", "txt", "csv", "json", "yaml", "yml", "toml"].includes(ext);

    if (isTextFile) {
      try {
        extractedText = await file.text();
        if (extractedText.length > 50_000) {
          extractedText = extractedText.slice(0, 50_000);
        }
      } catch {
        // Non-critical
      }
    }

    // Insert document record — MATCHES real schema: storage_path, uploaded_by (author_id), channel_id
    const { data: doc, error: insertError } = await supabase
      .from("documents")
      .insert({
        channel_id: channel.id,
        uploaded_by: author.id,
        title: title.trim(),
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
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
