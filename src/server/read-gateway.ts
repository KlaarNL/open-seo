import { WorkerEntrypoint } from "cloudflare:workers";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withPgClient } from "@/db";
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import type { ToolContext } from "@/server/mcp/context";
import { objectSchema } from "@/server/mcp/output-schemas";
import type { OpenSeoToolDefinition, ToolSchema } from "@/server/mcp/server";
import { getBacklinksOverviewTool } from "@/server/mcp/tools/get-backlinks-overview";
import { getBacklinksProfileTool } from "@/server/mcp/tools/get-backlinks-profile";
import { getDomainKeywordSuggestionsTool } from "@/server/mcp/tools/get-domain-keyword-suggestions";
import { getDomainOverviewTool } from "@/server/mcp/tools/get-domain-overview";
import { estimateRankTrackerCostTool } from "@/server/mcp/tools/estimate-rank-tracker-cost";
import { getRankTrackerTool } from "@/server/mcp/tools/get-rank-tracker";
import { getSerpResultsTool } from "@/server/mcp/tools/get-serp-results";
import {
  getGoogleAnalyticsAudienceBreakdownTool,
  getGoogleAnalyticsEcommercePerformanceTool,
  getGoogleAnalyticsKeyEventsTool,
  getGoogleAnalyticsMeasurementHealthTool,
  getGoogleAnalyticsOrganicLandingPagesTool,
  getGoogleAnalyticsOrganicOverviewTool,
  getGoogleAnalyticsPagePerformanceTool,
  getGoogleAnalyticsSiteSearchTool,
  getGoogleAnalyticsTrafficAcquisitionTool,
  getSearchOpportunitiesTool,
} from "@/server/mcp/tools/google-analytics-tools";
import { listSavedKeywordsTool } from "@/server/mcp/tools/list-saved-keywords";
import {
  findSerpCompetitorsTool,
  getGoogleBusinessQuestionsTool,
  getKeywordMetricsTool,
  getLocalSerpResultsTool,
  getRankedKeywordsTool,
  searchLocalBusinessesTool,
} from "@/server/mcp/tools/dataforseo-research-tools";
import {
  getBusinessProfileTool,
  getBusinessReviewsTool,
  getBusinessUpdatesTool,
  getLocalRankGridTool,
  listBusinessCategoriesTool,
} from "@/server/mcp/tools/local-seo-tools";
import { researchKeywordsTool } from "@/server/mcp/tools/research-keywords";
import {
  getSearchConsolePerformanceTool,
  inspectUrlsTool,
} from "@/server/mcp/tools/search-console-tools";
import {
  getAuditIssuesTool,
  getAuditPagesTool,
  getAuditStatusTool,
} from "@/server/mcp/tools/site-audit-tools";
import { getProjectContextTool } from "@/server/mcp/tools/project-context";

const GATEWAY_VERSION = "1.0.0";
const SERVICE_PRINCIPAL_ID = "service:klaarnl-content-read";
const SERVICE_PRINCIPAL_EMAIL = "content-read@service.klaarnl.invalid";
const DASHBOARD_BASE_URL = "https://open-seo-selfhost.klaarnlapp.workers.dev";

const accessClassSchema = z.enum([
  "stored_read",
  "connected_read",
  "paid_provider_read",
]);
type AccessClass = z.infer<typeof accessClassSchema>;

const querySchema = z.strictObject({
  capabilityId: z.string().min(1).max(100),
  arguments: z.record(z.string(), z.unknown()).default({}),
  allowProviderSpend: z.boolean().default(false),
});

const profileSchema = z.strictObject({
  profileId: z.literal("content-opportunity-v1"),
  input: z.strictObject({ keyword: z.string().min(1).max(200) }),
});

type GatewayTool = {
  id: string;
  title: string;
  description: string;
  accessClass: AccessClass;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  invoke: (args: unknown, context: ToolContext) => Promise<CallToolResult>;
};

function expose<Input extends ToolSchema>(
  tool: OpenSeoToolDefinition<Input>,
  accessClass: AccessClass,
): GatewayTool {
  const inputSchema = objectSchema(tool.config.inputSchema);
  const outputSchema =
    objectSchema(tool.config.outputSchema) ?? z.object({}).passthrough();
  return {
    id: tool.name,
    title: tool.config.title ?? tool.name,
    description: tool.config.description ?? "",
    accessClass,
    inputSchema,
    outputSchema,
    async invoke(args, context) {
      const parsed = inputSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(`Invalid ${tool.name} input: ${parsed.error.message}`);
      }
      return tool.handler(
        // The input was validated against this tool's own schema above.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Zod erased the generic while normalizing raw shapes and full object schemas
        parsed.data as never,
        context,
      );
    },
  };
}

const CAPABILITIES = [
  expose(getProjectContextTool, "stored_read"),
  expose(listSavedKeywordsTool, "stored_read"),
  expose(getRankTrackerTool, "stored_read"),
  expose(estimateRankTrackerCostTool, "stored_read"),
  expose(getAuditStatusTool, "stored_read"),
  expose(getAuditIssuesTool, "stored_read"),
  expose(getAuditPagesTool, "stored_read"),
  expose(getSearchConsolePerformanceTool, "connected_read"),
  expose(inspectUrlsTool, "connected_read"),
  expose(getGoogleAnalyticsOrganicLandingPagesTool, "connected_read"),
  expose(getGoogleAnalyticsPagePerformanceTool, "connected_read"),
  expose(getGoogleAnalyticsKeyEventsTool, "connected_read"),
  expose(getSearchOpportunitiesTool, "connected_read"),
  expose(getGoogleAnalyticsOrganicOverviewTool, "connected_read"),
  expose(getGoogleAnalyticsTrafficAcquisitionTool, "connected_read"),
  expose(getGoogleAnalyticsMeasurementHealthTool, "connected_read"),
  expose(getGoogleAnalyticsEcommercePerformanceTool, "connected_read"),
  expose(getGoogleAnalyticsSiteSearchTool, "connected_read"),
  expose(getGoogleAnalyticsAudienceBreakdownTool, "connected_read"),
  expose(researchKeywordsTool, "paid_provider_read"),
  expose(getDomainOverviewTool, "paid_provider_read"),
  expose(getDomainKeywordSuggestionsTool, "paid_provider_read"),
  expose(getBacklinksOverviewTool, "paid_provider_read"),
  expose(getBacklinksProfileTool, "paid_provider_read"),
  expose(getSerpResultsTool, "paid_provider_read"),
  expose(getRankedKeywordsTool, "paid_provider_read"),
  expose(findSerpCompetitorsTool, "paid_provider_read"),
  expose(searchLocalBusinessesTool, "paid_provider_read"),
  expose(getLocalSerpResultsTool, "paid_provider_read"),
  expose(getGoogleBusinessQuestionsTool, "paid_provider_read"),
  expose(getBusinessProfileTool, "paid_provider_read"),
  expose(getBusinessReviewsTool, "paid_provider_read"),
  expose(getBusinessUpdatesTool, "paid_provider_read"),
  expose(listBusinessCategoriesTool, "paid_provider_read"),
  expose(getLocalRankGridTool, "paid_provider_read"),
  expose(getKeywordMetricsTool, "paid_provider_read"),
] as const;

const capabilitiesById = new Map(
  CAPABILITIES.map((capability) => [capability.id, capability]),
);

function resolveCapabilityRequest(input: unknown) {
  const request = querySchema.safeParse(input);
  if (!request.success) {
    throw new Error(`Invalid OpenSEO read request: ${request.error.message}`);
  }
  const capability = capabilitiesById.get(request.data.capabilityId);
  if (!capability) {
    throw new Error("Unknown OpenSEO read capability.");
  }
  if (
    capability.accessClass === "paid_provider_read" &&
    !request.data.allowProviderSpend
  ) {
    throw new Error("Paid provider read requires explicit admission.");
  }
  return { capability, request: request.data };
}

export function validateReadGatewayRequest(input: unknown) {
  const { capability, request } = resolveCapabilityRequest(input);
  return {
    capabilityId: capability.id,
    accessClass: capability.accessClass,
    allowProviderSpend: request.allowProviderSpend,
  };
}

export function describeReadGateway() {
  return {
    gatewayVersion: GATEWAY_VERSION,
    scope: "openseo:read",
    projectScoped: true,
    capabilities: CAPABILITIES.map((capability) => ({
      id: capability.id,
      title: capability.title,
      description: capability.description,
      accessClass: capability.accessClass,
      requiresExplicitProviderSpend:
        capability.accessClass === "paid_provider_read",
      inputSchema: z.toJSONSchema(capability.inputSchema, {
        unrepresentable: "any",
      }),
    })),
    profiles: [
      {
        id: "content-opportunity-v1",
        description:
          "Saved keyword and Search Console evidence for content opportunity and cannibalization decisions.",
      },
    ],
  };
}

type GatewayContext = {
  projectId: string;
  toolContext: ToolContext;
};

async function resolveContext(env: Cloudflare.Env): Promise<GatewayContext> {
  const projectId = env.OPEN_SEO_READ_PROJECT_ID?.trim();
  if (!projectId) {
    throw new Error("OpenSEO read gateway is not configured.");
  }
  const project = await ProjectRepository.getProjectById(projectId);
  if (!project) {
    throw new Error("OpenSEO read gateway project is unavailable.");
  }
  return {
    projectId,
    toolContext: {
      auth: {
        userId: SERVICE_PRINCIPAL_ID,
        userEmail: SERVICE_PRINCIPAL_EMAIL,
        organizationId: project.organizationId,
        // Self-host/delegated modes carry one implicit owner per org, and
        // the gateway is pinned to the configured project's organization.
        role: "owner",
        orgScope: "pinned",
        scopes: ["openseo:read"],
        clientId: "cloudflare-service-binding",
        baseUrl: DASHBOARD_BASE_URL,
      },
    },
  };
}

async function invokeCapability(
  env: Cloudflare.Env,
  input: unknown,
): Promise<Record<string, unknown>> {
  const { capability, request } = resolveCapabilityRequest(input);

  const { projectId, toolContext } = await resolveContext(env);
  const suppliedProjectId = request.arguments.projectId;
  if (suppliedProjectId !== undefined && suppliedProjectId !== projectId) {
    throw new Error("OpenSEO read capability is scoped to one project.");
  }
  const result = await capability.invoke(
    { ...request.arguments, projectId },
    toolContext,
  );
  if (result.isError) {
    throw new Error("OpenSEO read capability failed.");
  }
  const output = capability.outputSchema.safeParse(
    result.structuredContent ?? {},
  );
  if (!output.success) {
    throw new Error(`Invalid ${capability.id} output: ${output.error.message}`);
  }
  console.log("[read-gateway] capability completed", {
    capabilityId: capability.id,
    accessClass: capability.accessClass,
    projectId,
    principal: SERVICE_PRINCIPAL_ID,
  });
  return {
    capabilityId: capability.id,
    accessClass: capability.accessClass,
    data: output.data,
    meta: result._meta ?? null,
    text: result.content.find((item) => item.type === "text")?.text ?? null,
  };
}

export class OpenSeoReadGateway extends WorkerEntrypoint {
  describe() {
    return describeReadGateway();
  }

  query(input: unknown) {
    return withPgClient(() => invokeCapability(this.env, input));
  }

  profile(input: unknown) {
    return withPgClient(async () => {
      const request = profileSchema.safeParse(input);
      if (!request.success) {
        throw new Error(
          `Invalid OpenSEO read profile request: ${request.error.message}`,
        );
      }
      const keyword = request.data.input.keyword;
      const [keywords, searchConsole] = await Promise.all([
        invokeCapability(this.env, {
          capabilityId: "list_saved_keywords",
          arguments: { search: keyword, limit: 100 },
        }),
        invokeCapability(this.env, {
          capabilityId: "get_search_console_performance",
          arguments: {
            dimensions: ["query", "page"],
            dateRange: "last_28_days",
            rowLimit: 250,
            startRow: 0,
            type: "web",
            dataState: "final",
          },
        }),
      ]);
      return {
        gatewayVersion: GATEWAY_VERSION,
        profileId: request.data.profileId,
        generatedAt: new Date().toISOString(),
        keyword,
        keywords,
        searchConsole,
      };
    });
  }
}
