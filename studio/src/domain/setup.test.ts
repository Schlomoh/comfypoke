import { describe, expect, it } from "vitest";

import { EMPTY } from "@/domain/recipe";
import { applySetup, parseSetup, passOf, retouchOf, setupOf } from "@/domain/setup";

const raw = {
  id: "s",
  name: "Mine",
  unet: "krea2_turbo_Q8_0.gguf",
  family: "krea2",
  steps: 8,
  cfg: 1,
  loras: [],
  at: 1,
};

describe("setups", () => {
  it("reads a stored setup, gguf included", () =>
    expect(parseSetup(raw)?.unet).toBe("krea2_turbo_Q8_0.gguf"));
  it("refuses one without a model file or a name", () => {
    expect(parseSetup({ ...raw, unet: "notes.txt" })).toBeNull();
    expect(parseSetup({ ...raw, name: " " })).toBeNull();
  });
  it("drops malformed LoRAs and keeps the rest", () =>
    expect(
      parseSetup({ ...raw, loras: [{ name: "a.safetensors", strength: 0.5 }, { name: 3 }] })?.loras,
    ).toEqual([{ name: "a.safetensors", strength: 0.5 }]));
  it("keeps only the LoRAs switched on", () => {
    const r = {
      ...EMPTY,
      loras: [
        { name: "a", strength: 1, on: true },
        { name: "b", strength: 1, on: false },
      ],
    };
    expect(setupOf(r, "krea2", "x").loras).toEqual([{ name: "a", strength: 1 }]);
  });
  it("leaves the family implicit when the model list suggests the same", () => {
    const s = parseSetup(raw);
    if (!s) throw new Error("unparsed");
    expect(applySetup(EMPTY, s, "krea2").family).toBeNull();
    expect(applySetup(EMPTY, s, "zimage").family).toBe("krea2");
  });
});

describe("passOf and retouchOf", () => {
  const render = {
    id: "r",
    createdAt: 0,
    seconds: 1,
    prompt: "a cat",
    negative: "blurry",
    unet: "z_image_turbo_bf16.safetensors",
    family: "zimage",
    width: 512,
    height: 512,
    steps: 8,
    cfg: 1,
    seed: 1,
    loras: [],
  };
  const finish = {
    unet: "krea2_turbo_bf16.safetensors",
    family: "krea2",
    steps: null,
    cfg: null,
    loras: [],
    denoise: 0.35,
  };
  it("is the render's model without a finish", () => expect(passOf(render).unet).toBe(render.unet));
  it("is the finish's model with one", () => expect(passOf({ ...render, finish }).family).toBe("krea2"));
  it("retouches with the finish's model and leaves the other model's negative out", () => {
    const r = retouchOf({ ...render, finish }, { megapixels: 4, prompt: "sharper", denoise: 0.3 });
    expect(r?.unet).toBe(finish.unet);
    expect(r?.negative).toBe("");
    expect(r?.prompt).toBe("a cat sharper");
  });
  it("has no retouch without words", () =>
    expect(retouchOf(render, { megapixels: 4, prompt: " ", denoise: 0.3 })).toBeNull());
});

describe("passOf with stored data", () => {
  it("ignores a finish recorded without its model's settings", () => {
    const old = {
      id: "r",
      createdAt: 0,
      seconds: 1,
      prompt: "",
      negative: "",
      unet: "a.safetensors",
      family: "krea2",
      width: 8,
      height: 8,
      steps: 8,
      cfg: 1,
      seed: 1,
      loras: [],
    };
    const r = { ...old, finish: { unet: "b.safetensors", denoise: 0.3 } } as unknown as Parameters<
      typeof passOf
    >[0];
    expect(passOf(r).unet).toBe("a.safetensors");
  });
});
