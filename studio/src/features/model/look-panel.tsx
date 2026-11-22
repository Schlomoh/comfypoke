import { LookHead } from "@/features/model/look-sheet";
// The Look tab: how pictures are made rather than what is in them. The look it is on top (look-sheet.tsx), the model and the LoRA
// stack that make it, sampling last. What a single run is set to (size, seeds, draft, finish, upscale) is the dock's.
import { Loras } from "@/features/model/loras";
import { ModelSection } from "@/features/model/model-section";
import { SamplingSection } from "@/features/model/sampling";

export function LookPanel() {
  return (
    <div>
      <LookHead />
      <ModelSection />
      <Loras />
      <SamplingSection />
    </div>
  );
}
