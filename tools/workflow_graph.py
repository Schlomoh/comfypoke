"""Tiny builder shared by the tools/build_*_workflow*.py generators: `Graph.add`
appends one node, wires its inputs (keyword order: SPEC inputs first, then any
widget driven by a link, e.g. width=(size_node, 0)) and records the same node in
API format, `Graph.write` dumps the GUI workflow JSON and the API prompt."""
import json

SPEC = {  # node type -> (input names, output types)
    "UNETLoader": ([], ["MODEL"]), "CLIPLoader": ([], ["CLIP"]), "VAELoader": ([], ["VAE"]),
    "LoraLoaderModelOnly": (["model"], ["MODEL"]), "ModelSamplingAuraFlow": (["model"], ["MODEL"]),
    "CLIPTextEncode": (["clip"], ["CONDITIONING"]), "EmptySD3LatentImage": ([], ["LATENT"]), "EmptyLatentImage": ([], ["LATENT"]),
    "KSampler": (["model", "positive", "negative", "latent_image"], ["LATENT"]),
    "VAEDecode": (["samples", "vae"], ["IMAGE"]), "VAEEncode": (["pixels", "vae"], ["LATENT"]),
    "SaveImage": (["images"], []), "UpscaleModelLoader": ([], ["UPSCALE_MODEL"]),
    "ImageUpscaleWithModel": (["upscale_model", "image"], ["IMAGE"]),
    "ImageScaleToTotalPixels": (["image"], ["IMAGE"]),
    "LoadImage": ([], ["IMAGE", "MASK"]),
    "ImagePadForOutpaint": (["image"], ["IMAGE", "MASK"]),
    "InpaintCropImproved": (["image", "mask"], ["STITCHER", "IMAGE", "MASK"]),
    "InpaintStitchImproved": (["stitcher", "inpainted_image"], ["IMAGE"]),
    "InpaintModelConditioning": (["positive", "negative", "vae", "pixels", "mask"], ["CONDITIONING", "CONDITIONING", "LATENT"]),
    "SetLatentNoiseMask": (["samples", "mask"], ["LATENT"]),
    "CheckpointLoaderSimple": ([], ["MODEL", "CLIP", "VAE"]),
    "SAM3_Detect": (["model", "image", "conditioning"], ["MASK", "BOUNDING_BOX"]),
    "GrowMask": (["mask"], ["MASK"]), "InvertMask": (["mask"], ["MASK"]), "MaskComposite": (["destination", "source"], ["MASK"]),
    "GetImageSize": (["image"], ["INT", "INT", "INT"]),
    "ConditioningZeroOut": (["conditioning"], ["CONDITIONING"]),
    "ReferenceLatent": (["conditioning", "latent"], ["CONDITIONING"]),
    "EmptyFlux2LatentImage": ([], ["LATENT"]), "Flux2Scheduler": ([], ["SIGMAS"]),
    "KSamplerSelect": ([], ["SAMPLER"]), "RandomNoise": ([], ["NOISE"]),
    "CFGGuider": (["model", "positive", "negative"], ["GUIDER"]),
    "SamplerCustomAdvanced": (["noise", "guider", "sampler", "sigmas", "latent_image"], ["LATENT", "LATENT"]),
    "ImageCompositeMasked": (["destination", "source", "mask"], ["IMAGE"]),
    "TextEncodeQwenImageEditPlus": (["clip", "vae", "image1"], ["CONDITIONING"]),
    "FluxKontextImageScale": (["image"], ["IMAGE"]), "FluxKontextMultiReferenceLatentMethod": (["conditioning"], ["CONDITIONING"]),
    "CFGNorm": (["model"], ["MODEL"]), "ModelPatchLoader": ([], ["MODEL_PATCH"]),
    "QwenImageDiffsynthControlnet": (["model", "model_patch", "vae", "image", "mask"], ["MODEL"]),
    "ZImageFunControlnet": (["model", "model_patch", "vae", "image", "inpaint_image", "mask"], ["MODEL"]),
    "MaskPreview": (["mask"], []), "RTDETR_detect": (["model", "image"], ["BOUNDING_BOX"]),
    "SAM3DBody_Loader": ([], ["SAM3D_BODY_MODEL"]), "SAM3DBody_Predict": (["sam3d_body_model", "image", "track_data", "bboxes"], ["MHR_POSE_DATA"]),
    "SAM3DBody_Render": (["pose_data", "background", "camera_info"], ["IMAGE"]),
    "LoadDA3Model": ([], ["DA3_MODEL"]), "DA3Inference": (["da3_model", "image"], ["DA3_GEOMETRY"]), "DA3Render": (["da3_geometry"], ["IMAGE"]),
    "PreviewImage": (["images"], []),
    "VAEEncodeTiled": (["pixels", "vae"], ["LATENT"]), "VAEDecodeTiled": (["samples", "vae"], ["IMAGE"]),
    "SeedVR2Preprocess": (["resized_images"], ["IMAGE"]), "SeedVR2Conditioning": (["model", "vae_conditioning"], ["CONDITIONING", "CONDITIONING"]),
    "SeedVR2PostProcessing": (["images", "original_resized_images"], ["IMAGE"]), "SplitSigmasDenoise": (["sigmas"], ["SIGMAS", "SIGMAS"]), "ComfySwitchNode": (["on_false", "on_true"], ["IMAGE"]), "MaskToImage": (["mask"], ["IMAGE"]), "ThresholdMask": (["mask"], ["MASK"]), "DifferentialDiffusion": (["model"], ["MODEL"]), "TextGenerate": (["clip", "image"], ["STRING"]), "StringConcatenate": ([], ["STRING"]), "ImageToMask": (["image"], ["MASK"]), "ImageBlur": (["image"], ["IMAGE"]), "ImageBlend": (["image1", "image2"], ["IMAGE"]), "ImageScale": (["image"], ["IMAGE"]),
}
WIDGET_NAMES = {
    "UNETLoader": ["unet_name", "weight_dtype"], "CLIPLoader": ["clip_name", "type", "device"], "VAELoader": ["vae_name"],
    "LoraLoaderModelOnly": ["lora_name", "strength_model"], "ModelSamplingAuraFlow": ["shift"], "CLIPTextEncode": ["text"],
    "EmptySD3LatentImage": ["width", "height", "batch_size"], "EmptyLatentImage": ["width", "height", "batch_size"],
    "KSampler": ["seed", "control_after_generate", "steps", "cfg", "sampler_name", "scheduler", "denoise"],
    "SaveImage": ["filename_prefix"], "UpscaleModelLoader": ["model_name"], "ImageScaleToTotalPixels": ["upscale_method", "megapixels", "resolution_steps"],
    "LoadImage": ["image", "upload"],
    "ImagePadForOutpaint": ["left", "top", "right", "bottom", "feathering"],
    "InpaintCropImproved": ["downscale_algorithm", "upscale_algorithm",
                            "preresize", "preresize_mode", "preresize_min_width", "preresize_min_height", "preresize_max_width", "preresize_max_height",
                            "mask_fill_holes", "mask_expand_pixels", "mask_invert", "mask_blend_pixels", "mask_hipass_filter",
                            "extend_for_outpainting", "extend_up_factor", "extend_down_factor", "extend_left_factor", "extend_right_factor",
                            "context_from_mask_extend_factor",
                            "output_resize_to_target_size", "output_target_width", "output_target_height", "output_padding", "device_mode"],
    "InpaintModelConditioning": ["noise_mask"],
    "CheckpointLoaderSimple": ["ckpt_name"], "SAM3_Detect": ["threshold", "refine_iterations", "individual_masks"],
    "GrowMask": ["expand", "tapered_corners"], "MaskComposite": ["x", "y", "operation"],
    "EmptyFlux2LatentImage": ["width", "height", "batch_size"], "Flux2Scheduler": ["steps", "width", "height"],
    "KSamplerSelect": ["sampler_name"], "RandomNoise": ["noise_seed", "control_after_generate"], "CFGGuider": ["cfg"],
    "ImageCompositeMasked": ["x", "y", "resize_source"],
    "TextEncodeQwenImageEditPlus": ["prompt"], "FluxKontextMultiReferenceLatentMethod": ["reference_latents_method"], "CFGNorm": ["strength", "pre_cfg"],
    "ModelPatchLoader": ["name"], "QwenImageDiffsynthControlnet": ["strength"], "ZImageFunControlnet": ["strength"],
    "RTDETR_detect": ["threshold", "class_name", "max_detections"],
    "SAM3DBody_Loader": ["model_file"], "SAM3DBody_Predict": ["run_hand_refinement", "fov", "batch_size"],
    "SAM3DBody_Render": ["width", "height", "render_style", "render_style.shader", "render_style.opacity", "render_style.person_palette_falloff", "render_style.region"],  # mesh style
    "LoadDA3Model": ["model_name", "weight_dtype"], "DA3Inference": ["resolution", "resize_method", "mode"],
    "DA3Render": ["output", "output.normalization", "output.apply_sky_clip"],
    "VAEEncodeTiled": ["tile_size", "overlap", "temporal_size", "temporal_overlap"], "VAEDecodeTiled": ["tile_size", "overlap", "temporal_size", "temporal_overlap"],
    "SeedVR2PostProcessing": ["color_correction_method"], "SplitSigmasDenoise": ["denoise"], "ComfySwitchNode": ["switch"], "ImageToMask": ["channel"], "ThresholdMask": ["value"], "DifferentialDiffusion": ["strength"], "TextGenerate": ["prompt", "max_length", "sampling_mode", "thinking", "use_default_template"], "StringConcatenate": ["string_a", "string_b", "delimiter"], "ImageBlur": ["blur_radius", "sigma"], "ImageBlend": ["blend_factor", "blend_mode"], "ImageScale": ["upscale_method", "width", "height", "crop"],
}
GUI_ONLY_WIDGETS = {"control_after_generate", "upload"}  # in widgets_values but not prompt inputs


class Graph:
    def __init__(self):
        self.nodes, self.links, self.api = [], [], {}

    def add(self, ntype, widgets=(), pos=(0, 0), title=None, color=None, **inputs):
        nodes, links = self.nodes, self.links
        nid = len(nodes) + 1
        in_names, out_types = SPEC[ntype]
        n = {"id": nid, "type": ntype, "pos": list(pos), "size": [320, 60 + 26 * (len(widgets) + len(in_names))],
             "flags": {}, "order": nid, "mode": 0, "inputs": [], "outputs": [], "properties": {"Node name for S&R": ntype},
             "widgets_values": list(widgets)}
        if title: n["title"] = title
        if color: n["color"], n["bgcolor"] = color
        api_inputs = {}
        for name, (src, slot) in inputs.items():  # SPEC inputs first, then widgets driven by a link
            lid = len(links) + 1
            links.append([lid, src, slot, nid, len(n["inputs"]), SPEC[nodes[src - 1]["type"]][1][slot]])
            entry = {"name": name, "type": links[-1][5], "link": lid}
            if name not in in_names: entry["widget"] = {"name": name}
            n["inputs"].append(entry)
            nodes[src - 1]["outputs"][slot]["links"].append(lid)
            api_inputs[name] = [str(src), slot]
        for i, t in enumerate(out_types):
            n["outputs"].append({"name": t, "type": t, "links": [], "slot_index": i})
        nodes.append(n)
        wn = WIDGET_NAMES.get(ntype, [])
        self.api[str(nid)] = {"class_type": ntype, "inputs": {**{k: v for k, v in zip(wn, widgets) if k not in GUI_ONLY_WIDGETS}, **api_inputs}}
        return nid

    def write(self, workflow_path, api_path, groups):
        wf = {"last_node_id": len(self.nodes), "last_link_id": len(self.links), "nodes": self.nodes, "links": self.links,
              "groups": [{"title": t, "bounding": list(b), "color": c, "font_size": 24, "flags": {}} for t, b, c in groups],
              "config": {}, "extra": {}, "version": 0.4}
        json.dump(wf, open(workflow_path, "w"), indent=1)
        json.dump(self.api, open(api_path, "w"), indent=1)
        print(workflow_path.name, "nodes", len(self.nodes), "links", len(self.links))
