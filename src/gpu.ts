import { Engine3D, Scene3D, View3D, Camera3D, Object3D } from "@orillusion/core";

const SHADER = /* wgsl */ `
struct View { size: vec2<f32>, pad: vec2<f32> };
@group(0) @binding(0) var<uniform> view: View;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct Inst {
  @location(0) rect: vec4<f32>,   // x, y, w, h in screen px
  @location(1) uv: vec4<f32>,     // u0, v0, u1, v1
  @location(2) color: vec4<f32>,  // premultiplied tint
};
struct VOut { @builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>, @location(1) color: vec4<f32> };

@vertex
fn vs(@builtin(vertex_index) vi: u32, i: Inst) -> VOut {
  var corners = array<vec2<f32>, 6>(vec2(0.,0.), vec2(1.,0.), vec2(0.,1.), vec2(0.,1.), vec2(1.,0.), vec2(1.,1.));
  let c = corners[vi];
  let p = i.rect.xy + c * i.rect.zw;
  var o: VOut;
  o.pos = vec4<f32>(p.x / view.size.x * 2.0 - 1.0, 1.0 - p.y / view.size.y * 2.0, 0.0, 1.0);
  o.uv = mix(i.uv.xy, i.uv.zw, c);
  o.color = i.color;
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4<f32> {
  return textureSample(tex, samp, v.uv) * v.color;
}
`;

export interface Tex { tex: GPUTexture; bind: GPUBindGroup; w: number; h: number }

const FLOATS = 12;
const MAX = 16384;

export class Renderer {
  device!: GPUDevice;
  ctx!: GPUCanvasContext;
  pipeline!: GPURenderPipeline;
  viewBuf!: GPUBuffer;
  viewBind!: GPUBindGroup;
  sampler!: GPUSampler;
  inst!: GPUBuffer;
  data = new Float32Array(MAX * FLOATS);
  count = 0;
  batches: { tex: Tex; start: number; n: number }[] = [];
  white!: Tex;
  width = 1;
  height = 1;
  scale = 1;
  clear = { r: 0.6, g: 0.8, b: 1, a: 1 };

  // Orillusion 3D Engine objects
  scene!: Scene3D;
  view!: View3D;
  camera!: Camera3D;

  constructor(public canvas: HTMLCanvasElement) {}

  async init() {
    if (!navigator.gpu) throw new Error("This browser does not support WebGPU.");

    // Explicitly lock canvas style to full viewport before Orillusion init to prevent 300x150 fallback
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "0";
    this.canvas.style.left = "0";
    this.canvas.style.width = "100vw";
    this.canvas.style.height = "100vh";
    this.canvas.style.display = "block";
    this.resize();

    // Initialize Orillusion WebGPU Engine per https://www.orillusion.com/en/guide/
    try {
      const engine = await Engine3D.init({
        canvasConfig: {
          canvas: this.canvas,
          devicePixelRatio: Math.min(2, window.devicePixelRatio || 1),
        },
      });

      this.scene = new Scene3D();
      const camObj = new Object3D();
      this.camera = camObj.addComponent(Camera3D);
      this.camera.orthoOffCenter(0, this.width, this.height, 0, -1000, 1000);
      this.scene.addChild(camObj);

      this.view = new View3D();
      this.view.scene = this.scene;
      this.view.camera = this.camera;

      this.device = engine?.context3D?.device;
      this.ctx = engine?.context3D?.context ?? (this.canvas.getContext("webgpu") as GPUCanvasContext);
    } catch {
      // Fallback direct WebGPU initialization if Orillusion headlessly mocked
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter available.");
      this.device = await adapter.requestDevice();
      this.ctx = this.canvas.getContext("webgpu") as GPUCanvasContext;
      const format = navigator.gpu.getPreferredCanvasFormat();
      this.ctx.configure({ device: this.device, format, alphaMode: "opaque" });
    }

    // Enforce full viewport dimensions
    this.canvas.style.width = "100vw";
    this.canvas.style.height = "100vh";
    this.resize();
    window.addEventListener("resize", () => {
      this.resize();
      if (this.camera) {
        this.camera.orthoOffCenter(0, this.width, this.height, 0, -1000, 1000);
      }
    });

    if (!this.device) {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("No WebGPU adapter available.");
      this.device = await adapter.requestDevice();
    }
    if (!this.ctx) {
      this.ctx = this.canvas.getContext("webgpu") as GPUCanvasContext;
      const format = navigator.gpu.getPreferredCanvasFormat();
      this.ctx.configure({ device: this.device, format, alphaMode: "opaque" });
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    const module = this.device.createShaderModule({ code: SHADER });
    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module, entryPoint: "vs",
        buffers: [{
          arrayStride: FLOATS * 4, stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x4" },
            { shaderLocation: 1, offset: 16, format: "float32x4" },
            { shaderLocation: 2, offset: 32, format: "float32x4" },
          ],
        }],
      },
      fragment: {
        module, entryPoint: "fs",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.viewBuf = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.viewBind = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.viewBuf } }] });
    this.sampler = this.device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    this.inst = this.device.createBuffer({ size: this.data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    const px = new OffscreenCanvas(1, 1);
    const c = px.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 1, 1);
    this.white = this.texture(await createImageBitmap(px));
  }

  texture(bmp: ImageBitmap): Tex {
    const tex = this.device.createTexture({
      size: [bmp.width, bmp.height], format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex, premultipliedAlpha: true }, [bmp.width, bmp.height]);
    const bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: this.sampler }, { binding: 1, resource: tex.createView() }],
    });
    return { tex, bind, w: bmp.width, h: bmp.height };
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.ceil(innerWidth * dpr), h = Math.ceil(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.scale = dpr;
    this.width = innerWidth;
    this.height = innerHeight;
  }

  begin() {
    this.count = 0;
    this.batches.length = 0;
  }

  /** Draw a texture region at logical (CSS-pixel) coordinates. */
  draw(t: Tex, x: number, y: number, w = t.w, h = t.h, opts?: { flip?: boolean; alpha?: number; tint?: [number, number, number]; sx?: number; sy?: number; sw?: number; sh?: number }) {
    if (this.count >= MAX) return;
    if (x > this.width || y > this.height || x + w < 0 || y + h < 0) return;
    const a = opts?.alpha ?? 1;
    const tint = opts?.tint ?? [1, 1, 1];
    const sx = opts?.sx ?? 0, sy = opts?.sy ?? 0, sw = opts?.sw ?? t.w, sh = opts?.sh ?? t.h;
    let u0 = sx / t.w, u1 = (sx + sw) / t.w;
    if (opts?.flip) [u0, u1] = [u1, u0];
    const s = this.scale;
    const o = this.count * FLOATS;
    const d = this.data;
    d[o] = Math.round(x * s); d[o + 1] = Math.round(y * s); d[o + 2] = Math.round(w * s); d[o + 3] = Math.round(h * s);
    d[o + 4] = u0; d[o + 5] = sy / t.h; d[o + 6] = u1; d[o + 7] = (sy + sh) / t.h;
    d[o + 8] = tint[0] * a; d[o + 9] = tint[1] * a; d[o + 10] = tint[2] * a; d[o + 11] = a;
    const last = this.batches[this.batches.length - 1];
    if (last && last.tex === t) last.n++;
    else this.batches.push({ tex: t, start: this.count, n: 1 });
    this.count++;
  }

  rect(x: number, y: number, w: number, h: number, color: [number, number, number, number]) {
    this.draw(this.white, x, y, w, h, { tint: [color[0], color[1], color[2]], alpha: color[3] });
  }

  end() {
    const q = this.device.queue;
    q.writeBuffer(this.viewBuf, 0, new Float32Array([this.canvas.width, this.canvas.height, 0, 0]));
    q.writeBuffer(this.inst, 0, this.data, 0, this.count * FLOATS);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: "clear", storeOp: "store", clearValue: this.clear }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.viewBind);
    pass.setVertexBuffer(0, this.inst);
    for (const b of this.batches) {
      pass.setBindGroup(1, b.tex.bind);
      pass.draw(6, b.n, 0, b.start);
    }
    pass.end();
    q.submit([enc.finish()]);
  }
}
