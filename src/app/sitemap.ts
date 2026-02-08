import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://nega.inkcraft.cn",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
      alternates: {
        languages: {
          "en-US": "https://nega.inkcraft.cn/en",
          "zh-CN": "https://nega.inkcraft.cn/zh",
        },
      },
    },
    {
      url: "https://nega.inkcraft.cn/en",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: "https://nega.inkcraft.cn/zh",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.9,
    },
  ];
}
