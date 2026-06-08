export type Demo = {
  slug: string;
  title: string;
  desc: string;
  color: string;
  tags: string[];
  src: string;
};

export const DEMOS: Demo[] = [
  {
    slug: "lgbtq-romance",
    title: "LGBTQ+ Romance",
    desc: "Bright pacing, playful emotional tone",
    color: "border-pink-400",
    tags: ["LGBTQ+", "Romance"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20LGBTQ%2B%20Romance%20-%20Male%20(BrightPlayful)%2C%20Confident%2C%20Sex-PositiveFlirtatious.mp3",
  },
  {
    slug: "romantasy",
    title: "Romantasy",
    desc: "Atmospheric, grounded fantasy emotion",
    color: "border-purple-400",
    tags: ["Romantasy", "Fantasy"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Romantasy%20-%20Male%20(PossessiveHaunted)%2C%20Harsh%20Control%20to%20Remorse%2C%20Deep%20Loss.mp3",
  },
  {
    slug: "feminine-voice",
    title: "Feminine Voice",
    desc: "Male & Female Dialogue",
    color: "border-violet-400",
    tags: ["Feminine Voice", "Duet"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Female%20Voice%202.mp3",
  },
  {
    slug: "romance-duet",
    title: "Romance Duet",
    desc: "British accent, romantic restraint",
    color: "border-rose-300",
    tags: ["Romance", "British"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/British%20-%20Romance%20Duet.mp3",
  },
  {
    slug: "child-pov-drama",
    title: "Child POV Drama",
    desc: "Raw emotion",
    color: "border-blue-400",
    tags: ["Drama", "Child POV"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/Dean%20Miller%20-%20Drama%20-%20Child%20(5-year-old%20boy)%2C%20Emotional%20TraumaWitness%20-%20Sample.mp3",
  },
  {
    slug: "multi-character-dialogue",
    title: "Multi-Character Dialogue",
    desc: "Clear character separation, vocal range",
    color: "border-amber-400",
    tags: ["Multi-Character"],
    src: "https://pub-0274e76b677f47ea8135396e59f3ef10.r2.dev/4%20Characters.mp3",
  },
];
