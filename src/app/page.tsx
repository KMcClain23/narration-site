import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function Page() {
  let acceptingProjects = true;
  try {
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "accepting_projects")
      .single();
    acceptingProjects = data?.value !== "false";
  } catch {
    // Table may not exist yet — default to true
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
      <HomeClient acceptingProjects={acceptingProjects} />
    </Suspense>
  );
}
