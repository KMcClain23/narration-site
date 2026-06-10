import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { r2, R2_BUCKETS } from "@/lib/r2";

// Public — active demos only, ordered by sort_order
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("demos")
    .select("id,title,genre,description,file_url,duration_seconds,sort_order,active")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Create new demo record
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, genre, description, file_url, file_key, duration_seconds, sort_order } = body;

    if (!title?.trim() || !file_url || !file_key) {
      return NextResponse.json({ error: "title, file_url, and file_key are required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("demos")
      .insert({
        title: title.trim(),
        genre:            genre    || null,
        description:      description?.trim() || null,
        file_url,
        file_key,
        duration_seconds: duration_seconds ?? null,
        sort_order:       sort_order ?? 0,
        active:           true,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    console.error("[POST /api/demos]", e);
    return NextResponse.json({ error: "Failed to create demo" }, { status: 500 });
  }
}

// Update demo (metadata, sort_order, active, or replace audio)
export async function PUT(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // If the file is being replaced, delete the old R2 object
    if (updates.file_key) {
      const { data: existing } = await supabaseAdmin
        .from("demos").select("file_key").eq("id", id).single();

      if (existing?.file_key && existing.file_key !== updates.file_key) {
        try {
          await r2.send(new DeleteObjectCommand({
            Bucket: R2_BUCKETS.demos.name,
            Key:    existing.file_key,
          }));
        } catch (r2Err) {
          console.warn("[PUT /api/demos] R2 old-file delete failed:", r2Err);
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("demos").update(updates).eq("id", id).select().single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    console.error("[PUT /api/demos]", e);
    return NextResponse.json({ error: "Failed to update demo" }, { status: 500 });
  }
}

// Delete demo + remove file from R2
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const { data: demo } = await supabaseAdmin
      .from("demos").select("file_key").eq("id", id).single();

    if (demo?.file_key) {
      try {
        await r2.send(new DeleteObjectCommand({
          Bucket: R2_BUCKETS.demos.name,
          Key:    demo.file_key,
        }));
      } catch (r2Err) {
        console.warn("[DELETE /api/demos] R2 delete failed:", r2Err);
      }
    }

    const { error } = await supabaseAdmin.from("demos").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[DELETE /api/demos]", e);
    return NextResponse.json({ error: "Failed to delete demo" }, { status: 500 });
  }
}
