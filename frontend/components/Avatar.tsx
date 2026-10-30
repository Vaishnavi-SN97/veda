import { cx } from "./ui";

// Picture keys -> emoji that render on old Android phones. Pictures let young children
// find themselves on a shared family phone without reading.
const PICTURES: Record<string, string> = {
  parrot: "🦜", elephant: "🐘", peacock: "🦚", tiger: "🐯", mango: "🥭", lotus: "🌺", rabbit: "🐰",
  fish: "🐟", star: "⭐", sun: "🌞", kite: "🎈", boat: "⛵", tree: "🌳", cow: "🐄", butterfly: "🦋",
  moon: "🌙", drum: "🥁", flower: "🌻", owl: "🦉", deer: "🦌", bus: "🚌", ball: "⚽", umbrella: "☂️",
  apple: "🍎", cat: "🐱",
};

export function Avatar({ picture, size = "md", className }: { picture: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-raised",
        size === "sm" ? "size-9 text-lg" : size === "md" ? "size-12 text-2xl" : "size-20 text-4xl",
        className,
      )}
    >
      {PICTURES[picture] ?? "🙂"}
    </span>
  );
}
