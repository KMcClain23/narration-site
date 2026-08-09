import { NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2, R2_BUCKETS, R2_PREFIXES, buildR2PublicUrl } from "@/lib/r2";
import { sanitizeName } from "@/lib/sanitize-name";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/require-admin";

const ALLOWED_TYPES = new Set(["audio/mpeg", "audio/mp3"]);

async function findOwnedCharacter(manuscriptId: string, characterId: string) {
  const { data } = await supabaseAdmin
    .from("characters")
    .select("id, name, voice_sample_key")
    .eq("id", characterId)
    .eq("manuscript_id", manuscriptId)
    .single();
  return data;
}

// POST: presigned PUT for a short voice-sample clip — same client-side
// upload pattern as everywhere else in the app (upload-person-photo,
// manuscripts). Doesn't touch the character row; PATCH does that once the
// PUT to R2 has actually succeeded.
export async function POST(req: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, characterId } = await params;
  const character = await findOwnedCharacter(id, characterId);
  if (!character) return NextResponse.json({ error: "Character not found for this manuscript" }, { status: 404 });

  const { filename, contentType } = await req.json().catch(() => ({}));
  if (!ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "Only MP3 files are allowed" }, { status: 400 });
  }

  const base = sanitizeName((filename || character.name).replace(/\.[^.]+$/, "")) || "voice-sample";
  const key = `${R2_PREFIXES.characterVoiceSamples}${characterId}-${Date.now()}-${base}.mp3`;

  const command = new PutObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 600 });
  const publicUrl = buildR2PublicUrl(R2_BUCKETS.media.publicBaseUrl, key);

  return NextResponse.json({ uploadUrl, key, publicUrl });
}

// PATCH: attach an already-uploaded clip to the character, replacing (and
// deleting from R2) whatever was there before.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, characterId } = await params;
  const character = await findOwnedCharacter(id, characterId);
  if (!character) return NextResponse.json({ error: "Character not found for this manuscript" }, { status: 404 });

  const { key, publicUrl } = await req.json().catch(() => ({}));
  if (!key || !publicUrl) return NextResponse.json({ error: "Missing key or publicUrl" }, { status: 400 });

  if (character.voice_sample_key) {
    r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: character.voice_sample_key })).catch(() => {});
  }

  const { error } = await supabaseAdmin
    .from("characters")
    .update({ voice_sample_url: publicUrl, voice_sample_key: key })
    .eq("id", characterId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ voice_sample_url: publicUrl });
}

// DELETE: remove the sample entirely.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; characterId: string }> }) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id, characterId } = await params;
  const character = await findOwnedCharacter(id, characterId);
  if (!character) return NextResponse.json({ error: "Character not found for this manuscript" }, { status: 404 });

  if (character.voice_sample_key) {
    r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKETS.media.name, Key: character.voice_sample_key })).catch(() => {});
  }

  const { error } = await supabaseAdmin
    .from("characters")
    .update({ voice_sample_url: null, voice_sample_key: null })
    .eq("id", characterId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
