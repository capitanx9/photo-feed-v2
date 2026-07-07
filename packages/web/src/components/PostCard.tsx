import Link from "next/link";
import type { Post } from "@/lib/api";

export function PostCard({ post }: { post: Post }) {
  const readyMedia = post.media.filter((m) => m.status === "ready" && m.url);
  const cover = readyMedia[0];
  const extras = readyMedia.length - 1;

  return (
    <Link
      href={`/posts/${post.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-black/[.08] transition-shadow hover:shadow-md dark:border-white/[.145]"
    >
      <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.url!}
            alt={post.caption || `Post #${post.id}`}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            No image
          </div>
        )}
        {extras > 0 && (
          <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            +{extras}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <p className="line-clamp-1 text-zinc-700 dark:text-zinc-200">
          {post.caption || <span className="text-zinc-400">Untitled</span>}
        </p>
        {post.price && (
          <p className="whitespace-nowrap font-medium">€{post.price}</p>
        )}
      </div>
    </Link>
  );
}
