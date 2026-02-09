import { Suspense } from "react";
import HomeClient from "./HomeClient";

export default function Page() {
  return (
    // Suspense is required here because HomeClient uses useSearchParams()
    <Suspense fallback={<div className="min-h-screen bg-[#050814]" />}>
      <HomeClient />
    </Suspense>
  );
}