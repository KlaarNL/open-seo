import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  // Production-like self-host config: runtime-env reads Google OAuth settings
  // from this record, so the Search Console tool takes its configured path.
  workersEnv: {
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    BETTER_AUTH_SECRET: "x".repeat(32),
  },
  getProjectById: vi.fn(),
  getProjectForOrganization: vi.fn(),
  getSavedKeywords: vi.fn(),
  getPerformance: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: mocks.workersEnv,
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

// The fakes below sit at the same upstream service seams the upstream MCP tool
// tests fake (saved-keywords-tools.test.ts, search-console-tools.test.ts), so
// an upstream refactor of these paths surfaces there too.
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: { getProjectById: mocks.getProjectById },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
// project-auth imports the repository for user-scoped credentials; unused for
// the pinned principal but keeps the db out of the module graph.
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getMembership: vi.fn() },
}));
vi.mock("@/server/features/keywords/services/KeywordResearchService", () => ({
  KeywordResearchService: { getSavedKeywords: mocks.getSavedKeywords },
}));
vi.mock("@/server/features/gsc/services/GscService", () => ({
  GscService: { getPerformance: mocks.getPerformance },
}));

import { OpenSeoReadGateway } from "@/server/read-gateway";

function createGateway(env: Record<string, string> = {}) {
  // The WorkerEntrypoint mock only records env; ExecutionContext is unused.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- test double for the Workers runtime context
  return new OpenSeoReadGateway({} as ExecutionContext, env as never);
}

const pinnedEnv = { OPEN_SEO_READ_PROJECT_ID: "p_pinned" };

describe("OpenSeoReadGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectById.mockResolvedValue({
      id: "p_pinned",
      organizationId: "org_k",
    });
    mocks.getProjectForOrganization.mockResolvedValue({
      id: "p_pinned",
      locationCode: 2528,
      languageCode: "nl",
    });
    mocks.getSavedKeywords.mockResolvedValue({
      rows: [],
      totalCount: 0,
      tags: [],
    });
    mocks.getPerformance.mockResolvedValue({
      siteUrl: "https://klaarnl.com/",
      connectedBy: "ops@klaarnl.com",
      request: { dimensions: ["query", "page"], startRow: 0, rowLimit: 250 },
      rows: [],
    });
  });

  describe("describe()", () => {
    const description = createGateway().describe();

    it("publishes the openseo:read catalogue the content factory binds to", () => {
      expect(description).toMatchObject({
        scope: "openseo:read",
        projectScoped: true,
      });
      expect(description.gatewayVersion).toMatch(/^\d+\.\d+\.\d+$/);
      expect(description.profiles).toEqual([
        expect.objectContaining({ id: "content-opportunity-v1" }),
      ]);
      for (const capability of description.capabilities) {
        expect(capability.inputSchema.type).toBe("object");
        expect(capability.title).toEqual(expect.any(String));
        expect(capability.description).toEqual(expect.any(String));
      }
      // The factory calls these three with provider spend off and rejects paid
      // receipts, so their classes are the consumer contract.
      expect(description.capabilities).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "get_project_context",
            accessClass: "stored_read",
            requiresExplicitProviderSpend: false,
          }),
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
    });

    it("exposes only read verbs, so a new write tool must be classified deliberately", () => {
      const ids = description.capabilities.map(({ id }) => id);
      expect(
        ids.filter(
          (id) =>
            !/^(get|list|estimate|inspect|research|find|search)_/.test(id),
        ),
      ).toEqual([]);
    });
  });

  describe("query() admission", () => {
    it.each([
      {
        name: "unknown capability",
        request: { capabilityId: "delete_everything", arguments: {} },
        error: "Unknown OpenSEO read capability.",
      },
      {
        name: "paid provider read without admission",
        request: {
          capabilityId: "research_keywords",
          arguments: { seeds: [{ seed: "inburgering" }] },
        },
        error: "Paid provider read requires explicit admission.",
      },
      {
        name: "foreign project id",
        request: {
          capabilityId: "list_saved_keywords",
          arguments: { projectId: "other" },
        },
        error: "scoped to one project",
      },
    ])("rejects $name before any tool runs", async ({ request, error }) => {
      await expect(createGateway(pinnedEnv).query(request)).rejects.toThrow(
        error,
      );
      // Every exposed tool enters upstream project auth before its service
      // call, so this proves no tool was dispatched for any row.
      expect(mocks.getProjectForOrganization).not.toHaveBeenCalled();
    });

    it("admits a paid read once spend is allowed", async () => {
      const request = {
        capabilityId: "research_keywords",
        arguments: { seeds: [{ seed: "inburgering" }] },
      };
      // Env has no pinned project: getting past admission surfaces the
      // configuration error instead of the admission error.
      await expect(createGateway().query(request)).rejects.toThrow(
        "Paid provider read requires explicit admission.",
      );
      await expect(
        createGateway().query({ ...request, allowProviderSpend: true }),
      ).rejects.toThrow("OpenSEO read gateway is not configured.");
    });
  });

  describe("profile()", () => {
    it("serves content-opportunity-v1 from the pinned project through stored and connected reads", async () => {
      const result = await createGateway(pinnedEnv).profile({
        profileId: "content-opportunity-v1",
        input: { keyword: "inburgeringsexamen" },
      });

      // The factory parses this with a strict object: an extra key breaks it.
      expect(new Set(Object.keys(result))).toEqual(
        new Set([
          "gatewayVersion",
          "generatedAt",
          "keyword",
          "keywords",
          "profileId",
          "searchConsole",
        ]),
      );
      // Each read is the same receipt query() returns to the factory.
      expect(result.keywords).toMatchObject({
        capabilityId: "list_saved_keywords",
        accessClass: "stored_read",
      });
      expect(result.searchConsole).toMatchObject({
        capabilityId: "get_search_console_performance",
        accessClass: "connected_read",
      });
      expect(result.keywords.data).toEqual(expect.any(Object));
      expect(result.searchConsole.data).toEqual(expect.any(Object));
      expect(mocks.getProjectForOrganization).toHaveBeenCalledWith(
        "org_k",
        "p_pinned",
      );
      expect(mocks.getSavedKeywords).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "p_pinned",
          search: "inburgeringsexamen",
        }),
      );
      expect(mocks.getPerformance).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: "p_pinned" }),
      );
    });
  });
});
