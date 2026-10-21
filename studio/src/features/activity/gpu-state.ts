// How the GPU worker's state reads on screen, in the activity button and the GPU panel.
import type { GpuState } from "@/data/api";

export const LABEL: Record<GpuState, string> = {
  cold: "OFF",
  starting: "BOOTING",
  warm: "WARM",
  busy: "BUSY",
};
export const TONE: Record<GpuState, string> = {
  cold: "text-faint",
  starting: "text-warn",
  warm: "text-ok",
  busy: "text-ok",
};
