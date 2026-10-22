// Everything about how the image is made rather than what is in it.
import { Loras } from "@/features/model/loras";
import { ModelSection } from "@/features/model/model-section";
import { SamplingSection } from "@/features/model/sampling";
import { SeedSection, SizeSection } from "@/features/model/size-seed";
import { UpscaleSection } from "@/features/model/upscale";

export function ModelPanel() {
  return (
    <div>
      <ModelSection />
      <Loras />
      <SizeSection />
      <SeedSection />
      <UpscaleSection />
      <SamplingSection />
    </div>
  );
}
