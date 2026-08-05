import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { splitParagraphs, type SpanLite } from "./paragraph-highlight";
import type { CharacterLite } from "./ParagraphText";

export interface PrepPDFChapter {
  id: string;
  order_index: number;
  title: string | null;
  pov_character: string | null;
  summary: string | null;
  raw_text: string;
  spans: SpanLite[];
}

/** "#e6194b" -> "rgba(230, 25, 75, 0.25)" — react-pdf's color support is
 *  narrower than CSS, so alpha goes through rgba() rather than 8-digit hex. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const UNMATCHED_BG = "rgba(200, 90, 90, 0.18)";

const s = StyleSheet.create({
  titlePage: { fontFamily: "Times-Roman", padding: 72, justifyContent: "center", alignItems: "center" },
  bookTitle: { fontFamily: "Times-Bold", fontSize: 28, textAlign: "center", marginBottom: 8 },
  bookAuthor: { fontSize: 13, color: "#555555", textAlign: "center", marginBottom: 4 },
  bookMeta: { fontSize: 9, color: "#888888", textAlign: "center", marginBottom: 22 },
  legendLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#888888", letterSpacing: 0.5, textAlign: "center", marginBottom: 8 },
  legendRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  legendChip: { flexDirection: "row", alignItems: "center", border: "0.5pt solid #cccccc", borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, margin: 3 },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  legendText: { fontSize: 8 },

  page: { fontFamily: "Times-Roman", fontSize: 10.5, color: "#1a1a1a", paddingTop: 48, paddingBottom: 48, paddingHorizontal: 50, lineHeight: 1.5 },
  chapterLabel: { fontFamily: "Helvetica-Bold", fontSize: 8, color: "#888888", letterSpacing: 0.5, marginBottom: 3 },
  chapterTitle: { fontFamily: "Times-Bold", fontSize: 18, marginBottom: 6 },
  povPill: { fontSize: 8.5, color: "#555555", marginBottom: 9 },
  summaryBox: { backgroundColor: "#f4f4f4", padding: "7pt 10pt", fontSize: 8.5, color: "#555555", marginBottom: 16 },

  paraRow: { flexDirection: "row", marginBottom: 9 },
  marginCol: { width: 68, paddingRight: 6 },
  marginTag: { fontSize: 6.5, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  proseCol: { flex: 1 },
  prose: { fontSize: 10.5, lineHeight: 1.6 },
});

/** Same offset-slicing approach as ParagraphText.tsx, targeting react-pdf's
 *  nested-Text-run model instead of DOM <mark> elements. */
function renderProseSegments(block: ReturnType<typeof splitParagraphs>[number], charById: Map<string, CharacterLite>) {
  const spans = [...block.spans].sort((a, b) => a.start_offset - b.start_offset);
  const nodes: React.ReactNode[] = [];
  let cursor = block.start;

  spans.forEach((sp, i) => {
    if (sp.start_offset < cursor) return;
    if (sp.start_offset > cursor) {
      nodes.push(<Text key={`t${i}`}>{block.text.slice(cursor - block.start, sp.start_offset - block.start)}</Text>);
    }
    const seg = block.text.slice(sp.start_offset - block.start, sp.end_offset - block.start);
    const c = sp.character_id ? charById.get(sp.character_id) : undefined;
    if (sp.matched && c) {
      nodes.push(
        <Text key={`m${i}`} style={{ backgroundColor: hexToRgba(c.color_hex, 0.28) }}>
          {seg}
        </Text>
      );
    } else {
      nodes.push(
        <Text key={`u${i}`} style={{ backgroundColor: UNMATCHED_BG }}>
          {seg}
        </Text>
      );
    }
    cursor = sp.end_offset;
  });

  if (cursor < block.end) nodes.push(<Text key="tail">{block.text.slice(cursor - block.start)}</Text>);
  return nodes;
}

export function ManuscriptPrepPDF({
  title,
  author,
  characters,
  chapters,
}: {
  title: string;
  author: string | null;
  characters: CharacterLite[];
  chapters: PrepPDFChapter[];
}) {
  const charById = new Map(characters.map((c) => [c.id, c]));

  return (
    <Document title={`${title} — Narration Prep`} author={author ?? undefined}>
      <Page size="LETTER" style={s.titlePage}>
        <Text style={s.bookTitle}>{title}</Text>
        {author && <Text style={s.bookAuthor}>{author}</Text>}
        <Text style={s.bookMeta}>
          Narration prep — {chapters.length} chapter{chapters.length === 1 ? "" : "s"}, {characters.length} character
          {characters.length === 1 ? "" : "s"}
        </Text>
        {characters.length > 0 && (
          <View>
            <Text style={s.legendLabel}>CHARACTERS</Text>
            <View style={s.legendRow}>
              {characters.map((c) => (
                <View key={c.id} style={s.legendChip}>
                  <View style={[s.legendDot, { backgroundColor: c.color_hex }]} />
                  <Text style={s.legendText}>{c.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>

      <Page size="LETTER" style={s.page} wrap>
        {chapters.map((ch, i) => {
          const blocks = splitParagraphs(ch.raw_text, ch.spans);
          return (
            <View key={ch.id} break={i > 0} wrap>
              <Text style={s.chapterLabel}>
                CHAPTER {i + 1} OF {chapters.length}
              </Text>
              <Text style={s.chapterTitle}>{ch.title || "Untitled"}</Text>
              {ch.pov_character && <Text style={s.povPill}>POV: {ch.pov_character}</Text>}
              {ch.summary && <Text style={s.summaryBox}>{ch.summary}</Text>}

              {blocks.map((block, bi) => {
                if (!block.text.trim()) return null;
                const speakerIds = Array.from(
                  new Set(
                    block.spans
                      .filter((sp) => sp.matched && sp.character_id)
                      .map((sp) => sp.character_id as string)
                  )
                );
                return (
                  <View key={bi} style={s.paraRow} wrap={false}>
                    <View style={s.marginCol}>
                      {speakerIds.map((id) => {
                        const c = charById.get(id);
                        if (!c) return null;
                        return (
                          <Text key={id} style={[s.marginTag, { color: c.color_hex }]}>
                            {c.name}
                          </Text>
                        );
                      })}
                    </View>
                    <View style={s.proseCol}>
                      <Text style={s.prose}>{renderProseSegments(block, charById)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      </Page>
    </Document>
  );
}
