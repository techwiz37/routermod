import { NextResponse } from "next/server";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "URL required" }, { status: 400 });
  }

  try {
    const parsedUrl = new URL(url);
    const origin = parsedUrl.origin;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(origin, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json({ 
        faviconUrl: `${origin}/favicon.ico`,
        fallback: true 
      });
    }

    const html = await response.text();

    const iconPatterns = [
      /<link[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
      /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*>/gi,
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    ];

    let faviconUrl = null;

    for (const pattern of iconPatterns) {
      const match = pattern.exec(html);
      if (match && match[1]) {
        faviconUrl = match[1];
        break;
      }
    }

    if (faviconUrl) {
      if (faviconUrl.startsWith("http://") || faviconUrl.startsWith("https://")) {
        return NextResponse.json({ faviconUrl });
      } else if (faviconUrl.startsWith("//")) {
        return NextResponse.json({ faviconUrl: `https:${faviconUrl}` });
      } else if (faviconUrl.startsWith("/")) {
        return NextResponse.json({ faviconUrl: `${origin}${faviconUrl}` });
      } else {
        return NextResponse.json({ faviconUrl: `${origin}/${faviconUrl}` });
      }
    }

    return NextResponse.json({ 
      faviconUrl: `${origin}/favicon.ico`,
      fallback: true 
    });

  } catch (error) {
    try {
      const parsedUrl = new URL(url);
      return NextResponse.json({ 
        faviconUrl: `${parsedUrl.origin}/favicon.ico`,
        fallback: true,
        error: error.message 
      });
    } catch {
      return NextResponse.json({ 
        error: "Invalid URL",
        fallback: true 
      }, { status: 400 });
    }
  }
}
