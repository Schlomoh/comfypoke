// The Look tab: how pictures are made rather than what is in them. A saved setup on top, the model and the LoRA
// stack that make it, sampling last. What a single run is set to (size, seeds, draft, finish, upscale) is the dock's.
import { Loras } from "@/features/model/loras";
import { ModelSection } from "@/features/model/model-section";
import { SamplingSection } from "@/features/model/sampling";
import { SetupsSection } from "@/features/model/setups";

export function LookPanel() {
  return (
    <div>
      <SetupsSection />
      <ModelSection />
      <Loras />
      <SamplingSection />
    </div>
  );
}
