import { describe, expect, it } from "vitest";

import { modelName } from "@/domain/format";

describe("modelName", () => {
  it("reads a file as a model's name, without its precision", () => {
    expect(modelName("krea2_turbo_bf16.safetensors")).toBe("Krea2 Turbo");
    expect(modelName("z_image-turbo_fp8_e4m3fn.safetensors")).toBe("Z Image Turbo");
    expect(modelName("flux1-dev-Q8_0.gguf")).toBe("Flux1 Dev");
  });
  it("keeps the file name when nothing else is left", () =>
    expect(modelName("bf16.safetensors")).toBe("bf16"));
});
