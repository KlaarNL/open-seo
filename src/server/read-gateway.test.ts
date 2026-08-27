import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: vi.fn(),
  DurableObject: class {
    readonly mocked = true;
  },
  WorkflowEntrypoint: class {
    readonly mocked = true;
  },
  WorkerEntrypoint: class<Env> {
    protected env: Env;
    constructor(_ctx: ExecutionContext, env: Env) {
      this.env = env;
    }
  },
}));

vi.mock("@/db", () => ({
  withPgClient: (task: () => Promise<unknown>) => task(),
  db: {},
}));

vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {
    getProjectById: vi.fn(),
  },
}));

import {
  describeReadGateway,
  validateReadGatewayRequest,
} from "@/server/read-gateway";

describe("OpenSeoReadGateway", () => {
  it("discovers every classified read capability through one stable scope", () => {
    const description = describeReadGateway();
    expect(description).toMatchObject({
      gatewayVersion: "1.0.0",
      scope: "openseo:read",
      projectScoped: true,
    });
    expect(description.capabilities).toHaveLength(36);
    expect(description.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "list_saved_keywords",
          accessClass: "stored_read",
          requiresExplicitProviderSpend: false,
        }),
        expect.objectContaining({
          id: "get_search_console_performance",
          accessClass: "connected_read",
          requiresExplicitProviderSpend: false,
        }),
        expect.objectContaining({
          id: "research_keywords",
          accessClass: "paid_provider_read",
          requiresExplicitProviderSpend: true,
        }),
      ]),
    );
    expect(
      description.capabilities.every(
        (capability) => capability.inputSchema.type === "object",
      ),
    ).toBe(true);
  });

  it("does not expose writes, admin actions, or provider acquisition by default", () => {
    const description = describeReadGateway();
    const ids = new Set(description.capabilities.map(({ id }) => id));
    expect(ids).not.toContain("save_keywords");
    expect(ids).not.toContain("update_project_context");
    expect(ids).not.toContain("create_rank_tracker");
    expect(ids).not.toContain("run_site_audit");

    expect(() =>
      validateReadGatewayRequest({
        capabilityId: "research_keywords",
        arguments: { seeds: ["inburgering"] },
      }),
    ).toThrow("requires explicit admission");
  });

  it("fails closed for unknown capabilities", () => {
    expect(() =>
      validateReadGatewayRequest({
        capabilityId: "delete_everything",
        arguments: {},
      }),
    ).toThrow("Unknown OpenSEO read capability");
  });
});
