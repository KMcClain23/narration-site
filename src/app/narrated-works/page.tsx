import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

type BookStatus = "Released" | "In Progress" | "Coming Soon";

type Book = {
  title: string;
  author: string;
  cover: string;
  audible?: string;
  amazon?: string;
  status: BookStatus;
};

export const metadata: Metadata = {
  title: "Narrated Works | Dean Miller Audiobook Portfolio",
  description:
    "Browse the audiobook portfolio of Dean Miller. Featuring narrated works in dark romance, romantasy, and character-driven fiction.",
  alternates: {
    canonical: "https://dmnarration.com/narrated-works",
  },
  openGraph: {
    title: "Narrated Works | Dean Miller Audiobook Portfolio",
    description:
      "Listen to audiobook projects narrated by Dean Miller, specializing in immersive, character-driven performances.",
    url: "https://dmnarration.com/narrated-works",
    type: "website",
  },
};

const books: Book[] = [
  {
    title:
      "The Final Guardian: The Citadel of the Mind and the Garden",
    author: "Alexander Kamenetsky",
    cover:
      "https://dmn-site-media.<your-r2-domain>/final-guardian.jpg",
    audible: "https://www.audible.com/",
    amazon: "https://www.amazon.com/",
    status: "Released",
  },
  {
    title: "Santa Promised: A Christmas Novella",
    author: "Laetitia Clark",
    cover:
      "https://dmn-site-media.<your-r2-domain>/santa-promised.jpg",
    audible: "https://www.audible.com/",
    status: "Released",
  },
  {
    title: "The Circle: Rituals & Ruins",
    author: "Lillian Monroe & Kayla Gerdes",
    cover:
      "https://dmn-site-media.<your-r2-domain>/circle.jpg",
    audible: "https://www.audible.com/",
    status: "Released",
  },
  {
    title: "No One To Hold Me",
    author: "Noelle Rahn-Johnson",
    cover:
      "https://dmn-site-media.<your-r2-domain>/no-one.jpg",
    status: "In Progress",
  },
  {
    title: "Unmasked Hearts",
    author: "K.E. Noel",
    cover:
      "https://dmn-site-media.<your-r2-domain>/unmasked.jpg",
    status: "In Progress",
  },
  {
    title: "Heir of the Emberscale",
    author: "Shelby Gardner",
    cover:
      "https://dmn-site-media.<your-r2-domain>/emberscale.jpg",
    status: "In Progress",
  },
  {
    title: "Merciless Punks",
    author: "Madeline Fay",
    cover:
      "https://dmn-site-media.<your-r2-domain>/punks.jpg",
    status: "In Progress",
  },
  {
    title: "Blood on the Asphalt",
    author: "River Fox",
    cover:
      "https://dmn-site-media.<your-r2-domain>/asphalt.jpg",
    status: "Coming Soon",
  },
];

export default function NarratedWorksPage() {
  return (
    <main className="w-full px-4 sm:px-6 lg:px-10 py-12">
      {/* HEADER */}
      <section className="max-w-7xl mx-auto mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Narrated Works
        </h1>

        <p className="mt-4 text-muted-foreground max-w-2xl">
          A curated collection of audiobook performances by Dean Miller.
          Focused on emotionally grounded, character-driven storytelling
          across romance, dark romance, and cinematic fiction.
        </p>
      </section>

      {/* GRID - FULL WIDTH */}
      <section className="w-full">
        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {books.map((book, index) => (
            <article
              key={index}
              className="group rounded-2xl overflow-hidden border bg-background shadow-sm hover:shadow-xl transition-all duration-300"
            >
              {/* COVER */}
              <div className="relative aspect-[2/3] w-full overflow-hidden">
                <Image
                  src={book.cover}
                  alt={`${book.title} cover`}
                  fill
                  sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 16vw"
                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>

              {/* CONTENT */}
              <div className="p-4 flex flex-col justify-between h-[150px]">
                <div>
                  <h2 className="font-semibold text-sm leading-tight line-clamp-2">
                    {book.title}
                  </h2>

                  <p className="text-xs text-muted-foreground mt-1">
                    {book.author}
                  </p>
                </div>

                <div className="mt-3">
                  {/* STATUS BADGE */}
                  <span className="inline-block text-xs px-2 py-1 rounded-full border">
                    {book.status}
                  </span>

                  {/* LINKS */}
                  <div className="flex gap-3 mt-3 flex-wrap">
                    {book.audible && (
                      <Link
                        href={book.audible}
                        target="_blank"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Audible
                      </Link>
                    )}

                    {book.amazon && (
                      <Link
                        href={book.amazon}
                        target="_blank"
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        Amazon
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* JSON-LD SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: "Dean Miller Narrated Works",
            itemListElement: books.map((book, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: book.title,
              author: book.author,
            })),
          }),
        }}
      />
    </main>
  );
}