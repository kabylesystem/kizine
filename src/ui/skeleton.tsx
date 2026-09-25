/**
 * Squelettes affichés pendant que le serveur travaille. Next les peint dès le
 * clic, donc la navigation paraît immédiate même si les données mettent
 * deux cents millisecondes à revenir. La forme imite la vraie page pour que
 * rien ne saute quand le contenu arrive.
 */
export function Bar({ h = 14, w = "100%", r = 6 }: { h?: number; w?: string | number; r?: number }) {
  return (
    <span
      className="etal-pulse block"
      style={{ height: h, width: w, borderRadius: r, background: "var(--surface2)" }}
      aria-hidden
    />
  );
}

export function BandSkeleton() {
  return (
    <div className="mb-3 flex items-start gap-2">
      <div className="etal-band min-w-0 flex-1" style={{ "--c": "var(--surface2)" } as React.CSSProperties}>
        <span className="etal-pulse block" style={{ height: 20, width: 160, borderRadius: 6, background: "var(--surface3)" }} />
      </div>
    </div>
  );
}

export function Cards({ n = 4, h = 76 }: { n?: number; h?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="etal-card p-3">
          <Bar h={h} />
        </div>
      ))}
    </div>
  );
}

export function Tiles({ n = 4 }: { n?: number }) {
  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="rounded-[7px] p-3" style={{ background: "var(--surface2)" }}>
          <Bar h={26} w="60%" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ tiles = 0, cards = 4 }: { tiles?: number; cards?: number }) {
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-5 lg:px-8 lg:py-8">
      <BandSkeleton />
      {tiles > 0 ? <Tiles n={tiles} /> : null}
      <Cards n={cards} />
    </div>
  );
}
