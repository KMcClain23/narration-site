import { NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST(req: Request) {
  const tmpPath = join("/tmp", `book-${Date.now()}.pdf`);
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: "No file provided." }, { status: 400 });

    // Write PDF to temp file
    const bytes = await file.arrayBuffer();
    await writeFile(tmpPath, Buffer.from(bytes));

    // Extract text from first 10 pages to find TOC
    const { stdout } = await execAsync(
      `python3 -c "
import pdfplumber, re, json, sys

with pdfplumber.open('${tmpPath}') as pdf:
    total_pages = len(pdf.pages)
    
    # Extract text from first 10 pages looking for TOC
    toc_text = ''
    for i in range(min(10, total_pages)):
        toc_text += (pdf.pages[i].extract_text() or '') + '\\n'
    
    # Parse TOC entries: 'Name  PageNumber'
    lines = toc_text.strip().split('\\n')
    chapters = []
    
    SKIP = {'contents', 'preface', 'acknowledgments', 'copyright', 'dedication',
            'abouttheauthor', 'about the author', 'also by', 'note', 'author note',
            'author\\'s note', 'playlist', 'glossary', 'appendix', 'index', 'bonus'}
    
    for line in lines:
        line = line.strip()
        m = re.match(r'^([A-Za-z][A-Za-z\\-\\s]+?)\\s+(\\d+)\\s*$', line)
        if m:
            name = m.group(1).strip()
            page = int(m.group(2))
            if name.lower() not in SKIP and len(name) < 60:
                chapters.append({'title': name, 'page': page})
    
    # Calculate word/page counts from page ranges
    WORDS_PER_PAGE = 250
    result = []
    for i, ch in enumerate(chapters):
        end_page = chapters[i+1]['page'] - 1 if i+1 < len(chapters) else total_pages
        pages = max(1, end_page - ch['page'] + 1)
        words = pages * WORDS_PER_PAGE
        result.append({
            'number': i+1,
            'title': ch['title'],
            'wordCount': words,
            'pages': pages
        })
    
    print(json.dumps({'chapters': result, 'totalPages': total_pages}))
"`
    );

    await unlink(tmpPath).catch(() => {});

    const data = JSON.parse(stdout.trim());
    if (!data.chapters?.length) {
      return NextResponse.json({ error: "Could not find chapter list in PDF. Try the AI import instead." }, { status: 400 });
    }

    return NextResponse.json(data);
  } catch (e) {
    await unlink(tmpPath).catch(() => {});
    console.error("PDF chapter extraction error:", e);
    return NextResponse.json({ error: "Failed to extract chapters from PDF." }, { status: 500 });
  }
}
