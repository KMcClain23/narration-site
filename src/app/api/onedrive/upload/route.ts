import { NextRequest, NextResponse } from "next/server";
import { ClientSecretCredential } from "@azure/identity";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

export const runtime = "nodejs";

const USER_UPN = "Dean@DMNarration.com";

function buildClient() {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!,
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });
  return Client.initWithMiddleware({ authProvider });
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const bookTitle = (formData.get("bookTitle") as string | null) ?? "Script";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const safeName = bookTitle.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "Script";
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
    const drivePath = `Production Scripts/${safeName}.${ext}`;

    const client = buildClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload — simple PUT works for files up to 250 MB via Graph API
    const uploadedItem = await client
      .api(`/users/${USER_UPN}/drive/root:/${drivePath}:/content`)
      .header("Content-Type", file.type || "application/octet-stream")
      .put(buffer);

    // Create an anonymous view link
    const shareResult = await client
      .api(`/users/${USER_UPN}/drive/items/${uploadedItem.id}/createLink`)
      .post({ type: "view", scope: "anonymous" });

    return NextResponse.json({ url: shareResult.link.webUrl });
  } catch (e) {
    console.error("OneDrive upload error:", e);
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
