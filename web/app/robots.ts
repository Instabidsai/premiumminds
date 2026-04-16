import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard"],
      },
      // AI crawlers — ALLOW for GEO (AI citation optimization)
      {
        userAgent: ["GPTBot", "Google-Extended", "anthropic-ai", "ClaudeBot", "ChatGPT-User", "PerplexityBot", "OAI-SearchBot", "claude-web", "YouBot", "Applebot", "Amazonbot", "DuckAssistBot", "Bingbot", "MistralAI-User", "Bytespider"],
        allow: "/",
        disallow: ["/api/", "/dashboard"],
      },
      // Pure scraping bots — BLOCK
      {
        userAgent: ["CCBot", "Diffbot", "Applebot-Extended", "cohere-ai"],
        disallow: "/",
      },
    ],
    sitemap: "https://premiumminds.io/sitemap.xml",
  };
}
