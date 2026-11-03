import type { PassContext, RenderPass } from "@place-it/core";

/** Runs passes in insertion order; a pass that throws is reported and skipped so later passes still run. */
export class PassPipeline {
  private readonly passes: RenderPass[] = [];
  constructor(private readonly onError: (error: unknown, pass: RenderPass) => void = (e, p) => console.error(`render pass "${p.name}" failed`, e)) {}
  add(pass: RenderPass): void {
    this.passes.push(pass);
  }
  run(ctx: PassContext): void {
    for (const pass of this.passes) {
      try {
        pass.apply(ctx);
      } catch (e) {
        this.onError(e, pass);
      }
    }
  }
}

/** Example pass that changes nothing. */
export class IdentityPass implements RenderPass {
  readonly name = "identity";
  apply(_ctx: PassContext): void {}
}
