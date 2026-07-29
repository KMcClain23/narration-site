import { adminType } from "@/lib/design-tokens";

export function PlaceholderPage({ title, stage }: { title: string; stage: number }) {
  return (
    <div>
      <h1 className={adminType.titleLg}>{title}</h1>
      <p className={`${adminType.body} mt-2`}>This section will be built in Stage {stage}.</p>
    </div>
  );
}
