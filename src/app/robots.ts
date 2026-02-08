import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/*.json$", "/admin/"],
        crawlDelay: 1,
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
    ],
    sitemap: [
      "https://nega.inkcraft.cn/sitemap.xml",
      "https://nega.inkcraft.cn/sitemap-en.xml",
      "https://nega.inkcraft.cn/sitemap-zh.xml",
    ],
  };
}
