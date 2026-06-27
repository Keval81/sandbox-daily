interface Props {
  standfirst?: string;
}

/** Plain-English dek under the headline. Renders nothing when absent so the
 *  back catalogue (no standfirst) shows headline -> body with no gap. */
export function ArticleStandfirst({ standfirst }: Props) {
  if (!standfirst) return null;
  return (
    <p className="font-display text-xl md:text-2xl leading-snug mt-5 max-w-3xl opacity-90">
      {standfirst}
    </p>
  );
}
