import Image from "next/image";
import Link from "next/link";

export default function NarratedWorks() {
  const completed = [
    {
      title: "The Final Guardian",
      subtitle: "The Citadel of the Mind and the Garden",
      author: "Alexander Kamenetsky",
      link: "https://www.amazon.com/Final-Guardian-Citadel-Mind-Garden/dp/B0G1CNQM8H",
      cover: "/covers/the-final-guardian.jpg",
    },
    {
      title: "Santa Promised",
      subtitle: "A Christmas Novella",
      author: "Laetitia Clark",
      link: "https://www.amazon.com/Santa-Promised-A-Christmas-Novella/dp/B0G6GLQGHK",
      cover: "/covers/santa-promised.jpg",
    },
    {
      title: "The Circle",
      subtitle: "Rituals & Ruins",
      author: "Lilian Monroe, Kayla Gerdes",
      link: "https://www.amazon.com/Audible-The-Circle-Rituals-Ruins/dp/B0GKQY7N27",
      cover: "/covers/the-circle-rituals-and-ruins.jpg",
    },
    {
      title: "Sultry Secrets: Tease",
      subtitle: "Sultry Secrets Book 4",
      author: "Bethanie Loren",
      link: "https://www.amazon.com/-/es/Bethanie-Loren-ebook/dp/B0G6VDHL9L",
      cover: "/covers/sultry-secrets-tease.jpg",
      note: false,
    },
  ];

  const inProgress = [
    {
      title: "Unmasked Hearts",
      author: "K.E. Noel",
      link: "https://www.amazon.com/Unmasked-Hearts-K-Noel-ebook/dp/B0FMKP92Y9",
      cover: "/covers/unmasked-hearts.jpg",
    },
    {
      title: "No One to Hold Me",
      author: "Noelle Rahn-Johnson",
      link: "https://www.amazon.com/No-One-Hold-Noelle-Rahn-Johnson-ebook/dp/B088RMPLYX",
      cover: "/covers/no-one-to-hold-me.jpg",
    },
    {
      title: "Beating For You",
      author: "L.L. McAlister",
      link: "https://www.amazon.com/Beating-You-Body-Nobody-That-ebook/dp/B0FNQ2F6P4",
      cover: "/covers/beating-for-you.jpg",
    },
    {
      title: "Merciless Punks",
      author: "Madeline Fay",
      link: "https://www.amazon.com/Merciless-Punks-Enemies-romance-douchebags-ebook/dp/B09Z9P3C7V",
      cover: "/covers/merciless-punks.jpg",
    },
    {
      title: "Heir of the Emberscale",
      author: "Shelby Gardner",
      link: "https://www.amazon.com/Heir-Emberscale-Shelby-Gardner-ebook/dp/B0FXR4Y9JB",
      cover: "/covers/heir-of-emberscale.jpg",
    },
  ];

  return (
    <main className="min-h-screen bg-[#050814] text-white">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-20">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Narrated Works
        </h1>
        <p className="text-center text-white/70 text-lg mb-16 max-w-3xl mx-auto">
          A showcase of audiobook projects I've completed and those I'm currently narrating.
        </p>

        {/* Completed Projects */}
        <section className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center">Completed Projects</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8">
            {completed.map((book, index) => (
              <a
                key={index}
                href={book.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224]"
              >
                <div className="relative aspect-[3/4.5] w-full">
                  <Image
                    src={book.cover}
                    alt={`${book.title} cover`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                </div>
                <div className="p-4 text-center">
                  <h3 className="font-semibold text-base leading-tight text-white">
                    {book.title}
                  </h3>
                  {book.subtitle && (
                    <p className="text-sm text-white/80">{book.subtitle}</p>
                  )}
                  <p className="text-sm mt-1 text-[#D4AF37] font-medium">
                    {book.author}
                  </p>
                </div>
                {book.note && (
                  <div className="absolute top-2 right-2 bg-yellow-600/80 text-white text-xs px-2 py-1 rounded">
                    Note
                  </div>
                )}
              </a>
            ))}
          </div>
        </section>

        {/* Currently Narrating */}
        <section>
          <h2 className="text-3xl font-bold mb-8 text-center">Currently Narrating</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 md:gap-8">
            {inProgress.map((book, index) => (
              <a
                key={index}
                href={book.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-2 border border-[#1A2550] bg-[#0B1224]"
              >
                <div className="relative aspect-[3/4.5] w-full">
                  <Image
                    src={book.cover}
                    alt={`${book.title} cover`}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
                  />
                </div>
                <div className="absolute top-2 right-2 bg-[#D4AF37] text-black text-xs font-semibold px-2 py-1 rounded">
                  In Progress
                </div>
                <div className="p-4 text-center">
                  <h3 className="font-semibold text-base leading-tight text-white">
                    {book.title}
                  </h3>
                  <p className="text-sm mt-1 text-[#D4AF37] font-medium">
                    {book.author}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Call to Action */}
        <div className="mt-16 text-center">
          <p className="text-white/70 mb-6 text-lg">
            Ready to bring your story to life?
          </p>
          <Link
            href="/#contact"
            className="inline-flex items-center justify-center rounded-md bg-[#D4AF37] text-black px-8 py-4 font-semibold hover:bg-[#E0C15A] transition text-lg shadow-lg hover:shadow-2xl"
          >
            Contact Me
          </Link>
        </div>
      </div>
    </main>
  );
}