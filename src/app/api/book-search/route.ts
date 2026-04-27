import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q");
  if (!q) return NextResponse.json({ error: "Query required." }, { status: 400 });

  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1&printType=books`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.items?.length) {
      return NextResponse.json({ found: false, pageCount: 0, wordCount: 0, chapterCount: 0 });
    }

    const vol = data.items[0].volumeInfo;
    const pageCount = vol.pageCount || 0;
    // Estimate word count: ~250 words/page for fiction
    const wordCount = pageCount ? pageCount * 250 : 0;
    // Estimate chapter count: typical fiction chapter ~15 pages
    const chapterCount = pageCount ? Math.round(pageCount / 15) : 0;

    return NextResponse.json({
      found: true,
      title: vol.title,
      author: vol.authors?.[0] || "",
      description: vol.description || "",
      pageCount,
      wordCount,
      chapterCount,
      thumbnail: vol.imageLinks?.thumbnail || "",
    });
  } catch (e) {
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
