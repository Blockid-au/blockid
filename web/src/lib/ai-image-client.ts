/**
 * AI Image Generation Client — Multi-provider image generation for reports.
 *
 * Priority chain (ưu tiên free → cheap → paid):
 *   1. Gemini Flash Image (free via Google API key) — best free option
 *   2. OpenRouter Image Models (free/cheap) — Gemini, GPT-Image, Grok
 *   3. OpenAI DALL-E / GPT-Image (via Codex OAuth or API key)
 *   4. Mermaid SVG (local, no API) — for flowcharts, org charts, timelines
 *   5. Built-in SVG renderers (local, no API) — for radar, bar, funnel charts
 *
 * Used by the report pipeline to generate:
 *   - Infographics (AI-generated images with data visualization)
 *   - Flowcharts and org charts (Mermaid → SVG)
 *   - Data charts (built-in SVG renderers)
 *   - Market maps and competitive positioning diagrams
 */

import "server-only";

// ── Types ───────────────────────────────────────────────────────────────────

export type ImageProvider = "gemini" | "openrouter" | "openai" | "mermaid" | "svg";

export interface ImageGenerationRequest {
  prompt: string;
  style?: "infographic" | "chart" | "diagram" | "illustration" | "photo_realistic";
  width?: number;
  height?: number;
  /** If provided, use Mermaid rendering instead of AI */
  mermaidCode?: string;
  /** If provided, use built-in SVG renderer */
  svgType?: "radar" | "bar" | "funnel" | "progress" | "pie" | "line" | "heat_map";
  svgData?: Record<string, unknown>;
}

export interface ImageGenerationResult {
  provider: ImageProvider;
  model: string;
  /** Base64-encoded image data */
  base64: string;
  /** MIME type */
  mimeType: "image/png" | "image/svg+xml" | "image/jpeg" | "image/webp";
  /** Image dimensions */
  width: number;
  height: number;
  /** Cost in USD (0 for free) */
  costUSD: number;
}

// ── Provider: Gemini Flash Image (FREE) ─────────────────────────────────────

async function callGeminiImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini API key not configured");

  // Gemini 2.5 Flash supports image generation via generateContent
  const model = "gemini-2.5-flash-preview-image-generation";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const styleGuide = getStyleGuide(req.style);
  const fullPrompt = `${styleGuide}\n\n${req.prompt}\n\nGenerate a professional, clean image suitable for a business report. Use BlockID brand colors: blue (#2563eb), green (#10b981), amber (#f59e0b). White background.`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        responseMimeType: "text/plain",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Image ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts ?? [];

  // Find image part in response
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      return {
        provider: "gemini",
        model,
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType as ImageGenerationResult["mimeType"],
        width: req.width ?? 800,
        height: req.height ?? 600,
        costUSD: 0, // Free with Gemini API key
      };
    }
  }

  throw new Error("Gemini did not return an image");
}

// ── Provider: OpenRouter Image Models ───────────────────────────────────────

async function callOpenRouterImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  // Image generation models on OpenRouter, ordered by cost (free → cheap)
  const IMAGE_MODELS = [
    { id: "google/gemini-2.5-flash-preview-image-generation", cost: 0 },
    { id: "google/gemini-3.1-flash-image-preview", cost: 0.0001 },
    { id: "x-ai/grok-imagine-image-quality", cost: 0.05 },
    { id: "openai/gpt-4o", cost: 0.04 },
  ];

  const styleGuide = getStyleGuide(req.style);
  const fullPrompt = `${styleGuide}\n\n${req.prompt}\n\nProfessional report visual. Brand colors: blue #2563eb, green #10b981. Clean white background. No text watermarks.`;

  let lastErr: Error | null = null;

  for (const model of IMAGE_MODELS) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://blockid.au",
          "X-Title": "BlockID.au Report Generator",
        },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: "user", content: fullPrompt }],
          // For image generation models, response includes image data
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
      const data = await res.json();

      // Extract image from response (varies by model)
      const content = data.choices?.[0]?.message?.content ?? "";

      // Check if response contains base64 image data
      const imageMatch = content.match(/data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/);
      if (imageMatch) {
        return {
          provider: "openrouter",
          model: model.id,
          base64: imageMatch[2],
          mimeType: `image/${imageMatch[1]}` as ImageGenerationResult["mimeType"],
          width: req.width ?? 800,
          height: req.height ?? 600,
          costUSD: model.cost,
        };
      }

      // Some models return image URL instead
      const urlMatch = content.match(/https?:\/\/[^\s"]+\.(png|jpg|jpeg|webp)/i);
      if (urlMatch) {
        const imgRes = await fetch(urlMatch[0], { signal: AbortSignal.timeout(15_000) });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          return {
            provider: "openrouter",
            model: model.id,
            base64: buffer.toString("base64"),
            mimeType: "image/png",
            width: req.width ?? 800,
            height: req.height ?? 600,
            costUSD: model.cost,
          };
        }
      }

      throw new Error("No image in response");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-image] OpenRouter ${model.id} failed: ${lastErr.message}`);
    }
  }

  throw lastErr ?? new Error("All OpenRouter image models failed");
}

// ── Provider: OpenAI DALL-E / GPT-Image ─────────────────────────────────────

async function callOpenAIImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured");

  const model = "gpt-image-1";
  const styleGuide = getStyleGuide(req.style);

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: `${styleGuide}\n\n${req.prompt}\n\nProfessional report infographic. Clean design, white background, blue (#2563eb) and green (#10b981) colors.`,
      n: 1,
      size: `${req.width ?? 1024}x${req.height ?? 1024}`,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI Image ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const imageData = data.data?.[0]?.b64_json;
  if (!imageData) throw new Error("OpenAI did not return image data");

  return {
    provider: "openai",
    model,
    base64: imageData,
    mimeType: "image/png",
    width: req.width ?? 1024,
    height: req.height ?? 1024,
    costUSD: 0.04, // ~$0.04 per standard image
  };
}

// ── Provider: Mermaid Diagrams (LOCAL, FREE) ────────────────────────────────

async function renderMermaidDiagram(mermaidCode: string): Promise<ImageGenerationResult> {
  // Use beautiful-mermaid for server-side rendering (no DOM needed)
  // Falls back to returning raw SVG string if library not available
  try {
    // @ts-expect-error — beautiful-mermaid may not be installed
    const { render } = await import(/* webpackIgnore: true */ "beautiful-mermaid");
    const svg = render(mermaidCode);
    const base64 = Buffer.from(svg).toString("base64");
    return {
      provider: "mermaid",
      model: "beautiful-mermaid",
      base64,
      mimeType: "image/svg+xml",
      width: 800,
      height: 600,
      costUSD: 0,
    };
  } catch {
    // Fallback: return the Mermaid code wrapped in a basic SVG
    const escapedCode = mermaidCode.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">
      <rect width="800" height="400" fill="#f9fafb" rx="8"/>
      <text x="400" y="30" text-anchor="middle" font-family="Arial" font-size="14" fill="#374151" font-weight="bold">Diagram (Mermaid)</text>
      <foreignObject x="20" y="50" width="760" height="330">
        <pre xmlns="http://www.w3.org/1999/xhtml" style="font-size:11px;color:#374151;white-space:pre-wrap">${escapedCode}</pre>
      </foreignObject>
    </svg>`;
    return {
      provider: "mermaid",
      model: "fallback-svg",
      base64: Buffer.from(svg).toString("base64"),
      mimeType: "image/svg+xml",
      width: 800,
      height: 400,
      costUSD: 0,
    };
  }
}

// ── Mermaid Code Generators per Chart Type ───────────────────────────────────

export function generateMermaidOrgChart(data: Record<string, unknown>): string {
  const roles = (data.roles as string[]) ?? ["CEO", "CTO", "CFO", "COO"];
  let mermaid = "graph TD\n";
  if (roles.length > 0) {
    mermaid += `  CEO["${roles[0] ?? "CEO"}"]\n`;
    for (let i = 1; i < roles.length; i++) {
      mermaid += `  CEO --> R${i}["${roles[i]}"]\n`;
    }
  }
  return mermaid;
}

export function generateMermaidTimeline(milestones: string[]): string {
  let mermaid = "gantt\n  title Product Roadmap\n  dateFormat YYYY-MM-DD\n  section Milestones\n";
  const today = new Date();
  for (let i = 0; i < milestones.length && i < 8; i++) {
    const start = new Date(today.getTime() + i * 30 * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().slice(0, 10);
    mermaid += `  ${milestones[i].slice(0, 40)} :m${i}, ${startStr}, 30d\n`;
  }
  return mermaid;
}

export function generateMermaidFlowDiagram(steps: string[]): string {
  let mermaid = "graph LR\n";
  for (let i = 0; i < steps.length; i++) {
    const id = `S${i}`;
    const label = steps[i].slice(0, 30);
    mermaid += `  ${id}["${label}"]\n`;
    if (i > 0) mermaid += `  S${i - 1} --> ${id}\n`;
  }
  return mermaid;
}

// ── Style Guides for AI Image Prompts ───────────────────────────────────────

function getStyleGuide(style?: string): string {
  switch (style) {
    case "infographic":
      return "Create a professional business infographic with clean icons, data points, and visual hierarchy. Use flat design, sans-serif typography, and a modern corporate style.";
    case "chart":
      return "Create a clean, professional data visualization chart. Use clear axis labels, legends, and data annotations. Minimalist design with good contrast.";
    case "diagram":
      return "Create a clear technical/business diagram with labeled boxes, arrows, and connections. Use rounded rectangles, clean lines, and professional colors.";
    case "illustration":
      return "Create a modern business illustration in flat design style. Simple shapes, professional colors, clean lines, minimal detail.";
    case "photo_realistic":
      return "Create a photorealistic business scene with professional lighting and composition.";
    default:
      return "Create a professional, clean visual suitable for a startup valuation report.";
  }
}

// ── AI-Generated Infographic Prompts per Report Section ─────────────────────

export const SECTION_IMAGE_PROMPTS: Record<string, {
  prompt: string;
  style: ImageGenerationRequest["style"];
  mermaidType?: "org_chart" | "timeline" | "flow";
}> = {
  executive: {
    prompt: "Startup evaluation dashboard showing 8 dimension scores as a radar/spider chart with scores from 0-100. Include stage indicator and overall SVI score prominently displayed. Professional investor report style.",
    style: "infographic",
  },
  market: {
    prompt: "Market opportunity infographic showing TAM/SAM/SOM as nested circles/funnel. Include competitive landscape positioning as a 2x2 matrix. Market timing indicator. Professional startup pitch style.",
    style: "infographic",
  },
  founder: {
    prompt: "Founder team assessment visual showing team composition, skills coverage matrix, and experience timeline. Include strength/gap indicators. Clean corporate style.",
    style: "infographic",
  },
  code: {
    prompt: "Technical maturity dashboard showing code quality metrics, security score, architecture diagram overview, and DevOps maturity level. Developer-focused clean design.",
    style: "chart",
  },
  website: {
    prompt: "Digital presence scorecard showing website performance metrics (speed, SEO, mobile), social media reach indicators, and conversion funnel visualization.",
    style: "infographic",
  },
  customers: {
    prompt: "Customer traction dashboard with growth curve, engagement metrics (DAU/MAU), retention cohort heatmap, and acquisition funnel with conversion rates at each stage.",
    style: "chart",
  },
  gtm: {
    prompt: "Go-to-market strategy visual showing distribution channels as a flow diagram, pricing model comparison, and customer acquisition funnel with channel attribution.",
    style: "diagram",
  },
  revenue: {
    prompt: "Revenue analytics infographic showing MRR/ARR trend, 3-scenario projection (bear/base/bull), unit economics breakdown (LTV, CAC, margins), and path to profitability timeline.",
    style: "chart",
  },
  org: {
    prompt: "",
    style: "diagram",
    mermaidType: "org_chart",
  },
  roadmap: {
    prompt: "",
    style: "diagram",
    mermaidType: "timeline",
  },
  risk: {
    prompt: "Risk assessment heatmap with probability (x-axis) vs impact (y-axis), color-coded risk items positioned in the matrix. Include risk categories: market, execution, technical, financial, regulatory.",
    style: "chart",
  },
  competitive: {
    prompt: "Competitive positioning matrix (2x2) with axes of price vs value, showing the startup's position relative to 4-6 named competitors. Include feature comparison highlights.",
    style: "infographic",
  },
  action_plan: {
    prompt: "",
    style: "diagram",
    mermaidType: "flow",
  },
};

// ── Main Entry Point: Generate Image for Report Section ─────────────────────

export async function generateSectionImage(
  sectionId: string,
  context: {
    startupName: string;
    sviScore: number;
    stage: string;
    sectionData?: Record<string, unknown>;
    milestones?: string[];
    roles?: string[];
    actionSteps?: string[];
  },
): Promise<ImageGenerationResult | null> {
  const sectionConfig = SECTION_IMAGE_PROMPTS[sectionId];
  if (!sectionConfig) return null;

  // Priority 1: Mermaid diagrams (free, local, instant)
  if (sectionConfig.mermaidType) {
    try {
      let mermaidCode = "";
      switch (sectionConfig.mermaidType) {
        case "org_chart":
          mermaidCode = generateMermaidOrgChart(context.sectionData ?? { roles: context.roles });
          break;
        case "timeline":
          mermaidCode = generateMermaidTimeline(context.milestones ?? ["Milestone 1", "Milestone 2", "Milestone 3"]);
          break;
        case "flow":
          mermaidCode = generateMermaidFlowDiagram(context.actionSteps ?? ["Step 1", "Step 2", "Step 3"]);
          break;
      }
      if (mermaidCode) return await renderMermaidDiagram(mermaidCode);
    } catch (err) {
      console.warn(`[ai-image] Mermaid rendering failed for ${sectionId}:`, err);
    }
  }

  // Build full prompt with startup context
  const fullPrompt = `${sectionConfig.prompt}\n\nStartup: ${context.startupName}\nSVI Score: ${context.sviScore}/300\nStage: ${context.stage}`;

  const req: ImageGenerationRequest = {
    prompt: fullPrompt,
    style: sectionConfig.style,
    width: 800,
    height: 600,
  };

  // Priority 2: OpenRouter (free image models via OpenRouter key)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return await callOpenRouterImage(req);
    } catch (err) {
      console.warn(`[ai-image] OpenRouter Image failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // ❌ Gemini Image DISABLED — Gemini API costs $0.30-$2.50/1M tokens
  // Uncomment to re-enable as paid fallback:
  // if (process.env.GOOGLE_GEMINI_API_KEY) {
  //   try { return await callGeminiImage(req); }
  //   catch (err) { console.warn(`[ai-image] Gemini Image failed:`, err); }
  // }

  // Priority 3: OpenAI DALL-E (paid, ~$0.04/image — last resort)
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAIImage(req);
    } catch (err) {
      console.warn(`[ai-image] OpenAI Image failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  // All providers failed — return null (report will use SVG charts as fallback)
  console.warn(`[ai-image] All image providers failed for section ${sectionId}`);
  return null;
}

// ── Batch Generate: All Section Images for a Report ─────────────────────────

export async function generateReportImages(
  sectionIds: string[],
  context: {
    startupName: string;
    sviScore: number;
    stage: string;
    sectionData?: Record<string, Record<string, unknown>>;
    milestones?: string[];
    roles?: string[];
    actionSteps?: string[];
  },
): Promise<Map<string, ImageGenerationResult>> {
  const results = new Map<string, ImageGenerationResult>();

  // Generate images sequentially to respect rate limits
  // (free APIs have 20 req/min limits)
  for (const sectionId of sectionIds) {
    try {
      const result = await generateSectionImage(sectionId, {
        ...context,
        sectionData: context.sectionData?.[sectionId],
      });
      if (result) {
        results.set(sectionId, result);
      }
    } catch (err) {
      console.warn(`[ai-image] Failed to generate image for ${sectionId}:`, err);
    }

    // Rate limit: 1 second between requests for free APIs
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return results;
}

// ── Check which image providers are available ───────────────────────────────

export function getAvailableImageProviders(): ImageProvider[] {
  const providers: ImageProvider[] = [];
  providers.push("mermaid"); // Always available (local)
  providers.push("svg");     // Always available (local)
  if (process.env.GOOGLE_GEMINI_API_KEY) providers.push("gemini");
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  return providers;
}
