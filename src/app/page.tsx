export default function Home() {
  return (
    <div className="p-8">
      <h1 className="font-display text-5xl font-black uppercase tracking-tight text-ink">
        SANDBOX DAILY
      </h1>
      <p className="font-mono text-meta uppercase tracking-mono text-grey mt-2">
        News · Tech · Sport
      </p>
      <p className="font-body text-body text-ink mt-4">
        The intelligence of a broadsheet, the urgency of a live broadcast.
      </p>
      <div className="flex gap-4 mt-8">
        <div className="w-24 h-24 bg-orange rounded-sharp" />
        <div className="w-24 h-24 bg-green rounded-sharp" />
        <div className="w-24 h-24 bg-cream border border-ink rounded-sharp" />
        <div className="w-24 h-24 bg-ink rounded-sharp" />
        <div className="w-24 h-24 bg-grey rounded-sharp" />
        <div className="w-24 h-24 bg-accent rounded-sharp" />
      </div>
    </div>
  );
}
